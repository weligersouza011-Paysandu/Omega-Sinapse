'use strict';

// =============================================================================
// Synapse — Importação do histórico de orçamentos
//
// Planilha (pasta ./13/) + imagens (./13/Orçamento_Images/) → Cloudinary → Neon
//
// Uso:
//   npm run importar:historico
//
// Por linha da planilha:
//   1. resolve o PEP (fallback acordado: SS → OSI) e localiza as fotos;
//   2. otimiza até 3 fotos com Sharp (WebP, largura máxima 1920px) e envia
//      ao Cloudinary em `synapse/orcamentos/<id>-foto-<n>`;
//   3. grava o orçamento + a revisão inicial (Rev 00) em uma transação Prisma.
//
// Idempotência: a chave natural (PEP + SS) é consultada ANTES de qualquer
// upload, portanto reexecutar o script não duplica registros nem imagens.
// =============================================================================

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');

const prisma = require('../src/config/prisma');
const { otimizarParaWebp, enviarParaCloudinary } = require('../src/services/uploadService');
const orcamentoRepository = require('../src/repositories/orcamentoRepository');

// ------------------------------------------------------------------ Caminhos
const RAIZ_PROJETO = path.resolve(__dirname, '..');
const PASTA_PLANILHA = path.join(RAIZ_PROJETO, '13');

/** Pastas candidatas para as imagens (a planilha referencia "Orçamento_Images"). */
const PASTAS_IMAGENS = [
  path.join(RAIZ_PROJETO, '13', 'Orçamento_Images'),
  path.join(RAIZ_PROJETO, '13', 'orcamento_imagens'),
  path.join(RAIZ_PROJETO, 'orcamento_imagens'),
  path.join(RAIZ_PROJETO, 'Orçamento_Images'),
];

// ------------------------------------------------------------------ Regras
/** Limite estrito de fotos por orçamento (foto_1 obrigatória; foto_2 e foto_3 opcionais). */
const LIMITE_FOTOS = 3;

/** Pasta de destino no Cloudinary. */
const PASTA_CLOUDINARY = process.env.CLOUDINARY_FOLDER || 'synapse/orcamentos';

/** Limites das colunas VarChar do schema Prisma (evita erro de "value too long"). */
const LIMITES = {
  pep: 100,
  cliente: 255,
  ss: 60,
  fiscal_nome: 255,
  fiscal_contato: 255,
  art: 120,
};

/** Autor padrão das importações — criado sob demanda, sem acesso de login. */
const AUTOR_IMPORTACAO = {
  nome: 'Importação Histórica',
  matricula: 'IMPORT',
  email: 'importacao.historico@omega.local',
  perfil: 'ADMIN',
};

/** Nomes exatos das colunas na planilha "Orçamento Finax.xlsx". */
const COLUNAS = {
  id: 'id',
  ss: 'SS',
  osi: 'OSI',
  pep: 'PEP (CC)',
  endereco: 'Endereço',
  fiscal: 'Fiscal',
  emailFiscal: 'Email (Fiscal)',
  contato: 'Contato',
  planejador: 'Planejador ',
  descricao: 'Detalhamento do Serviço',
  documentos: 'Documentações de Referencia para execução do Serviço',
  valor: 'Valor',
  status: 'Status',
};

/** Status já mapeados explicitamente (chave normalizada sem acento/minúscula). */
const STATUS_PLANILHA = {
  'visita tecnica': 'VISITA_TECNICA',
  'aguardando aprovacao (orcamento enviado)': 'AGUARDANDO_APROVACAO',
  'orcamento aprovado': 'APROVADO',
  'encaminhado para abertura de osi': 'ENCAMINHADO_OSI',
  'osi - emitida': 'OSI_EMITIDA',
  'desativado': 'DESATIVADO',
};

/** Heurística aplicada apenas a status fora do mapa acima. */
const REGRAS_STATUS = [
  [/visita|levantamento/, 'VISITA_TECNICA'],
  [/osi/, 'OSI_EMITIDA'],
  [/encaminh/, 'ENCAMINHADO_OSI'],
  [/cancel|desativ|reprov/, 'DESATIVADO'],
  [/aprov/, 'APROVADO'],
  [/analise|enviad|aguardando/, 'AGUARDANDO_APROVACAO'],
];

// ------------------------------------------------------------------ Utilitários
const TAG = { info: '[INFO ]', ok: '[ OK  ]', aviso: '[AVISO]', erro: '[ERRO ]' };

function log(tag, mensagem) {
  console.log(`${tag} ${mensagem}`);
}

function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Converte qualquer valor da planilha em texto limpo (ou null quando vazio). */
function texto(valor) {
  if (valor === null || valor === undefined) return null;
  const limpo = String(valor).replace(/\s+/g, ' ').trim();
  return limpo === '' ? null : limpo;
}

/** Trunca em `limite` caracteres para respeitar os VarChar do schema. */
function cortar(valor, limite) {
  if (valor === null || valor === undefined) return null;
  const limpo = String(valor).trim();
  return limpo.length > limite ? limpo.slice(0, limite) : limpo;
}

/** Status da planilha → enum StatusOrcamento (validando antes). */
function mapearStatus(bruto) {
  const chave = normalizar(bruto);
  if (!chave) {
    return { status: 'VISITA_TECNICA', mapeado: true };
  }
  if (STATUS_PLANILHA[chave]) {
    return { status: STATUS_PLANILHA[chave], mapeado: true };
  }
  for (const [regex, status] of REGRAS_STATUS) {
    if (regex.test(chave)) return { status, mapeado: false };
  }
  return { status: 'VISITA_TECNICA', mapeado: false };
}

// ------------------------------------------------------------------ Descoberta de arquivos
/** Localiza a planilha .xlsx dentro de ./13/. */
function localizarPlanilha() {
  if (!fs.existsSync(PASTA_PLANILHA)) {
    throw new Error(`Pasta da planilha não encontrada: ${PASTA_PLANILHA}`);
  }

  const arquivos = fs
    .readdirSync(PASTA_PLANILHA)
    .filter((nome) => nome.toLowerCase().endsWith('.xlsx') && !nome.startsWith('~$'))
    .map((nome) => path.join(PASTA_PLANILHA, nome));

  if (arquivos.length === 0) {
    throw new Error(`Nenhum arquivo .xlsx encontrado em ${PASTA_PLANILHA}`);
  }

  return arquivos[0];
}

/** Localiza a pasta de imagens (aceita "Orçamento_Images" e "orcamento_imagens"). */
function localizarPastaImagens() {
  const encontrada = PASTAS_IMAGENS.find((pasta) => fs.existsSync(pasta) && fs.statSync(pasta).isDirectory());

  if (!encontrada) {
    throw new Error(
      `Pasta de imagens não encontrada. Pastas verificadas:\n  - ${PASTAS_IMAGENS.join('\n  - ')}`
    );
  }

  return encontrada;
}

/**
 * Indexa os arquivos da pasta de imagens.
 * - `porNome`: nome do arquivo → caminho absoluto (resolve as referências da planilha).
 * - `porPrefixo`: id do orçamento (ex.: "73f1dcc5") → fotos ordenadas por número/timestamp.
 *   Arquivos de assinatura são ignorados — apenas "Foto (n)" entra no orçamento.
 */
function indexarImagens(pasta) {
  const porNome = new Map();
  const porPrefixo = new Map();

  for (const arquivo of fs.readdirSync(pasta)) {
    const caminho = path.join(pasta, arquivo);
    if (!fs.statSync(caminho).isFile()) continue;

    porNome.set(arquivo, caminho);

    const match = /^([0-9a-fA-F]{6,})\.[Ff]oto \((\d+)\)/.exec(arquivo);
    if (!match) continue;

    const [, id, numero] = match;
    if (!porPrefixo.has(id)) porPrefixo.set(id, []);
    porPrefixo.get(id).push({ arquivo, caminho, numero: Number(numero) });
  }

  for (const lista of porPrefixo.values()) {
    lista.sort((a, b) => a.numero - b.numero || a.arquivo.localeCompare(b.arquivo));
  }

  return { pasta, porNome, porPrefixo };
}

/** Resolve a referência de imagem da planilha em um caminho absoluto existente. */
function resolverArquivo(referencia, indice) {
  const bruto = texto(referencia);
  if (!bruto) return null;

  const candidatos = [
    path.join(indice.pasta, bruto),
    path.join(RAIZ_PROJETO, bruto),
    indice.porNome.get(path.basename(bruto)),
  ];

  for (const candidato of candidatos) {
    if (candidato && fs.existsSync(candidato)) return candidato;
  }

  return null;
}

/**
 * Seleciona até 3 fotos para o orçamento:
 *  1. as referências explícitas da planilha ("Foto (1)" → "Foto (10)"), na ordem;
 *  2. o excedente por convenção de nome (mesmo prefixo de id, ainda não usado).
 */
function selecionarFotos(linha, idImportacao, indice) {
  const caminhos = [];
  const adicionar = (caminho) => {
    if (caminho && !caminhos.includes(caminho)) caminhos.push(caminho);
  };

  for (let n = 1; n <= 10 && caminhos.length < LIMITE_FOTOS; n += 1) {
    adicionar(resolverArquivo(linha[`Foto (${n})`], indice));
  }

  if (caminhos.length < LIMITE_FOTOS) {
    for (const foto of indice.porPrefixo.get(idImportacao) || []) {
      if (caminhos.length >= LIMITE_FOTOS) break;
      adicionar(foto.caminho);
    }
  }

  return caminhos;
}

// ------------------------------------------------------------------ Banco de dados
/** Busca (ou cria) o usuário autor das importações. */
async function obterAutorImportacao() {
  const existente = await prisma.usuario.findUnique({ where: { email: AUTOR_IMPORTACAO.email } });
  if (existente) return existente;

  // Senha aleatória: o autor existe apenas para rastreabilidade, não para login.
  const senha_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

  try {
    const criado = await prisma.usuario.create({
      data: { ...AUTOR_IMPORTACAO, ativo: false, senha_hash },
    });
    log(TAG.info, `Usuário de importação criado: ${criado.nome} <${criado.email}> (#${criado.id}) — sem login.`);
    return criado;
  } catch (err) {
    const alternativa = await prisma.usuario.findFirst({
      where: { OR: [{ email: AUTOR_IMPORTACAO.email }, { matricula: AUTOR_IMPORTACAO.matricula }] },
    });
    if (alternativa) return alternativa;
    throw err;
  }
}

/** Mapa "nome normalizado" → id, usado para vincular o planejador citado na planilha. */
async function obterMapaPlanejadores() {
  const usuarios = await prisma.usuario.findMany({ select: { id: true, nome: true } });
  const mapa = new Map();

  for (const usuario of usuarios) {
    const chave = normalizar(usuario.nome);
    if (!mapa.has(chave)) mapa.set(chave, usuario.id);
  }

  return mapa;
}

// ------------------------------------------------------------------ Upload
/** Otimiza (Sharp → WebP) e envia até 3 imagens ao Cloudinary, na ordem das fotos. */
async function enviarFotos(idImportacao, caminhos) {
  const urls = [];

  for (let i = 0; i < caminhos.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const original = await fs.promises.readFile(caminhos[i]);
    // eslint-disable-next-line no-await-in-loop
    const webp = await otimizarParaWebp(original);
    // eslint-disable-next-line no-await-in-loop
    const enviada = await enviarParaCloudinary(webp, {
      pasta: PASTA_CLOUDINARY,
      // public_id determinístico ⇒ reexecuções sobrescrevem a mesma imagem.
      publicId: `${idImportacao}-foto-${i + 1}`,
    });

    urls.push(enviada.url);
  }

  return urls;
}

/** Monta o payload de gravação a partir de uma linha da planilha. */
function montarPayload(linha, { pep, autorId, planejadorId }) {
  const ss = texto(linha[COLUNAS.ss]);
  const osi = texto(linha[COLUNAS.osi]);
  const documentos = texto(linha[COLUNAS.documentos]);
  const contato = [texto(linha[COLUNAS.emailFiscal]), texto(linha[COLUNAS.contato])]
    .filter(Boolean)
    .join(' · ');

  const nomeFiscal = cortar(texto(linha[COLUNAS.fiscal]), LIMITES.fiscal_nome);

  const brutoValor = linha[COLUNAS.valor];
  const valorAusente = brutoValor === null || brutoValor === undefined || brutoValor === '';
  const numero = valorAusente ? 0 : Number(brutoValor);
  const valor = Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;

  return {
    valorAusente,
    dados: {
      pep: cortar(pep, LIMITES.pep),
      cliente: null, // a planilha não possui coluna de cliente/área
      ss: cortar(ss, LIMITES.ss),
      descricao: texto(linha[COLUNAS.descricao]),
      endereco: texto(linha[COLUNAS.endereco]),
      // A planilha guarda um único fiscal por linha; cada um vira um registro
      // na relação 1:N de fiscais do orçamento.
      fiscais: nomeFiscal
        ? [{ nome: nomeFiscal, contato: cortar(contato || null, LIMITES.fiscal_contato) }]
        : [],
      // O OSI (ordem de serviço) não tem coluna própria no schema: é preservado
      // como referência documental para não perder a rastreabilidade da obra.
      documentos_referencia: [osi ? `OSI: ${osi}` : null, documentos].filter(Boolean).join('\n') || null,
      valor,
      art: null, // sem ART na planilha; campo restrito a PLANEJADOR/SUPERVISOR/ADMIN
      orcamentista_id: autorId,
      planejador_id: planejadorId,
    },
  };
}

// ------------------------------------------------------------------ Execução
async function importar() {
  const inicio = Date.now();
  const resumo = { lidos: 0, importados: 0, ignorados: 0, falhas: 0, fotos: 0 };

  const caminhoPlanilha = localizarPlanilha();
  const pastaImagens = localizarPastaImagens();
  const indice = indexarImagens(pastaImagens);

  console.log('');
  console.log('=====================================================================');
  console.log(' Synapse — Importação de histórico de orçamentos');
  console.log('=====================================================================');
  log(TAG.info, `Planilha........: ${caminhoPlanilha}`);
  log(TAG.info, `Imagens.........: ${pastaImagens} (${indice.porNome.size} arquivos)`);
  log(TAG.info, `Destino imagens.: Cloudinary/${PASTA_CLOUDINARY}`);
  console.log('');

  const pastaTrabalho = XLSX.readFile(caminhoPlanilha);
  const nomeAba = pastaTrabalho.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(pastaTrabalho.Sheets[nomeAba], { defval: null, raw: true });
  resumo.lidos = linhas.length;

  log(TAG.info, `Aba "${nomeAba}": ${linhas.length} registro(s) encontrado(s).`);
  console.log('');

  const autor = await obterAutorImportacao();
  const planejadores = await obterMapaPlanejadores();
  const idsDaPlanilha = new Set();
  const planejadoresNaoEncontrados = new Set();
  const statusForaDoMapa = new Set();

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const posicao = `[${i + 1}/${linhas.length}]`;
    const idImportacao = texto(linha[COLUNAS.id]) || `linha-${i + 2}`;
    idsDaPlanilha.add(idImportacao);

    const ss = texto(linha[COLUNAS.ss]);
    const osi = texto(linha[COLUNAS.osi]);
    const pepPlanilha = texto(linha[COLUNAS.pep]);
    const pep = pepPlanilha || ss || osi;
    const etiqueta = `PEP ${pep || '(vazio)'}${ss ? ` · ${ss}` : ''}`;

    if (pepPlanilha === null) {
      log(TAG.aviso, `${posicao} PEP ausente na planilha — usando ${ss ? 'SS' : 'OSI'} como identificador (${pep}).`);
    }

    // Validação obrigatória: sem PEP não há como identificar o orçamento.
    if (!pep) {
      resumo.falhas += 1;
      log(TAG.erro, `${posicao} ${idImportacao}: sem PEP, SS ou OSI — registro ignorado.`);
      continue;
    }

    try {
      // Idempotência: chave natural (PEP + SS) verificada antes de qualquer upload.
      const existente = await prisma.orcamento.findFirst({
        where: { pep: cortar(pep, LIMITES.pep), ss: cortar(ss, LIMITES.ss) },
        select: { id: true },
      });

      if (existente) {
        resumo.ignorados += 1;
        log(TAG.info, `${posicao} ${etiqueta}: já importado (orçamento #${existente.id}) — ignorado.`);
        continue;
      }

      // Validação obrigatória: foto_1.
      const fotos = selecionarFotos(linha, idImportacao, indice);
      if (fotos.length === 0) {
        resumo.falhas += 1;
        log(TAG.erro, `${posicao} ${etiqueta}: nenhuma foto encontrada (foto_1 é obrigatória) — registro ignorado.`);
        continue;
      }

      const urls = await enviarFotos(idImportacao, fotos);

      const nomePlanejador = texto(linha[COLUNAS.planejador]);
      const planejadorId = nomePlanejador ? planejadores.get(normalizar(nomePlanejador)) || null : null;
      if (nomePlanejador && !planejadorId) planejadoresNaoEncontrados.add(nomePlanejador);

      const { status, mapeado } = mapearStatus(texto(linha[COLUNAS.status]));
      if (!mapeado) statusForaDoMapa.add(texto(linha[COLUNAS.status]));

      const { dados, valorAusente } = montarPayload(linha, { pep, autorId: autor.id, planejadorId });

      // Grava orçamento + Rev 00 em uma única transação Prisma.
      const criado = await orcamentoRepository.create({
        ...dados,
        status,
        foto_1: urls[0],
        foto_2: urls[1] || null,
        foto_3: urls[2] || null,
        observacao_inicial: `Importação histórica do registro ${idImportacao} — planilha "${path.basename(caminhoPlanilha)}".`,
      });

      resumo.importados += 1;
      resumo.fotos += urls.length;
      log(TAG.ok, `${posicao} ${etiqueta}: ${urls.length} imagem(ns) enviada(s) com sucesso → orçamento #${criado.id} (Rev 00).`);

      if (valorAusente) {
        log(TAG.aviso, `${posicao} ${etiqueta}: valor não informado na planilha — gravado como 0,00 (a revisão de valor pode ser lançada depois).`);
      }
      if (urls.length < LIMITE_FOTOS) {
        log(TAG.info, `${posicao} ${etiqueta}: apenas ${urls.length} foto(s) disponível(is) para este registro.`);
      }
      if (nomePlanejador && !planejadorId) {
        log(TAG.aviso, `${posicao} ${etiqueta}: planejador "${nomePlanejador}" não encontrado na tabela de usuários — campo deixado em branco.`);
      }
    } catch (err) {
      resumo.falhas += 1;
      log(TAG.erro, `${posicao} ${etiqueta}: ${err.message}`);
    }
  }

  // Prefixos de imagem que não pertencem a nenhuma linha da planilha.
  const orfaos = [...indice.porPrefixo.keys()].filter((id) => !idsDaPlanilha.has(id));

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log('');
  console.log('---------------------------------------------------------------------');
  console.log(' RESUMO DA IMPORTAÇÃO');
  console.log('---------------------------------------------------------------------');
  log(TAG.info, `Registros na planilha..: ${resumo.lidos}`);
  log(TAG.ok, `Orçamentos importados..: ${resumo.importados}`);
  log(TAG.info, `Já existentes (ignorados): ${resumo.ignorados}`);
  log(TAG.info, `Falhas.................: ${resumo.falhas}`);
  log(TAG.info, `Imagens enviadas.......: ${resumo.fotos}`);
  log(TAG.info, `Tempo..................: ${segundos}s`);

  if (orfaos.length > 0) {
    log(TAG.aviso, `${orfaos.length} prefixo(s) de imagem sem linha na planilha: ${orfaos.join(', ')}`);
  }
  if (planejadoresNaoEncontrados.size > 0) {
    log(TAG.aviso, `Planejadores não cadastrados: ${[...planejadoresNaoEncontrados].join(', ')}`);
  }
  if (statusForaDoMapa.size > 0) {
    log(TAG.aviso, `Status traduzidos por heurística: ${[...statusForaDoMapa].join(', ')}`);
  }

  console.log('');
  return resumo;
}

async function main() {
  try {
    const resumo = await importar();
    process.exitCode = resumo.falhas > 0 ? 1 : 0;
  } catch (err) {
    log(TAG.erro, `Falha na importação: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

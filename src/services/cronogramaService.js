'use strict';

const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');
const cronogramaRepository = require('../repositories/cronogramaRepository');
const uploadService = require('./uploadService');
const { analisarCronograma } = require('./cronogramaParser');
const { aplicarNoUpload } = require('./caminhoCriticoService');

/** Perfis autorizados a enviar novas revisões de cronograma. */
const PERFIS_ENVIO = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
/** Perfis que excluem qualquer revisão; o PLANEJADOR exclui apenas as que enviou. */
const PERFIS_EXCLUSAO_TOTAL = ['SUPERVISOR', 'ADMIN'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 0 → "Rev 00", 1 → "Rev 01", ... */
function rotularRevisao(numero) {
  return `Rev ${String(numero).padStart(2, '0')}`;
}

async function garantirObra(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'Informe o "obra_id" (número inteiro positivo) da obra do cronograma.');
  }
  if (!(await obraRepository.existsById(id))) {
    throw new AppError(404, `Obra ${id} não encontrada.`);
  }
  return id;
}

function dataSnapshotDe(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return new Date();
  const texto = String(valor).trim();
  // Data sem hora (input type="date"): meio-dia de Brasília, para não mudar de dia com o fuso.
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00-03:00`) : new Date(texto);
  if (Number.isNaN(data.getTime())) {
    throw new AppError(400, 'O campo "data_snapshot" deve ser uma data válida (ISO 8601).');
  }
  return data;
}

function textoOpcional(valor, max) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto ? texto.slice(0, max) : null;
}

/** Compara SS ignorando espaços, pontuação e zeros à esquerda ("SS 043/25" = "SS43-25"). */
function mesmaSs(a, b) {
  const chave = (valor) =>
    String(valor || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .replace(/^SS0*/, 'SS');
  return chave(a) === chave(b);
}

function dataDoPeriodo(valor) {
  return valor ? new Date(`${valor}T00:00:00Z`) : null;
}

/**
 * POST /api/cronogramas/upload — recebe o arquivo do modelo padrão, faz o parse,
 * guarda o original no Cloudinary e cria o snapshot com todas as atividades.
 */
async function enviarCronograma(arquivo, payload = {}, usuario) {
  if (!usuario || !PERFIS_ENVIO.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_ENVIO.join(', ')} podem enviar cronogramas.`);
  }
  if (!arquivo || !arquivo.buffer || arquivo.size === 0) {
    throw new AppError(400, 'Envie a planilha do cronograma no campo "arquivo" (multipart/form-data).');
  }

  const obraId = await garantirObra(payload.obra_id ?? payload.obraId);
  const dataSnapshot = dataSnapshotDe(payload.data_snapshot ?? payload.dataSnapshot);
  const hash = crypto.createHash('sha256').update(arquivo.buffer).digest('hex');
  const arquivoNome = textoOpcional(arquivo.originalname, 255);
  const forcar = ['true', '1', 'sim'].includes(String(payload.forcar ?? '').toLowerCase());

  /** Registra no histórico uma importação recusada (sem mascarar o erro original). */
  const registrarFalha = async (mensagem, extra = {}) => {
    try {
      await cronogramaRepository.registrarHistorico({
        obra_id: obraId,
        acao: 'FALHA',
        arquivo_nome: arquivoNome,
        arquivo_hash: hash,
        usuario_id: usuario.id ?? null,
        detalhes: { mensagem, ...extra },
      });
    } catch (err) {
      console.error('[cronograma] Falha ao registrar o histórico:', err.message);
    }
  };

  // 0) Mesma planilha já importada nesta obra: pede confirmação antes de duplicar.
  const repetida = await cronogramaRepository.buscarPorHash(obraId, hash);
  if (repetida && !forcar) {
    const quando = new Date(repetida.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const autor = repetida.autor?.nome ? ` por ${repetida.autor.nome}` : '';
    const mensagem = `Este arquivo já foi importado nesta obra como ${repetida.versao} em ${quando}${autor}. Confirme para importar mesmo assim.`;
    await registrarFalha(mensagem, { motivo: 'DUPLICADO', versao_existente: repetida.versao });
    throw new AppError(409, mensagem, {
      codigo: 'ARQUIVO_DUPLICADO',
      versao_existente: {
        id: repetida.id,
        versao: repetida.versao,
        importado_em: repetida.created_at,
        arquivo_nome: repetida.arquivo_nome,
      },
    });
  }

  // 1) Parse antes do upload: arquivos fora do modelo não chegam ao Cloudinary.
  let analise;
  try {
    analise = analisarCronograma(arquivo.buffer);
  } catch (err) {
    if (err instanceof AppError) {
      await registrarFalha(err.message, { motivo: 'ARQUIVO_INVALIDO', ...(err.details || {}) });
    }
    throw err;
  }
  if (repetida) {
    analise.avisos.push(`Arquivo idêntico ao da ${repetida.versao}, importado novamente por confirmação do usuário.`);
  }

  // 1b) Caminho crítico (CPM) e folgas de cada atividade.
  const cpm = aplicarNoUpload(analise.atividades, {
    possuiColunaCritica: (analise.resumo.colunas_detectadas || []).includes('critica'),
  });
  analise.avisos.push(...cpm.avisos);
  analise.resumo.atividades_criticas = analise.atividades.filter((a) => a.caminho_critico).length;
  analise.resumo.caminho_critico = cpm.resumo;

  const obra = await obraRepository.findById(obraId);
  if (analise.resumo.ss_arquivo && obra?.ss && !mesmaSs(analise.resumo.ss_arquivo, obra.ss)) {
    analise.avisos.push(
      `A SS do arquivo (${analise.resumo.ss_arquivo}) difere da SS da obra (${obra.ss}). Confira se o cronograma é desta obra.`
    );
  }

  // 2) Arquivo original para rastreabilidade. Uma falha do armazenamento não
  // impede a importação: os dados já foram lidos e a revisão é gravada sem o link.
  let enviado = { url: null };
  try {
    enviado = await uploadService.processarDocumento(arquivo, {
      pasta: process.env.CLOUDINARY_FOLDER_CRONOGRAMAS || 'synapse/obras/cronogramas',
    });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    console.error(`[cronograma] Arquivo original não armazenado (obra ${obraId}): ${err.message}`);
    analise.avisos.push(
      'O cronograma foi importado, mas o arquivo original não pôde ser guardado no armazenamento (Cloudinary). ' +
        'Os dados estão salvos; avise o administrador para corrigir as credenciais e reenvie se precisar do arquivo anexado.'
    );
  }

  // 3) Snapshot + atividades em lote (transação).
  const dados = {
    obra_id: obraId,
    data_snapshot: dataSnapshot,
    periodo_inicio: dataDoPeriodo(analise.periodo_inicio),
    periodo_fim: dataDoPeriodo(analise.periodo_fim),
    autor_id: usuario.id ?? null,
    arquivo_url: enviado.url,
    arquivo_nome: arquivoNome,
    arquivo_hash: hash,
    arquivo_tamanho: arquivo.size ?? null,
    observacao: textoOpcional(payload.observacao, 2000),
    resumo: { ...analise.resumo, abas: analise.abas, avisos: analise.avisos },
    curva_s: analise.curva_s ?? Prisma.DbNull,
    histograma_mao_de_obra: analise.histograma_mao_de_obra ?? Prisma.DbNull,
    histograma_equipamentos: analise.histograma_equipamentos ?? Prisma.DbNull,
  };
  const atividades = analise.atividades.map((atividade) => ({
    ...atividade,
    recursos_mao_de_obra: atividade.recursos_mao_de_obra ?? Prisma.DbNull,
    recursos_equipamentos: atividade.recursos_equipamentos ?? Prisma.DbNull,
  }));

  const historico = {
    arquivo_nome: arquivoNome,
    arquivo_hash: hash,
    arquivo_url: enviado.url,
    total_atividades: atividades.length,
    usuario_id: usuario.id ?? null,
    detalhes: {
      observacao: dados.observacao,
      data_snapshot: dataSnapshot.toISOString(),
      avisos: analise.avisos,
      reimportacao_de: repetida ? repetida.versao : null,
    },
  };

  let versao;
  try {
    versao = await cronogramaRepository.criarVersao({ dados, atividades, rotular: rotularRevisao, historico });
  } catch (err) {
    // Upload simultâneo na mesma obra: tenta uma vez com o próximo número.
    if (err?.code !== 'P2002') throw err;
    versao = await cronogramaRepository.criarVersao({ dados, atividades, rotular: rotularRevisao, historico });
  }

  return { ...versao, avisos: analise.avisos };
}

/** GET /api/cronogramas/obra/:obraId — revisões enviadas, da mais recente à mais antiga. */
async function listarPorObra(obraIdParam) {
  const obraId = await garantirObra(obraIdParam);
  const versoes = await cronogramaRepository.listarPorObra(obraId);
  return { data: versoes, total: versoes.length, vigente_id: versoes[0]?.id ?? null };
}

/** GET /api/cronogramas/:id — versão completa com atividades, Curva S e histogramas. */
async function obterVersao(idParam) {
  if (!UUID.test(String(idParam || ''))) {
    throw new AppError(400, 'O identificador da versão do cronograma deve ser um UUID.');
  }
  const versao = await cronogramaRepository.buscarPorId(idParam);
  if (!versao) throw new AppError(404, 'Versão de cronograma não encontrada.');
  return versao;
}

/** GET /api/cronogramas/obra/:obraId/historico — importações, falhas e exclusões. */
async function listarHistorico(obraIdParam) {
  const obraId = await garantirObra(obraIdParam);
  const data = await cronogramaRepository.listarHistorico(obraId);
  return { data, total: data.length };
}

/**
 * DELETE /api/cronogramas/:id — exclui a revisão (atividades incluídas) e
 * registra o motivo no histórico. SUPERVISOR/ADMIN excluem qualquer revisão;
 * o PLANEJADOR, apenas as que ele mesmo enviou.
 */
async function excluirVersao(idParam, payload = {}, usuario) {
  if (!usuario || !PERFIS_ENVIO.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_ENVIO.join(', ')} podem excluir revisões do cronograma.`);
  }
  if (!UUID.test(String(idParam || ''))) {
    throw new AppError(400, 'O identificador da versão do cronograma deve ser um UUID.');
  }
  const versao = await cronogramaRepository.buscarPorId(idParam);
  if (!versao) throw new AppError(404, 'Versão de cronograma não encontrada.');
  if (!PERFIS_EXCLUSAO_TOTAL.includes(usuario.perfil) && versao.autor_id !== usuario.id) {
    throw new AppError(403, 'O planejador só pode excluir as revisões que ele mesmo enviou. Peça a um supervisor.');
  }

  const resultado = await cronogramaRepository.excluirVersao(versao.id, {
    usuarioId: usuario.id ?? null,
    motivo: textoOpcional(payload.motivo, 500),
  });
  if (!resultado) throw new AppError(404, 'Versão de cronograma não encontrada.');
  return resultado;
}

module.exports = {
  enviarCronograma,
  listarPorObra,
  listarHistorico,
  obterVersao,
  excluirVersao,
  rotularRevisao,
  PERFIS_ENVIO,
};

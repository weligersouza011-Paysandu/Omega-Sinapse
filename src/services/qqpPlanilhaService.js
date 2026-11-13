'use strict';

const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const AppError = require('../errors/AppError');
const qqpRepository = require('../repositories/qqpRepository');
const qqp = require('./qqpService');
const dinheiro = require('../utils/dinheiro');
const classificacao = require('../utils/classificacaoQqp');

/**
 * Planilhas do QQP: template XLSX (as 8 colunas do sistema Projeção Financeira + Tipo de
 * unidade + Categoria Synapse), importação com prévia e substituição confirmada por
 * código, e PDF do QQP de um contrato/TAC.
 *
 * Uma planilha exportada pelo Projeção (só 8 colunas) também é aceita: o tipo de unidade e
 * a categoria do Synapse são deduzidos do texto (regras em utils/classificacaoQqp.js) e a
 * prévia mostra o que foi deduzido para revisão antes de gravar.
 */

const COLUNAS_PROJECAO = ['Categoria', 'Grupo', 'Subgrupo', 'Código', 'Descrição', 'Unidade', 'Quantidade', 'Valor Unitário'];
const COLUNAS_SYNAPSE = ['Tipo de unidade', 'Categoria Synapse'];
const COLUNAS = [...COLUNAS_PROJECAO, ...COLUNAS_SYNAPSE];
const MAX_LINHAS = 10000;

const ROTULO_UNIDADE = { HORA: 'Por hora', DIA: 'Por dia útil', MES: 'Por mês', UNIDADE: 'Por unidade' };
const ROTULO_CATEGORIA = { HH: 'HH (mão de obra)', EQUIPAMENTO: 'Equipamento', INSUMO: 'Insumo', OUTROS: 'Outros' };

const estaVazio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

/* -------------------------------------------------------------------------- */
/* Contexto                                                                   */
/* -------------------------------------------------------------------------- */

/** Contrato + escopo (0 = TAC0, id do TAC). Planilha e PDF são sempre de um escopo. */
async function contextoDoEscopo(idParam, tacParam) {
  const contratoId = qqp.validarId(idParam);
  const contrato = await qqp.carregarEstado(contratoId);
  const escopo = qqp.lerEscopo(tacParam, { padraoTodos: false });
  if (escopo === undefined) throw new AppError(400, 'Escolha o contrato original (TAC0) ou um TAC.');
  qqp.garantirEscopoDoContrato(contrato, escopo);
  const tac = escopo ? contrato.aditivos.find((t) => t.id === escopo) : null;
  return { contrato, contratoId, escopo, tac, rotulo: qqp.rotuloEscopo(contrato, tac) };
}

function nomeDeArquivo(contexto, prefixo, extensao) {
  const base = `${prefixo} ${contexto.rotulo}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return `${base}.${extensao}`;
}

/* -------------------------------------------------------------------------- */
/* Template / exportação XLSX                                                 */
/* -------------------------------------------------------------------------- */

/** Número para a célula; valores com mais de 15 dígitos vão como texto para não perder precisão. */
function celulaNumerica(texto) {
  if (texto === null || texto === undefined) return '';
  const digitos = String(texto).replace(/[^0-9]/g, '').replace(/^0+/, '');
  return digitos.length > 15 ? String(texto) : Number(texto);
}

/**
 * GET /api/contratos/:id/qqp/template?tac=0|<id>&vazio=true
 * Sem `vazio`, a planilha já vem com os itens atuais do escopo (serve de exportação).
 */
async function gerarTemplate(idParam, query = {}, usuario) {
  qqp.validarUsuario(usuario);
  const contexto = await contextoDoEscopo(idParam, query.tac);
  const vazio = String(query.vazio || '').toLowerCase() === 'true';
  const itens = vazio ? [] : await qqpRepository.listarItens(contexto.contratoId, contexto.escopo);

  const linhas = [COLUNAS];
  for (const item of itens) {
    const formatado = qqp.formatarItem(item);
    linhas.push([
      formatado.categoria_planilha || '',
      formatado.grupo || '',
      formatado.subgrupo || '',
      formatado.codigo,
      formatado.descricao,
      formatado.unidade_planilha || '',
      celulaNumerica(formatado.quantidade ?? '0'),
      celulaNumerica(formatado.preco_unitario_exato),
      formatado.unidade,
      formatado.categoria,
    ]);
  }
  const planilha = XLSX.utils.aoa_to_sheet(linhas);
  planilha['!cols'] = [28, 26, 26, 16, 54, 12, 14, 18, 16, 18].map((wch) => ({ wch }));
  planilha['!autofilter'] = { ref: `A1:J${Math.max(linhas.length, 2)}` };
  for (let r = 1; r < linhas.length; r += 1) {
    const qtd = planilha[XLSX.utils.encode_cell({ r, c: 6 })];
    const preco = planilha[XLSX.utils.encode_cell({ r, c: 7 })];
    if (qtd && qtd.t === 'n') qtd.z = '0.00######';
    if (preco && preco.t === 'n') preco.z = '#,##0.00######';
  }

  const instrucoes = XLSX.utils.aoa_to_sheet([
    ['Como preencher o QQP'],
    [''],
    ['As 8 primeiras colunas seguem o template do sistema Projeção Financeira; as duas últimas são do Synapse.'],
    ['Categoria, Grupo e Subgrupo montam a árvore do QQP. Código é único dentro do contrato/TAC.'],
    ['Quantidade (contratada) e Valor Unitário: números maiores ou iguais a zero, até 8 casas decimais.'],
    ['Valores com mais de 15 dígitos devem ser digitados como texto (precedidos de apóstrofo).'],
    [''],
    ['Tipo de unidade (usado no cálculo da projeção)', 'Valores aceitos'],
    ...Object.entries(ROTULO_UNIDADE).map(([valor, rotulo]) => [rotulo, valor]),
    ['Vazio: deduzido da coluna Unidade (mês → MES; h/hora → HORA; dia → DIA; demais → UNIDADE).'],
    [''],
    ['Categoria Synapse', 'Valores aceitos'],
    ...Object.entries(ROTULO_CATEGORIA).map(([valor, rotulo]) => [rotulo, valor]),
    ['Vazio: deduzida da Categoria/Grupo (materiais → INSUMO; mão de obra por hora → HH; máquinas/equipamentos → EQUIPAMENTO; demais → OUTROS).'],
    [''],
    ['Na importação, itens com código já existente no contrato/TAC são substituídos (após confirmação); os demais são incluídos.'],
  ]);
  instrucoes['!cols'] = [{ wch: 70 }, { wch: 18 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilha, 'QQP');
  XLSX.utils.book_append_sheet(pasta, instrucoes, 'Instruções');
  const buffer = XLSX.write(pasta, { type: 'buffer', bookType: 'xlsx', compression: true });
  return { buffer, nomeArquivo: nomeDeArquivo(contexto, vazio ? 'Template QQP' : 'QQP', 'xlsx'), linhas: itens.length };
}

/* -------------------------------------------------------------------------- */
/* Importação                                                                 */
/* -------------------------------------------------------------------------- */

/** Valor da célula como texto; números viram a forma decimal mais curta (sem notação científica). */
function textoDaCelula(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return '';
    const texto = String(valor);
    if (!/e/i.test(texto)) return texto;
    return valor.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  }
  return String(valor).trim();
}

function cabecalhoConfere(linha) {
  const normal = (v) => classificacao.normalizar(v);
  const ok = COLUNAS_PROJECAO.every((rotulo, i) => normal(linha[i]) === normal(rotulo));
  if (!ok) {
    throw new AppError(400, `Os cabeçalhos devem estar na ordem: ${COLUNAS_PROJECAO.join(', ')} (e, opcionalmente, ${COLUNAS_SYNAPSE.join(', ')}).`);
  }
  return {
    temTipo: normal(linha[8]) === normal(COLUNAS_SYNAPSE[0]),
    temCategoria: normal(linha[9]) === normal(COLUNAS_SYNAPSE[1]),
  };
}

/** Lê a primeira aba do XLSX e valida cada linha. Função pura (sem banco). */
function lerPlanilha(buffer) {
  if (!buffer || !buffer.length) throw new AppError(400, 'Selecione uma planilha .xlsx.');
  let pasta;
  try {
    pasta = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellFormula: false, cellHTML: false });
  } catch {
    throw new AppError(400, 'Não foi possível ler o arquivo. Use um template Excel .xlsx válido.');
  }
  const aba = pasta.Sheets[pasta.SheetNames[0]];
  if (!aba) throw new AppError(400, 'A planilha não contém uma aba para importar.');
  const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, raw: true, defval: '', blankrows: false });
  if (!linhas.length) throw new AppError(400, 'A planilha está vazia.');
  const colunas = cabecalhoConfere(linhas[0]);

  const itens = [];
  const erros = [];
  const vistos = new Map();
  linhas.slice(1).forEach((linha, indice) => {
    const numeroLinha = indice + 2;
    const valores = Array.from({ length: 10 }, (_, i) => textoDaCelula(linha[i]));
    if (valores.every((v) => v === '')) return;
    const [categoriaPlanilha, grupo, subgrupo, codigoBruto, descricao, unidadePlanilha, quantidade, preco, tipo, categoriaSynapse] = valores;
    const problemas = [];
    const avisos = [];

    let codigo = null;
    try {
      codigo = qqp.lerCodigo(codigoBruto);
    } catch (err) {
      problemas.push(err.message);
    }
    if (!descricao) problemas.push('Descrição vazia.');
    if (!categoriaPlanilha || !grupo || !subgrupo) problemas.push('Preencha Categoria, Grupo e Subgrupo.');
    if (!unidadePlanilha) problemas.push('Unidade vazia.');
    if (unidadePlanilha.length > 30) problemas.push('Unidade aceita no máximo 30 caracteres.');

    const lerNumero = (valor, rotulo, opcoes) => {
      try {
        return qqp.decimalExato(valor, rotulo, opcoes);
      } catch (err) {
        problemas.push(err.message.replace(`O campo "${rotulo}"`, rotulo));
        return null;
      }
    };
    const qtd = lerNumero(quantidade, 'Quantidade', { casas: 8, inteiros: 16 });
    const valorUnitario = lerNumero(preco, 'Valor Unitário', { casas: 8, inteiros: 10 });

    let unidade = colunas.temTipo && tipo ? classificacao.unidadeInformada(tipo) : null;
    if (colunas.temTipo && tipo && !unidade) problemas.push(`Tipo de unidade "${tipo}" inválido (use HORA, DIA, MES ou UNIDADE).`);
    let unidadeDeduzida = false;
    if (!unidade && !(colunas.temTipo && tipo)) {
      unidade = classificacao.unidadeDoTexto(unidadePlanilha);
      unidadeDeduzida = true;
      if (!unidade) {
        unidade = 'UNIDADE';
        if (unidadePlanilha) avisos.push(`Unidade "${unidadePlanilha}" tratada como UNIDADE (lançamento por quantidade).`);
      }
    }

    let categoria = colunas.temCategoria && categoriaSynapse ? classificacao.categoriaInformada(categoriaSynapse) : null;
    if (colunas.temCategoria && categoriaSynapse && !categoria) {
      problemas.push(`Categoria Synapse "${categoriaSynapse}" inválida (use HH, EQUIPAMENTO, INSUMO ou OUTROS).`);
    }
    let categoriaDeduzida = false;
    if (!categoria && !(colunas.temCategoria && categoriaSynapse)) {
      categoria = classificacao.categoriaDoTexto({ categoria: categoriaPlanilha, grupo, subgrupo, descricao }, unidade);
      categoriaDeduzida = true;
      if (!categoria) {
        categoria = 'OUTROS';
        avisos.push('Categoria Synapse não identificada: ficou OUTROS.');
      }
    }

    if (codigo) {
      if (vistos.has(codigo)) problemas.push(`Código repetido na planilha (também na linha ${vistos.get(codigo)}).`);
      else vistos.set(codigo, numeroLinha);
    }
    const textoLongo = [[categoriaPlanilha, 'Categoria'], [grupo, 'Grupo'], [subgrupo, 'Subgrupo']].find(([v]) => v.length > 200);
    if (textoLongo) problemas.push(`${textoLongo[1]} aceita no máximo 200 caracteres.`);

    if (problemas.length) {
      erros.push({ linha: numeroLinha, codigo: codigoBruto || null, mensagens: problemas });
      return;
    }
    itens.push({
      linha: numeroLinha,
      posicao: itens.length,
      codigo,
      descricao,
      categoria_planilha: categoriaPlanilha,
      grupo,
      subgrupo,
      unidade_planilha: unidadePlanilha,
      quantidade: qtd,
      preco_unitario: valorUnitario,
      unidade,
      categoria,
      unidade_deduzida: unidadeDeduzida,
      categoria_deduzida: categoriaDeduzida,
      avisos,
    });
  });

  if (itens.length + erros.length > MAX_LINHAS) throw new AppError(400, `A planilha excede o limite de ${MAX_LINHAS} itens por importação.`);
  if (!itens.length && !erros.length) throw new AppError(400, 'A planilha não contém itens para importar.');
  return { itens, erros, colunas };
}

const CAMPOS_COMPARADOS = ['descricao', 'categoria_planilha', 'grupo', 'subgrupo', 'unidade_planilha', 'quantidade', 'preco_unitario', 'unidade', 'categoria'];

/** Compara a planilha com o QQP atual do escopo: novo, substituir (com as diferenças) ou igual. */
function compararComAtual(itens, existentes) {
  const porCodigo = new Map(existentes.map((item) => [item.codigo, item]));
  const erros = [];
  const linhas = itens.map((item) => {
    const atual = porCodigo.get(item.codigo);
    if (!atual) return { ...item, acao: 'novo' };
    const formatado = qqp.formatarItem(atual);
    const antes = {
      descricao: formatado.descricao,
      categoria_planilha: formatado.categoria_planilha,
      grupo: formatado.grupo,
      subgrupo: formatado.subgrupo,
      unidade_planilha: formatado.unidade_planilha,
      quantidade: formatado.quantidade,
      preco_unitario: formatado.preco_unitario_exato,
      unidade: formatado.unidade,
      categoria: formatado.categoria,
    };
    const mudancas = CAMPOS_COMPARADOS.filter((campo) => String(antes[campo] ?? '') !== String(item[campo] ?? ''));
    if (mudancas.includes('unidade') && formatado.recursos_em_uso > 0) {
      erros.push({
        linha: item.linha,
        codigo: item.codigo,
        mensagens: [`O tipo de unidade não pode mudar (${antes.unidade} → ${item.unidade}): o item está em uso em recursos de obra.`],
      });
    }
    return { ...item, id: atual.id, acao: mudancas.length ? 'substituir' : 'igual', mudancas, antes, reativar: !atual.ativo };
  });
  return { linhas, erros };
}

/**
 * POST /api/contratos/:id/qqp/importar?tac=0|<id>  (multipart: arquivo)
 * Sem `confirmar=true`: só a prévia (novos, substituídos, iguais, erros e o que foi deduzido).
 * Com `confirmar=true` e `qqp_revisao`: grava tudo numa transação (nenhuma linha com erro é aceita).
 */
async function importar(idParam, arquivo, campos = {}, usuario) {
  qqp.exigirPerfil(usuario, qqp.PERFIS_QUE_GEREM_QQP, 'importar o QQP');
  if (!arquivo || !arquivo.buffer) throw new AppError(400, 'Selecione uma planilha .xlsx (campo "arquivo").');
  const contexto = await contextoDoEscopo(idParam, campos.tac);
  const lido = lerPlanilha(arquivo.buffer);
  const existentes = await qqpRepository.listarItens(contexto.contratoId, contexto.escopo);
  const comparacao = compararComAtual(lido.itens, existentes);
  const erros = [...lido.erros, ...comparacao.erros].sort((a, b) => a.linha - b.linha);

  const resumo = {
    novos: comparacao.linhas.filter((l) => l.acao === 'novo').length,
    substituidos: comparacao.linhas.filter((l) => l.acao === 'substituir').length,
    iguais: comparacao.linhas.filter((l) => l.acao === 'igual').length,
    com_erro: erros.length,
    deduzidos: comparacao.linhas.filter((l) => l.unidade_deduzida || l.categoria_deduzida).length,
    com_aviso: comparacao.linhas.filter((l) => l.avisos.length).length,
  };
  const previa = {
    tac: contexto.escopo,
    rotulo: contexto.rotulo,
    colunas_synapse: lido.colunas,
    resumo,
    linhas: comparacao.linhas,
    erros,
    qqp_revisao: contexto.contrato.qqp_revisao,
  };
  if (String(campos.confirmar || '').toLowerCase() !== 'true') return { ...previa, aplicado: false };

  if (erros.length) {
    throw new AppError(400, `A planilha tem ${erros.length} linha(s) com erro. Corrija e importe de novo.`, { erros });
  }
  const novos = comparacao.linhas.filter((l) => l.acao === 'novo');
  const alterados = comparacao.linhas.filter((l) => l.acao !== 'novo');
  const { revisao } = await qqp.gravarComRevisao(contexto.contratoId, campos.qqp_revisao, async (tx) => {
    const dadosDe = (l) => ({
      descricao: l.descricao,
      categoria_planilha: l.categoria_planilha,
      grupo: l.grupo,
      subgrupo: l.subgrupo,
      unidade_planilha: l.unidade_planilha,
      quantidade: l.quantidade,
      preco_unitario: l.preco_unitario,
      unidade: l.unidade,
      categoria: l.categoria,
      posicao: l.posicao,
    });
    if (novos.length) {
      await tx.itemQqp.createMany({
        data: novos.map((l) => ({
          ...dadosDe(l),
          contrato_id: contexto.contratoId,
          termo_aditivo_id: contexto.escopo || null,
          escopo_tac: contexto.escopo,
          codigo: l.codigo,
          ativo: true,
        })),
      });
    }
    for (const l of alterados) {
      await tx.itemQqp.update({ where: { id: l.id }, data: { ...dadosDe(l), ativo: true } });
    }
  });
  return { ...previa, aplicado: true, qqp_revisao: revisao };
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                        */
/* -------------------------------------------------------------------------- */

const MARGEM = 30;
const COR = { marca: '#164b7d', texto: '#1e293b', suave: '#64748b', linha: '#e2e8f0', categoria: '#e0ecf7', grupo: '#f1f5f9' };
const FUSO_MS = -3 * 60 * 60 * 1000;

/** "1234.5" -> "1.234,50" (mínimo de casas, sem perder as demais). */
function decimalBr(texto, minimoCasas = 2) {
  if (texto === null || texto === undefined || texto === '') return '—';
  const [inteiro, fracao = ''] = String(texto).split('.');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${milhar},${fracao.padEnd(minimoCasas, '0')}`;
}

function reaisBr(valor) {
  if (valor === null || valor === undefined) return '—';
  return `R$ ${decimalBr(dinheiro.centavosParaTexto(dinheiro.arredondarEmCentavos(String(valor))))}`;
}

const COLUNAS_PDF = [
  { titulo: 'Código', largura: 80, alinhar: 'left' },
  { titulo: 'Descrição', largura: 330, alinhar: 'left' },
  { titulo: 'Unidade', largura: 52, alinhar: 'center' },
  { titulo: 'Tipo', largura: 52, alinhar: 'center' },
  { titulo: 'Quantidade', largura: 80, alinhar: 'right' },
  { titulo: 'Valor unitário', largura: 90, alinhar: 'right' },
  { titulo: 'Total', largura: 98, alinhar: 'right' },
];

/** GET /api/contratos/:id/qqp/pdf?tac=0|<id> */
async function gerarPdf(idParam, query = {}, usuario) {
  qqp.validarUsuario(usuario);
  const contexto = await contextoDoEscopo(idParam, query.tac);
  const itens = await qqp.itensComTotais(contexto.contratoId, contexto.escopo);
  const { arvore, total } = qqp.montarArvore(itens, contexto.contrato.qqp_ordem?.ordem);

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGEM,
    bufferPages: true,
    info: { Title: `QQP ${contexto.rotulo}`, Author: 'Synapse · Omega Service', Subject: 'Quadro de Quantidades e Preços' },
  });
  const pedacos = [];
  const pronto = new Promise((resolve, reject) => {
    doc.on('data', (p) => pedacos.push(p));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);
  });

  const largura = doc.page.width - MARGEM * 2;
  const limite = () => doc.page.height - MARGEM - 16;
  const agora = new Date(Date.now() + FUSO_MS).toISOString();

  const cabecalho = () => {
    doc.rect(0, 0, doc.page.width, 50).fill(COR.marca);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('QQP — Quadro de Quantidades e Preços', MARGEM, 12, { width: largura * 0.6, lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).text(contexto.contrato.descricao || '', MARGEM, 31, { width: largura * 0.6, lineBreak: false, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(11).text(contexto.rotulo, MARGEM, 12, { width: largura, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).text(`${contexto.contrato.id_vale} · emitido em ${agora.slice(8, 10)}/${agora.slice(5, 7)}/${agora.slice(0, 4)} ${agora.slice(11, 16)}`, MARGEM, 31, { width: largura, align: 'right', lineBreak: false });
    doc.y = 62;
    let x = MARGEM;
    doc.rect(MARGEM, doc.y, largura, 16).fill(COR.texto);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    for (const coluna of COLUNAS_PDF) {
      doc.text(coluna.titulo, x + 4, doc.y + 4.5, { width: coluna.largura - 8, align: coluna.alinhar, lineBreak: false });
      x += coluna.largura;
    }
    doc.y = 62 + 18;
  };
  const garantirEspaco = (altura) => {
    if (doc.y + altura > limite()) {
      doc.addPage();
      cabecalho();
    }
  };
  const faixa = (texto, valor, cor, recuo, negrito = true) => {
    garantirEspaco(15);
    const y = doc.y;
    doc.rect(MARGEM, y, largura, 14).fill(cor);
    doc.fillColor(COR.texto).font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    doc.text(texto, MARGEM + 4 + recuo, y + 3.5, { width: largura - 140 - recuo, lineBreak: false, ellipsis: true });
    doc.font('Helvetica-Bold').text(reaisBr(valor), MARGEM, y + 3.5, { width: largura - 4, align: 'right', lineBreak: false });
    doc.y = y + 15;
  };

  cabecalho();
  if (!arvore.length) {
    doc.fillColor(COR.suave).font('Helvetica').fontSize(10).text('Nenhum item neste QQP.', MARGEM, doc.y + 10);
  }
  for (const categoria of arvore) {
    faixa(categoria.categoria, categoria.total, COR.categoria, 0);
    for (const grupo of categoria.grupos) {
      if (grupo.grupo) faixa(grupo.grupo, grupo.total, COR.grupo, 8);
      for (const subgrupo of grupo.subgrupos) {
        if (subgrupo.subgrupo) faixa(subgrupo.subgrupo, subgrupo.total, '#ffffff', 16, false);
        for (const item of subgrupo.itens) {
          const valores = [
            item.codigo,
            item.descricao,
            item.unidade_planilha || '—',
            item.unidade,
            item.quantidade === null ? '—' : decimalBr(item.quantidade),
            `R$ ${decimalBr(item.preco_unitario_exato)}`,
            reaisBr(item.total),
          ];
          doc.font('Helvetica').fontSize(7.5);
          const altura = Math.max(11, doc.heightOfString(item.descricao, { width: COLUNAS_PDF[1].largura - 8 }) + 4);
          garantirEspaco(altura);
          const y = doc.y;
          let x = MARGEM;
          doc.fillColor(item.ativo ? COR.texto : COR.suave);
          COLUNAS_PDF.forEach((coluna, i) => {
            doc.text(valores[i], x + 4, y + 2, { width: coluna.largura - 8, align: coluna.alinhar, lineBreak: i === 1 });
            x += coluna.largura;
          });
          doc.moveTo(MARGEM, y + altura).lineTo(MARGEM + largura, y + altura).lineWidth(0.4).strokeColor(COR.linha).stroke();
          doc.y = y + altura + 1;
        }
      }
    }
  }
  garantirEspaco(20);
  doc.rect(MARGEM, doc.y + 2, largura, 16).fill(COR.marca);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text(`Total do QQP (${itens.length} itens)`, MARGEM + 6, doc.y + 6.5, { width: largura / 2, lineBreak: false });
  doc.text(reaisBr(total), MARGEM, doc.y, { width: largura - 6, align: 'right', lineBreak: false });

  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    // Sem margem inferior durante o rodapé: senão o pdfkit abre uma página nova.
    doc.page.margins.bottom = 0;
    doc.fillColor(COR.suave).font('Helvetica').fontSize(7).text(
      `Página ${i + 1} de ${paginas.count}`,
      MARGEM,
      doc.page.height - MARGEM - 6,
      { width: largura, align: 'right', lineBreak: false }
    );
  }
  doc.end();
  return { buffer: await pronto, nomeArquivo: nomeDeArquivo(contexto, 'QQP', 'pdf'), itens: itens.length };
}

module.exports = { COLUNAS, gerarTemplate, lerPlanilha, compararComAtual, importar, gerarPdf, decimalBr };

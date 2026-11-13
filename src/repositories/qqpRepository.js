'use strict';

const prisma = require('../config/prisma');

const TRANSACAO_TIMEOUT_MS = 60000;

const CONTAGEM = { _count: { select: { recursos: true, projecoes: true } } };

/**
 * Itens do QQP de um contrato. `escopoTac` = 0 (contrato original), o id do TAC, ou
 * undefined para todos. Ordem da planilha (posição), depois código.
 */
async function listarItens(contratoId, escopoTac) {
  return prisma.itemQqp.findMany({
    where: { contrato_id: contratoId, ...(escopoTac === undefined ? {} : { escopo_tac: escopoTac }) },
    orderBy: [{ escopo_tac: 'asc' }, { posicao: 'asc' }, { codigo: 'asc' }],
    include: CONTAGEM,
  });
}

/** Contrato com o que a tela do QQP precisa: revisão, TACs e ordem de visualização. */
async function estadoDoContrato(contratoId) {
  return prisma.contrato.findUnique({
    where: { id: contratoId },
    select: {
      id: true,
      id_vale: true,
      descricao: true,
      numero_sap: true,
      qqp_revisao: true,
      qqp_ordem: { select: { ordem: true, updated_at: true } },
      aditivos: {
        orderBy: [{ data_assinatura: 'asc' }, { id: 'asc' }],
        select: { id: true, numero_tac: true, numero_sap: true, data_inicio: true, data_fim: true },
      },
    },
  });
}

async function revisaoAtual(contratoId) {
  const contrato = await prisma.contrato.findUnique({ where: { id: contratoId }, select: { qqp_revisao: true } });
  return contrato ? contrato.qqp_revisao : null;
}

async function buscarItem(contratoId, itemId, cliente = prisma) {
  return cliente.itemQqp.findFirst({
    where: { id: itemId, contrato_id: contratoId },
    include: CONTAGEM,
  });
}

/** Item pelo código dentro do escopo (0 = contrato original/TAC0; senão, o id do TAC). */
async function buscarItemPorCodigo(contratoId, codigo, escopoTac = 0, cliente = prisma) {
  return cliente.itemQqp.findUnique({
    where: { uq_qqp_codigo_por_escopo: { contrato_id: contratoId, escopo_tac: escopoTac, codigo } },
    include: CONTAGEM,
  });
}

/** Maior posição usada no escopo (novos itens entram no fim). */
async function ultimaPosicao(contratoId, escopoTac, cliente = prisma) {
  const resultado = await cliente.itemQqp.aggregate({
    where: { contrato_id: contratoId, escopo_tac: escopoTac },
    _max: { posicao: true },
  });
  return resultado._max.posicao ?? -1;
}

/**
 * Executa `operacao(tx)` só se a revisão do QQP do contrato ainda for `revisaoEsperada`,
 * incrementando-a na mesma transação. Devolve { conflito: true } se outra gravação venceu.
 */
async function comRevisao(contratoId, revisaoEsperada, operacao) {
  return prisma.$transaction(
    async (tx) => {
      const travado = await tx.contrato.updateMany({
        where: { id: contratoId, qqp_revisao: revisaoEsperada },
        data: { qqp_revisao: { increment: 1 } },
      });
      if (travado.count === 0) return { conflito: true };
      const resultado = await operacao(tx);
      return { conflito: false, revisao: revisaoEsperada + 1, resultado };
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

async function criarItem(contratoId, dados, cliente = prisma) {
  const item = await cliente.itemQqp.create({ data: { contrato_id: contratoId, ...dados } });
  return buscarItem(contratoId, item.id, cliente);
}

async function atualizarItem(contratoId, itemId, dados, cliente = prisma) {
  await cliente.itemQqp.updateMany({ where: { id: itemId, contrato_id: contratoId }, data: dados });
  return buscarItem(contratoId, itemId, cliente);
}

async function excluirItem(contratoId, itemId, cliente = prisma) {
  const resultado = await cliente.itemQqp.deleteMany({ where: { id: itemId, contrato_id: contratoId } });
  return resultado.count > 0;
}

async function salvarOrdem(contratoId, ordem, cliente = prisma) {
  return cliente.qqpOrdemVisualizacao.upsert({
    where: { contrato_id: contratoId },
    create: { contrato_id: contratoId, ordem },
    update: { ordem },
  });
}

const INCLUDE_RECURSO = { item: true };

/** Recursos planejados da obra, com o item do QQP (preço, unidade, categoria). */
async function listarRecursosDaObra(obraId) {
  return prisma.recursoObraQqp.findMany({
    where: { obra_id: obraId },
    orderBy: [{ data_inicio: 'asc' }, { id: 'asc' }],
    include: INCLUDE_RECURSO,
  });
}

async function buscarRecurso(obraId, recursoId) {
  return prisma.recursoObraQqp.findFirst({
    where: { id: recursoId, obra_id: obraId },
    include: INCLUDE_RECURSO,
  });
}

async function criarRecurso(obraId, dados) {
  const recurso = await prisma.recursoObraQqp.create({ data: { obra_id: obraId, ...dados } });
  return buscarRecurso(obraId, recurso.id);
}

async function atualizarRecurso(obraId, recursoId, dados) {
  await prisma.recursoObraQqp.updateMany({ where: { id: recursoId, obra_id: obraId }, data: dados });
  return buscarRecurso(obraId, recursoId);
}

async function excluirRecurso(obraId, recursoId) {
  const resultado = await prisma.recursoObraQqp.deleteMany({ where: { id: recursoId, obra_id: obraId } });
  return resultado.count > 0;
}

/** Contrato da obra (os recursos só podem usar itens do QQP desse contrato). */
async function contratoDaObra(obraId) {
  const obra = await prisma.obra.findUnique({ where: { id: obraId }, select: { id: true, contrato_id: true } });
  return obra;
}

module.exports = {
  listarItens,
  estadoDoContrato,
  revisaoAtual,
  buscarItem,
  buscarItemPorCodigo,
  ultimaPosicao,
  comRevisao,
  criarItem,
  atualizarItem,
  excluirItem,
  salvarOrdem,
  listarRecursosDaObra,
  buscarRecurso,
  criarRecurso,
  atualizarRecurso,
  excluirRecurso,
  contratoDaObra,
};

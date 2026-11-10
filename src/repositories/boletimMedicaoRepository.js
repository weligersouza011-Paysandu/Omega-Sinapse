'use strict';

const prisma = require('../config/prisma');

const TRANSACAO_TIMEOUT_MS = 15000;

/** Boletim com os itens por obra/SS (dados do orçamento para identificar a SS). */
const INCLUDE_BOLETIM = {
  usuario: { select: { nome: true } },
  itens: {
    orderBy: { id: 'asc' },
    include: {
      obra: {
        select: {
          id: true,
          osi_numero: true,
          orcamento: { select: { ss: true, pep: true, descricao: true } },
        },
      },
    },
  },
};

/** Todos os boletins do contrato (do ciclo mais recente ao mais antigo). */
async function listarPorContrato(contratoId) {
  return prisma.boletimMedicao.findMany({
    where: { contrato_id: contratoId },
    orderBy: [{ ciclo_fim: 'desc' }, { id: 'desc' }],
    include: INCLUDE_BOLETIM,
  });
}

async function buscar(contratoId, boletimId) {
  return prisma.boletimMedicao.findFirst({
    where: { id: boletimId, contrato_id: contratoId },
    include: INCLUDE_BOLETIM,
  });
}

/** Existe boletim do contrato cujo ciclo cruza o intervalo informado? */
async function existeCicloSobreposto(contratoId, inicio, fim, ignorarId = null) {
  const encontrado = await prisma.boletimMedicao.findFirst({
    where: {
      contrato_id: contratoId,
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
      ciclo_inicio: { lte: fim },
      ciclo_fim: { gte: inicio },
    },
    select: { numero_bmm: true },
  });
  return encontrado ? encontrado.numero_bmm : null;
}

async function existeNumero(contratoId, numeroBmm) {
  const encontrado = await prisma.boletimMedicao.findUnique({
    where: { uq_bmm_por_contrato: { contrato_id: contratoId, numero_bmm: numeroBmm } },
    select: { id: true },
  });
  return Boolean(encontrado);
}

/** Obras (entre as informadas) que pertencem ao contrato. */
async function obrasDoContrato(contratoId, obraIds) {
  const obras = await prisma.obra.findMany({
    where: { id: { in: obraIds }, contrato_id: contratoId },
    select: { id: true },
  });
  return obras.map((obra) => obra.id);
}

/** Cria o boletim com seus itens na mesma transação. */
async function criar(contratoId, dados, itens, usuarioId = null) {
  const boletim = await prisma.$transaction(
    (tx) =>
      tx.boletimMedicao.create({
        data: {
          contrato_id: contratoId,
          numero_bmm: dados.numero_bmm,
          valor_medido: dados.valor_medido,
          ciclo_inicio: dados.ciclo_inicio,
          ciclo_fim: dados.ciclo_fim,
          status: dados.status,
          observacao: dados.observacao ?? null,
          usuario_id: usuarioId,
          itens: { create: itens.map((item) => ({ obra_id: item.obra_id, valor: item.valor })) },
        },
      }),
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
  return buscar(contratoId, boletim.id);
}

async function atualizar(contratoId, boletimId, dados) {
  await prisma.boletimMedicao.updateMany({ where: { id: boletimId, contrato_id: contratoId }, data: dados });
  return buscar(contratoId, boletimId);
}

async function excluir(contratoId, boletimId) {
  const resultado = await prisma.boletimMedicao.deleteMany({ where: { id: boletimId, contrato_id: contratoId } });
  return resultado.count > 0;
}

/**
 * Obras vinculadas ao contrato com o valor vigente do orçamento e a série de
 * avanço físico (base do Previsto e da Tendência financeiros).
 */
async function obrasComAvanco(contratoId) {
  return prisma.obra.findMany({
    where: { contrato_id: contratoId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      status: true,
      osi_numero: true,
      orcamento: { select: { ss: true, pep: true, descricao: true, valor: true } },
      avanco_fisico: {
        orderBy: [{ data: 'asc' }, { id: 'asc' }],
        select: { data: true, fisico_prev_acum: true, fisico_tend_acum: true, fisico_real_acum: true },
      },
    },
  });
}

/** Previsto e tendência financeiros do contrato por ciclo (planilha importada), em ordem. */
async function curvaDoContrato(contratoId) {
  return prisma.curvaFinanceiraContrato.findMany({
    where: { contrato_id: contratoId },
    orderBy: { ciclo_fim: 'asc' },
  });
}

/** Obra com orçamento, contrato e avanço físico (base da medição e da projeção). */
async function obraParaProjecao(obraId) {
  return prisma.obra.findUnique({
    where: { id: obraId },
    select: {
      id: true,
      status: true,
      osi_numero: true,
      contrato: { select: { id: true, id_vale: true, descricao: true } },
      orcamento: { select: { ss: true, pep: true, descricao: true, valor: true } },
      avanco_fisico: {
        orderBy: [{ data: 'asc' }, { id: 'asc' }],
        select: { data: true, fisico_prev_acum: true, fisico_tend_acum: true, fisico_real_acum: true },
      },
    },
  });
}

/** Linhas de todos os boletins em que a obra pontuou (com os dados do boletim). */
async function itensDaObra(obraId) {
  return prisma.boletimMedicaoItem.findMany({
    where: { obra_id: obraId },
    orderBy: [{ boletim: { ciclo_fim: 'asc' } }, { id: 'asc' }],
    include: {
      boletim: {
        select: { id: true, numero_bmm: true, status: true, ciclo_inicio: true, ciclo_fim: true, valor_medido: true },
      },
    },
  });
}

/** Quantos boletins referenciam a obra (protege a exclusão de obras medidas). */
async function contarItensDaObra(obraId) {
  return prisma.boletimMedicaoItem.count({ where: { obra_id: obraId } });
}

module.exports = {
  listarPorContrato,
  buscar,
  existeCicloSobreposto,
  existeNumero,
  obrasDoContrato,
  criar,
  atualizar,
  excluir,
  obrasComAvanco,
  curvaDoContrato,
  obraParaProjecao,
  itensDaObra,
  contarItensDaObra,
};

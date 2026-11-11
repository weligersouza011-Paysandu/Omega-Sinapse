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

async function existeNumero(contratoId, numeroBmm, ignorarId = null) {
  const encontrado = await prisma.boletimMedicao.findFirst({
    where: { contrato_id: contratoId, numero_bmm: numeroBmm, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
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

/** Obras informadas com o contrato a que pertencem (null = sem contrato). */
async function obrasComContrato(obraIds) {
  return prisma.obra.findMany({
    where: { id: { in: obraIds } },
    select: { id: true, contrato_id: true, contrato: { select: { id_vale: true } } },
  });
}

/** Vincula obras (sem contrato) ao contrato. */
async function vincularObras(contratoId, obraIds) {
  const resultado = await prisma.obra.updateMany({ where: { id: { in: obraIds }, contrato_id: null }, data: { contrato_id: contratoId } });
  return resultado.count;
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

/** Item de um boletim (com o boletim, para conferir o contrato). */
async function buscarItem(contratoId, boletimId, itemId) {
  return prisma.boletimMedicaoItem.findFirst({
    where: { id: itemId, boletim_id: boletimId, boletim: { contrato_id: contratoId } },
  });
}

/** Já existe item da mesma obra ou do mesmo código de SS no boletim? */
async function existeItemDuplicado(boletimId, { obraId = null, ssCodigo = null }, ignorarId = null) {
  const encontrado = await prisma.boletimMedicaoItem.findFirst({
    where: {
      boletim_id: boletimId,
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
      ...(obraId ? { obra_id: obraId } : { obra_id: null, ss_codigo: ssCodigo }),
    },
    select: { id: true },
  });
  return Boolean(encontrado);
}

/**
 * Inclui, altera ou remove um item e ajusta o valor medido do boletim pela diferença,
 * na mesma transação (o que não está detalhado por SS é preservado).
 */
async function incluirItem(boletimId, dados) {
  return prisma.$transaction(
    async (tx) => {
      const item = await tx.boletimMedicaoItem.create({ data: { boletim_id: boletimId, ...dados } });
      await tx.boletimMedicao.update({ where: { id: boletimId }, data: { valor_medido: { increment: dados.valor } } });
      return item;
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

async function alterarItem(boletimId, itemId, dados, diferenca) {
  return prisma.$transaction(
    async (tx) => {
      const item = await tx.boletimMedicaoItem.update({ where: { id: itemId }, data: dados });
      if (diferenca !== 0) {
        await tx.boletimMedicao.update({ where: { id: boletimId }, data: { valor_medido: { increment: diferenca } } });
      }
      return item;
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

async function removerItem(boletimId, itemId, valor) {
  return prisma.$transaction(
    async (tx) => {
      await tx.boletimMedicaoItem.delete({ where: { id: itemId } });
      await tx.boletimMedicao.update({ where: { id: boletimId }, data: { valor_medido: { decrement: valor } } });
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
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

/** Cria ciclos novos na curva do contrato (meses projetados até o fim do contrato). */
async function criarCiclosDaCurva(contratoId, ciclos) {
  if (ciclos.length === 0) return;
  await prisma.curvaFinanceiraContrato.createMany({
    data: ciclos.map((ciclo) => ({ ...ciclo, contrato_id: contratoId })),
    skipDuplicates: true,
  });
}

/** Grava, na mesma transação, as alterações de vários ciclos da curva ([{ id, dados }]). */
async function atualizarCiclosDaCurva(alteracoes) {
  if (alteracoes.length === 0) return;
  await prisma.$transaction(
    alteracoes.map((alteracao) => prisma.curvaFinanceiraContrato.update({ where: { id: alteracao.id }, data: alteracao.dados })),
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
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
  obrasComContrato,
  vincularObras,
  criar,
  atualizar,
  excluir,
  obrasComAvanco,
  buscarItem,
  existeItemDuplicado,
  incluirItem,
  alterarItem,
  removerItem,
  curvaDoContrato,
  criarCiclosDaCurva,
  atualizarCiclosDaCurva,
  obraParaProjecao,
  itensDaObra,
  contarItensDaObra,
};

'use strict';

const prisma = require('../config/prisma');

const TRANSACAO_TIMEOUT_MS = 20000;

const INCLUIR_COMPLETO = {
  obra: { select: { id: true, contrato_id: true, orcamento: { select: { ss: true, descricao: true, pep: true } } } },
  termo_aditivo: { select: { id: true, numero_tac: true, numero_sap: true } },
  usuario: { select: { id: true, nome: true } },
  itens: {
    orderBy: [{ posicao: 'asc' }, { id: 'asc' }],
    include: {
      item_qqp: {
        select: {
          id: true,
          codigo: true,
          descricao: true,
          categoria: true,
          categoria_planilha: true,
          grupo: true,
          subgrupo: true,
          unidade_planilha: true,
          ativo: true,
        },
      },
      semanas: { orderBy: { semana_inicio: 'asc' } },
    },
  },
};

async function buscarContrato(contratoId) {
  return prisma.contrato.findUnique({
    where: { id: contratoId },
    select: { id: true, id_vale: true, numero_sap: true, data_inicio: true, data_fim: true },
  });
}

async function buscarAditivo(contratoId, aditivoId) {
  return prisma.termoAditivo.findFirst({
    where: { id: aditivoId, contrato_id: contratoId },
    select: { id: true, numero_tac: true, numero_sap: true },
  });
}

async function buscarObra(obraId) {
  return prisma.obra.findUnique({
    where: { id: obraId },
    select: {
      id: true,
      contrato_id: true,
      planejador_id: true,
      planejadores: { select: { usuario_id: true } },
    },
  });
}

/** Itens do QQP do escopo (contrato + TAC; escopo 0 = contrato original) entre os ids pedidos. */
async function itensDoEscopo(contratoId, escopoTac, ids) {
  return prisma.itemQqp.findMany({
    where: { contrato_id: contratoId, escopo_tac: escopoTac, id: { in: ids } },
    select: { id: true, codigo: true, descricao: true, unidade: true, preco_unitario: true, ativo: true },
  });
}

/** Datas (AAAA-MM-DD) dos feriados personalizados globais e do contrato no intervalo. */
async function feriadosNoIntervalo(contratoId, inicio, fim) {
  const linhas = await prisma.feriadoPersonalizado.findMany({
    where: {
      data: { gte: inicio, lte: fim },
      OR: [{ contrato_id: null }, { contrato_id: contratoId }],
    },
    select: { data: true },
  });
  return new Set(linhas.map((linha) => linha.data.toISOString().slice(0, 10)));
}

async function listar(filtro) {
  return prisma.projecaoBmm.findMany({
    where: filtro,
    orderBy: [{ referencia: 'desc' }, { obra_id: 'asc' }, { numero_bmm: 'asc' }],
    include: {
      obra: INCLUIR_COMPLETO.obra,
      termo_aditivo: INCLUIR_COMPLETO.termo_aditivo,
      usuario: INCLUIR_COMPLETO.usuario,
      _count: { select: { itens: true } },
    },
  });
}

async function obter(id) {
  return prisma.projecaoBmm.findUnique({ where: { id }, include: INCLUIR_COMPLETO });
}

/** Soma dos totais das projeções do contrato na referência, em texto decimal (ou null se não houver). */
async function somarDoContratoNaReferencia(contratoId, referencia) {
  const resultado = await prisma.projecaoBmm.aggregate({
    where: { contrato_id: contratoId, referencia },
    _sum: { total: true },
    _count: { _all: true },
  });
  return resultado._count._all > 0 ? String(resultado._sum.total) : null;
}

function dadosDosItens(itens) {
  return itens.map((item, posicao) => ({
    item_qqp_id: item.item_qqp_id,
    preco_unitario: item.preco_unitario,
    unidade: item.unidade,
    horas_dia: item.horas_dia,
    total: item.total,
    posicao,
    semanas: { create: item.semanas },
  }));
}

async function criar(cabecalho, itens) {
  return prisma.$transaction(
    async (tx) => {
      const criada = await tx.projecaoBmm.create({ data: cabecalho, select: { id: true } });
      for (const item of dadosDosItens(itens)) {
        await tx.projecaoBmmItem.create({ data: { projecao_id: criada.id, ...item } });
      }
      return criada.id;
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

/** Substitui cabeçalho e linhas da projeção (as linhas antigas saem em cascata). */
async function substituir(id, cabecalho, itens) {
  await prisma.$transaction(
    async (tx) => {
      await tx.projecaoBmmItem.deleteMany({ where: { projecao_id: id } });
      await tx.projecaoBmm.update({ where: { id }, data: cabecalho });
      for (const item of dadosDosItens(itens)) {
        await tx.projecaoBmmItem.create({ data: { projecao_id: id, ...item } });
      }
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

async function excluir(id) {
  const resultado = await prisma.projecaoBmm.deleteMany({ where: { id } });
  return resultado.count > 0;
}

/* ------------------------------ Feriados personalizados ------------------------------ */

async function listarFeriados(filtro) {
  return prisma.feriadoPersonalizado.findMany({
    where: filtro,
    orderBy: [{ data: 'asc' }, { nome: 'asc' }],
    include: { contrato: { select: { id: true, id_vale: true } } },
  });
}

async function buscarFeriado(id) {
  return prisma.feriadoPersonalizado.findUnique({ where: { id } });
}

async function existeFeriado({ data, nome, contrato_id: contratoId }, ignorarId = null) {
  const encontrado = await prisma.feriadoPersonalizado.findFirst({
    where: {
      data,
      nome: { equals: nome, mode: 'insensitive' },
      contrato_id: contratoId,
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(encontrado);
}

async function criarFeriado(dados) {
  return prisma.feriadoPersonalizado.create({ data: dados });
}

async function atualizarFeriado(id, dados) {
  return prisma.feriadoPersonalizado.update({ where: { id }, data: dados });
}

async function excluirFeriado(id) {
  const resultado = await prisma.feriadoPersonalizado.deleteMany({ where: { id } });
  return resultado.count > 0;
}

module.exports = {
  buscarContrato,
  buscarAditivo,
  buscarObra,
  itensDoEscopo,
  feriadosNoIntervalo,
  listar,
  obter,
  somarDoContratoNaReferencia,
  criar,
  substituir,
  excluir,
  listarFeriados,
  buscarFeriado,
  existeFeriado,
  criarFeriado,
  atualizarFeriado,
  excluirFeriado,
};

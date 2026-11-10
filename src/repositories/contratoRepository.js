'use strict';

const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

/** Tempo máximo das transações financeiras (Neon pode estar "frio"). */
const TRANSACAO_TIMEOUT_MS = 15000;

/**
 * Relações carregadas com o contrato: os aditivos em ordem de assinatura e as
 * obras vinculadas com o valor vigente do orçamento (base do valor comprometido).
 */
const INCLUDE_CONTRATO = {
  _count: { select: { boletins: true, itens_qqp: true, curva_financeira: true } },
  aditivos: {
    orderBy: [{ data_assinatura: 'asc' }, { id: 'asc' }],
    include: { usuario: { select: { nome: true } } },
  },
  obras: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      status: true,
      osi_numero: true,
      orcamento: { select: { id: true, ss: true, pep: true, descricao: true, valor: true, status: true } },
    },
  },
};

/** Lista os contratos com aditivos e obras vinculadas. */
async function findAll() {
  return prisma.contrato.findMany({
    orderBy: [{ data_inicio: 'desc' }, { id: 'desc' }],
    include: INCLUDE_CONTRATO,
  });
}

/** Busca um contrato com aditivos e obras vinculadas (ou null). */
async function findById(id) {
  return prisma.contrato.findUnique({ where: { id }, include: INCLUDE_CONTRATO });
}

async function findByIdVale(idVale) {
  return prisma.contrato.findUnique({ where: { id_vale: idVale }, select: { id: true } });
}

async function existsById(id) {
  const contrato = await prisma.contrato.findUnique({ where: { id }, select: { id: true } });
  return Boolean(contrato);
}

/** Cadastra o contrato-mãe. */
async function create(dados) {
  const contrato = await prisma.contrato.create({ data: dados });
  return findById(contrato.id);
}

/**
 * Recalcula o "novo valor total" de cada TAC em ordem de assinatura (valor inicial +
 * aditivos até ele). Chamado depois de criar, editar ou excluir um aditivo.
 */
async function recalcularTetos(tx, contratoId) {
  const contrato = await tx.contrato.findUnique({ where: { id: contratoId }, select: { valor_inicial: true } });
  const aditivos = await tx.termoAditivo.findMany({
    where: { contrato_id: contratoId },
    orderBy: [{ data_assinatura: 'asc' }, { id: 'asc' }],
  });
  let teto = new Prisma.Decimal(contrato.valor_inicial);
  for (const tac of aditivos) {
    teto = teto.plus(tac.valor_aditivo);
    // eslint-disable-next-line no-await-in-loop
    await tx.termoAditivo.update({ where: { id: tac.id }, data: { novo_valor_total: teto } });
  }
}

async function buscarAditivo(contratoId, aditivoId) {
  return prisma.termoAditivo.findFirst({ where: { id: aditivoId, contrato_id: contratoId } });
}

async function existeNumeroTac(contratoId, numeroTac, ignorarId = null) {
  const encontrado = await prisma.termoAditivo.findFirst({
    where: { contrato_id: contratoId, numero_tac: numeroTac, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  });
  return Boolean(encontrado);
}

/** Edita um TAC e recalcula os tetos do contrato. */
async function atualizarAditivo(contratoId, aditivoId, dados) {
  await prisma.$transaction(
    async (tx) => {
      await tx.termoAditivo.update({ where: { id: aditivoId }, data: dados });
      await recalcularTetos(tx, contratoId);
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

/** Exclui um TAC e recalcula os tetos dos demais. */
async function excluirAditivo(contratoId, aditivoId) {
  await prisma.$transaction(
    async (tx) => {
      await tx.termoAditivo.delete({ where: { id: aditivoId } });
      await recalcularTetos(tx, contratoId);
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

/**
 * Atualiza os dados do contrato. Como cada TAC guarda o teto que passou a valer na
 * sua assinatura, os "novos valores totais" são recalculados em ordem quando o
 * valor inicial muda.
 */
async function atualizar(id, dados) {
  await prisma.$transaction(
    async (tx) => {
      await tx.contrato.update({ where: { id }, data: dados });

      if (dados.valor_inicial !== undefined) {
        const aditivos = await tx.termoAditivo.findMany({
          where: { contrato_id: id },
          orderBy: [{ data_assinatura: 'asc' }, { id: 'asc' }],
        });
        let teto = new Prisma.Decimal(dados.valor_inicial);
        for (const tac of aditivos) {
          teto = teto.plus(tac.valor_aditivo);
          // eslint-disable-next-line no-await-in-loop
          await tx.termoAditivo.update({ where: { id: tac.id }, data: { novo_valor_total: teto } });
        }
      }
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
  return findById(id);
}

/** Quantos registros dependem do contrato (para avisar antes de excluir). */
async function resumirDependencias(id) {
  const [boletins, aditivos, obras, itensQqp, curva, recursosEmUso] = await Promise.all([
    prisma.boletimMedicao.count({ where: { contrato_id: id } }),
    prisma.termoAditivo.count({ where: { contrato_id: id } }),
    prisma.obra.count({ where: { contrato_id: id } }),
    prisma.itemQqp.count({ where: { contrato_id: id } }),
    prisma.curvaFinanceiraContrato.count({ where: { contrato_id: id } }),
    prisma.recursoObraQqp.count({ where: { item: { contrato_id: id } } }),
  ]);
  return { boletins, aditivos, obras, itens_qqp: itensQqp, curva_ciclos: curva, recursos_em_uso: recursosEmUso };
}

/** Exclui o contrato; boletins, TACs, QQP e curva saem em cascata e as obras ficam sem contrato. */
async function excluir(id) {
  await prisma.contrato.delete({ where: { id } });
}

/**
 * Registra um Termo Aditivo e calcula o novo teto do contrato
 * (valor inicial + todos os aditivos, incluindo este).
 *
 * A linha do contrato fica travada durante a transação: dois TACs registrados
 * ao mesmo tempo não calculam o mesmo "novo valor total".
 *
 * @returns {Promise<object|null>} aditivo criado (ou null se o contrato não existir)
 */
async function registrarAditivo(contratoId, dados, usuarioId = null) {
  return prisma.$transaction(
    async (tx) => {
      const linhas = await tx.$queryRaw`
        SELECT id FROM contratos WHERE id = ${contratoId} FOR UPDATE
      `;
      if (linhas.length === 0) return null;

      const contrato = await tx.contrato.findUnique({
        where: { id: contratoId },
        select: { valor_inicial: true },
      });
      const soma = await tx.termoAditivo.aggregate({
        where: { contrato_id: contratoId },
        _sum: { valor_aditivo: true },
      });

      const tetoAnterior = new Prisma.Decimal(contrato.valor_inicial).plus(soma._sum.valor_aditivo || 0);
      const novoValorTotal = tetoAnterior.plus(dados.valor_aditivo);

      const criado = await tx.termoAditivo.create({
        data: {
          contrato_id: contratoId,
          numero_tac: dados.numero_tac,
          valor_aditivo: dados.valor_aditivo,
          novo_valor_total: novoValorTotal,
          data_assinatura: dados.data_assinatura,
          motivo: dados.motivo,
          usuario_id: usuarioId,
        },
      });
      // Um TAC lançado com data anterior a outro muda os tetos seguintes.
      await recalcularTetos(tx, contratoId);
      return criado;
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

/** IDs, entre os informados, que existem como obra. */
async function obrasExistentes(obraIds) {
  const obras = await prisma.obra.findMany({ where: { id: { in: obraIds } }, select: { id: true } });
  return obras.map((obra) => obra.id);
}

/** Vincula as obras ao contrato (substitui o vínculo anterior de cada uma). */
async function vincularObras(contratoId, obraIds) {
  const resultado = await prisma.obra.updateMany({
    where: { id: { in: obraIds } },
    data: { contrato_id: contratoId },
  });
  return resultado.count;
}

module.exports = {
  atualizarAditivo,
  excluirAditivo,
  buscarAditivo,
  existeNumeroTac,
  atualizar,
  resumirDependencias,
  excluir,
  findAll,
  findById,
  findByIdVale,
  existsById,
  create,
  registrarAditivo,
  obrasExistentes,
  vincularObras,
};

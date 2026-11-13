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
      solicitacoes_exclusao: {
        where: { status: 'PENDENTE' },
        select: { id: true, solicitante_nome: true, motivo: true, created_at: true },
      },
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

/** Soma e quantidade das projeções do contrato por referência ("AAAA-MM"). */
async function somasPorReferencia(contratoId) {
  const linhas = await prisma.projecaoBmm.groupBy({
    by: ['referencia'],
    where: { contrato_id: contratoId },
    _sum: { total: true },
    _count: { _all: true },
  });
  return linhas.map((l) => ({ referencia: l.referencia, total: String(l._sum.total), quantidade: l._count._all }));
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

/**
 * Exclui a projeção (ADMIN). Pedidos de exclusão pendentes dela ficam APROVADOS.
 * `decisor` = { id, nome }.
 */
async function excluir(id, decisor = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.solicitacaoExclusaoProjecao.updateMany({
      where: { projecao_id: id, status: 'PENDENTE' },
      data: {
        status: 'APROVADA',
        decidido_por_id: decisor.id ?? null,
        decidido_por_nome: decisor.nome ?? null,
        decidido_em: new Date(),
        motivo_decisao: 'Projeção excluída pelo administrador.',
      },
    });
    const resultado = await tx.projecaoBmm.deleteMany({ where: { id } });
    return resultado.count > 0;
  });
}

/* ------------------------- Comparativo Projetado × Medido ------------------------- */

/** Tudo o que o comparativo precisa do contrato (opcionalmente de uma obra só). */
async function dadosDoComparativo(contratoId, obraId = null) {
  const daObra = obraId ? { obra_id: obraId } : {};
  const [obras, projecoes, medicoes, recursos] = await Promise.all([
    prisma.obra.findMany({
      where: { contrato_id: contratoId, ...(obraId ? { id: obraId } : {}) },
      select: { id: true, orcamento: { select: { ss: true, descricao: true } } },
    }),
    prisma.projecaoBmm.groupBy({
      by: ['obra_id', 'referencia'],
      where: { contrato_id: contratoId, ...daObra },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.boletimMedicaoItem.findMany({
      where: { boletim: { contrato_id: contratoId }, obra_id: obraId ? obraId : { not: null } },
      select: { obra_id: true, valor: true, boletim: { select: { status: true, ciclo_fim: true, numero_bmm: true } } },
    }),
    prisma.recursoObraQqp.findMany({
      where: { obra: { contrato_id: contratoId }, ...(obraId ? { obra_id: obraId } : {}) },
      include: { item: true },
    }),
  ]);
  return { obras, projecoes, medicoes, recursos };
}

/* ------------------------- Solicitações de exclusão ------------------------- */

const INCLUIR_SOLICITACAO = {
  projecao: {
    select: { id: true, numero_bmm: true, referencia: true, total: true, obra_id: true, obra: { select: { orcamento: { select: { ss: true } } } } },
  },
};

/**
 * Registra o pedido travando a projeção (FOR UPDATE), para dois pedidos simultâneos
 * não ficarem pendentes juntos. Devolve { naoEncontrada } | { duplicada } | { solicitacao }.
 */
async function criarSolicitacao(projecaoId, dados) {
  return prisma.$transaction(async (tx) => {
    const travada = await tx.$queryRaw`SELECT id FROM projecoes_bmm WHERE id = ${projecaoId} FOR UPDATE`;
    if (!travada.length) return { naoEncontrada: true };
    const pendente = await tx.solicitacaoExclusaoProjecao.findFirst({ where: { projecao_id: projecaoId, status: 'PENDENTE' }, select: { id: true } });
    if (pendente) return { duplicada: true };
    const solicitacao = await tx.solicitacaoExclusaoProjecao.create({ data: { projecao_id: projecaoId, ...dados }, include: INCLUIR_SOLICITACAO });
    return { solicitacao };
  });
}

async function listarSolicitacoes(filtro) {
  return prisma.solicitacaoExclusaoProjecao.findMany({
    where: filtro,
    orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
    include: INCLUIR_SOLICITACAO,
    take: 500,
  });
}

async function buscarSolicitacao(id) {
  return prisma.solicitacaoExclusaoProjecao.findUnique({ where: { id }, include: INCLUIR_SOLICITACAO });
}

/**
 * Decide o pedido com o pedido e a projeção travados (o primeiro a decidir vence).
 * Aprovar exclui a projeção. Devolve { jaDecidida } | { solicitacao, projecaoExcluida }.
 */
async function decidirSolicitacao(id, { aprovar, decisor, motivo }) {
  return prisma.$transaction(async (tx) => {
    const [linha] = await tx.$queryRaw`SELECT status::text AS status, projecao_id FROM solicitacoes_exclusao_projecao WHERE id = ${id} FOR UPDATE`;
    if (!linha) return { naoEncontrada: true };
    if (linha.status !== 'PENDENTE') return { jaDecidida: true };
    const decisao = {
      decidido_por_id: decisor.id ?? null,
      decidido_por_nome: decisor.nome ?? null,
      decidido_em: new Date(),
    };
    let projecaoExcluida = null;
    if (aprovar && linha.projecao_id) {
      await tx.$queryRaw`SELECT id FROM projecoes_bmm WHERE id = ${linha.projecao_id} FOR UPDATE`;
      projecaoExcluida = await tx.projecaoBmm.findUnique({ where: { id: linha.projecao_id }, select: { id: true, contrato_id: true, referencia: true } });
    }
    const solicitacao = await tx.solicitacaoExclusaoProjecao.update({
      where: { id },
      data: { ...decisao, status: aprovar ? 'APROVADA' : 'REJEITADA', motivo_decisao: motivo || null },
      include: INCLUIR_SOLICITACAO,
    });
    if (projecaoExcluida) await tx.projecaoBmm.delete({ where: { id: projecaoExcluida.id } });
    return { solicitacao, projecaoExcluida };
  });
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
  somasPorReferencia,
  criar,
  substituir,
  excluir,
  criarSolicitacao,
  dadosDoComparativo,
  listarSolicitacoes,
  buscarSolicitacao,
  decidirSolicitacao,
  listarFeriados,
  buscarFeriado,
  existeFeriado,
  criarFeriado,
  atualizarFeriado,
  excluirFeriado,
};

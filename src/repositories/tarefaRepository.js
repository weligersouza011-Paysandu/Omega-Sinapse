'use strict';

const prisma = require('../config/prisma');

/**
 * Persistência das tarefas da equipe de planejamento (gestão de demandas).
 * As regras de prazo, recorrência e permissão ficam em tarefaService.
 */

const INCLUDE_TAREFA = {
  usuario: { select: { id: true, nome: true, perfil: true } },
  obra: {
    select: {
      id: true,
      osi_numero: true,
      orcamento: { select: { ss: true, pep: true, descricao: true } },
    },
  },
};

/** Monta o `where` da listagem a partir dos filtros já validados. */
function montarWhere({ usuarioId, status, tipo, obraId, de, ate } = {}) {
  const where = {};
  if (usuarioId) where.usuario_id = usuarioId;
  if (status && status.length > 0) where.status = { in: status };
  if (tipo) where.tipo = tipo;
  if (obraId) where.obra_id = obraId;
  if (de || ate) {
    where.data_vencimento = {};
    if (de) where.data_vencimento.gte = de;
    if (ate) where.data_vencimento.lte = ate;
  }
  return where;
}

/**
 * Lista paginada ordenada pelo vencimento mais próximo.
 * @returns {Promise<{data:object[], total:number, page:number, limit:number, totalPages:number}>}
 */
async function findAll(filtros = {}) {
  const { page, limit } = filtros;
  const where = montarWhere(filtros);

  const [total, data] = await prisma.$transaction([
    prisma.tarefa.count({ where }),
    prisma.tarefa.findMany({
      where,
      include: INCLUDE_TAREFA,
      orderBy: [{ data_vencimento: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function findById(id) {
  return prisma.tarefa.findUnique({ where: { id }, include: INCLUDE_TAREFA });
}

function create(dados) {
  return prisma.tarefa.create({ data: dados, include: INCLUDE_TAREFA });
}

function update(id, dados) {
  return prisma.tarefa.update({ where: { id }, data: dados, include: INCLUDE_TAREFA });
}

/**
 * Conclui uma rotina recorrente e já agenda a próxima ocorrência, de forma
 * atômica (nunca fica uma conclusão sem a rotina seguinte, nem o contrário).
 */
async function concluirRecorrente(id, dados, proxima) {
  const [concluida, criada] = await prisma.$transaction([
    prisma.tarefa.update({ where: { id }, data: dados, include: INCLUDE_TAREFA }),
    prisma.tarefa.create({ data: proxima, include: INCLUDE_TAREFA }),
  ]);
  return { concluida, proxima: criada };
}

async function remove(id) {
  const resultado = await prisma.tarefa.deleteMany({ where: { id } });
  return resultado.count > 0;
}

/**
 * Contagens agregadas por colaborador para o painel de carga da equipe.
 * @param {{de?:Date, ate?:Date, agora:Date, fimSemana:Date, statusAtivos:string[]}} opcoes
 */
async function contarCargaEquipe({ de, ate, agora, fimSemana, statusAtivos }) {
  const base = montarWhere({ de, ate });
  const ativas = { ...base, status: { in: statusAtivos } };

  const [porStatus, vencidas, concluidasComAtraso, fixas, semana] = await prisma.$transaction([
    prisma.tarefa.groupBy({
      by: ['usuario_id', 'status'],
      where: base,
      _count: { _all: true },
      orderBy: [{ usuario_id: 'asc' }, { status: 'asc' }],
    }),
    prisma.tarefa.groupBy({
      by: ['usuario_id'],
      where: { ...ativas, data_vencimento: { lt: agora } },
      _count: { _all: true },
      orderBy: { usuario_id: 'asc' },
    }),
    // A justificativa só é aceita (e exigida) em conclusões fora do prazo.
    prisma.tarefa.groupBy({
      by: ['usuario_id'],
      where: { ...base, status: 'CONCLUIDO', justificativa_atraso: { not: null } },
      _count: { _all: true },
      orderBy: { usuario_id: 'asc' },
    }),
    prisma.tarefa.groupBy({
      by: ['usuario_id'],
      where: { ...ativas, tipo: 'FIXA_RECORRENTE' },
      _count: { _all: true },
      orderBy: { usuario_id: 'asc' },
    }),
    // Carga da semana: ativas que vencem até o domingo (inclui as já vencidas).
    prisma.tarefa.groupBy({
      by: ['usuario_id'],
      where: { ...ativas, data_vencimento: { lte: fimSemana } },
      _count: { _all: true },
      orderBy: { usuario_id: 'asc' },
    }),
  ]);

  return { porStatus, vencidas, concluidasComAtraso, fixas, semana };
}

/** Usuários ativos de uma lista de perfis + os ids informados (mesmo inativos). */
function listarColaboradores(perfis, idsExtras = []) {
  return prisma.usuario.findMany({
    where: {
      OR: [{ ativo: true, perfil: { in: perfis } }, { id: { in: idsExtras } }],
    },
    select: { id: true, nome: true, perfil: true, ativo: true },
    orderBy: { nome: 'asc' },
  });
}

/** Colaboradores ativos (filtro e atribuição de tarefas). */
function listarResponsaveis() {
  return prisma.usuario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, perfil: true },
    orderBy: { nome: 'asc' },
  });
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  concluirRecorrente,
  remove,
  contarCargaEquipe,
  listarColaboradores,
  listarResponsaveis,
};

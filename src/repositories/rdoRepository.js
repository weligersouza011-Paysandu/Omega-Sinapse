'use strict';

const prisma = require('../config/prisma');

/** Tudo que a tela do RDO precisa, numa só leitura. */
const INCLUDE_COMPLETO = {
  encarregado: { select: { id: true, nome: true, matricula: true } },
  decidido_por: { select: { id: true, nome: true } },
  contrato: { select: { id: true, id_vale: true } },
  atividades: {
    orderBy: { id: 'asc' },
    include: {
      obra: { select: { id: true, orcamento: { select: { ss: true, pep: true, descricao: true } } } },
      fotos: { orderBy: { id: 'asc' } },
      mao_obra: {
        orderBy: { id: 'asc' },
        include: { funcao: { select: { id: true, nome: true } }, colaborador: { select: { id: true, nome: true } } },
      },
    },
  },
  equipamentos: { orderBy: { id: 'asc' }, include: { equipamento: { select: { id: true, nome: true, codigo: true } } } },
  pts: { orderBy: { solicitado_em: 'asc' } },
  desvios: { orderBy: { id: 'asc' }, include: { motivo: { select: { id: true, descricao: true } } } },
  historico: { orderBy: { id: 'asc' }, include: { usuario: { select: { id: true, nome: true } } } },
};

const INCLUDE_LISTA = {
  encarregado: { select: { id: true, nome: true } },
  _count: { select: { atividades: true } },
};

/* ------------------------------- Cronograma ------------------------------- */

/** Revisão mais recente do cronograma da obra (a "vigente"). */
function ultimaVersao(obraId, client = prisma) {
  return client.versaoCronograma.findFirst({
    where: { obra_id: obraId },
    orderBy: { numero_revisao: 'desc' },
    select: { id: true, versao: true, numero_revisao: true, data_snapshot: true },
  });
}

/** Atividade (por EDT) numa revisão. */
function atividadeNaVersao(versaoId, codigo, client = prisma) {
  return client.atividadeCronograma.findFirst({
    where: { versao_cronograma_id: versaoId, codigo_atividade: codigo },
    select: { codigo_atividade: true, codigo_pai: true, descricao: true, resumo: true, avanco_fisico_real: true },
  });
}

/** Atividades-folha (as que recebem avanço) de uma revisão, na ordem da EAP. */
function folhasDaVersao(versaoId, client = prisma) {
  return client.atividadeCronograma.findMany({
    where: { versao_cronograma_id: versaoId, resumo: false },
    orderBy: { ordem: 'asc' },
    select: { codigo_atividade: true, codigo_pai: true, descricao: true, nivel: true, avanco_fisico_real: true, data_inicio: true, data_fim: true, dados_origem: true },
  });
}

/** Último avanço aprovado em RDO da atividade (mais recente por data; empate pelo último lançado). */
function ultimoAvancoAprovado(obraId, codigo, client = prisma) {
  return client.avancoAtividadeAprovado.findFirst({
    where: { obra_id: obraId, codigo_atividade: codigo },
    orderBy: [{ data: 'desc' }, { id: 'desc' }],
    select: { percentual: true, data: true },
  });
}

/** Último avanço aprovado de cada atividade da obra (para listar sem N consultas). */
async function ultimosAvancosDaObra(obraId, client = prisma) {
  const linhas = await client.avancoAtividadeAprovado.findMany({
    where: { obra_id: obraId },
    orderBy: [{ data: 'desc' }, { id: 'desc' }],
    select: { codigo_atividade: true, percentual: true, data: true },
  });
  const mapa = new Map();
  linhas.forEach((l) => {
    if (!mapa.has(l.codigo_atividade)) mapa.set(l.codigo_atividade, l);
  });
  return mapa;
}

/* ---------------------------------- Escopo -------------------------------- */

async function obraIdsDoEncarregado(usuarioId) {
  const linhas = await prisma.encarregadoObra.findMany({ where: { usuario_id: usuarioId }, select: { obra_id: true } });
  return linhas.map((l) => l.obra_id);
}

async function obraIdsDoPlanejador(usuarioId) {
  const linhas = await prisma.obra.findMany({
    where: { OR: [{ planejador_id: usuarioId }, { planejadores: { some: { usuario_id: usuarioId } } }] },
    select: { id: true },
  });
  return linhas.map((l) => l.id);
}

function obrasPorIds(ids, client = prisma) {
  return client.obra.findMany({
    where: ids === null ? {} : { id: { in: ids } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      contrato_id: true,
      status: true,
      orcamento: { select: { ss: true, pep: true, descricao: true, cliente: true } },
    },
  });
}

/* ----------------------------------- RDO ---------------------------------- */

function buscarCompleto(id, client = prisma) {
  return client.rdo.findUnique({ where: { id }, include: INCLUDE_COMPLETO });
}

function buscarSimples(id, client = prisma) {
  return client.rdo.findUnique({
    where: { id },
    include: { atividades: { select: { id: true, obra_id: true, codigo_atividade: true, fora_de_escopo: true, percentual_declarado: true, percentual_anterior: true, _count: { select: { fotos: true } } } } },
  });
}

async function listar({ where, limite, deslocamento }) {
  const [itens, total] = await Promise.all([
    prisma.rdo.findMany({
      where,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
      take: limite,
      skip: deslocamento,
      include: INCLUDE_LISTA,
    }),
    prisma.rdo.count({ where }),
  ]);
  return { itens, total };
}

module.exports = {
  prisma,
  INCLUDE_COMPLETO,
  ultimaVersao,
  atividadeNaVersao,
  folhasDaVersao,
  ultimoAvancoAprovado,
  ultimosAvancosDaObra,
  obraIdsDoEncarregado,
  obraIdsDoPlanejador,
  obrasPorIds,
  buscarCompleto,
  buscarSimples,
  listar,
};

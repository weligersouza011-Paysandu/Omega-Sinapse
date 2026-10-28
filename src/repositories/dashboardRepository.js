'use strict';

const prisma = require('../config/prisma');

/**
 * Consultas do Dashboard de Planejamento.
 *
 * A carga é intencionalmente única: obras + orçamento/fiscais + planejador +
 * localizações + avanço físico + restrições. O volume atual (dezenas de obras
 * e centenas de medições) permite montar todos os indicadores e a Curva S
 * consolidada em uma só viagem ao banco, sem N+1.
 */

/** Campos do avanço físico usados na Curva S e nos indicadores. */
const SELECT_AVANCO = {
  id: true,
  data: true,
  semana: true,
  fisico_prev: true,
  fisico_lb_prev: true,
  fisico_real: true,
  fisico_tend_acum: true,
  fisico_prev_acum: true,
  fisico_real_acum: true,
};

/** Localizações georreferenciadas (as linhas sem coordenada não entram no mapa). */
const SELECT_LOCALIZACAO = {
  id: true,
  descricao: true,
  tipo: true,
  latitude: true,
  longitude: true,
  km_inicial: true,
  km_final: true,
  referencia: true,
};

const INCLUDE_DASHBOARD = {
  orcamento: {
    select: {
      ss: true,
      pep: true,
      descricao: true,
      cliente: true,
      valor: true,
      endereco: true,
      fiscais: {
        select: { id: true, nome: true },
        orderBy: { id: 'asc' },
      },
    },
  },
  planejador: { select: { id: true, nome: true } },
  localizacoes: {
    where: {
      latitude: { not: null },
      longitude: { not: null },
    },
    select: SELECT_LOCALIZACAO,
    orderBy: [{ id: 'asc' }],
  },
  avanco_fisico: {
    select: SELECT_AVANCO,
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  },
  restricoes: {
    orderBy: [{ prazo: 'asc' }, { id: 'asc' }],
  },
  atividades: {
    where: { status: { not: 'CONCLUIDA' } },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      status: true,
      responsavel: true,
      prazo: true,
      created_at: true,
    },
    orderBy: [{ prazo: 'asc' }, { id: 'asc' }],
  },
  ocorrencias: {
    select: { id: true, descricao: true, gravidade: true, created_at: true },
    orderBy: { created_at: 'desc' },
  },
};

/** Carrega todas as obras com as relações necessárias ao dashboard. */
async function findAll() {
  return prisma.obra.findMany({
    include: INCLUDE_DASHBOARD,
    orderBy: { id: 'asc' },
  });
}

/* -------------------------------------------------------------------------- */
/* Restrições 6WLA (CRUD básico para alimentar a tabela do dashboard)         */
/* -------------------------------------------------------------------------- */

async function criarRestricao(obraId, dados) {
  return prisma.obraRestricao.create({
    data: { obra_id: obraId, ...dados },
  });
}

async function atualizarRestricao(obraId, id, dados) {
  const resultado = await prisma.obraRestricao.updateMany({
    where: { id, obra_id: obraId },
    data: dados,
  });
  if (resultado.count === 0) return null;
  return prisma.obraRestricao.findUnique({ where: { id } });
}

async function removerRestricao(obraId, id) {
  const resultado = await prisma.obraRestricao.deleteMany({
    where: { id, obra_id: obraId },
  });
  return resultado.count > 0;
}

module.exports = {
  findAll,
  criarRestricao,
  atualizarRestricao,
  removerRestricao,
};

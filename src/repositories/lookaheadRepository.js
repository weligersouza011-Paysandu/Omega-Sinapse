'use strict';

const prisma = require('../config/prisma');

/**
 * Persistência do Lookahead (6WLA): atividades das versões de cronograma e
 * restrições de atividade (Last Planner System).
 */

const SELECT_ATIVIDADE = {
  id: true,
  ordem: true,
  codigo_atividade: true,
  codigo_pai: true,
  descricao: true,
  nivel: true,
  resumo: true,
  data_inicio: true,
  data_fim: true,
  data_inicio_lb: true,
  data_fim_lb: true,
  avanco_fisico_previsto: true,
  avanco_fisico_real: true,
  recursos_mao_de_obra: true,
  recursos_equipamentos: true,
  caminho_critico: true,
  folga_total_dias: true,
};

const SELECT_RESTRICAO = {
  id: true,
  obra_id: true,
  atividade_id: true,
  codigo_atividade: true,
  tipo: true,
  descricao: true,
  status: true,
  responsavel: true,
  data_limite: true,
  data_baixa: true,
  criado_por: true,
  created_at: true,
  updated_at: true,
  autor: { select: { id: true, nome: true } },
};

function mapearRestricao(registro) {
  if (!registro) return null;
  const { autor, ...restricao } = registro;
  return {
    ...restricao,
    data_limite: restricao.data_limite ? new Date(restricao.data_limite).toISOString().slice(0, 10) : null,
    criado_por_nome: autor?.nome ?? null,
  };
}

/** Todas as atividades de uma versão, na ordem da EAP. */
async function listarAtividades(versaoId) {
  return prisma.atividadeCronograma.findMany({
    where: { versao_cronograma_id: versaoId },
    orderBy: { ordem: 'asc' },
    select: SELECT_ATIVIDADE,
  });
}

/** Atividade + obra da versão (para validar o vínculo da restrição). */
async function buscarAtividade(id) {
  return prisma.atividadeCronograma.findUnique({
    where: { id },
    select: {
      id: true,
      codigo_atividade: true,
      descricao: true,
      versao: { select: { id: true, obra_id: true, versao: true } },
    },
  });
}

async function buscarAtividadePorCodigo(versaoId, codigo) {
  return prisma.atividadeCronograma.findFirst({
    where: { versao_cronograma_id: versaoId, codigo_atividade: codigo },
    select: {
      id: true,
      codigo_atividade: true,
      descricao: true,
      versao: { select: { id: true, obra_id: true, versao: true } },
    },
  });
}

async function listarRestricoes(obraId) {
  const registros = await prisma.restricaoAtividade.findMany({
    where: { obra_id: obraId },
    orderBy: [{ status: 'asc' }, { data_limite: { sort: 'asc', nulls: 'last' } }, { created_at: 'asc' }],
    select: SELECT_RESTRICAO,
  });
  return registros.map(mapearRestricao);
}

async function buscarRestricao(id) {
  return mapearRestricao(await prisma.restricaoAtividade.findUnique({ where: { id }, select: SELECT_RESTRICAO }));
}

async function criarRestricao(dados) {
  return mapearRestricao(await prisma.restricaoAtividade.create({ data: dados, select: SELECT_RESTRICAO }));
}

async function atualizarRestricao(id, dados) {
  return mapearRestricao(await prisma.restricaoAtividade.update({ where: { id }, data: dados, select: SELECT_RESTRICAO }));
}

module.exports = {
  listarAtividades,
  buscarAtividade,
  buscarAtividadePorCodigo,
  listarRestricoes,
  buscarRestricao,
  criarRestricao,
  atualizarRestricao,
};

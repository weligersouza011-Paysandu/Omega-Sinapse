'use strict';

const prisma = require('../config/prisma');

/**
 * Persistência das versões de cronograma (snapshots imutáveis por upload) e de
 * suas atividades. A numeração das revisões e as regras de acesso ficam em
 * cronogramaService.
 */

const SELECT_AUTOR = { select: { id: true, nome: true } };

/** Campos da listagem: sem as séries pesadas (Curva S e histogramas). */
const SELECT_LISTAGEM = {
  id: true,
  obra_id: true,
  versao: true,
  numero_revisao: true,
  data_snapshot: true,
  periodo_inicio: true,
  periodo_fim: true,
  autor_id: true,
  arquivo_url: true,
  arquivo_nome: true,
  observacao: true,
  resumo: true,
  created_at: true,
  autor: SELECT_AUTOR,
  _count: { select: { atividades: true } },
};

const TAMANHO_LOTE = 1000;

function dataSemHora(valor) {
  if (!valor) return null;
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
}

function mapearVersao(registro) {
  if (!registro) return null;
  const { autor, _count: contagem, atividades, ...versao } = registro;
  return {
    ...versao,
    periodo_inicio: dataSemHora(versao.periodo_inicio),
    periodo_fim: dataSemHora(versao.periodo_fim),
    autor_nome: autor?.nome ?? null,
    total_atividades: contagem?.atividades ?? (atividades ? atividades.length : 0),
    ...(atividades ? { atividades } : {}),
  };
}

/** Lista as revisões da obra, da mais recente para a mais antiga. */
async function listarPorObra(obraId) {
  const registros = await prisma.versaoCronograma.findMany({
    where: { obra_id: obraId },
    orderBy: { numero_revisao: 'desc' },
    select: SELECT_LISTAGEM,
  });
  return registros.map(mapearVersao);
}

/** Versão completa: séries, histogramas e atividades na ordem da EAP. */
async function buscarPorId(id) {
  const registro = await prisma.versaoCronograma.findUnique({
    where: { id },
    include: {
      autor: SELECT_AUTOR,
      atividades: { orderBy: { ordem: 'asc' } },
    },
  });
  return mapearVersao(registro);
}

/**
 * Cria a versão e grava as atividades em lote numa única transação.
 * O número da revisão é o próximo sequencial da obra; a restrição única
 * (obra_id, numero_revisao) protege contra uploads simultâneos.
 */
async function criarVersao({ dados, atividades, rotular }) {
  const registro = await prisma.$transaction(
    async (tx) => {
      const ultima = await tx.versaoCronograma.aggregate({
        where: { obra_id: dados.obra_id },
        _max: { numero_revisao: true },
      });
      const numero = ultima._max.numero_revisao === null ? 0 : ultima._max.numero_revisao + 1;

      const versao = await tx.versaoCronograma.create({
        data: { ...dados, numero_revisao: numero, versao: rotular(numero) },
        select: { id: true },
      });

      for (let inicio = 0; inicio < atividades.length; inicio += TAMANHO_LOTE) {
        // eslint-disable-next-line no-await-in-loop
        await tx.atividadeCronograma.createMany({
          data: atividades
            .slice(inicio, inicio + TAMANHO_LOTE)
            .map((atividade) => ({ ...atividade, versao_cronograma_id: versao.id })),
        });
      }

      return tx.versaoCronograma.findUnique({ where: { id: versao.id }, select: SELECT_LISTAGEM });
    },
    { timeout: 60000, maxWait: 15000 }
  );
  return mapearVersao(registro);
}

/** Revisões da obra (sem séries), da mais antiga para a mais recente. */
async function listarVersoesLeves(obraId) {
  return prisma.versaoCronograma.findMany({
    where: { obra_id: obraId },
    orderBy: { numero_revisao: 'asc' },
    select: { id: true, versao: true, numero_revisao: true, data_snapshot: true, periodo_fim: true },
  });
}

/** Curva S e resumo de uma revisão específica da obra. */
async function buscarCurvaDaVersao(obraId, versaoId) {
  const registro = await prisma.versaoCronograma.findFirst({
    where: { id: versaoId, obra_id: obraId },
    select: {
      id: true,
      versao: true,
      numero_revisao: true,
      data_snapshot: true,
      periodo_inicio: true,
      periodo_fim: true,
      resumo: true,
      curva_s: true,
    },
  });
  if (!registro) return null;
  return {
    ...registro,
    periodo_inicio: dataSemHora(registro.periodo_inicio),
    periodo_fim: dataSemHora(registro.periodo_fim),
  };
}

/** Histogramas de recursos e período de uma revisão específica da obra. */
async function buscarHistogramasDaVersao(obraId, versaoId) {
  const registro = await prisma.versaoCronograma.findFirst({
    where: { id: versaoId, obra_id: obraId },
    select: {
      id: true,
      versao: true,
      numero_revisao: true,
      data_snapshot: true,
      periodo_fim: true,
      histograma_mao_de_obra: true,
      histograma_equipamentos: true,
      curva_s: true,
    },
  });
  if (!registro) return null;
  return { ...registro, periodo_fim: dataSemHora(registro.periodo_fim) };
}

/** Atividades folha de uma revisão com os recursos vinculados (cruzamento com o lookahead). */
async function listarAtividadesComRecursos(versaoId) {
  return prisma.atividadeCronograma.findMany({
    where: { versao_cronograma_id: versaoId, resumo: false },
    orderBy: { ordem: 'asc' },
    select: {
      codigo_atividade: true,
      descricao: true,
      data_inicio: true,
      data_fim: true,
      avanco_fisico_real: true,
      recursos_mao_de_obra: true,
      recursos_equipamentos: true,
    },
  });
}

/** Avanço físico semanal lançado manualmente (fallback sem cronograma). */
async function listarAvancoManual(obraId) {
  return prisma.obraAvancoFisico.findMany({
    where: { obra_id: obraId },
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  });
}

module.exports = {
  listarPorObra,
  buscarPorId,
  criarVersao,
  listarVersoesLeves,
  buscarCurvaDaVersao,
  buscarHistogramasDaVersao,
  listarAtividadesComRecursos,
  listarAvancoManual,
};

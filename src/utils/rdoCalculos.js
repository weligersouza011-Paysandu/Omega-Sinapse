'use strict';

/** Cálculos puros do RDO (sem banco), cobertos por tests/rdoCalculos.test.js. */

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

const arredondar = (valor, casas = 2) => {
  const fator = 10 ** casas;
  return Math.round((numero(valor) + Number.EPSILON) * fator) / fator;
};

/** HH de um lançamento = quantidade de pessoas × horas de cada uma. */
function hhDoLancamento(lancamento) {
  return arredondar(numero(lancamento?.quantidade) * numero(lancamento?.horas));
}

/** HH total de uma lista de lançamentos de mão de obra. */
function totalHH(lancamentos = []) {
  return arredondar(lancamentos.reduce((soma, l) => soma + hhDoLancamento(l), 0));
}

/** Espera do PTS em minutos (liberação − solicitação); null enquanto não liberado ou se inválida. */
function esperaPtsMinutos(solicitadoEm, liberadoEm) {
  if (!solicitadoEm || !liberadoEm) return null;
  const inicio = new Date(solicitadoEm).getTime();
  const fim = new Date(liberadoEm).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return null;
  return Math.round((fim - inicio) / 60000);
}

/** Total de horas de desvio/improdutividade, geral e por motivo. */
function totalDesvios(desvios = []) {
  const porMotivo = {};
  let total = 0;
  desvios.forEach((d) => {
    const horas = numero(d.horas);
    total += horas;
    const chave = d.motivo_id ?? d.motivo ?? 'sem_motivo';
    porMotivo[chave] = arredondar((porMotivo[chave] || 0) + horas);
  });
  return { total: arredondar(total), por_motivo: porMotivo };
}

/**
 * Normaliza um percentual (0–100, até 2 casas). Retorna null se inválido (vazio, texto, fora da faixa).
 */
function normalizarPercentual(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return arredondar(n, 2);
}

module.exports = { hhDoLancamento, totalHH, esperaPtsMinutos, totalDesvios, normalizarPercentual, arredondar };

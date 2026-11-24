'use strict';

/**
 * Regra de "fonte de verdade" do % de uma atividade: o MAIS RECENTE vale.
 *
 * Duas fontes:
 *  - cronograma: `avanco_fisico_real` da última revisão importada do MS Project, datado pela
 *    data de status (`data_snapshot`) da revisão;
 *  - RDO aprovado: último avanço em `avanco_atividade_aprovado`, datado pela data do RDO.
 *
 * Empate de data → o RDO vale (foi apurado em campo no próprio dia do status). Sem uma das
 * fontes, vale a outra; sem nenhuma, 0%.
 */

const FUSO_BRASILIA_MS = -3 * 60 * 60 * 1000;

/** Data (aaaa-mm-dd) de um instante, no horário de Brasília — para comparar com datas DATE do RDO. */
function diaBrasilia(valor) {
  if (!valor) return null;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  // Colunas DATE do Prisma chegam como meia-noite UTC: já são o dia correto.
  if (data.getUTCHours() === 0 && data.getUTCMinutes() === 0 && data.getUTCSeconds() === 0) {
    return data.toISOString().slice(0, 10);
  }
  return new Date(data.getTime() + FUSO_BRASILIA_MS).toISOString().slice(0, 10);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{ aprovado?: {percentual:any, data:any}|null, cronograma?: {percentual:any, data:any}|null }} fontes
 * @returns {{ percentual: number, origem: 'RDO'|'CRONOGRAMA'|'NENHUMA', data: string|null }}
 */
function escolherPercentualVigente({ aprovado = null, cronograma = null } = {}) {
  const rdo = aprovado && numero(aprovado.percentual) !== null
    ? { percentual: numero(aprovado.percentual), data: diaBrasilia(aprovado.data) }
    : null;
  const ms = cronograma && numero(cronograma.percentual) !== null
    ? { percentual: numero(cronograma.percentual), data: diaBrasilia(cronograma.data) }
    : null;

  if (rdo && ms) {
    // Sem data do cronograma não dá para comparar: o apurado em campo (RDO) prevalece.
    if (!ms.data || !rdo.data || rdo.data >= ms.data) return { ...rdo, origem: 'RDO' };
    return { ...ms, origem: 'CRONOGRAMA' };
  }
  if (rdo) return { ...rdo, origem: 'RDO' };
  if (ms) return { ...ms, origem: 'CRONOGRAMA' };
  return { percentual: 0, origem: 'NENHUMA', data: null };
}

module.exports = { escolherPercentualVigente, diaBrasilia };

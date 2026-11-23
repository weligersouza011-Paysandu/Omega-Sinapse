'use strict';

/**
 * Fuso operacional da equipe: America/Sao_Paulo (UTC-3, sem horário de verão
 * desde 2019; igual a America/Belem). O servidor roda em UTC (Render), então
 * toda regra de "hoje" e de horário de disparo usa este deslocamento fixo.
 */
const FUSO = '-03:00';
const FUSO_NOME = 'America/Sao_Paulo';
const FUSO_OFFSET_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** "aaaa-mm-dd" de hoje no fuso operacional. */
function hojeLocal(agora) {
  return new Date(agora.getTime() + FUSO_OFFSET_MS).toISOString().slice(0, 10);
}

/** Último instante (23:59:59.999) do dia local de `agora`. */
function fimDoDiaLocal(agora) {
  return new Date(`${hojeLocal(agora)}T23:59:59.999${FUSO}`);
}

/** Instante de `hora` ("HH:mm") no dia local de `agora`. */
function horarioDoDiaLocal(agora, hora) {
  return new Date(`${hojeLocal(agora)}T${hora}:00.000${FUSO}`);
}

/** "23/11/2026 18:00" no fuso operacional. */
function formatarDataHoraLocal(valor) {
  return new Date(valor).toLocaleString('pt-BR', {
    timeZone: FUSO_NOME,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "23/11/2026" no fuso operacional. */
function formatarDataLocal(valor) {
  return new Date(valor).toLocaleDateString('pt-BR', {
    timeZone: FUSO_NOME,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

module.exports = {
  FUSO,
  FUSO_NOME,
  FUSO_OFFSET_MS,
  DIA_MS,
  hojeLocal,
  fimDoDiaLocal,
  horarioDoDiaLocal,
  formatarDataHoraLocal,
  formatarDataLocal,
};

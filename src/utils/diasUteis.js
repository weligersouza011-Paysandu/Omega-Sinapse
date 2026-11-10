'use strict';

/**
 * Calendário de dias úteis para a projeção financeira (QQP).
 *
 * Dia útil = segunda a sexta (e sábado, se a alocação o inclui) que não seja
 * feriado nacional. Todas as datas são tratadas como datas de calendário em UTC
 * (sem horário), como as colunas DATE do banco.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

function iso(data) {
  return data.toISOString().slice(0, 10);
}

/** Data de calendário (UTC, meia-noite) a partir de Date ou texto AAAA-MM-DD. */
function dataDeCalendario(valor) {
  const data = valor instanceof Date ? valor : new Date(String(valor).length === 10 ? `${valor}T00:00:00Z` : valor);
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const cacheFeriados = new Map();

/** Feriados nacionais do ano (datas AAAA-MM-DD). */
function feriadosNacionais(ano) {
  if (cacheFeriados.has(ano)) return cacheFeriados.get(ano);

  const sextaSanta = new Date(pascoa(ano).getTime() - 2 * DIA_MS);
  const fixos = [
    [0, 1], // Confraternização Universal
    [3, 21], // Tiradentes
    [4, 1], // Dia do Trabalho
    [8, 7], // Independência
    [9, 12], // Nossa Senhora Aparecida
    [10, 2], // Finados
    [10, 15], // Proclamação da República
    [11, 25], // Natal
  ].map(([mes, dia]) => iso(new Date(Date.UTC(ano, mes, dia))));

  const conjunto = new Set([...fixos, iso(sextaSanta)]);
  cacheFeriados.set(ano, conjunto);
  return conjunto;
}

/** O dia (Date em UTC) é útil? */
function ehDiaUtil(data, { sabados = false, feriadosExtras = null } = {}) {
  const diaSemana = data.getUTCDay();
  if (diaSemana === 0) return false;
  if (diaSemana === 6 && !sabados) return false;
  const texto = iso(data);
  if (feriadosNacionais(data.getUTCFullYear()).has(texto)) return false;
  if (feriadosExtras && feriadosExtras.has(texto)) return false;
  return true;
}

/** Percorre os dias do intervalo [inicio, fim] (inclusive). */
function* percorrerDias(inicio, fim) {
  const limite = dataDeCalendario(fim).getTime();
  for (let t = dataDeCalendario(inicio).getTime(); t <= limite; t += DIA_MS) {
    yield new Date(t);
  }
}

/** Quantidade de dias úteis no intervalo [inicio, fim] (inclusive). */
function contarDiasUteis(inicio, fim, opcoes = {}) {
  let total = 0;
  for (const dia of percorrerDias(inicio, fim)) {
    if (ehDiaUtil(dia, opcoes)) total += 1;
  }
  return total;
}

module.exports = { dataDeCalendario, feriadosNacionais, ehDiaUtil, percorrerDias, contarDiasUteis, iso };

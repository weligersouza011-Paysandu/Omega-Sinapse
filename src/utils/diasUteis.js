'use strict';

/**
 * Calendário de dias úteis para a projeção financeira (QQP).
 *
 * Dia útil = segunda a sexta (e sábado, se a alocação o inclui) que não seja
 * feriado nacional, estadual (UF da obra; padrão PA, como no sistema Projeção
 * Financeira) nem feriado personalizado (`feriadosExtras`). Todas as datas são tratadas como datas de calendário em UTC
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

/** UF padrão das obras (contratos da Vale no Pará). */
const UF_PADRAO = 'PA';

/** Feriados estaduais fixos por UF: [mês (0-11), dia, nome]. */
const FERIADOS_ESTADUAIS = {
  PA: [[7, 15, 'Adesão do Grão-Pará à Independência do Brasil']],
};

/** Feriados estaduais do ano (datas AAAA-MM-DD) da UF informada. */
function feriadosEstaduais(ano, uf = UF_PADRAO) {
  const lista = FERIADOS_ESTADUAIS[String(uf || '').toUpperCase()] || [];
  return new Set(lista.map(([mes, dia]) => iso(new Date(Date.UTC(ano, mes, dia)))));
}

/** O dia (Date em UTC) é útil? */
function ehDiaUtil(data, { sabados = false, feriadosExtras = null, uf = UF_PADRAO } = {}) {
  const diaSemana = data.getUTCDay();
  if (diaSemana === 0) return false;
  if (diaSemana === 6 && !sabados) return false;
  const texto = iso(data);
  if (feriadosNacionais(data.getUTCFullYear()).has(texto)) return false;
  if (feriadosEstaduais(data.getUTCFullYear(), uf).has(texto)) return false;
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

/** Dia em que o ciclo de medição começa (termina no dia 15 do mês de referência). */
const DIA_INICIO_CICLO = 16;

/**
 * Ciclo 16→15 do mês de referência "AAAA-MM" (o ciclo termina no dia 15 desse mês).
 * Devolve null se o texto não for uma referência válida.
 */
function cicloDaReferencia(referencia) {
  const partes = /^(\d{4})-(\d{2})$/.exec(String(referencia || '').trim());
  const mes = partes ? Number(partes[2]) : 0;
  if (!partes || mes < 1 || mes > 12) return null;
  const ano = Number(partes[1]);
  return {
    inicio: new Date(Date.UTC(ano, mes - 2, DIA_INICIO_CICLO)),
    fim: new Date(Date.UTC(ano, mes - 1, DIA_INICIO_CICLO - 1)),
  };
}

/**
 * Semanas (segunda a domingo) do intervalo [inicio, fim], recortadas a ele, com os dias
 * úteis de cada uma (segunda a sexta, sem feriados). Port de `projection_weeks` do Projeção:
 * cada semana é identificada pela segunda-feira e rotulada pela sexta-feira.
 */
function semanasDoIntervalo(inicio, fim, opcoes = {}) {
  const semanas = [];
  let atual = null;
  for (const dia of percorrerDias(inicio, fim)) {
    const recuo = (dia.getUTCDay() + 6) % 7; // segunda = 0
    const segunda = new Date(dia.getTime() - recuo * DIA_MS);
    const chave = iso(segunda);
    if (!atual || atual.semana_inicio !== chave) {
      atual = {
        semana_inicio: chave,
        sexta: iso(new Date(segunda.getTime() + 4 * DIA_MS)),
        inicio: iso(dia),
        fim: iso(dia),
        dias_uteis: 0,
      };
      semanas.push(atual);
    }
    atual.fim = iso(dia);
    if (ehDiaUtil(dia, { ...opcoes, sabados: false })) atual.dias_uteis += 1;
  }
  return semanas;
}

module.exports = {
  dataDeCalendario,
  feriadosNacionais,
  feriadosEstaduais,
  ehDiaUtil,
  percorrerDias,
  contarDiasUteis,
  cicloDaReferencia,
  semanasDoIntervalo,
  iso,
  UF_PADRAO,
};

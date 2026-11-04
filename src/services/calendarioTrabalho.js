'use strict';

/**
 * Calendário de trabalho para o CPM e para as curvas (minutos úteis).
 *
 * Especificação (gravada na versão do cronograma, vinda do MS Project):
 * {
 *   nome, minutos_por_dia,                     // minutos de "1 dia" de duração
 *   semana: { "0": [], "1": [[600,720],[780,1020]], ... },   // 0 = domingo; minutos desde 00:00
 *   semanas_trabalho: [{ de: 'AAAA-MM-DD', ate: 'AAAA-MM-DD', semana: {...} }],
 *   excecoes: [{ de, ate, intervalos: [[ini, fim], ...] }]  // [] = dia não útil
 * }
 *
 * Horários são locais da obra (America/Sao_Paulo, UTC−3, sem horário de verão).
 * A escala contínua é "minutos úteis desde a origem": convertida com somas
 * prefixadas por dia, o que torna exatas as exceções (feriados, sábados
 * trabalhados) e as semanas de trabalho alternativas.
 */

const FUSO_OFFSET_MIN = -3 * 60;
const DIA_MS = 24 * 60 * 60 * 1000;
/** Origem da escala (dia 0) e alcance pré-calculado. */
const ORIGEM_DIA = Math.floor(Date.UTC(2015, 0, 1) / DIA_MS);
const TOTAL_DIAS = 365 * 30;

/** Calendário padrão (MS Project "Padrão"): seg–sex, 08–12 e 13–17. */
const CALENDARIO_PADRAO = Object.freeze({
  nome: 'Padrão (seg–sex, 8 h/dia)',
  minutos_por_dia: 480,
  semana: {
    0: [],
    1: [[480, 720], [780, 1020]],
    2: [[480, 720], [780, 1020]],
    3: [[480, 720], [780, 1020]],
    4: [[480, 720], [780, 1020]],
    5: [[480, 720], [780, 1020]],
    6: [],
  },
  semanas_trabalho: [],
  excecoes: [],
});

function dataDoDia(dia) {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10);
}

function diaDaData(texto) {
  return Math.floor(Date.parse(`${texto}T00:00:00Z`) / DIA_MS);
}

function normalizarIntervalos(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map(([ini, fim]) => [Number(ini), Number(fim)])
    .filter(([ini, fim]) => Number.isFinite(ini) && Number.isFinite(fim) && fim > ini)
    .sort((a, b) => a[0] - b[0]);
}

function total(intervalos) {
  return intervalos.reduce((soma, [ini, fim]) => soma + (fim - ini), 0);
}

/**
 * Cria o calendário a partir da especificação (ou o padrão, sem especificação).
 * @returns {{ paraMinutos(d: Date): number, deMinutos(m: number, modo?: 'inicio'|'fim'): Date,
 *             minutosPorDia: number, nome: string, especificacao: object }}
 */
function criarCalendario(especificacao = null) {
  const spec = especificacao && especificacao.semana ? especificacao : CALENDARIO_PADRAO;
  const semanaBase = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, normalizarIntervalos(spec.semana[d] ?? spec.semana[String(d)])]));
  const semanasTrabalho = (spec.semanas_trabalho || []).map((s) => ({
    de: diaDaData(s.de),
    ate: diaDaData(s.ate),
    semana: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const valor = s.semana?.[d] ?? s.semana?.[String(d)];
        return [d, valor === undefined || valor === null ? null : normalizarIntervalos(valor)];
      })
    ),
  }));
  const excecoes = new Map();
  (spec.excecoes || []).forEach((e) => {
    for (let d = diaDaData(e.de); d <= diaDaData(e.ate || e.de); d += 1) excecoes.set(d, normalizarIntervalos(e.intervalos));
  });

  const intervalosDoDia = (diaAbs) => {
    if (excecoes.has(diaAbs)) return excecoes.get(diaAbs);
    const semana = new Date(diaAbs * DIA_MS).getUTCDay();
    const alternativa = semanasTrabalho.find((s) => diaAbs >= s.de && diaAbs <= s.ate);
    if (alternativa && alternativa.semana[semana]) return alternativa.semana[semana];
    return semanaBase[semana];
  };

  // Somas prefixadas: acumulado[i] = minutos úteis antes do dia ORIGEM_DIA + i.
  const acumulado = new Float64Array(TOTAL_DIAS + 1);
  const intervalos = new Array(TOTAL_DIAS);
  for (let i = 0; i < TOTAL_DIAS; i += 1) {
    intervalos[i] = intervalosDoDia(ORIGEM_DIA + i);
    acumulado[i + 1] = acumulado[i] + total(intervalos[i]);
  }
  if (acumulado[TOTAL_DIAS] === 0) throw new Error('Calendário sem nenhum horário de trabalho.');

  const indiceDoDia = (diaAbs) => Math.min(Math.max(diaAbs - ORIGEM_DIA, 0), TOTAL_DIAS - 1);

  function paraMinutos(data) {
    const localMin = Math.floor(data.getTime() / 60000) + FUSO_OFFSET_MIN;
    const diaAbs = Math.floor(localMin / 1440);
    const i = indiceDoDia(diaAbs);
    const minutoDoDia = localMin - diaAbs * 1440;
    const noDia = intervalos[i].reduce((soma, [ini, fim]) => soma + Math.max(0, Math.min(minutoDoDia, fim) - ini), 0);
    return acumulado[i] + noDia;
  }

  /** Em fronteiras: 'inicio' → começo do próximo período; 'fim' → término do anterior. */
  function deMinutos(minutos, modo = 'inicio') {
    const m = Math.min(Math.max(minutos, 0), acumulado[TOTAL_DIAS]);
    // Busca binária do dia: maior i com acumulado[i] < m (fim) ou ≤ m (início).
    let baixo = 0;
    let alto = TOTAL_DIAS - 1;
    while (baixo < alto) {
      const meio = Math.ceil((baixo + alto) / 2);
      const cabe = modo === 'fim' ? acumulado[meio] < m : acumulado[meio] <= m;
      if (cabe) baixo = meio;
      else alto = meio - 1;
    }
    let i = baixo;
    // Pula dias sem expediente (início) — o minuto pertence ao próximo dia útil.
    while (i < TOTAL_DIAS - 1 && total(intervalos[i]) === 0) i += 1;
    let restante = m - acumulado[i];
    let minutoDoDia = intervalos[i][0] ? intervalos[i][0][0] : 0;
    for (const [ini, fim] of intervalos[i]) {
      const duracao = fim - ini;
      const cabe = modo === 'fim' ? restante <= duracao : restante < duracao;
      if (cabe) {
        minutoDoDia = ini + restante;
        break;
      }
      restante -= duracao;
      minutoDoDia = fim;
    }
    return new Date(((ORIGEM_DIA + i) * 1440 + minutoDoDia - FUSO_OFFSET_MIN) * 60000);
  }

  return {
    nome: spec.nome || 'Calendário',
    minutosPorDia: Number(spec.minutos_por_dia) > 0 ? Number(spec.minutos_por_dia) : 480,
    paraMinutos,
    deMinutos,
    especificacao: spec,
    /** Descrição curta para exibição (ex.: "seg–qui 10:00–17:00…"). */
    dataDoDia,
  };
}

module.exports = { criarCalendario, CALENDARIO_PADRAO };

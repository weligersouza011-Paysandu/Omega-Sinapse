/**
 * Estudo de saúde contratual: teto em degraus (valor inicial + cada TAC) contra o acumulado real,
 * run rate dos ciclos (16 a 15) e projeção de esgotamento do saldo. Funções puras, sem React.
 *
 * Mês de referência: o ciclo termina no dia 15; uma data do dia 16 em diante pertence ao ciclo do mês seguinte.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MAX_MESES = 144;
/** Quantos ciclos medidos mais recentes formam o ritmo "atual". */
export const CICLOS_DO_RITMO = 3;

/** Referência ("AAAA-MM") do ciclo a que uma data ISO pertence. */
export function referenciaDaData(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
  const indice = ano * 12 + (mes - 1) + (dia >= 16 ? 1 : 0);
  return deIndice(indice);
}

const paraIndice = (referencia) => {
  const [ano, mes] = referencia.split('-').map(Number);
  return ano * 12 + (mes - 1);
};
const deIndice = (indice) => `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`;

export const somarMeses = (referencia, meses) => deIndice(paraIndice(referencia) + meses);
export const diferencaEmMeses = (de, ate) => paraIndice(ate) - paraIndice(de);

/** "set/26". */
export function rotuloDoMes(referencia) {
  const [ano, mes] = referencia.split('-');
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

const arredondar = (valor) => Math.round(valor * 100) / 100;
const percentual = (parte, base) => (base > 0 ? Math.round((parte / base) * 1000) / 10 : null);

/** Primeira referência (entre as medidas) em que o acumulado alcança `limite`; null se nunca. */
function primeiraAlcanca(medidos, limite) {
  const ponto = medidos.find((item) => item.real_acumulado >= limite);
  return ponto ? ponto.referencia : null;
}

/**
 * Monta o estudo.
 *
 * @param {object} contrato contrato com data_inicio, data_fim, valor_inicial, aditivos e consolidado.teto_atual
 * @param {object[]} curva curva S do dashboard (referencia, real, real_acumulado)
 */
export function montarEstudo(contrato, curva = []) {
  const aditivos = [...(contrato?.aditivos || [])]
    .sort((a, b) => (a.data_assinatura < b.data_assinatura ? -1 : 1))
    .map((tac, indice, todos) => ({
      ...tac,
      referencia: referenciaDaData(tac.data_assinatura),
      teto_anterior: indice === 0 ? Number(contrato.valor_inicial) : Number(todos[indice - 1].novo_valor_total),
      teto_novo: Number(tac.novo_valor_total),
      valor: Number(tac.valor_aditivo),
    }));

  const medidos = curva
    .filter((ponto) => ponto.real !== null && ponto.real !== undefined)
    .map((ponto) => ({ referencia: ponto.referencia, real: Number(ponto.real), real_acumulado: Number(ponto.real_acumulado) }))
    .sort((a, b) => (a.referencia < b.referencia ? -1 : 1));
  const primeiraMedida = medidos[0]?.referencia || null;
  const ultima = medidos[medidos.length - 1] || null;

  const refInicio = referenciaDaData(contrato.data_inicio);
  const refFim = referenciaDaData(contrato.data_fim);
  const inicio = [refInicio, primeiraMedida, ...aditivos.map((tac) => tac.referencia)].filter(Boolean).sort()[0];
  const fim = [refFim, ultima?.referencia, ...aditivos.map((tac) => tac.referencia)].filter(Boolean).sort().slice(-1)[0];

  /* ------------------------------- indicadores ------------------------------- */
  const tetoAtual = Number(contrato.consolidado?.teto_atual ?? contrato.valor_inicial);
  const acumulado = ultima ? ultima.real_acumulado : 0;
  const saldo = arredondar(tetoAtual - acumulado);
  const recentes = medidos.slice(-CICLOS_DO_RITMO);
  const ritmoRecente = recentes.length ? arredondar(recentes.reduce((soma, item) => soma + item.real, 0) / recentes.length) : null;
  const ritmoGeral = medidos.length ? arredondar(acumulado / medidos.length) : null;
  const pico = medidos.length ? medidos.reduce((maior, item) => (item.real > maior.real ? item : maior), medidos[0]) : null;

  const mesesRestantes = ultima ? Math.max(0, diferencaEmMeses(ultima.referencia, refFim)) : null;
  const ciclosAteEsgotar = ritmoRecente > 0 ? (saldo > 0 ? saldo / ritmoRecente : 0) : null;
  const referenciaEsgota = ultima && ciclosAteEsgotar !== null ? somarMeses(ultima.referencia, Math.ceil(ciclosAteEsgotar)) : null;
  const consumoAteFim = ritmoRecente !== null && mesesRestantes !== null ? arredondar(ritmoRecente * mesesRestantes) : null;
  const folga = consumoAteFim !== null ? arredondar(saldo - consumoAteFim) : null;
  const ritmoNecessario = mesesRestantes > 0 ? arredondar(saldo / mesesRestantes) : null;

  let situacao = 'SEM_DADOS';
  if (ultima && ritmoRecente !== null) {
    if (saldo <= 0) situacao = 'ESGOTADO';
    else if (mesesRestantes === 0) situacao = 'ENCERRADA';
    else if (folga < 0) situacao = 'ADITIVO';
    else if (folga < consumoAteFim * 0.1) situacao = 'ATENCAO';
    else situacao = 'OK';
  }

  const totalAditivos = arredondar(aditivos.reduce((soma, tac) => soma + tac.valor, 0));
  const indicadores = {
    situacao,
    teto_atual: tetoAtual,
    acumulado,
    saldo,
    percentual_consumido: percentual(acumulado, tetoAtual),
    ritmo_recente: ritmoRecente,
    ritmo_geral: ritmoGeral,
    pico: pico ? { referencia: pico.referencia, valor: pico.real } : null,
    ciclos_medidos: medidos.length,
    ultima_referencia: ultima?.referencia || null,
    meses_restantes: mesesRestantes,
    ciclos_ate_esgotar: ciclosAteEsgotar === null ? null : Math.round(ciclosAteEsgotar * 10) / 10,
    referencia_esgota: referenciaEsgota,
    consumo_ate_fim: consumoAteFim,
    folga,
    aditivo_necessario: folga !== null && folga < 0 ? arredondar(-folga) : 0,
    ritmo_necessario: ritmoNecessario,
    razao_ritmo: ritmoNecessario > 0 && ritmoRecente !== null ? Math.round((ritmoRecente / ritmoNecessario) * 1000) / 1000 : null,
    total_aditivos: totalAditivos,
    percentual_aditivos: percentual(totalAditivos, Number(contrato.valor_inicial)),
    quantidade_aditivos: aditivos.length,
  };

  /* ------------------------------- linha do tempo ------------------------------ */
  const realPorMes = new Map(medidos.map((item) => [item.referencia, item.real_acumulado]));
  const serie = [];
  const total = Math.min(MAX_MESES, diferencaEmMeses(inicio, fim) + 1);
  for (let i = 0; i < total; i += 1) {
    const referencia = somarMeses(inicio, i);
    const teto = aditivos.reduce((soma, tac) => (tac.referencia <= referencia ? tac.teto_novo : soma), Number(contrato.valor_inicial));
    const real = realPorMes.has(referencia) ? realPorMes.get(referencia) : null;
    let projecao = null;
    if (ultima && ritmoRecente !== null && referencia >= ultima.referencia) {
      projecao = referencia === ultima.referencia ? acumulado : arredondar(acumulado + ritmoRecente * diferencaEmMeses(ultima.referencia, referencia));
    }
    serie.push({
      referencia,
      rotulo: rotuloDoMes(referencia),
      teto,
      real,
      projecao,
      tacs: aditivos.filter((tac) => tac.referencia === referencia).map((tac) => tac.numero_tac),
    });
  }

  /* ------------------------- leitura de cada aditivo --------------------------- */
  const realAte = (referencia) => {
    if (!primeiraMedida || referencia < primeiraMedida) return 0;
    const anteriores = medidos.filter((item) => item.referencia <= referencia);
    return anteriores.length ? anteriores[anteriores.length - 1].real_acumulado : 0;
  };

  const analiseTacs = aditivos.map((tac) => {
    const realNaAssinatura = realAte(tac.referencia);
    const pct = percentual(realNaAssinatura, tac.teto_anterior);
    const ref90 = primeiraAlcanca(medidos, tac.teto_anterior * 0.9);
    const ref100 = primeiraAlcanca(medidos, tac.teto_anterior);
    let leitura = 'ANTECIPADO';
    if (pct !== null && pct >= 100) leitura = 'ESTOURADO';
    else if (pct !== null && pct >= 90) leitura = 'NO_LIMITE';
    else if (!primeiraMedida || tac.referencia < primeiraMedida) leitura = 'SEM_MEDICAO';
    return {
      id: tac.id,
      numero_tac: tac.numero_tac,
      data_assinatura: tac.data_assinatura,
      referencia: tac.referencia,
      motivo: tac.motivo || null,
      valor: tac.valor,
      teto_anterior: tac.teto_anterior,
      teto_novo: tac.teto_novo,
      real_na_assinatura: realNaAssinatura,
      percentual_do_teto_anterior: pct,
      referencia_90: ref90,
      referencia_100: ref100,
      leitura,
    };
  });

  return { serie, analiseTacs, indicadores };
}

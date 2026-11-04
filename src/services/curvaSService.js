'use strict';

const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');
const cronogramaRepository = require('../repositories/cronogramaRepository');

/**
 * Motor da Curva S e dos indicadores de desempenho de prazo.
 *
 * Fonte de dados (em ordem de preferência):
 *  1. Série semanal `curva_s` da versão de cronograma escolhida (padrão: a
 *     revisão mais recente), comparada com a linha de base original (Rev 00);
 *  2. Avanço físico semanal lançado manualmente na obra (obra_avanco_fisico).
 *
 * Convenções:
 *  - Físico em % (0–100); financeiro em R$.
 *  - "previsto" = linha de base da versão; "real" existe até a semana de status;
 *    "tendencia" (forecast) parte da semana de status até o fim projetado.
 *  - Desvio = real − previsto (p.p. no físico, R$ no financeiro).
 *  - SPI = real ÷ previsto acumulados (aderência ao prazo = SPI × 100).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANAS_RITMO = 4;

/** Faixas de SPI para classificação do desempenho de prazo. */
const FAIXAS_SPI = { noPrazo: 0.95, atencao: 0.85 };

function arredondar(valor, casas = 2) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function numeroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function dataIso(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function somarDias(dataTexto, dias) {
  const data = new Date(`${dataTexto}T00:00:00Z`);
  return new Date(data.getTime() + dias * DIA_MS).toISOString().slice(0, 10);
}

function diferencaDias(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(dataIso(a)) - Date.parse(dataIso(b))) / DIA_MS);
}

function classificarSpi(spi) {
  if (spi === null) return 'SEM_DADOS';
  if (spi >= FAIXAS_SPI.noPrazo) return 'NO_PRAZO';
  if (spi >= FAIXAS_SPI.atencao) return 'ATENCAO';
  return 'ATRASADO';
}

/* -------------------------------------------------------------------------- */
/* Normalização das fontes                                                    */
/* -------------------------------------------------------------------------- */

/** Série `curva_s` da versão → pontos { semana, data, fisico, financeiro }. */
function pontosDaVersao(curvaS) {
  return (Array.isArray(curvaS) ? curvaS : [])
    .filter((ponto) => ponto && ponto.data)
    .map((ponto) => ({
      semana: ponto.semana ?? null,
      data: dataIso(ponto.data),
      fisico: ponto.fisico || {},
      financeiro: ponto.financeiro || null,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Avanço manual da obra → mesmo formato (sem financeiro). */
function pontosDoAvancoManual(linhas, hoje = new Date()) {
  const limite = dataIso(hoje);
  return linhas.map((linha) => {
    const data = dataIso(linha.data);
    const tendencia = numeroOuNulo(linha.fisico_tend_acum);
    return {
      semana: linha.semana ?? null,
      data,
      fisico: {
        previsto: numeroOuNulo(linha.fisico_prev),
        real: data <= limite ? numeroOuNulo(linha.fisico_real) : null,
        previsto_acum: numeroOuNulo(linha.fisico_prev_acum),
        real_acum: data <= limite ? numeroOuNulo(linha.fisico_real_acum) : null,
        tendencia_acum: tendencia && tendencia > 0 ? tendencia : null,
      },
      financeiro: null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Cálculo de uma dimensão (físico ou financeiro)                             */
/* -------------------------------------------------------------------------- */

/**
 * Acumulado de uma série: usa o campo `<serie>_acum` quando informado; senão
 * acumula os valores do período. `carregar` repete o último valor nas semanas
 * sem dado (usado no previsto, que se mantém após o término da linha de base).
 */
function acumulado(pontos, dimensao, serie, { carregar = false } = {}) {
  let soma = 0;
  let ultimo = null;
  return pontos.map((ponto) => {
    const dados = ponto[dimensao] || {};
    const acum = numeroOuNulo(dados[`${serie}_acum`]);
    const periodo = numeroOuNulo(dados[serie]);
    let valor = null;
    if (acum !== null) {
      valor = acum;
      soma = acum;
    } else if (periodo !== null) {
      soma += periodo;
      valor = soma;
    } else if (carregar && ultimo !== null) {
      valor = ultimo;
    }
    if (valor !== null) ultimo = valor;
    return valor;
  });
}

function calcularDimensao(pontos, dimensao, casas) {
  const previsto = acumulado(pontos, dimensao, 'previsto', { carregar: true });
  const realBruto = acumulado(pontos, dimensao, 'real');
  const tendenciaBruta = acumulado(pontos, dimensao, 'tendencia');

  // Semana de status = última semana com realizado informado.
  let indiceStatus = -1;
  realBruto.forEach((valor, indice) => {
    if (valor !== null) indiceStatus = indice;
  });

  const real = realBruto.map((valor, indice) => (indice <= indiceStatus ? valor : null));
  const tendencia = tendenciaBruta.map((valor, indice) => {
    if (indiceStatus >= 0 && indice < indiceStatus) return null;
    if (indice === indiceStatus && valor === null) return real[indice]; // conecta real → forecast
    return valor;
  });

  const desvio = real.map((valor, indice) =>
    valor === null || previsto[indice] === null ? null : arredondar(valor - previsto[indice], casas)
  );
  const spi = real.map((valor, indice) =>
    valor === null || !previsto[indice] ? null : arredondar(valor / previsto[indice], 4)
  );

  return {
    previsto: previsto.map((v) => arredondar(v, casas)),
    real: real.map((v) => arredondar(v, casas)),
    tendencia: tendencia.map((v) => arredondar(v, casas)),
    desvio,
    spi,
    indiceStatus,
  };
}

/** Alinha a série prevista da linha de base às datas da versão analisada. */
function alinharLinhaBase(pontos, pontosBase, dimensao, casas) {
  if (!pontosBase.length) return null;
  const previstoBase = acumulado(pontosBase, dimensao, 'previsto', { carregar: true });
  const porData = pontosBase.map((ponto, indice) => ({ data: ponto.data, valor: previstoBase[indice] }));
  return pontos.map((ponto) => {
    // Último ponto da base com data ≤ data do ponto (degrau semanal).
    let valor = null;
    porData.forEach((item) => {
      if (item.data <= ponto.data && item.valor !== null) valor = item.valor;
    });
    return arredondar(valor, casas);
  });
}

/* -------------------------------------------------------------------------- */
/* Indicadores                                                                */
/* -------------------------------------------------------------------------- */

function indicadoresFisicos(pontos, fisico, previstoBase, resumo = {}, resumoBase = null) {
  const i = fisico.indiceStatus;
  const temStatus = i >= 0;
  const real = temStatus ? fisico.real[i] : null;
  const previsto = temStatus ? fisico.previsto[i] : null;
  const spi = temStatus ? fisico.spi[i] : null;

  // Ritmo real médio das últimas semanas (avanço por semana em p.p.).
  let ritmo = null;
  if (temStatus) {
    const inicio = Math.max(0, i - SEMANAS_RITMO);
    ritmo = i === 0 ? real : arredondar((real - (fisico.real[inicio] ?? 0)) / (i - inicio), 2);
  }

  // Semanas previstas restantes até o fim da linha de base da versão.
  const maximoPrevisto = Math.max(...fisico.previsto.filter((v) => v !== null), 0);
  const indiceFimLb = fisico.previsto.findIndex((v) => v !== null && v >= maximoPrevisto);
  const semanasRestantesLb = temStatus && indiceFimLb > i ? indiceFimLb - i : 0;
  const restante = real === null ? null : Math.max(100 - real, 0);

  const semanasNoRitmo = restante !== null && ritmo > 0 ? Math.ceil(restante / ritmo) : null;
  const dataStatus = temStatus ? pontos[i].data : null;
  const indiceConclusaoTendencia = fisico.tendencia.findIndex((v) => v !== null && v >= 99.95);

  const previstoLinhaBase = temStatus && previstoBase ? previstoBase[i] : null;

  return {
    semana_status: temStatus ? pontos[i].semana : null,
    data_status: dataStatus,
    previsto_acumulado: previsto,
    real_acumulado: real,
    tendencia_final: [...fisico.tendencia].reverse().find((v) => v !== null) ?? null,
    desvio: temStatus ? fisico.desvio[i] : null,
    spi,
    aderencia: spi === null ? null : arredondar(spi * 100, 2),
    status_prazo: classificarSpi(spi),
    ritmo_real_semanal: ritmo,
    ritmo_necessario_semanal:
      restante === null ? null : semanasRestantesLb > 0 ? arredondar(restante / semanasRestantesLb, 2) : null,
    semanas_para_concluir_no_ritmo: semanasNoRitmo,
    conclusao_no_ritmo: semanasNoRitmo !== null && dataStatus ? somarDias(dataStatus, semanasNoRitmo * 7) : null,
    conclusao_pela_tendencia: indiceConclusaoTendencia >= 0 ? pontos[indiceConclusaoTendencia].data : null,
    inicio_lb: resumo.inicio_lb ?? null,
    termino_lb: resumo.termino_lb ?? null,
    termino_tendencia: resumo.termino_tendencia ?? null,
    desvio_termino_dias: diferencaDias(resumo.termino_tendencia, resumo.termino_lb) ?? resumo.desvio_termino_dias ?? null,
    linha_base:
      previstoBase || resumoBase
        ? {
            previsto_acumulado: previstoLinhaBase,
            desvio: real !== null && previstoLinhaBase !== null ? arredondar(real - previstoLinhaBase, 2) : null,
            spi: real !== null && previstoLinhaBase ? arredondar(real / previstoLinhaBase, 4) : null,
            termino_lb_original: resumoBase?.termino_lb ?? null,
            replanejamento_termino_dias: diferencaDias(resumo.termino_lb, resumoBase?.termino_lb),
            desvio_termino_vs_original_dias: diferencaDias(resumo.termino_tendencia, resumoBase?.termino_lb),
          }
        : null,
  };
}

function indicadoresFinanceiros(pontos, financeiro, previstoBase) {
  if (!financeiro) return null;
  const i = financeiro.indiceStatus;
  const temStatus = i >= 0;
  const spi = temStatus ? financeiro.spi[i] : null;
  const total = Math.max(...financeiro.previsto.filter((v) => v !== null), 0);
  return {
    // A medição financeira pode estar defasada da física (semana de status própria).
    semana_status: temStatus ? pontos[i].semana : null,
    data_status: temStatus ? pontos[i].data : null,
    total_previsto: arredondar(total, 2),
    previsto_acumulado: temStatus ? financeiro.previsto[i] : null,
    real_acumulado: temStatus ? financeiro.real[i] : null,
    tendencia_final: [...financeiro.tendencia].reverse().find((v) => v !== null) ?? null,
    desvio: temStatus ? financeiro.desvio[i] : null,
    spi,
    aderencia: spi === null ? null : arredondar(spi * 100, 2),
    percentual_realizado: temStatus && total > 0 ? arredondar((financeiro.real[i] / total) * 100, 2) : null,
    saldo_a_realizar: temStatus ? arredondar(total - financeiro.real[i], 2) : null,
    previsto_linha_base: temStatus && previstoBase ? previstoBase[i] : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Montagem da resposta                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Função pura: recebe os pontos da versão (e opcionalmente da linha de base) e
 * devolve eixo temporal, séries e indicadores prontos para os gráficos.
 */
function calcularCurvaS(pontos, { pontosBase = [], resumo = {}, resumoBase = null } = {}) {
  const temFinanceiro = pontos.some((ponto) => ponto.financeiro && Object.keys(ponto.financeiro).length);

  const fisico = calcularDimensao(pontos, 'fisico', 2);
  const financeiro = temFinanceiro ? calcularDimensao(pontos, 'financeiro', 2) : null;
  const baseFisico = alinharLinhaBase(pontos, pontosBase, 'fisico', 2);
  const baseFinanceiro =
    temFinanceiro && pontosBase.some((p) => p.financeiro) ? alinharLinhaBase(pontos, pontosBase, 'financeiro', 2) : null;

  const eixo = pontos.map((ponto) => ({
    semana: ponto.semana,
    data: ponto.data,
    rotulo: ponto.semana ? `S${String(ponto.semana).padStart(2, '0')}` : ponto.data,
  }));

  // Formato "linha por semana" — consumido direto pelo Recharts.
  const pontosGrafico = eixo.map((item, indice) => ({
    ...item,
    previsto: fisico.previsto[indice],
    real: fisico.real[indice],
    tendencia: fisico.tendencia[indice],
    desvio: fisico.desvio[indice],
    spi: fisico.spi[indice],
    ...(baseFisico ? { previsto_linha_base: baseFisico[indice] } : {}),
    ...(financeiro
      ? {
          financeiro_previsto: financeiro.previsto[indice],
          financeiro_real: financeiro.real[indice],
          financeiro_tendencia: financeiro.tendencia[indice],
          financeiro_desvio: financeiro.desvio[indice],
          ...(baseFinanceiro ? { financeiro_previsto_linha_base: baseFinanceiro[indice] } : {}),
        }
      : {}),
  }));

  const series = (dimensao, base) =>
    dimensao && {
      previsto: dimensao.previsto,
      real: dimensao.real,
      tendencia: dimensao.tendencia,
      desvio: dimensao.desvio,
      spi: dimensao.spi,
      ...(base ? { previsto_linha_base: base } : {}),
    };

  return {
    eixo,
    series: { fisico: series(fisico, baseFisico), financeiro: series(financeiro, baseFinanceiro) || null },
    pontos: pontosGrafico,
    indicadores: {
      fisico: indicadoresFisicos(pontos, fisico, baseFisico, resumo || {}, resumoBase),
      financeiro: indicadoresFinanceiros(pontos, financeiro, baseFinanceiro),
    },
  };
}

function descreverVersao(versao) {
  return versao
    ? {
        id: versao.id,
        versao: versao.versao,
        numero_revisao: versao.numero_revisao,
        data_snapshot: versao.data_snapshot,
        periodo_inicio: versao.periodo_inicio ?? null,
        periodo_fim: versao.periodo_fim ?? null,
      }
    : null;
}

/**
 * GET /api/obras/:obraId/curva-s
 * Query:
 *  - versao_id: UUID da revisão analisada (padrão: a mais recente);
 *  - comparar:  "linha_base" (padrão) compara com a Rev 00; "nenhum" desliga;
 *  - base_id:   UUID de outra revisão para usar como base de comparação.
 */
async function obterCurvaS(obraIdParam, query = {}) {
  const obraId = Number(obraIdParam);
  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw new AppError(400, 'O parâmetro "obraId" deve ser um número inteiro positivo.');
  }
  if (!(await obraRepository.existsById(obraId))) {
    throw new AppError(404, `Obra ${obraId} não encontrada.`);
  }

  for (const campo of ['versao_id', 'base_id']) {
    if (query[campo] && !UUID.test(String(query[campo]))) {
      throw new AppError(400, `O parâmetro "${campo}" deve ser o UUID de uma versão do cronograma.`);
    }
  }
  const comparar = String(query.comparar || 'linha_base').toLowerCase();
  if (!['linha_base', 'nenhum'].includes(comparar)) {
    throw new AppError(400, 'O parâmetro "comparar" aceita "linha_base" ou "nenhum".');
  }

  const versoes = await cronogramaRepository.listarVersoesLeves(obraId);
  const versoesDisponiveis = versoes.map((v) => ({ id: v.id, versao: v.versao, numero_revisao: v.numero_revisao }));

  // ------------------------------------------------ Fallback: avanço manual
  if (!versoes.length) {
    if (query.versao_id) throw new AppError(404, 'Versão de cronograma não encontrada para esta obra.');
    const linhas = await cronogramaRepository.listarAvancoManual(obraId);
    const pontos = pontosDoAvancoManual(linhas);
    return {
      obra_id: obraId,
      fonte: pontos.length ? 'avanco_manual' : 'sem_dados',
      versao: null,
      linha_base: null,
      versoes_disponiveis: [],
      ...calcularCurvaS(pontos),
    };
  }

  // -------------------------------------------- Versão analisada e a base
  const idVersao = query.versao_id || versoes[versoes.length - 1].id;
  const versao = await cronogramaRepository.buscarCurvaDaVersao(obraId, idVersao);
  if (!versao) throw new AppError(404, 'Versão de cronograma não encontrada para esta obra.');

  let base = null;
  if (comparar === 'linha_base') {
    const idBase = query.base_id || versoes[0].id;
    if (idBase !== versao.id) {
      base = await cronogramaRepository.buscarCurvaDaVersao(obraId, idBase);
      if (!base) throw new AppError(404, 'Versão de base para comparação não encontrada para esta obra.');
    }
  }

  const pontos = pontosDaVersao(versao.curva_s);
  const avisos = [];
  if (!pontos.length) avisos.push(`A ${versao.versao} não possui série semanal de Curva S.`);
  if (base && !pontosDaVersao(base.curva_s).length) avisos.push(`A ${base.versao} não possui série semanal de Curva S.`);

  return {
    obra_id: obraId,
    fonte: 'cronograma',
    versao: descreverVersao(versao),
    linha_base: descreverVersao(base),
    versoes_disponiveis: versoesDisponiveis,
    ...calcularCurvaS(pontos, {
      pontosBase: base ? pontosDaVersao(base.curva_s) : [],
      resumo: versao.resumo || {},
      resumoBase: base ? base.resumo || {} : null,
    }),
    avisos,
  };
}

module.exports = {
  obterCurvaS,
  // Funções puras exportadas para testes e reuso (dashboard, relatórios).
  calcularCurvaS,
  pontosDaVersao,
  pontosDoAvancoManual,
  classificarSpi,
  FAIXAS_SPI,
};

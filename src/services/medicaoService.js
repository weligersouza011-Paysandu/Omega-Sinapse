'use strict';

const AppError = require('../errors/AppError');
const contratoRepository = require('../repositories/contratoRepository');
const boletimRepository = require('../repositories/boletimMedicaoRepository');
const { montarContrato } = require('./contratoService');

/**
 * Módulo de Medição e Projeção Financeira — Fase 2.
 *
 * Boletins de Medição (BMM) do contrato por ciclo (16 de um mês a 15 do
 * seguinte) e o dashboard agregado: KPIs, aderência financeira, árvore
 * BMM × SS e Curva S financeira mensal/acumulada.
 *
 * Todos os valores monetários são somados em centavos inteiros para que a
 * soma de várias parcelas não acumule erro de ponto flutuante.
 */

const PERFIS_QUE_GEREM_MEDICAO = ['SUPERVISOR', 'ADMIN'];
const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const STATUS_BOLETIM = ['EM_ANALISE', 'APROVADO', 'REJEITADO'];

/** Dia em que o ciclo de medição começa (e termina no dia anterior, no mês seguinte). */
const DIA_INICIO_CICLO = 16;

/** Limite de meses da Curva S (evita séries enormes por datas erradas). */
const MAX_MESES_CURVA = 120;

const MESES_ABREVIADOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function estaVazio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

function validarUsuario(usuario) {
  if (!usuario || usuario.id === undefined || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!PERFIS_VALIDOS.includes(usuario.perfil)) {
    throw new AppError(403, `Perfil desconhecido: "${usuario.perfil}".`);
  }
}

function exigirGestor(usuario) {
  validarUsuario(usuario);
  if (!PERFIS_QUE_GEREM_MEDICAO.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_QUE_GEREM_MEDICAO.join(' ou ')} podem gerir medições.`);
  }
}

function validarId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser um número inteiro positivo.`);
  }
  return numero;
}

/** Converte reais em centavos inteiros (arredondando meio centavo para cima). */
function emCentavos(valor) {
  return Math.round(Number(valor || 0) * 100);
}

function emReais(centavos) {
  return Math.round(centavos) / 100;
}

function valorNaoNegativo(valor, rotulo) {
  if (estaVazio(valor)) {
    throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new AppError(400, `O campo "${rotulo}" deve ser um número maior ou igual a zero.`);
  }
  return emReais(emCentavos(numero));
}

function dataISO(valor) {
  return valor ? new Date(valor).toISOString().slice(0, 10) : null;
}

function dataUTC(ano, mes, dia) {
  return new Date(Date.UTC(ano, mes, dia));
}

function parseData(valor, rotulo) {
  if (estaVazio(valor)) {
    throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  }
  const texto = String(valor).trim();
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00Z`) : new Date(texto);
  if (Number.isNaN(data.getTime())) {
    throw new AppError(400, `O campo "${rotulo}" deve ser uma data válida (AAAA-MM-DD).`);
  }
  return dataUTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
}

/** Mês de referência ("AAAA-MM") de uma data de ciclo: o mês em que o ciclo termina. */
function referenciaDaData(valor) {
  const data = new Date(valor);
  let ano = data.getUTCFullYear();
  let mes = data.getUTCMonth();
  if (data.getUTCDate() >= DIA_INICIO_CICLO) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      ano += 1;
    }
  }
  return `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

/** Ciclo padrão (16 do mês anterior a 15 do mês) de um mês de referência "AAAA-MM". */
function cicloDoMes(referencia) {
  const encontrado = /^(\d{4})-(\d{2})$/.exec(String(referencia || '').trim());
  const mes = encontrado ? Number(encontrado[2]) : 0;
  if (!encontrado || mes < 1 || mes > 12) {
    throw new AppError(400, 'O campo "mes_referencia" deve estar no formato AAAA-MM.');
  }
  const ano = Number(encontrado[1]);
  return {
    inicio: dataUTC(ano, mes - 2, DIA_INICIO_CICLO),
    fim: dataUTC(ano, mes - 1, DIA_INICIO_CICLO - 1),
  };
}

function proximoMes(referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

function mesAnterior(referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
}

/** Fim do ciclo (dia 15) do mês de referência, para comparar com séries por data. */
function fimDoCiclo(referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  return dataUTC(ano, mes - 1, DIA_INICIO_CICLO - 1);
}

function rotuloDoMes(referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  return `${MESES_ABREVIADOS[mes - 1]}/${String(ano).slice(2)}`;
}

/* -------------------------------------------------------------------------- */
/* Cálculo do dashboard (função pura)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Percentual físico acumulado de uma série na data informada (degrau: vale o
 * último lançamento até aquela data; antes do primeiro lançamento é zero).
 */
function percentualEm(serie, data, campo) {
  let valor = 0;
  for (const ponto of serie) {
    if (new Date(ponto.data) > data) break;
    const atual = Number(ponto[campo]);
    if (Number.isFinite(atual)) valor = atual;
  }
  return valor;
}

/** Boletim no formato da API (valores em reais, datas AAAA-MM-DD, itens por SS). */
function formatarBoletim(boletim) {
  const valorCent = emCentavos(boletim.valor_medido);
  const itens = (boletim.itens || []).map((item) => ({
    id: item.id ?? null,
    // Itens do histórico podem ser de uma SS que ainda não é obra do sistema (obra_id nulo).
    obra_id: item.obra_id ?? null,
    ss: item.obra?.orcamento?.ss ?? item.ss_codigo ?? null,
    osi: item.obra?.osi_numero ?? null,
    pep: item.obra?.orcamento?.pep ?? null,
    descricao: item.obra?.orcamento?.descricao ?? item.descricao ?? null,
    valor: emReais(emCentavos(item.valor)),
    percentual_do_boletim: valorCent > 0 ? Math.round((emCentavos(item.valor) / valorCent) * 10000) / 100 : 0,
  }));
  const detalhadoCent = itens.reduce((soma, item) => soma + emCentavos(item.valor), 0);
  const referencia = referenciaDaData(boletim.ciclo_fim);

  return {
    id: boletim.id,
    contrato_id: boletim.contrato_id,
    numero_bmm: boletim.numero_bmm,
    status: boletim.status,
    ciclo_inicio: dataISO(boletim.ciclo_inicio),
    ciclo_fim: dataISO(boletim.ciclo_fim),
    referencia,
    rotulo: rotuloDoMes(referencia),
    valor_medido: emReais(valorCent),
    observacao: boletim.observacao ?? null,
    registrado_por: boletim.usuario?.nome ?? null,
    itens,
    valor_sem_detalhamento: emReais(valorCent - detalhadoCent),
  };
}

/**
 * Monta o dashboard de medição de um contrato.
 *
 * @param {object} contrato resultado de `montarContrato` (teto atual e TACs)
 * @param {object[]} boletins boletins com `itens` (obra + valor)
 * @param {object[]} obras obras vinculadas ao contrato com `avanco_fisico`
 * @param {object[]} curvaContrato previsto/tendência financeiros do contrato por ciclo (planilha);
 *   quando existe, substitui o previsto derivado do avanço físico das obras
 */
function montarDashboardMedicao(contrato, boletins = [], obras = [], curvaContrato = []) {
  const aprovados = boletins.filter((boletim) => boletim.status === 'APROVADO');
  const emAnalise = boletins.filter((boletim) => boletim.status === 'EM_ANALISE');

  const tetoCent = emCentavos(contrato.consolidado.teto_atual);
  const acumuladoCent = aprovados.reduce((soma, boletim) => soma + emCentavos(boletim.valor_medido), 0);
  const emAnaliseCent = emAnalise.reduce((soma, boletim) => soma + emCentavos(boletim.valor_medido), 0);

  // Medido aprovado por mês de referência (o ciclo termina no mês do boletim).
  const realPorMes = new Map();
  aprovados.forEach((boletim) => {
    const referencia = referenciaDaData(boletim.ciclo_fim);
    realPorMes.set(referencia, (realPorMes.get(referencia) || 0) + emCentavos(boletim.valor_medido));
  });

  const referenciasMedidas = [...realPorMes.keys()].sort();
  const ultimaReferencia = referenciasMedidas[referenciasMedidas.length - 1] || null;
  const referenciaAnterior = ultimaReferencia ? mesAnterior(ultimaReferencia) : null;

  const ultimoCicloCent = ultimaReferencia ? realPorMes.get(ultimaReferencia) : 0;
  const anteriorCent = referenciaAnterior ? realPorMes.get(referenciaAnterior) || 0 : 0;

  const numeroDe = (referencia) =>
    aprovados
      .filter((boletim) => referenciaDaData(boletim.ciclo_fim) === referencia)
      .map((boletim) => boletim.numero_bmm)
      .join(' + ') || null;

  const kpis = {
    valor_contrato: emReais(tetoCent),
    valor_inicial: contrato.consolidado.valor_inicial,
    total_aditivos: contrato.consolidado.total_aditivos,
    quantidade_aditivos: contrato.consolidado.quantidade_aditivos,
    total_acumulado: emReais(acumuladoCent),
    saldo_contratual: emReais(tetoCent - acumuladoCent),
    percentual_medido: tetoCent > 0 ? Math.round((acumuladoCent / tetoCent) * 10000) / 100 : 0,
    percentual_saldo: tetoCent > 0 ? Math.round(((tetoCent - acumuladoCent) / tetoCent) * 10000) / 100 : 0,
    valor_em_analise: emReais(emAnaliseCent),
    ultimo_ciclo: ultimaReferencia
      ? {
          referencia: ultimaReferencia,
          rotulo: rotuloDoMes(ultimaReferencia),
          bmm: numeroDe(ultimaReferencia),
          valor: emReais(ultimoCicloCent),
          percentual_do_contrato: tetoCent > 0 ? Math.round((ultimoCicloCent / tetoCent) * 10000) / 100 : 0,
        }
      : null,
    mes_anterior: referenciaAnterior && realPorMes.has(referenciaAnterior)
      ? { referencia: referenciaAnterior, rotulo: rotuloDoMes(referenciaAnterior), bmm: numeroDe(referenciaAnterior), valor: emReais(anteriorCent) }
      : null,
    variacao_percentual:
      ultimaReferencia && anteriorCent > 0 ? Math.round(((ultimoCicloCent - anteriorCent) / anteriorCent) * 10000) / 100 : null,
  };

  /* ----------------------------- Curva S financeira ---------------------------- */
  const obrasComSerie = obras.filter((obra) => (obra.avanco_fisico || []).length > 0);
  const usarCurvaContrato = curvaContrato.length > 0;
  const curvaPorMes = new Map(curvaContrato.map((linha) => [referenciaDaData(linha.ciclo_fim), linha]));
  const referenciasEnvolvidas = [
    ...boletins.map((boletim) => referenciaDaData(boletim.ciclo_fim)),
    ...(usarCurvaContrato
      ? [...curvaPorMes.keys()]
      : obrasComSerie.flatMap((obra) => {
          const serie = obra.avanco_fisico;
          return [referenciaDaData(serie[0].data), referenciaDaData(serie[serie.length - 1].data)];
        })),
  ].sort();

  // Com a curva do contrato, a tabela vai até o mês da última medição prevista (fim do contrato).
  const referenciaFimContrato = contrato.data_fim ? referenciaDaData(`${String(contrato.data_fim).slice(0, 10)}T00:00:00Z`) : null;
  if (usarCurvaContrato && referenciaFimContrato) referenciasEnvolvidas.push(referenciaFimContrato);
  referenciasEnvolvidas.sort();

  const curva = [];
  if (referenciasEnvolvidas.length > 0) {
    const primeira = referenciasEnvolvidas[0];
    const ultima = referenciasEnvolvidas[referenciasEnvolvidas.length - 1];
    let referencia = primeira;
    let previstoAnteriorCent = 0;
    let realAcumuladoCent = 0;
    // Tendência é só manual (planilha ou ajuste na tabela): nenhum mês é calculado automaticamente.
    // A "tendência do mês" é a diferença entre a tendência acumulada informada e a anterior (ou o
    // real acumulado do último ciclo medido, no primeiro mês da projeção).
    let baseTendenciaCent = 0;

    for (let i = 0; i < MAX_MESES_CURVA; i += 1) {
      const fim = fimDoCiclo(referencia);
      const linhaCurva = curvaPorMes.get(referencia);
      const previstoAcumCent = usarCurvaContrato
        ? linhaCurva
          ? emCentavos(linhaCurva.previsto_acumulado)
          : previstoAnteriorCent
        : obrasComSerie.reduce(
            (soma, obra) => soma + Math.round((emCentavos(obra.orcamento?.valor) * percentualEm(obra.avanco_fisico, fim, 'fisico_prev_acum')) / 100),
            0
          );
      const previstoMesCent =
        usarCurvaContrato && linhaCurva ? emCentavos(linhaCurva.previsto_mensal) : previstoAcumCent - previstoAnteriorCent;
      const realMesCent = realPorMes.get(referencia) || 0;
      realAcumuladoCent += realMesCent;
      const medido = ultimaReferencia !== null && referencia <= ultimaReferencia;
      const projecao = ultimaReferencia !== null && referencia > ultimaReferencia;
      const tendenciaGravada =
        linhaCurva && linhaCurva.tendencia_acumulada !== null && linhaCurva.tendencia_acumulada !== undefined
          ? emCentavos(linhaCurva.tendencia_acumulada)
          : null;

      let tendenciaAcumCent;
      let tendenciaMensal = null;
      if (!usarCurvaContrato) {
        tendenciaAcumCent = obrasComSerie.reduce(
          (soma, obra) => soma + Math.round((emCentavos(obra.orcamento?.valor) * percentualEm(obra.avanco_fisico, fim, 'fisico_tend_acum')) / 100),
          0
        );
      } else if (ultimaReferencia === null || projecao || referencia === ultimaReferencia) {
        tendenciaAcumCent = tendenciaGravada ?? 0;
        if (referencia === ultimaReferencia) baseTendenciaCent = tendenciaGravada ?? realAcumuladoCent;
        if (projecao && tendenciaGravada !== null) {
          tendenciaMensal = tendenciaGravada - baseTendenciaCent;
          baseTendenciaCent = tendenciaGravada;
        }
      } else {
        tendenciaAcumCent = 0; // meses já medidos: o real substitui a tendência
      }

      curva.push({
        referencia,
        rotulo: rotuloDoMes(referencia),
        ciclo_inicio: dataISO(cicloDoMes(referencia).inicio),
        ciclo_fim: dataISO(cicloDoMes(referencia).fim),
        previsto: emReais(previstoMesCent),
        previsto_acumulado: emReais(previstoAcumCent),
        previsto_replanejado:
          usarCurvaContrato && linhaCurva && linhaCurva.previsto_replanejado !== null && linhaCurva.previsto_replanejado !== undefined
            ? emReais(emCentavos(linhaCurva.previsto_replanejado))
            : null,
        real: medido ? emReais(realMesCent) : null,
        real_acumulado: medido ? emReais(realAcumuladoCent) : null,
        tendencia_acumulada: emReais(tendenciaAcumCent),
        tendencia_mensal: tendenciaMensal === null ? null : emReais(tendenciaMensal),
        projecao,
        fim_do_contrato: referencia === referenciaFimContrato,
        // Com a curva do contrato todo mês é editável; um mês ainda sem linha ganha a linha ao ser ajustado.
        editavel: usarCurvaContrato,
      });

      previstoAnteriorCent = previstoAcumCent;
      if (referencia >= ultima) break;
      referencia = proximoMes(referencia);
    }
  }

  /* ------------------------------ Aderência financeira ------------------------- */
  const pontoDaUltima = ultimaReferencia ? curva.find((ponto) => ponto.referencia === ultimaReferencia) : null;
  let aderencia = {
    percentual: null,
    contra_tendencia: null,
    referencia: ultimaReferencia,
    real_acumulado: emReais(acumuladoCent),
    previsto_acumulado: pontoDaUltima ? pontoDaUltima.previsto_acumulado : 0,
    tendencia_acumulada: pontoDaUltima ? pontoDaUltima.tendencia_acumulada : 0,
    situacao: 'SEM_BASE',
  };
  if (pontoDaUltima && pontoDaUltima.previsto_acumulado > 0) {
    const percentual = Math.round((acumuladoCent / emCentavos(pontoDaUltima.previsto_acumulado)) * 10000) / 100;
    aderencia = {
      ...aderencia,
      percentual,
      contra_tendencia:
        pontoDaUltima.tendencia_acumulada > 0
          ? Math.round((acumuladoCent / emCentavos(pontoDaUltima.tendencia_acumulada)) * 10000) / 100
          : null,
      situacao: percentual >= 100 ? 'ACIMA_DO_PREVISTO' : percentual >= 90 ? 'NO_RITMO' : 'ABAIXO_DO_PREVISTO',
    };
  }

  /* ------------------------------ Árvore BMM × SS ------------------------------ */
  const arvore = [...boletins]
    .sort((a, b) => new Date(b.ciclo_fim) - new Date(a.ciclo_fim) || b.id - a.id)
    .map((boletim) => {
      const formatado = formatarBoletim(boletim);
      return {
        ...formatado,
        percentual_do_contrato:
          tetoCent > 0 ? Math.round((emCentavos(boletim.valor_medido) / tetoCent) * 10000) / 100 : 0,
      };
    });

  /* --------------------- Medido aprovado por obra/SS (rastreio) ----------------- */
  const porObra = new Map();
  aprovados.forEach((boletim) => {
    (boletim.itens || []).forEach((item) => {
      const chave = item.obra_id ?? `ss:${item.ss_codigo}`;
      const atual = porObra.get(chave) || {
        obra_id: item.obra_id ?? null,
        ss: item.obra?.orcamento?.ss ?? item.ss_codigo ?? null,
        osi: item.obra?.osi_numero ?? null,
        descricao: item.obra?.orcamento?.descricao ?? item.descricao ?? null,
        medido_cent: 0,
        boletins: [],
      };
      atual.medido_cent += emCentavos(item.valor);
      atual.boletins.push(boletim.numero_bmm);
      porObra.set(chave, atual);
    });
  });
  const valoresObras = new Map(obras.map((obra) => [obra.id, emCentavos(obra.orcamento?.valor)]));
  const porSs = [...porObra.values()]
    .map(({ medido_cent: medidoCent, ...obra }) => {
      const valorObraCent = valoresObras.get(obra.obra_id) || 0;
      return {
        ...obra,
        valor_obra: emReais(valorObraCent),
        medido_aprovado: emReais(medidoCent),
        percentual_medido: valorObraCent > 0 ? Math.round((medidoCent / valorObraCent) * 10000) / 100 : null,
      };
    })
    .sort((a, b) => b.medido_aprovado - a.medido_aprovado);

  return {
    contrato: {
      id: contrato.id,
      id_vale: contrato.id_vale,
      descricao: contrato.descricao,
      data_inicio: contrato.data_inicio,
      data_fim: contrato.data_fim,
      em_vigencia: contrato.em_vigencia,
    },
    kpis,
    aderencia_financeira: aderencia,
    boletins: arvore,
    por_ss: porSs,
    curva_s: curva,
    curva_s_fonte: usarCurvaContrato ? 'CONTRATO' : 'OBRAS',
    totais: {
      boletins: boletins.length,
      aprovados: aprovados.length,
      em_analise: emAnalise.length,
      rejeitados: boletins.length - aprovados.length - emAnalise.length,
      obras_vinculadas: obras.length,
      obras_com_avanco_fisico: obrasComSerie.length,
    },
    gerado_em: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

async function carregarContrato(idParam) {
  const id = validarId(idParam);
  const registro = await contratoRepository.findById(id);
  if (!registro) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }
  return { id, contrato: montarContrato(registro) };
}

/** GET /api/contratos/:id/dashboard-medicao */
async function obterDashboardMedicao(idParam, usuario) {
  validarUsuario(usuario);
  const { id, contrato } = await carregarContrato(idParam);
  const [boletins, obras, curvaContrato, historico] = await Promise.all([
    boletimRepository.listarPorContrato(id),
    boletimRepository.obrasComAvanco(id),
    boletimRepository.curvaDoContrato(id),
    boletimRepository.historicoDaCurva(id),
  ]);
  return {
    ...montarDashboardMedicao(contrato, boletins, obras, curvaContrato),
    historico_curva: historico.map((item) => ({
      id: item.id,
      referencia: item.referencia,
      rotulo: rotuloDoMes(item.referencia),
      campo: item.campo,
      valor_anterior: item.valor_anterior === null ? null : Number(item.valor_anterior),
      valor_novo: item.valor_novo === null ? null : Number(item.valor_novo),
      usuario_nome: item.usuario_nome,
      restaurado_de: item.restaurado_de,
      created_at: item.created_at,
    })),
  };
}

/**
 * POST /api/contratos/:id/boletins
 *
 * Corpo: { numero_bmm, mes_referencia ("AAAA-MM") ou ciclo_inicio + ciclo_fim,
 *          status?, observacao?, itens?: [{ obra_id, valor }], valor_medido? }
 * O valor medido é a soma dos itens; sem itens, `valor_medido` é obrigatório.
 */
async function criarBoletim(idParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const { id } = await carregarContrato(idParam);

  if (estaVazio(payload.numero_bmm)) {
    throw new AppError(400, 'O campo "numero_bmm" é obrigatório.');
  }
  const numeroBmm = String(payload.numero_bmm).trim().toUpperCase();
  if (numeroBmm.length > 30) {
    throw new AppError(400, 'O campo "numero_bmm" aceita no máximo 30 caracteres.');
  }

  // Ciclo: pelo mês de referência (16 a 15) ou por datas informadas.
  let inicio;
  let fim;
  if (!estaVazio(payload.mes_referencia)) {
    ({ inicio, fim } = cicloDoMes(payload.mes_referencia));
  } else {
    inicio = parseData(payload.ciclo_inicio, 'ciclo_inicio');
    fim = parseData(payload.ciclo_fim, 'ciclo_fim');
  }
  if (fim < inicio) {
    throw new AppError(400, 'O fim do ciclo não pode ser anterior ao início.');
  }

  const status = estaVazio(payload.status) ? 'EM_ANALISE' : String(payload.status).trim().toUpperCase();
  if (!STATUS_BOLETIM.includes(status)) {
    throw new AppError(400, `Status inválido. Valores aceitos: ${STATUS_BOLETIM.join(', ')}.`);
  }

  // Itens por obra/SS.
  const bruto = Array.isArray(payload.itens) ? payload.itens : [];
  const itens = bruto.map((item) => ({
    obra_id: validarId(item?.obra_id, 'itens[].obra_id'),
    valor: valorNaoNegativo(item?.valor, 'itens[].valor'),
  }));
  const repetidas = itens.map((item) => item.obra_id).filter((obraId, i, todas) => todas.indexOf(obraId) !== i);
  if (repetidas.length > 0) {
    throw new AppError(400, `A obra ${repetidas[0]} aparece mais de uma vez nos itens do boletim.`);
  }

  let valorMedido;
  if (itens.length > 0) {
    const somaCent = itens.reduce((soma, item) => soma + emCentavos(item.valor), 0);
    if (!estaVazio(payload.valor_medido) && emCentavos(valorNaoNegativo(payload.valor_medido, 'valor_medido')) !== somaCent) {
      throw new AppError(400, 'O "valor_medido" não confere com a soma dos itens do boletim.');
    }
    valorMedido = emReais(somaCent);

    await garantirObrasNoContrato(id, itens.map((item) => item.obra_id));
  } else {
    valorMedido = valorNaoNegativo(payload.valor_medido, 'valor_medido');
  }

  if (await boletimRepository.existeNumero(id, numeroBmm)) {
    throw new AppError(409, `O boletim ${numeroBmm} já está registrado neste contrato.`);
  }
  const sobreposto = await boletimRepository.existeCicloSobreposto(id, inicio, fim);
  if (sobreposto) {
    throw new AppError(409, `O ciclo informado se sobrepõe ao do boletim ${sobreposto}.`);
  }

  const boletim = await boletimRepository.criar(
    id,
    {
      numero_bmm: numeroBmm,
      valor_medido: valorMedido,
      ciclo_inicio: inicio,
      ciclo_fim: fim,
      status,
      observacao: estaVazio(payload.observacao) ? null : String(payload.observacao).trim(),
    },
    itens,
    usuario.id ?? null
  );
  return formatarBoletim(boletim);
}

/** PATCH /api/contratos/:id/boletins/:boletimId — aprova/rejeita ou ajusta a observação. */
async function atualizarBoletim(idParam, boletimIdParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const { id } = await carregarContrato(idParam);
  const boletimId = validarId(boletimIdParam, 'boletimId');

  const dados = {};
  if (!estaVazio(payload.status)) {
    const status = String(payload.status).trim().toUpperCase();
    if (!STATUS_BOLETIM.includes(status)) {
      throw new AppError(400, `Status inválido. Valores aceitos: ${STATUS_BOLETIM.join(', ')}.`);
    }
    dados.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'observacao')) {
    dados.observacao = estaVazio(payload.observacao) ? null : String(payload.observacao).trim();
  }
  const existente = await boletimRepository.buscar(id, boletimId);
  if (!existente) {
    throw new AppError(404, `Boletim ${boletimId} não encontrado neste contrato.`);
  }

  // Correção do número, do ciclo e (sem detalhamento por SS) do valor medido.
  if (!estaVazio(payload.numero_bmm)) {
    const numero = String(payload.numero_bmm).trim().toUpperCase();
    if (numero.length > 30) {
      throw new AppError(400, 'O campo "numero_bmm" aceita no máximo 30 caracteres.');
    }
    if (numero !== existente.numero_bmm) {
      if (await boletimRepository.existeNumero(id, numero, boletimId)) {
        throw new AppError(409, `O boletim ${numero} já está registrado neste contrato.`);
      }
      dados.numero_bmm = numero;
    }
  }

  if (!estaVazio(payload.mes_referencia) || !estaVazio(payload.ciclo_inicio) || !estaVazio(payload.ciclo_fim)) {
    let inicio;
    let fim;
    if (!estaVazio(payload.mes_referencia)) {
      ({ inicio, fim } = cicloDoMes(payload.mes_referencia));
    } else {
      inicio = parseData(payload.ciclo_inicio, 'ciclo_inicio');
      fim = parseData(payload.ciclo_fim, 'ciclo_fim');
    }
    if (fim < inicio) {
      throw new AppError(400, 'O fim do ciclo não pode ser anterior ao início.');
    }
    const mudou = dataISO(existente.ciclo_inicio) !== dataISO(inicio) || dataISO(existente.ciclo_fim) !== dataISO(fim);
    if (mudou) {
      const sobreposto = await boletimRepository.existeCicloSobreposto(id, inicio, fim, boletimId);
      if (sobreposto) {
        throw new AppError(409, `O ciclo informado se sobrepõe ao do boletim ${sobreposto}.`);
      }
      dados.ciclo_inicio = inicio;
      dados.ciclo_fim = fim;
    }
  }

  if (!estaVazio(payload.valor_medido)) {
    const valor = valorNaoNegativo(payload.valor_medido, 'valor_medido');
    if ((existente.itens || []).length > 0) {
      if (emCentavos(valor) !== emCentavos(existente.valor_medido)) {
        throw new AppError(
          400,
          'Este boletim tem o valor detalhado por SS: o total é a soma das SS. Exclua o boletim e lance de novo para mudar os valores.'
        );
      }
    } else {
      dados.valor_medido = valor;
    }
  }

  if (Object.keys(dados).length === 0) {
    throw new AppError(400, 'Informe ao menos um campo do boletim para alterar (número, ciclo, valor, status ou observação).');
  }

  return formatarBoletim(await boletimRepository.atualizar(id, boletimId, dados));
}

/**
 * Toda obra lançada em um boletim precisa ser do contrato. A que ainda não tem contrato é
 * vinculada aqui mesmo (basta escolher a SS); a que já é de outro contrato é recusada,
 * para não mover obra de contrato sem querer.
 */
async function garantirObrasNoContrato(contratoId, obraIds) {
  const unicas = [...new Set(obraIds)];
  const obras = await boletimRepository.obrasComContrato(unicas);
  const inexistentes = unicas.filter((obraId) => !obras.some((obra) => obra.id === obraId));
  if (inexistentes.length > 0) {
    throw new AppError(400, `Obra(s) ${inexistentes.join(', ')} não encontrada(s).`);
  }
  const deOutro = obras.filter((obra) => obra.contrato_id && obra.contrato_id !== contratoId);
  if (deOutro.length > 0) {
    const nomes = deOutro.map((obra) => `${obra.id} (${obra.contrato?.id_vale || `contrato ${obra.contrato_id}`})`).join(', ');
    throw new AppError(400, `A(s) obra(s) ${nomes} já estão em outro contrato. Mova-as pelo botão "Vincular obras" do contrato.`);
  }
  const livres = obras.filter((obra) => !obra.contrato_id).map((obra) => obra.id);
  if (livres.length > 0) {
    await boletimRepository.vincularObras(contratoId, livres);
  }
}

/* ---------------------- Itens (SS) de um boletim já lançado ---------------------- */

async function carregarBoletim(idParam, boletimIdParam) {
  const { id } = await carregarContrato(idParam);
  const boletimId = validarId(boletimIdParam, 'boletimId');
  const boletim = await boletimRepository.buscar(id, boletimId);
  if (!boletim) {
    throw new AppError(404, `Boletim ${boletimId} não encontrado neste contrato.`);
  }
  return { contratoId: id, boletimId, boletim };
}

/** Devolve o boletim atualizado no formato da API. */
async function boletimAtualizado(contratoId, boletimId) {
  return formatarBoletim(await boletimRepository.buscar(contratoId, boletimId));
}

/**
 * POST /api/contratos/:id/boletins/:boletimId/itens
 * Corpo: { obra_id, valor } (obra vinculada ao contrato) ou { ss_codigo, descricao?, valor }.
 * O valor medido do boletim aumenta pelo valor do item.
 */
async function incluirItemBoletim(idParam, boletimIdParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const { contratoId, boletimId } = await carregarBoletim(idParam, boletimIdParam);
  const valor = valorNaoNegativo(payload.valor, 'valor');

  let obraId = null;
  let ssCodigo = null;
  let descricao = null;
  if (!estaVazio(payload.obra_id)) {
    obraId = validarId(payload.obra_id, 'obra_id');
    await garantirObrasNoContrato(contratoId, [obraId]);
  } else if (!estaVazio(payload.ss_codigo)) {
    ssCodigo = String(payload.ss_codigo).trim().toUpperCase();
    if (ssCodigo.length > 60) {
      throw new AppError(400, 'O campo "ss_codigo" aceita no máximo 60 caracteres.');
    }
    descricao = estaVazio(payload.descricao) ? null : String(payload.descricao).trim();
  } else {
    throw new AppError(400, 'Informe a obra ("obra_id") ou o código da SS ("ss_codigo").');
  }

  if (await boletimRepository.existeItemDuplicado(boletimId, { obraId, ssCodigo })) {
    throw new AppError(409, 'Esta SS já está neste boletim: edite o valor da linha existente.');
  }

  await boletimRepository.incluirItem(boletimId, { obra_id: obraId, ss_codigo: ssCodigo, descricao, valor });
  return boletimAtualizado(contratoId, boletimId);
}

/** PUT /api/contratos/:id/boletins/:boletimId/itens/:itemId — corrige o valor (e o código/descrição de SS sem obra). */
async function atualizarItemBoletim(idParam, boletimIdParam, itemIdParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const { contratoId, boletimId } = await carregarBoletim(idParam, boletimIdParam);
  const itemId = validarId(itemIdParam, 'itemId');
  const item = await boletimRepository.buscarItem(contratoId, boletimId, itemId);
  if (!item) {
    throw new AppError(404, `Item ${itemId} não encontrado neste boletim.`);
  }

  const dados = {};
  if (!estaVazio(payload.valor)) dados.valor = valorNaoNegativo(payload.valor, 'valor');
  if (item.obra_id === null) {
    if (!estaVazio(payload.ss_codigo)) {
      dados.ss_codigo = String(payload.ss_codigo).trim().toUpperCase();
      if (dados.ss_codigo !== item.ss_codigo && (await boletimRepository.existeItemDuplicado(boletimId, { ssCodigo: dados.ss_codigo }, itemId))) {
        throw new AppError(409, 'Esta SS já está neste boletim: edite o valor da linha existente.');
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'descricao')) {
      dados.descricao = estaVazio(payload.descricao) ? null : String(payload.descricao).trim();
    }
  }
  if (Object.keys(dados).length === 0) {
    throw new AppError(400, 'Informe o novo valor da SS.');
  }

  const diferenca = dados.valor === undefined ? 0 : (emCentavos(dados.valor) - emCentavos(item.valor)) / 100;
  await boletimRepository.alterarItem(boletimId, itemId, dados, diferenca);
  return boletimAtualizado(contratoId, boletimId);
}

/** DELETE /api/contratos/:id/boletins/:boletimId/itens/:itemId — tira a SS e o valor dela do boletim. */
async function removerItemBoletim(idParam, boletimIdParam, itemIdParam, usuario) {
  exigirGestor(usuario);
  const { contratoId, boletimId } = await carregarBoletim(idParam, boletimIdParam);
  const itemId = validarId(itemIdParam, 'itemId');
  const item = await boletimRepository.buscarItem(contratoId, boletimId, itemId);
  if (!item) {
    throw new AppError(404, `Item ${itemId} não encontrado neste boletim.`);
  }

  await boletimRepository.removerItem(boletimId, itemId, Number(item.valor));
  return boletimAtualizado(contratoId, boletimId);
}

/* ------------------- Previsto, projetado e tendência editáveis ------------------- */

/** Linhas da curva em centavos, com a referência do mês. */
function linhasEmCentavos(curva) {
  return curva.map((linha) => ({
    id: linha.id,
    referencia: referenciaDaData(linha.ciclo_fim),
    previsto_mensal: emCentavos(linha.previsto_mensal),
    previsto_acumulado: emCentavos(linha.previsto_acumulado),
  }));
}

/**
 * Garante que a curva tenha linha para `referencia`: cria o mês (e os meses vazios entre a linha
 * anterior e ele) com previsto zero, mantendo o acumulado. Só vale até o fim do contrato.
 * Devolve a curva atualizada.
 */
async function garantirMesNaCurva(contratoId, contrato, referencia, curva) {
  const linhas = linhasEmCentavos(curva);
  if (linhas.some((linha) => linha.referencia === referencia)) return curva;
  if (linhas.length === 0) {
    throw new AppError(409, 'O contrato ainda não tem a curva de previsto importada. Importe a planilha de acompanhamento primeiro.');
  }
  const fimContrato = referenciaDaData(`${String(contrato.data_fim).slice(0, 10)}T00:00:00Z`);
  if (referencia > fimContrato) {
    throw new AppError(400, `O mês ${referencia} fica depois do fim do contrato (${rotuloDoMes(fimContrato)}).`);
  }
  const anteriores = curva.filter((linha) => referenciaDaData(linha.ciclo_fim) < referencia);
  if (anteriores.length === 0) {
    throw new AppError(400, `O mês ${referencia} é anterior ao início da curva do contrato.`);
  }
  const base = anteriores[anteriores.length - 1];
  const numeroBase = /^(.*?)(\d+)\s*$/.exec(String(base.numero_bmm || ''));

  const novos = [];
  let atual = proximoMes(referenciaDaData(base.ciclo_fim));
  let passo = 1;
  while (atual <= referencia) {
    const ciclo = cicloDoMes(atual);
    novos.push({
      numero_bmm: numeroBase ? `${numeroBase[1]}${Number(numeroBase[2]) + passo}` : `PREV-${atual}`,
      ciclo_inicio: ciclo.inicio,
      ciclo_fim: ciclo.fim,
      previsto_mensal: 0,
      previsto_acumulado: base.previsto_acumulado,
    });
    atual = proximoMes(atual);
    passo += 1;
  }
  await boletimRepository.criarCiclosDaCurva(contratoId, novos);
  return boletimRepository.curvaDoContrato(contratoId);
}

/** Campo do histórico → coluna da curva. */
const CAMPOS_CURVA = {
  PREVISTO: 'previsto_mensal',
  PROJETADO: 'previsto_replanejado',
  TENDENCIA: 'tendencia_acumulada',
};

const valorOuNulo = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/**
 * Aplica no mês `referencia` o novo valor (em centavos, ou null para limpar projetado/tendência)
 * e registra a alteração no histórico. No previsto, o acumulado dos meses seguintes acompanha.
 */
async function aplicarAlteracaoNaCurva({ id, contrato, referencia, campo, novoCent, usuario, restauradoDe = null }) {
  const curva = await garantirMesNaCurva(id, contrato, referencia, await boletimRepository.curvaDoContrato(id));
  const linhaBruta = curva.find((linha) => referenciaDaData(linha.ciclo_fim) === referencia);
  if (!linhaBruta) {
    throw new AppError(404, `O mês ${referencia} não está na curva do contrato. Importe a planilha de acompanhamento primeiro.`);
  }
  const coluna = CAMPOS_CURVA[campo];
  const anterior = valorOuNulo(linhaBruta[coluna]);
  const novo = novoCent === null ? null : emReais(novoCent);
  if (anterior === novo || (anterior !== null && novo !== null && emCentavos(anterior) === novoCent)) {
    return; // nada mudou: não gera histórico
  }

  if (campo === 'PREVISTO') {
    const linhas = linhasEmCentavos(curva);
    const alvo = linhas.find((linha) => linha.referencia === referencia);
    const diferenca = novoCent - alvo.previsto_mensal;
    const alteracoes = linhas
      .filter((linha) => linha.referencia >= referencia)
      .map((linha) => {
        const dados = { previsto_acumulado: emReais(linha.previsto_acumulado + diferenca) };
        if (linha.id === alvo.id) dados.previsto_mensal = emReais(novoCent);
        return { id: linha.id, dados };
      });
    await boletimRepository.atualizarCiclosDaCurva(alteracoes);
  } else {
    await boletimRepository.atualizarCiclosDaCurva([{ id: linhaBruta.id, dados: { [coluna]: novo } }]);
  }

  await boletimRepository.registrarHistoricoCurva({
    contrato_id: id,
    referencia,
    campo,
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: Number.isInteger(usuario?.id) ? usuario.id : null,
    usuario_nome: usuario?.nome || usuario?.email || null,
    restaurado_de: restauradoDe,
  });
}

/**
 * PUT /api/contratos/:id/curva/:referencia
 * Corpo (um valor por vez), para o mês "AAAA-MM":
 *  - { previsto: number } — o acumulado dos meses seguintes acompanha (a tendência não muda);
 *  - { projetado: number } — previsto replanejado (coluna "Projetado"); não mexe no acumulado;
 *  - { tendencia_acumulada: number } — tendência manual daquele mês, sem mexer em nenhum outro.
 * Cada alteração fica no histórico da curva. Devolve o dashboard atualizado.
 */
async function atualizarPrevistoDaCurva(idParam, referenciaParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const { id, contrato } = await carregarContrato(idParam);
  const referencia = String(referenciaParam || '').trim();
  cicloDoMes(referencia); // valida o formato AAAA-MM

  const informados = [
    ['PREVISTO', 'previsto'],
    ['PROJETADO', 'projetado'],
    ['TENDENCIA', 'tendencia_acumulada'],
  ].filter(([, chave]) => !estaVazio(payload[chave]));
  if (informados.length === 0) {
    throw new AppError(400, 'Informe o novo valor do mês: "previsto", "projetado" ou "tendencia_acumulada".');
  }
  if (informados.length > 1) {
    throw new AppError(400, 'Informe só um valor por vez: previsto, projetado ou tendência do mês.');
  }
  const [campo, chave] = informados[0];
  const novoCent = emCentavos(valorNaoNegativo(payload[chave], chave));

  await aplicarAlteracaoNaCurva({ id, contrato, referencia, campo, novoCent, usuario });
  return obterDashboardMedicao(id, usuario);
}

/**
 * POST /api/contratos/:id/curva/historico/:historicoId/restaurar
 * Volta o mês ao valor que ele tinha antes daquela alteração (a restauração também entra no histórico).
 */
async function restaurarAlteracaoDaCurva(idParam, historicoIdParam, usuario) {
  exigirGestor(usuario);
  const { id, contrato } = await carregarContrato(idParam);
  const historicoId = validarId(historicoIdParam, 'historicoId');
  const registro = await boletimRepository.buscarHistoricoCurva(id, historicoId);
  if (!registro) {
    throw new AppError(404, `Alteração ${historicoId} não encontrada no histórico deste contrato.`);
  }
  const anterior = valorOuNulo(registro.valor_anterior);
  // O previsto não fica vazio: sem valor anterior (mês criado na alteração) volta a zero.
  const novoCent = anterior === null ? (registro.campo === 'PREVISTO' ? 0 : null) : emCentavos(anterior);
  await aplicarAlteracaoNaCurva({ id, contrato, referencia: registro.referencia, campo: registro.campo, novoCent, usuario, restauradoDe: registro.id });
  return obterDashboardMedicao(id, usuario);
}

/** DELETE /api/contratos/:id/boletins/:boletimId */
async function excluirBoletim(idParam, boletimIdParam, usuario) {
  exigirGestor(usuario);
  const { id } = await carregarContrato(idParam);
  const boletimId = validarId(boletimIdParam, 'boletimId');

  if (!(await boletimRepository.excluir(id, boletimId))) {
    throw new AppError(404, `Boletim ${boletimId} não encontrado neste contrato.`);
  }
  return { id: boletimId, excluido: true };
}

module.exports = {
  atualizarPrevistoDaCurva,
  restaurarAlteracaoDaCurva,
  incluirItemBoletim,
  atualizarItemBoletim,
  removerItemBoletim,
  emCentavos,
  emReais,
  percentualEm,
  proximoMes,
  fimDoCiclo,
  rotuloDoMes,
  dataISO,
  PERFIS_QUE_GEREM_MEDICAO,
  STATUS_BOLETIM,
  obterDashboardMedicao,
  criarBoletim,
  atualizarBoletim,
  excluirBoletim,
  montarDashboardMedicao,
  cicloDoMes,
  referenciaDaData,
};

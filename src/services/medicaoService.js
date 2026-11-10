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
    obra_id: item.obra_id,
    ss: item.obra?.orcamento?.ss ?? null,
    osi: item.obra?.osi_numero ?? null,
    pep: item.obra?.orcamento?.pep ?? null,
    descricao: item.obra?.orcamento?.descricao ?? null,
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
 */
function montarDashboardMedicao(contrato, boletins = [], obras = []) {
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
    valor_em_analise: emReais(emAnaliseCent),
    ultimo_ciclo: ultimaReferencia
      ? { referencia: ultimaReferencia, rotulo: rotuloDoMes(ultimaReferencia), bmm: numeroDe(ultimaReferencia), valor: emReais(ultimoCicloCent) }
      : null,
    mes_anterior: referenciaAnterior && realPorMes.has(referenciaAnterior)
      ? { referencia: referenciaAnterior, rotulo: rotuloDoMes(referenciaAnterior), bmm: numeroDe(referenciaAnterior), valor: emReais(anteriorCent) }
      : null,
    variacao_percentual:
      ultimaReferencia && anteriorCent > 0 ? Math.round(((ultimoCicloCent - anteriorCent) / anteriorCent) * 10000) / 100 : null,
  };

  /* ----------------------------- Curva S financeira ---------------------------- */
  const obrasComSerie = obras.filter((obra) => (obra.avanco_fisico || []).length > 0);
  const referenciasEnvolvidas = [
    ...boletins.map((boletim) => referenciaDaData(boletim.ciclo_fim)),
    ...obrasComSerie.flatMap((obra) => {
      const serie = obra.avanco_fisico;
      return [referenciaDaData(serie[0].data), referenciaDaData(serie[serie.length - 1].data)];
    }),
  ].sort();

  const curva = [];
  if (referenciasEnvolvidas.length > 0) {
    const primeira = referenciasEnvolvidas[0];
    const ultima = referenciasEnvolvidas[referenciasEnvolvidas.length - 1];
    let referencia = primeira;
    let previstoAnteriorCent = 0;
    let realAcumuladoCent = 0;

    for (let i = 0; i < MAX_MESES_CURVA; i += 1) {
      const fim = fimDoCiclo(referencia);
      const previstoAcumCent = obrasComSerie.reduce(
        (soma, obra) => soma + Math.round((emCentavos(obra.orcamento?.valor) * percentualEm(obra.avanco_fisico, fim, 'fisico_prev_acum')) / 100),
        0
      );
      const tendenciaAcumCent = obrasComSerie.reduce(
        (soma, obra) => soma + Math.round((emCentavos(obra.orcamento?.valor) * percentualEm(obra.avanco_fisico, fim, 'fisico_tend_acum')) / 100),
        0
      );
      const realMesCent = realPorMes.get(referencia) || 0;
      realAcumuladoCent += realMesCent;
      const medido = ultimaReferencia !== null && referencia <= ultimaReferencia;

      curva.push({
        referencia,
        rotulo: rotuloDoMes(referencia),
        ciclo_inicio: dataISO(cicloDoMes(referencia).inicio),
        ciclo_fim: dataISO(cicloDoMes(referencia).fim),
        previsto: emReais(previstoAcumCent - previstoAnteriorCent),
        previsto_acumulado: emReais(previstoAcumCent),
        real: medido ? emReais(realMesCent) : null,
        real_acumulado: medido ? emReais(realAcumuladoCent) : null,
        tendencia_acumulada: emReais(tendenciaAcumCent),
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
      const atual = porObra.get(item.obra_id) || {
        obra_id: item.obra_id,
        ss: item.obra?.orcamento?.ss ?? null,
        osi: item.obra?.osi_numero ?? null,
        descricao: item.obra?.orcamento?.descricao ?? null,
        medido_cent: 0,
        boletins: [],
      };
      atual.medido_cent += emCentavos(item.valor);
      atual.boletins.push(boletim.numero_bmm);
      porObra.set(item.obra_id, atual);
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
  const [boletins, obras] = await Promise.all([
    boletimRepository.listarPorContrato(id),
    boletimRepository.obrasComAvanco(id),
  ]);
  return montarDashboardMedicao(contrato, boletins, obras);
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

    const doContrato = await boletimRepository.obrasDoContrato(id, itens.map((item) => item.obra_id));
    const foraDoContrato = itens.map((item) => item.obra_id).filter((obraId) => !doContrato.includes(obraId));
    if (foraDoContrato.length > 0) {
      throw new AppError(
        400,
        `A(s) obra(s) ${foraDoContrato.join(', ')} não estão vinculadas a este contrato. Vincule-as antes de lançar a medição.`
      );
    }
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
  if (Object.keys(dados).length === 0) {
    throw new AppError(400, 'Informe "status" e/ou "observacao" para atualizar o boletim.');
  }

  if (!(await boletimRepository.buscar(id, boletimId))) {
    throw new AppError(404, `Boletim ${boletimId} não encontrado neste contrato.`);
  }
  return formatarBoletim(await boletimRepository.atualizar(id, boletimId, dados));
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

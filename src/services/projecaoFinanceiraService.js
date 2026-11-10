'use strict';

const AppError = require('../errors/AppError');
const boletimRepository = require('../repositories/boletimMedicaoRepository');
const qqpRepository = require('../repositories/qqpRepository');
const { contarDiasUteis, ehDiaUtil, percorrerDias, dataDeCalendario, iso } = require('../utils/diasUteis');
const {
  emCentavos,
  emReais,
  percentualEm,
  proximoMes,
  fimDoCiclo,
  rotuloDoMes,
  dataISO,
  cicloDoMes,
  referenciaDaData,
} = require('./medicaoService');

/**
 * Medição e projeção financeira de uma obra (SS).
 *
 *  - Medição: os Boletins de Medição (BMM) em que a obra pontuou, com o valor
 *    medido em cada ciclo (16 a 15) e o acumulado aprovado;
 *  - Projeção: avanço físico planejado x realizado x medido (R$) por ciclo e o
 *    custo projetado dos recursos do QQP (HH, equipamentos, insumos), calculado
 *    pelos dias úteis de cada ciclo.
 *
 * Valores monetários em centavos inteiros durante as somas.
 */

const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const HORAS_DIA_PADRAO = 8;
const MAX_CICLOS = 120;

const CHAVE_CATEGORIA = { HH: 'hh', EQUIPAMENTO: 'equipamento', INSUMO: 'insumo', OUTROS: 'outros' };

function arredondar(valor, casas = 2) {
  const fator = 10 ** casas;
  return Math.round(Number(valor || 0) * fator) / fator;
}

function validarUsuario(usuario) {
  if (!usuario || usuario.id === undefined || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!PERFIS_VALIDOS.includes(usuario.perfil)) {
    throw new AppError(403, `Perfil desconhecido: "${usuario.perfil}".`);
  }
}

function validarId(valor) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, 'O parâmetro "id" deve ser um número inteiro positivo.');
  }
  return numero;
}

/** Lista contínua de meses de referência entre o primeiro e o último informados. */
function mesesEntre(referencias) {
  const validas = referencias.filter(Boolean).sort();
  if (validas.length === 0) return [];
  const lista = [];
  let atual = validas[0];
  const ultimo = validas[validas.length - 1];
  for (let i = 0; i < MAX_CICLOS; i += 1) {
    lista.push(atual);
    if (atual >= ultimo) break;
    atual = proximoMes(atual);
  }
  return lista;
}

/* -------------------------------------------------------------------------- */
/* Motor de custos do QQP (dias úteis x recursos x preços)                    */
/* -------------------------------------------------------------------------- */

/**
 * Custo de um recurso do QQP por ciclo de medição.
 *
 *  - HORA:    dias úteis do ciclo x quantidade x horas por dia x preço;
 *  - DIA:     dias úteis do ciclo x quantidade x preço;
 *  - MES:     quantidade x preço x (dias úteis alocados ÷ dias úteis do ciclo);
 *  - UNIDADE: quantidade x preço, uma vez, no ciclo da data de início.
 *
 * @returns {{ porCiclo: Map<string, {custoCent:number, dias:number}>, diasUteisTotal:number, custoTotalCent:number }}
 */
function custoDoRecurso(recurso) {
  const { item } = recurso;
  const quantidade = Number(recurso.quantidade);
  const preco = Number(item.preco_unitario);
  const horas = recurso.horas_dia === null || recurso.horas_dia === undefined ? HORAS_DIA_PADRAO : Number(recurso.horas_dia);
  const opcoes = { sabados: Boolean(recurso.inclui_sabados) };
  const porCiclo = new Map();
  const somar = (referencia, custoCent, dias) => {
    const atual = porCiclo.get(referencia) || { custoCent: 0, dias: 0 };
    atual.custoCent += custoCent;
    atual.dias += dias;
    porCiclo.set(referencia, atual);
  };

  if (item.unidade === 'UNIDADE') {
    somar(referenciaDaData(recurso.data_inicio), Math.round(quantidade * preco * 100), 0);
  } else {
    const diasPorCiclo = new Map();
    for (const dia of percorrerDias(recurso.data_inicio, recurso.data_fim || recurso.data_inicio)) {
      if (!ehDiaUtil(dia, opcoes)) continue;
      const referencia = referenciaDaData(dia);
      diasPorCiclo.set(referencia, (diasPorCiclo.get(referencia) || 0) + 1);
    }

    diasPorCiclo.forEach((dias, referencia) => {
      let custo;
      if (item.unidade === 'HORA') {
        custo = dias * quantidade * horas * preco;
      } else if (item.unidade === 'DIA') {
        custo = dias * quantidade * preco;
      } else {
        const ciclo = cicloDoMes(referencia);
        const diasDoCiclo = contarDiasUteis(ciclo.inicio, ciclo.fim, opcoes);
        custo = diasDoCiclo > 0 ? quantidade * preco * (dias / diasDoCiclo) : 0;
      }
      somar(referencia, Math.round(custo * 100), dias);
    });
  }

  let diasUteisTotal = 0;
  let custoTotalCent = 0;
  porCiclo.forEach((valor) => {
    diasUteisTotal += valor.dias;
    custoTotalCent += valor.custoCent;
  });
  return { porCiclo, diasUteisTotal, custoTotalCent };
}

/**
 * Projeta o custo dos recursos do QQP por ciclo, separado por categoria.
 *
 * @param {object[]} recursos alocações com o `item` do QQP
 * @param {{ hoje?: Date }} opcoes `hoje` separa o custo já incorrido do a incorrer
 */
function projetarCustosQqp(recursos = [], { hoje = new Date() } = {}) {
  const ciclos = new Map();
  const porRecurso = [];

  recursos.forEach((recurso) => {
    const calculo = custoDoRecurso(recurso);
    const chave = CHAVE_CATEGORIA[recurso.item.categoria] || 'outros';

    calculo.porCiclo.forEach(({ custoCent }, referencia) => {
      const ciclo = ciclos.get(referencia) || { hh: 0, equipamento: 0, insumo: 0, outros: 0 };
      ciclo[chave] += custoCent;
      ciclos.set(referencia, ciclo);
    });

    porRecurso.push({
      recurso_id: recurso.id,
      item: {
        id: recurso.item.id,
        codigo: recurso.item.codigo,
        descricao: recurso.item.descricao,
        categoria: recurso.item.categoria,
        unidade: recurso.item.unidade,
        preco_unitario: arredondar(recurso.item.preco_unitario, 4),
      },
      quantidade: arredondar(recurso.quantidade, 3),
      horas_dia: recurso.item.unidade === 'HORA' ? arredondar(recurso.horas_dia ?? HORAS_DIA_PADRAO) : null,
      data_inicio: dataISO(recurso.data_inicio),
      data_fim: dataISO(recurso.data_fim),
      inclui_sabados: Boolean(recurso.inclui_sabados),
      observacao: recurso.observacao ?? null,
      dias_uteis: calculo.diasUteisTotal,
      custo_total: emReais(calculo.custoTotalCent),
    });
  });

  const hojeIso = iso(dataDeCalendario(hoje));
  const referencias = mesesEntre([...ciclos.keys()]);
  let acumulado = 0;
  const lista = referencias.map((referencia) => {
    const valores = ciclos.get(referencia) || { hh: 0, equipamento: 0, insumo: 0, outros: 0 };
    const totalCent = valores.hh + valores.equipamento + valores.insumo + valores.outros;
    acumulado += totalCent;
    const ciclo = cicloDoMes(referencia);
    return {
      referencia,
      rotulo: rotuloDoMes(referencia),
      ciclo_inicio: dataISO(ciclo.inicio),
      ciclo_fim: dataISO(ciclo.fim),
      dias_uteis: contarDiasUteis(ciclo.inicio, ciclo.fim),
      incorrido: dataISO(ciclo.fim) <= hojeIso,
      hh: emReais(valores.hh),
      equipamento: emReais(valores.equipamento),
      insumo: emReais(valores.insumo),
      outros: emReais(valores.outros),
      total: emReais(totalCent),
      total_acumulado: emReais(acumulado),
    };
  });

  const soma = (campo) => lista.reduce((total, ciclo) => total + emCentavos(ciclo[campo]), 0);
  const totalCent = soma('total');
  const incorridoCent = lista.filter((ciclo) => ciclo.incorrido).reduce((total, ciclo) => total + emCentavos(ciclo.total), 0);

  return {
    ciclos: lista,
    por_recurso: porRecurso,
    totais: {
      hh: emReais(soma('hh')),
      equipamento: emReais(soma('equipamento')),
      insumo: emReais(soma('insumo')),
      outros: emReais(soma('outros')),
      total: emReais(totalCent),
      incorrido: emReais(incorridoCent),
      a_incorrer: emReais(totalCent - incorridoCent),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Medição da obra (BMMs em que a SS pontuou)                                 */
/* -------------------------------------------------------------------------- */

function identificarObra(obra) {
  return {
    id: obra.id,
    ss: obra.orcamento?.ss ?? null,
    osi: obra.osi_numero ?? null,
    pep: obra.orcamento?.pep ?? null,
    descricao: obra.orcamento?.descricao ?? null,
    status: obra.status,
    valor: arredondar(obra.orcamento?.valor),
    contrato: obra.contrato
      ? { id: obra.contrato.id, id_vale: obra.contrato.id_vale, descricao: obra.contrato.descricao }
      : null,
  };
}

/**
 * Histórico de medição da obra.
 *
 * @param {object} obra obra com orçamento e contrato
 * @param {object[]} itens itens de boletim da obra (cada um com `boletim`)
 */
function montarMedicaoObra(obra, itens = []) {
  const valorObraCent = emCentavos(obra.orcamento?.valor);
  const ordenados = [...itens].sort(
    (a, b) => new Date(a.boletim.ciclo_fim) - new Date(b.boletim.ciclo_fim) || a.boletim.id - b.boletim.id
  );

  let acumuladoCent = 0;
  const boletins = ordenados.map((item) => {
    const valorCent = emCentavos(item.valor);
    const aprovado = item.boletim.status === 'APROVADO';
    if (aprovado) acumuladoCent += valorCent;
    const totalBoletimCent = emCentavos(item.boletim.valor_medido);
    const referencia = referenciaDaData(item.boletim.ciclo_fim);
    return {
      boletim_id: item.boletim.id,
      numero_bmm: item.boletim.numero_bmm,
      status: item.boletim.status,
      ciclo_inicio: dataISO(item.boletim.ciclo_inicio),
      ciclo_fim: dataISO(item.boletim.ciclo_fim),
      referencia,
      rotulo: rotuloDoMes(referencia),
      valor: emReais(valorCent),
      valor_boletim: emReais(totalBoletimCent),
      participacao_no_boletim: totalBoletimCent > 0 ? arredondar((valorCent / totalBoletimCent) * 100) : 0,
      // Só boletins aprovados entram no acumulado.
      acumulado_aprovado: emReais(acumuladoCent),
      percentual_acumulado: valorObraCent > 0 ? arredondar((acumuladoCent / valorObraCent) * 100) : 0,
    };
  });

  const somaPorStatus = (status) =>
    ordenados.filter((item) => item.boletim.status === status).reduce((total, item) => total + emCentavos(item.valor), 0);
  const aprovadoCent = somaPorStatus('APROVADO');
  const emAnaliseCent = somaPorStatus('EM_ANALISE');

  return {
    obra: identificarObra(obra),
    resumo: {
      valor_obra: emReais(valorObraCent),
      medido_aprovado: emReais(aprovadoCent),
      em_analise: emReais(emAnaliseCent),
      rejeitado: emReais(somaPorStatus('REJEITADO')),
      saldo_a_medir: emReais(valorObraCent - aprovadoCent),
      percentual_medido: valorObraCent > 0 ? arredondar((aprovadoCent / valorObraCent) * 100) : 0,
      quantidade_boletins: boletins.length,
      ultimo_boletim: boletins.length ? boletins[boletins.length - 1].numero_bmm : null,
    },
    boletins,
    gerado_em: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Projeção financeira da obra                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fluxo de caixa projetado da obra por ciclo de medição.
 *
 * Para cada ciclo (16 a 15):
 *  - previsto: valor da obra x avanço físico PLANEJADO acumulado;
 *  - fisico_real: valor da obra x avanço físico REAL acumulado (o que já foi feito);
 *  - tendencia: valor da obra x avanço físico de TENDÊNCIA acumulado;
 *  - medido: boletins aprovados (o que foi faturado);
 *  - desvio: medido − previsto no mesmo ciclo;
 *  - custo QQP: HH, equipamentos e insumos projetados pelos dias úteis;
 *  - receita: o medido nos ciclos já medidos e, depois, a tendência do cronograma;
 *  - fluxo = receita − custo.
 */
function montarProjecaoObra(obra, itensMedicao = [], recursos = [], { hoje = new Date() } = {}) {
  const valorObraCent = emCentavos(obra.orcamento?.valor);
  const serie = [...(obra.avanco_fisico || [])].sort((a, b) => new Date(a.data) - new Date(b.data));
  const qqp = projetarCustosQqp(recursos, { hoje });

  // Medido aprovado por ciclo.
  const medidoPorCiclo = new Map();
  let emAnaliseCent = 0;
  itensMedicao.forEach((item) => {
    const referencia = referenciaDaData(item.boletim.ciclo_fim);
    if (item.boletim.status === 'APROVADO') {
      medidoPorCiclo.set(referencia, (medidoPorCiclo.get(referencia) || 0) + emCentavos(item.valor));
    } else if (item.boletim.status === 'EM_ANALISE') {
      emAnaliseCent += emCentavos(item.valor);
    }
  });
  const ultimaMedida = [...medidoPorCiclo.keys()].sort().pop() || null;

  const referencias = mesesEntre([
    ...(serie.length ? [referenciaDaData(serie[0].data), referenciaDaData(serie[serie.length - 1].data)] : []),
    ...medidoPorCiclo.keys(),
    ...qqp.ciclos.map((ciclo) => ciclo.referencia),
  ]);

  const custoPorCiclo = new Map(qqp.ciclos.map((ciclo) => [ciclo.referencia, ciclo]));

  // O avanço físico real só vale até o último lançamento com realizado (depois dele é zero "ainda não feito").
  const lancamentosComReal = serie.filter((linha) => Number(linha.fisico_real_acum) > 0);
  const ultimaDataReal = lancamentosComReal.length
    ? dataDeCalendario(lancamentosComReal[lancamentosComReal.length - 1].data)
    : null;
  const valorEm = (campo, fim) => Math.round((valorObraCent * percentualEm(serie, fim, campo)) / 100);

  let medidoAcumCent = 0;
  let tendenciaAnteriorCent = 0;
  let custoAcumCent = 0;
  let fluxoAcumCent = 0;
  const hojeIso = iso(dataDeCalendario(hoje));

  const meses = referencias.map((referencia) => {
    const fim = fimDoCiclo(referencia);
    const ciclo = cicloDoMes(referencia);
    const previstoCent = valorEm('fisico_prev_acum', fim);
    const tendenciaCent = valorEm('fisico_tend_acum', fim);
    const fisicoRealCent = valorEm('fisico_real_acum', fim);
    const medidoMesCent = medidoPorCiclo.get(referencia) || 0;
    medidoAcumCent += medidoMesCent;
    const medido = ultimaMedida !== null && referencia <= ultimaMedida;

    // Receita: o que foi medido até o último ciclo medido; depois, o ritmo da tendência.
    const receitaCent = medido ? medidoMesCent : Math.max(0, tendenciaCent - tendenciaAnteriorCent);
    tendenciaAnteriorCent = Math.max(tendenciaAnteriorCent, tendenciaCent);

    const custo = custoPorCiclo.get(referencia);
    const custoCent = custo ? emCentavos(custo.total) : 0;
    custoAcumCent += custoCent;
    fluxoAcumCent += receitaCent - custoCent;

    return {
      referencia,
      rotulo: rotuloDoMes(referencia),
      ciclo_inicio: dataISO(ciclo.inicio),
      ciclo_fim: dataISO(ciclo.fim),
      dias_uteis: contarDiasUteis(ciclo.inicio, ciclo.fim),
      previsto_acumulado: emReais(previstoCent),
      tendencia_acumulada: emReais(tendenciaCent),
      fisico_real_acumulado: ultimaDataReal && ciclo.inicio <= ultimaDataReal ? emReais(fisicoRealCent) : null,
      medido: medido ? emReais(medidoMesCent) : null,
      medido_acumulado: medido ? emReais(medidoAcumCent) : null,
      desvio: medido ? emReais(medidoAcumCent - previstoCent) : null,
      desvio_pontos: medido && valorObraCent > 0 ? arredondar(((medidoAcumCent - previstoCent) / valorObraCent) * 100) : null,
      custo_hh: custo?.hh ?? 0,
      custo_equipamento: custo?.equipamento ?? 0,
      custo_insumo: custo?.insumo ?? 0,
      custo_outros: custo?.outros ?? 0,
      custo_qqp: emReais(custoCent),
      custo_qqp_acumulado: emReais(custoAcumCent),
      receita: emReais(receitaCent),
      receita_projetada: !medido,
      fluxo: emReais(receitaCent - custoCent),
      fluxo_acumulado: emReais(fluxoAcumCent),
      passado: dataISO(ciclo.fim) <= hojeIso,
    };
  });

  const medidoAprovadoCent = [...medidoPorCiclo.values()].reduce((soma, valor) => soma + valor, 0);
  const pontoUltima = ultimaMedida ? meses.find((mes) => mes.referencia === ultimaMedida) : null;
  const receitaFuturaCent = meses.filter((mes) => mes.receita_projetada).reduce((soma, mes) => soma + emCentavos(mes.receita), 0);
  const temQqp = recursos.length > 0;
  const custoTotalCent = emCentavos(qqp.totais.total);

  let aderencia = null;
  if (pontoUltima && pontoUltima.previsto_acumulado > 0) {
    aderencia = arredondar((medidoAprovadoCent / emCentavos(pontoUltima.previsto_acumulado)) * 100);
  }

  return {
    obra: identificarObra(obra),
    resumo: {
      valor_obra: emReais(valorObraCent),
      medido_aprovado: emReais(medidoAprovadoCent),
      em_analise: emReais(emAnaliseCent),
      saldo_a_medir: emReais(valorObraCent - medidoAprovadoCent),
      percentual_medido: valorObraCent > 0 ? arredondar((medidoAprovadoCent / valorObraCent) * 100) : 0,
      aderencia_financeira: aderencia,
      ultimo_ciclo_medido: ultimaMedida,
      receita_futura_projetada: emReais(receitaFuturaCent),
      custo_qqp_total: qqp.totais.total,
      custo_qqp_incorrido: qqp.totais.incorrido,
      custo_qqp_a_incorrer: qqp.totais.a_incorrer,
      // Resultado projetado = tudo que a obra deve faturar (medido + tendência) menos o custo dos recursos.
      resultado_projetado: temQqp ? emReais(medidoAprovadoCent + receitaFuturaCent - custoTotalCent) : null,
      margem_projetada:
        temQqp && medidoAprovadoCent + receitaFuturaCent > 0
          ? arredondar(((medidoAprovadoCent + receitaFuturaCent - custoTotalCent) / (medidoAprovadoCent + receitaFuturaCent)) * 100)
          : null,
      tem_avanco_fisico: serie.length > 0,
      tem_recursos_qqp: temQqp,
    },
    meses,
    qqp,
    premissas: {
      dias_uteis: 'Segunda a sexta, exceto feriados nacionais (sábados só nas alocações que os incluem).',
      ciclo: 'Ciclo de medição do dia 16 ao dia 15, identificado pelo mês em que termina.',
      horas_por_dia_padrao: HORAS_DIA_PADRAO,
    },
    gerado_em: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

async function carregarObra(idParam) {
  const id = validarId(idParam);
  const obra = await boletimRepository.obraParaProjecao(id);
  if (!obra) {
    throw new AppError(404, `Obra ${id} não encontrada.`);
  }
  return obra;
}

/** GET /api/obras/:id/medicao */
async function obterMedicaoDaObra(idParam, usuario) {
  validarUsuario(usuario);
  const obra = await carregarObra(idParam);
  const itens = await boletimRepository.itensDaObra(obra.id);
  return montarMedicaoObra(obra, itens);
}

/** GET /api/obras/:id/projecao-financeira */
async function obterProjecaoFinanceira(idParam, usuario) {
  validarUsuario(usuario);
  const obra = await carregarObra(idParam);
  const [itens, recursos] = await Promise.all([
    boletimRepository.itensDaObra(obra.id),
    qqpRepository.listarRecursosDaObra(obra.id),
  ]);
  return montarProjecaoObra(obra, itens, recursos);
}

module.exports = {
  custoDoRecurso,
  projetarCustosQqp,
  montarMedicaoObra,
  montarProjecaoObra,
  obterMedicaoDaObra,
  obterProjecaoFinanceira,
};

'use strict';

const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');
const cronogramaRepository = require('../repositories/cronogramaRepository');

/**
 * Carga de trabalho e alocação por função (MOD, MOI e Equipamentos).
 *
 * Fonte: histogramas da versão de cronograma (abas MOD_MOI e EQP do modelo).
 * Para cada recurso e semana o modelo traz:
 *  - efetivo da semana (coluna "Sxx" = pico diário da semana);
 *  - efetivo diário (seg..sáb) → somado em homens-dia (ou equipamento-dia).
 *
 * HH = homens-dia × horas por dia (padrão 8,8 h = 44 h semanais em 5 dias).
 * Semanas até a data de status da versão (fim do período do relatório) têm
 * realizado; as seguintes são só demanda prevista.
 *
 * Gargalos no lookahead (6 semanas a partir da data de referência): compara a
 * demanda prevista de cada função com o efetivo mobilizado na semana de status.
 *  - MOBILIZAR: demanda maior que o efetivo atual (falta de recurso);
 *  - OCIOSIDADE: efetivo atual maior que a demanda (excesso / desmobilizar);
 *  - SEM_PLANEJAMENTO: semana após o fim da demanda prevista no histograma (o
 *    planejador precisa atualizar o histograma; não é tratada como ociosidade).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORAS_POR_DIA_PADRAO = 8.8;
const SEMANAS_LOOKAHEAD = 6;
const DIAS_UTEIS_SEMANA = 5;
const DIA_MS = 24 * 60 * 60 * 1000;
const FUSO_OFFSET_HORAS = -3;
const CATEGORIAS = ['MOD', 'MOI', 'EQUIPAMENTO'];

function arredondar(valor, casas = 2) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function percentual(parte, total) {
  return total > 0 ? arredondar((parte / total) * 100, 2) : null;
}

function somarDias(dataTexto, dias) {
  return new Date(Date.parse(`${dataTexto}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Segunda-feira (AAAA-MM-DD) da semana da data local de referência. */
function segundaDe(dataTexto) {
  const d = new Date(`${dataTexto}T00:00:00Z`);
  return somarDias(dataTexto, -((d.getUTCDay() + 6) % 7));
}

/** Semana ISO-8601 de uma data AAAA-MM-DD. */
function semanaIso(dataTexto) {
  const d = new Date(`${dataTexto}T00:00:00Z`);
  const quinta = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DIA_MS);
  const inicioAno = Date.UTC(quinta.getUTCFullYear(), 0, 1);
  return Math.ceil(((quinta - inicioAno) / DIA_MS + 1) / 7);
}

function hojeLocal() {
  return new Date(Date.now() + FUSO_OFFSET_HORAS * 3600000).toISOString().slice(0, 10);
}

function picoDe(semanas, campo) {
  let pico = null;
  semanas.forEach((s) => {
    if (s[campo] > 0 && (!pico || s[campo] > pico.valor)) pico = { valor: s[campo], semana: s.semana, inicio: s.inicio };
  });
  return pico;
}

/* -------------------------------------------------------------------------- */
/* Normalização dos histogramas                                               */
/* -------------------------------------------------------------------------- */

/** Recursos dos dois histogramas em um formato único, com dias por semana. */
function recursosDaVersao(histogramaMo, histogramaEqp) {
  const normalizar = (recurso, categoriaPadrao) => ({
    nome: recurso.nome,
    unidade: recurso.unidade || null,
    categoria: CATEGORIAS.includes(recurso.categoria) ? recurso.categoria : categoriaPadrao,
    semanas: (recurso.semanas || [])
      .filter((s) => s.inicio)
      .map((s) => ({
        semana: s.semana,
        inicio: s.inicio,
        previsto: Number(s.previsto) || 0,
        realizado: Number(s.realizado) || 0,
        // Versões sem colunas diárias: efetivo × 5 dias úteis.
        previsto_dias: s.previsto_dias ?? (Number(s.previsto) || 0) * DIAS_UTEIS_SEMANA,
        realizado_dias: s.realizado_dias ?? (Number(s.realizado) || 0) * DIAS_UTEIS_SEMANA,
      })),
  });
  return [
    ...((histogramaMo && histogramaMo.recursos) || []).map((r) => normalizar(r, 'MOD')),
    ...((histogramaEqp && histogramaEqp.recursos) || []).map((r) => normalizar(r, 'EQUIPAMENTO')),
  ];
}

/* -------------------------------------------------------------------------- */
/* Cálculo (função pura)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {object[]} recursos saída de recursosDaVersao
 * @param {{ dataStatus?: string, dataReferencia: string, horasPorDia: number,
 *           atividades?: object[] }} opcoes
 */
function calcularCargaTrabalho(recursos, opcoes) {
  const { horasPorDia, dataReferencia } = opcoes;
  const avisos = [];

  // ---------------------------------------------------- Eixo semanal
  const inicios = new Set();
  recursos.forEach((r) => r.semanas.forEach((s) => inicios.add(s.inicio)));
  const lookaheadInicio = segundaDe(dataReferencia);
  const lookahead = Array.from({ length: SEMANAS_LOOKAHEAD }, (_, i) => somarDias(lookaheadInicio, i * 7));
  lookahead.forEach((inicio) => inicios.add(inicio));
  const eixo = [...inicios].sort();

  // Data de status: fim do período do relatório ou última semana com realizado.
  let dataStatus = opcoes.dataStatus || null;
  if (!dataStatus) {
    const comRealizado = eixo.filter((inicio) =>
      recursos.some((r) => r.semanas.some((s) => s.inicio === inicio && (s.realizado > 0 || s.realizado_dias > 0)))
    );
    dataStatus = comRealizado.length ? somarDias(comRealizado[comRealizado.length - 1], 6) : null;
  }
  const realizada = (inicio) => Boolean(dataStatus) && inicio <= dataStatus;
  const semanaStatus = [...eixo].reverse().find(realizada) || null;
  const noLookahead = new Set(lookahead);

  const numeroSemana = new Map(eixo.map((inicio) => [inicio, semanaIso(inicio)]));
  recursos.forEach((r) => r.semanas.forEach((s) => numeroSemana.set(s.inicio, s.semana)));

  // Fim do planejamento dos histogramas: última semana com demanda prevista.
  const comDemanda = eixo.filter((inicio) => recursos.some((r) => r.semanas.some((s) => s.inicio === inicio && s.previsto > 0)));
  const fimPlanoHistograma = comDemanda.length ? comDemanda[comDemanda.length - 1] : null;
  const semPlano = (inicio) => !fimPlanoHistograma || inicio > fimPlanoHistograma;

  // Atividades do cronograma em execução em cada semana (cruzamento com o lookahead).
  const atividadesTodas = opcoes.atividades || [];
  const ativasNaSemana = (inicio) => {
    const ini = new Date(`${inicio}T03:00:00Z`);
    const fim = new Date(ini.getTime() + 7 * DIA_MS);
    return atividadesTodas.filter(
      (a) => Number(a.avanco_fisico_real) < 100 && a.data_inicio && a.data_fim && new Date(a.data_inicio) < fim && new Date(a.data_fim) >= ini
    ).length;
  };

  // Totais previstos da Curva S (efetivo e equipamentos), por segunda-feira.
  const totaisCurva = new Map();
  (opcoes.curvaS || []).forEach((p) => {
    if (!p || !p.data) return;
    totaisCurva.set(segundaDe(String(p.data).slice(0, 10)), {
      efetivo: p.efetivo && Number.isFinite(Number(p.efetivo.previsto)) ? Number(p.efetivo.previsto) : null,
      equipamentos: p.equipamentos && Number.isFinite(Number(p.equipamentos.previsto)) ? Number(p.equipamentos.previsto) : null,
    });
  });

  // ------------------------------------------------- Por recurso
  const porRecurso = recursos.map((recurso) => {
    const porInicio = new Map(recurso.semanas.map((s) => [s.inicio, s]));
    const eqp = recurso.categoria === 'EQUIPAMENTO';
    const semanas = eixo.map((inicio) => {
      const s = porInicio.get(inicio) || { previsto: 0, realizado: 0, previsto_dias: 0, realizado_dias: 0 };
      const feita = realizada(inicio);
      return {
        semana: numeroSemana.get(inicio) ?? null,
        inicio,
        realizada: feita,
        previsto: s.previsto,
        realizado: feita ? s.realizado : null,
        dias_previstos: s.previsto_dias,
        dias_realizados: feita ? s.realizado_dias : null,
        [eqp ? 'horas_maquina_previstas' : 'hh_previsto']: arredondar(s.previsto_dias * horasPorDia, 1),
        [eqp ? 'horas_maquina_realizadas' : 'hh_realizado']: feita ? arredondar(s.realizado_dias * horasPorDia, 1) : null,
        desvio: feita ? arredondar(s.realizado - s.previsto, 2) : null,
      };
    });

    const passadas = semanas.filter((s) => s.realizada);
    const diasPrevistosAteStatus = passadas.reduce((t, s) => t + s.dias_previstos, 0);
    const diasRealizados = passadas.reduce((t, s) => t + (s.dias_realizados || 0), 0);
    const efetivoAtual = semanaStatus ? semanas.find((s) => s.inicio === semanaStatus).realizado ?? 0 : 0;

    const lookaheadRecurso = semanas
      .filter((s) => noLookahead.has(s.inicio))
      .map((s) => {
        const gap = arredondar(s.previsto - efetivoAtual, 2);
        // Sem demanda no histograma após o fim do planejamento dele: não é ociosidade.
        const situacao = semPlano(s.inicio) ? 'SEM_PLANEJAMENTO' : gap >= 1 ? 'MOBILIZAR' : gap <= -1 ? 'OCIOSIDADE' : 'OK';
        return { semana: s.semana, inicio: s.inicio, previsto: s.previsto, efetivo_atual: efetivoAtual, gap, situacao };
      });

    const totalDiasPrevistos = semanas.reduce((t, s) => t + s.dias_previstos, 0);
    return {
      nome: recurso.nome,
      categoria: recurso.categoria,
      unidade: recurso.unidade,
      efetivo_atual: efetivoAtual,
      pico_previsto: picoDe(semanas, 'previsto'),
      pico_realizado: picoDe(passadas, 'realizado'),
      dias_previstos_total: arredondar(totalDiasPrevistos, 2),
      dias_realizados_ate_status: arredondar(diasRealizados, 2),
      [eqp ? 'horas_maquina_previstas_total' : 'hh_previsto_total']: arredondar(totalDiasPrevistos * horasPorDia, 1),
      [eqp ? 'horas_maquina_realizadas_ate_status' : 'hh_realizado_ate_status']: arredondar(diasRealizados * horasPorDia, 1),
      /** Aderência da alocação: dias realizados ÷ dias previstos até a data de status. */
      aderencia_alocacao: percentual(diasRealizados, diasPrevistosAteStatus),
      semanas_com_deficit: passadas.filter((s) => s.realizado < s.previsto).length,
      lookahead: lookaheadRecurso,
      semanas,
    };
  });

  // ------------------------------------------ Consolidado por semana
  const somar = (lista, inicio, campo) =>
    lista.reduce((t, r) => {
      const s = r.semanas.find((x) => x.inicio === inicio);
      return t + (s && s[campo] !== null ? s[campo] : 0);
    }, 0);

  const grupos = {
    mod: porRecurso.filter((r) => r.categoria === 'MOD'),
    moi: porRecurso.filter((r) => r.categoria === 'MOI'),
    equipamentos: porRecurso.filter((r) => r.categoria === 'EQUIPAMENTO'),
  };
  const maoDeObra = [...grupos.mod, ...grupos.moi];

  const consolidar = (lista, inicio, feita, eqp = false) => {
    const diasPrev = somar(lista, inicio, 'dias_previstos');
    const diasReal = somar(lista, inicio, 'dias_realizados');
    return {
      previsto: somar(lista, inicio, 'previsto'),
      realizado: feita ? somar(lista, inicio, 'realizado') : null,
      [eqp ? 'horas_maquina_previstas' : 'hh_previsto']: arredondar(diasPrev * horasPorDia, 1),
      [eqp ? 'horas_maquina_realizadas' : 'hh_realizado']: feita ? arredondar(diasReal * horasPorDia, 1) : null,
    };
  };

  const semanas = eixo.map((inicio) => {
    const feita = realizada(inicio);
    const curva = totaisCurva.get(inicio) || {};
    return {
      semana: numeroSemana.get(inicio) ?? null,
      inicio,
      fim: somarDias(inicio, 6),
      realizada: feita,
      lookahead: noLookahead.has(inicio),
      mod: consolidar(grupos.mod, inicio, feita),
      moi: consolidar(grupos.moi, inicio, feita),
      mao_de_obra: consolidar(maoDeObra, inicio, feita),
      equipamentos: consolidar(grupos.equipamentos, inicio, feita, true),
      /** Totais previstos na Curva S (aba Avanço_Físico&Financeiro), para conferência. */
      efetivo_previsto_curva_s: curva.efetivo ?? null,
      equipamentos_previstos_curva_s: curva.equipamentos ?? null,
      histograma_planejado: !semPlano(inicio),
      atividades_em_execucao: ativasNaSemana(inicio),
    };
  });

  // --------------------------------- Cruzamento com as atividades do lookahead
  const atividades = opcoes.atividades || [];
  const comRecursos = atividades.filter(
    (a) => (Array.isArray(a.recursos_mao_de_obra) && a.recursos_mao_de_obra.length) ||
      (Array.isArray(a.recursos_equipamentos) && a.recursos_equipamentos.length)
  );
  let demandaAtividades = null;
  if (comRecursos.length) {
    demandaAtividades = lookahead.map((inicio) => {
      const inicioSemana = new Date(`${inicio}T03:00:00Z`);
      const fimSemana = new Date(inicioSemana.getTime() + 7 * DIA_MS);
      const ativas = comRecursos.filter(
        (a) => Number(a.avanco_fisico_real) < 100 && a.data_inicio && a.data_fim &&
          new Date(a.data_inicio) < fimSemana && new Date(a.data_fim) >= inicioSemana
      );
      const demanda = new Map();
      ativas.forEach((a) => {
        [...(a.recursos_mao_de_obra || []).map((r) => [r.funcao, r.quantidade]),
          ...(a.recursos_equipamentos || []).map((r) => [r.equipamento, r.quantidade])].forEach(([nome, qtd]) => {
          if (!nome) return;
          const atual = demanda.get(nome) || { recurso: nome, quantidade: 0, atividades: [] };
          atual.quantidade = arredondar(atual.quantidade + (Number(qtd) || 0), 2);
          atual.atividades.push(a.codigo_atividade);
          demanda.set(nome, atual);
        });
      });
      return { inicio, semana: numeroSemana.get(inicio) ?? null, atividades_ativas: ativas.length, recursos: [...demanda.values()] };
    });
  } else {
    avisos.push(
      'As atividades do cronograma não têm recursos vinculados: a demanda do lookahead vem dos histogramas (MOD_MOI e EQP).'
    );
  }

  // ------------------------------------------------------- Gargalos
  const gargalos = porRecurso
    .flatMap((r) =>
      r.lookahead
        .filter((s) => s.situacao === 'MOBILIZAR' || s.situacao === 'OCIOSIDADE')
        .map((s) => ({ ...s, recurso: r.nome, categoria: r.categoria }))
    )
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || Math.abs(b.gap) - Math.abs(a.gap));

  // ---------------------------------------------------- Indicadores
  const efetivoSemanas = semanas.map((s) => ({ ...s, previsto: s.mao_de_obra.previsto, realizado: s.mao_de_obra.realizado || 0 }));
  const eqpSemanas = semanas.map((s) => ({ ...s, previsto: s.equipamentos.previsto, realizado: s.equipamentos.realizado || 0 }));
  const semanasLookahead = semanas.filter((s) => s.lookahead);
  const hhPrevistoAteStatus = semanas.filter((s) => s.realizada).reduce((t, s) => t + s.mao_de_obra.hh_previsto, 0);
  const hhRealizado = semanas.filter((s) => s.realizada).reduce((t, s) => t + (s.mao_de_obra.hh_realizado || 0), 0);
  const statusSemana = semanaStatus ? semanas.find((s) => s.inicio === semanaStatus) : null;
  const efetivoAtual = statusSemana ? statusSemana.mao_de_obra.realizado : 0;
  // Sem histograma planejado no lookahead, o pico usa o efetivo previsto da Curva S.
  const picoLookahead = picoDe(
    semanasLookahead.map((s) => ({
      ...s,
      previsto: s.histograma_planejado ? s.mao_de_obra.previsto : s.efetivo_previsto_curva_s || 0,
    })),
    'previsto'
  );
  const lookaheadSemPlano = semanasLookahead.filter((s) => !s.histograma_planejado);
  if (lookaheadSemPlano.length) {
    const comAtividades = lookaheadSemPlano.filter((s) => s.atividades_em_execucao > 0);
    avisos.push(
      `O histograma de recursos só tem demanda prevista até a semana de ${fimPlanoHistograma ? fimPlanoHistograma.split('-').reverse().join('/') : '—'}; ` +
        `${lookaheadSemPlano.length} semana(s) do lookahead ficaram sem planejamento por função` +
        (comAtividades.length ? `, embora ${comAtividades.length} delas tenham atividades em execução no cronograma` : '') +
        '. Atualize o histograma (MOD_MOI/EQP) no próximo envio.'
    );
  }

  if (!recursos.length) avisos.push('A versão do cronograma não possui histogramas de recursos.');

  return {
    data_status: dataStatus,
    fim_planejamento_histograma: fimPlanoHistograma,
    semana_status: statusSemana ? statusSemana.semana : null,
    lookahead: { inicio: lookahead[0], fim: somarDias(lookahead[SEMANAS_LOOKAHEAD - 1], 6), semanas: SEMANAS_LOOKAHEAD },
    indicadores: {
      efetivo_atual: efetivoAtual,
      efetivo_atual_mod: statusSemana ? statusSemana.mod.realizado : 0,
      efetivo_atual_moi: statusSemana ? statusSemana.moi.realizado : 0,
      equipamentos_atuais: statusSemana ? statusSemana.equipamentos.realizado : 0,
      pico_efetivo_previsto: picoDe(efetivoSemanas, 'previsto'),
      pico_efetivo_realizado: picoDe(efetivoSemanas.filter((s) => s.realizada), 'realizado'),
      pico_equipamentos_previsto: picoDe(eqpSemanas, 'previsto'),
      pico_efetivo_lookahead: picoLookahead,
      hh_previsto_total: arredondar(semanas.reduce((t, s) => t + s.mao_de_obra.hh_previsto, 0), 1),
      hh_previsto_ate_status: arredondar(hhPrevistoAteStatus, 1),
      hh_realizado_ate_status: arredondar(hhRealizado, 1),
      aderencia_hh: percentual(hhRealizado, hhPrevistoAteStatus),
      hh_previsto_lookahead: arredondar(semanasLookahead.reduce((t, s) => t + s.mao_de_obra.hh_previsto, 0), 1),
      funcoes_a_mobilizar: new Set(gargalos.filter((g) => g.situacao === 'MOBILIZAR').map((g) => g.recurso)).size,
      funcoes_ociosas: new Set(gargalos.filter((g) => g.situacao === 'OCIOSIDADE').map((g) => g.recurso)).size,
      horas_por_dia: horasPorDia,
    },
    semanas,
    funcoes: porRecurso.filter((r) => r.categoria !== 'EQUIPAMENTO'),
    equipamentos: grupos.equipamentos,
    gargalos,
    demanda_atividades_lookahead: demandaAtividades,
    avisos,
  };
}

/* -------------------------------------------------------------------------- */
/* GET /api/obras/:obraId/carga-trabalho                                      */
/* -------------------------------------------------------------------------- */

/**
 * Query: versao_id (UUID, padrão a revisão mais recente), data_referencia
 * (AAAA-MM-DD, início do lookahead; padrão hoje), horas_por_dia (padrão 8,8).
 */
async function obterCargaTrabalho(obraIdParam, query = {}) {
  const obraId = Number(obraIdParam);
  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw new AppError(400, 'O parâmetro "obraId" deve ser um número inteiro positivo.');
  }
  if (query.versao_id && !UUID.test(String(query.versao_id))) {
    throw new AppError(400, 'O parâmetro "versao_id" deve ser o UUID de uma versão do cronograma.');
  }
  if (query.data_referencia && !/^\d{4}-\d{2}-\d{2}$/.test(String(query.data_referencia))) {
    throw new AppError(400, 'O parâmetro "data_referencia" deve estar no formato AAAA-MM-DD.');
  }
  const horasPorDia = query.horas_por_dia === undefined ? HORAS_POR_DIA_PADRAO : Number(String(query.horas_por_dia).replace(',', '.'));
  if (!Number.isFinite(horasPorDia) || horasPorDia <= 0 || horasPorDia > 24) {
    throw new AppError(400, 'O parâmetro "horas_por_dia" deve ser um número entre 0 e 24.');
  }

  if (!(await obraRepository.existsById(obraId))) {
    throw new AppError(404, `Obra ${obraId} não encontrada.`);
  }
  const versoes = await cronogramaRepository.listarVersoesLeves(obraId);
  if (!versoes.length) {
    throw new AppError(404, 'A obra ainda não possui cronograma enviado. Envie o cronograma para calcular a carga de trabalho.');
  }
  const idVersao = query.versao_id || versoes[versoes.length - 1].id;
  const versao = await cronogramaRepository.buscarHistogramasDaVersao(obraId, idVersao);
  if (!versao) throw new AppError(404, 'Versão de cronograma não encontrada para esta obra.');

  const atividades = await cronogramaRepository.listarAtividadesComRecursos(versao.id);
  const resultado = calcularCargaTrabalho(recursosDaVersao(versao.histograma_mao_de_obra, versao.histograma_equipamentos), {
    dataStatus: versao.periodo_fim,
    dataReferencia: query.data_referencia || hojeLocal(),
    curvaS: Array.isArray(versao.curva_s) ? versao.curva_s : [],
    horasPorDia,
    atividades,
  });

  return {
    obra_id: obraId,
    versao: { id: versao.id, versao: versao.versao, numero_revisao: versao.numero_revisao, data_snapshot: versao.data_snapshot },
    ...resultado,
  };
}

module.exports = { obterCargaTrabalho, calcularCargaTrabalho, recursosDaVersao, HORAS_POR_DIA_PADRAO };

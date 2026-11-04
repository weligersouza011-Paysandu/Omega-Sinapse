'use strict';

const AppError = require('../errors/AppError');
const { criarCalendario } = require('./calendarioTrabalho');

/**
 * Leitura do cronograma do MS Project (.mpp / .xml), a partir do JSON gerado
 * pelo MPXJ (ver mpxjConversor.js). Produz a mesma estrutura de análise usada
 * pelo restante do módulo: atividades da EAP, Curva S semanal, histograma de
 * mão de obra por função, calendário da obra e resumo.
 *
 * Origem dos dados no arquivo:
 *  - Tarefas: EDT, nome, nível, início/término (atual), início/término da linha
 *    de base, % concluída, predecessoras (com tipo e latência), restrições e os
 *    valores de CPM do próprio MS Project (crítica, folgas, datas cedo/tarde);
 *  - Atribuições: função (recurso), unidades, trabalho previsto e realizado;
 *  - Calendário padrão do projeto (expediente, feriados e exceções);
 *  - Propriedades: data de status, data da linha de base, revisão e título.
 *
 * Valores derivados (não existem prontos no arquivo):
 *  - % previsto (LB) na data de status: fração do tempo útil da linha de base
 *    decorrida, ponderada pela duração da linha de base;
 *  - Curva S: previsto pela linha de base; real reconstruído a partir das datas
 *    reais e do % concluído (linear entre início real e a data de status);
 *    tendência distribuindo o saldo até o término atual de cada tarefa;
 *  - Histograma: efetivo (unidades/100) e HH distribuídos por semana no tempo útil.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const FUSO_OFFSET_HORAS = -3;
const DIAS_SEMANA = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIPO_VINCULO = { FS: 'TI', SS: 'II', FF: 'TT', SF: 'IT' };

/** Funções de mão de obra indireta (MOI) reconhecidas pelo nome do recurso. */
const PADRAO_MOI = /motorista|t[eé]cnico (de )?(planejamento|seguran|materiais|qualidade)|aux(iliar|\.)? t[eé]cnico|servi[cç]os gerais|almoxarif|administrativ|engenheir|supervisor/i;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** "2026-05-25T11:00:00.0" (horário local da obra) → instante UTC. */
function dataLocal(texto) {
  if (!texto) return null;
  const m = String(texto).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const data = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0) - FUSO_OFFSET_HORAS, +(m[5] || 0)));
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Data local AAAA-MM-DD de um instante. */
function dataIso(instante) {
  return instante ? new Date(instante.getTime() + FUSO_OFFSET_HORAS * 3600000).toISOString().slice(0, 10) : null;
}

function arredondar(valor, casas = 2) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function minutosDeHora(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

function segundaDe(instante) {
  const texto = dataIso(instante);
  const d = new Date(`${texto}T00:00:00Z`);
  const segunda = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA_MS);
  return segunda.toISOString().slice(0, 10);
}

function semanaIso(dataTexto) {
  const d = new Date(`${dataTexto}T00:00:00Z`);
  const quinta = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DIA_MS);
  const inicioAno = Date.UTC(quinta.getUTCFullYear(), 0, 1);
  return Math.floor((quinta - inicioAno) / DIA_MS / 7) + 1;
}

function somarDias(texto, dias) {
  return new Date(Date.parse(`${texto}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Meia-noite local (BRT) de AAAA-MM-DD como instante. */
function meiaNoite(texto) {
  return new Date(Date.parse(`${texto}T00:00:00Z`) - FUSO_OFFSET_HORAS * 3600000);
}

/* -------------------------------------------------------------------------- */
/* Calendário                                                                 */
/* -------------------------------------------------------------------------- */

/** Calendário MPXJ (com herança do calendário base) → especificação do calendarioTrabalho. */
function calendarioDoProjeto(json, minutosPorDia) {
  const calendarios = new Map((json.calendars || []).map((c) => [c.unique_id, c]));
  const idPadrao = json.property_values?.default_calendar_unique_id ?? json.property_values?.calendar_unique_id;
  const principal = calendarios.get(idPadrao) || (json.calendars || []).find((c) => c.type === 'GLOBAL') || null;
  if (!principal) return null;

  const diaDe = (calendario, nomeDia, profundidade = 0) => {
    const dia = calendario?.[nomeDia];
    if (dia && dia.type === 'working') return (dia.hours || []).map((h) => [minutosDeHora(h.from), minutosDeHora(h.to) || 1440]);
    if (dia && dia.type === 'non_working') return [];
    const pai = calendario?.parent_unique_id !== undefined ? calendarios.get(calendario.parent_unique_id) : null;
    if (pai && profundidade < 5) return diaDe(pai, nomeDia, profundidade + 1);
    return nomeDia === 'sunday' || nomeDia === 'saturday' ? [] : [[480, 720], [780, 1020]];
  };

  const semana = Object.fromEntries(DIAS_SEMANA.map((nome, i) => [i, diaDe(principal, nome)]));
  const semanasTrabalho = (principal.working_weeks || [])
    .filter((w) => w.effective_from && w.effective_to)
    .map((w) => ({
      de: w.effective_from.slice(0, 10),
      ate: w.effective_to.slice(0, 10),
      semana: Object.fromEntries(
        DIAS_SEMANA.map((nome, i) => {
          const dia = w[nome];
          if (!dia || dia.type === 'default') return [i, null];
          if (dia.type === 'non_working') return [i, []];
          return [i, (dia.hours || []).map((h) => [minutosDeHora(h.from), minutosDeHora(h.to) || 1440])];
        })
      ),
    }));
  const excecoes = [];
  const coletarExcecoes = (calendario, profundidade = 0) => {
    if (!calendario || profundidade > 5) return;
    if (calendario.parent_unique_id !== undefined) coletarExcecoes(calendarios.get(calendario.parent_unique_id), profundidade + 1);
    (calendario.exceptions || []).forEach((e) => {
      excecoes.push({
        nome: e.name || null,
        de: String(e.from).slice(0, 10),
        ate: String(e.to || e.from).slice(0, 10),
        intervalos: e.type === 'working' ? (e.hours || []).map((h) => [minutosDeHora(h.from), minutosDeHora(h.to) || 1440]) : [],
      });
    });
  };
  coletarExcecoes(principal);

  return {
    nome: principal.name || 'Calendário do projeto',
    minutos_por_dia: minutosPorDia,
    semana,
    semanas_trabalho: semanasTrabalho,
    excecoes,
  };
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} json saída do MPXJ (JsonWriter)
 * @returns {{ atividades, resumo, curva_s, histograma_mao_de_obra, histograma_equipamentos,
 *             calendario, periodo_inicio, periodo_fim, data_status, fonte, avisos }}
 */
function mapearProjeto(json) {
  if (!json || !Array.isArray(json.tasks)) {
    throw new AppError(422, 'O arquivo não contém tarefas do MS Project.');
  }
  const avisos = [];
  const propriedades = json.property_values || {};
  const minutosPorDia = Number(propriedades.minutes_per_day) > 0 ? Number(propriedades.minutes_per_day) : 480;
  const especCalendario = calendarioDoProjeto(json, minutosPorDia);
  if (!especCalendario) avisos.push('Calendário do projeto não encontrado: usado o calendário padrão (seg–sex, 8 h).');
  const calendario = criarCalendario(especCalendario);
  const minutos = (instante) => (instante ? calendario.paraMinutos(instante) : null);
  const emDias = (segundos) => (segundos === undefined || segundos === null ? null : arredondar(segundos / 60 / minutosPorDia, 2));

  // ------------------------------------------------------------- Tarefas
  const tarefas = json.tasks.filter((t) => t.id !== undefined && t.id !== null && t.unique_id !== 0 && t.active !== false);
  const ignoradas = json.tasks.filter((t) => t.active === false).length;
  if (ignoradas) avisos.push(`${ignoradas} tarefa(s) inativa(s) no MS Project foram ignoradas.`);
  const semNome = tarefas.filter((t) => !String(t.name || '').trim());
  const validas = tarefas.filter((t) => String(t.name || '').trim() && t.wbs);
  if (semNome.length) avisos.push(`${semNome.length} linha(s) em branco do MS Project foram ignoradas.`);
  if (!validas.length) throw new AppError(422, 'Nenhuma tarefa com EDT encontrada no cronograma.');

  const porUnique = new Map(json.tasks.map((t) => [t.unique_id, t]));

  // Data de status (corte): a do arquivo ou, se houver avanço lançado depois
  // dela, a data do último avanço (o planejador atualizou sem mover o status).
  const statusArquivo = dataLocal(propriedades.status_date);
  const ultimoLancado = validas
    .filter((t) => !t.summary && Number(t.percent_complete) > 0)
    .flatMap((t) => [t.actual_finish, t.actual_start, Number(t.percent_complete) < 100 ? t.stop : null].map(dataLocal).filter(Boolean))
    .reduce((maior, d) => (!maior || d > maior ? d : maior), null);
  // Datas reais além do último salvamento são projeções (ex.: tarefa marcada 100% antes do término).
  const salvo = dataLocal(propriedades.last_saved);
  const limiteAvanco = salvo ? new Date(Date.parse(`${dataIso(salvo)}T23:59:00Z`) - FUSO_OFFSET_HORAS * 3600000) : null;
  const ultimoAvanco = ultimoLancado && limiteAvanco && ultimoLancado > limiteAvanco ? limiteAvanco : ultimoLancado;
  let dataStatus = statusArquivo || ultimoAvanco || dataLocal(propriedades.current_date);
  if (!statusArquivo) {
    avisos.push('O arquivo não tem "Data de status" definida no MS Project: usada a data do último avanço lançado.');
  } else if (ultimoAvanco && ultimoAvanco > statusArquivo) {
    dataStatus = ultimoAvanco;
    const br = (d) => dataIso(d).split('-').reverse().join('/');
    avisos.push(
      `A "Data de status" do arquivo (${br(statusArquivo)}) é anterior ao último avanço lançado (${br(ultimoAvanco)}): ` +
        `usada ${br(ultimoAvanco)} como data de corte. Atualize a data de status no MS Project (Projeto → Informações do projeto).`
    );
  }
  const temLinhaBase = validas.some((t) => t.baseline_start && t.baseline_finish);
  if (!temLinhaBase) avisos.push('O cronograma não possui linha de base salva: o % previsto e a Curva S prevista ficarão zerados.');

  // ---------------------------------------------------------- Recursos
  const recursos = new Map((json.resources || []).filter((r) => r.name).map((r) => [r.unique_id, r]));
  const categoriaDe = (recurso) => {
    if (recurso.type === 'MATERIAL' || recurso.type === 'COST') return 'EQUIPAMENTO';
    return PADRAO_MOI.test(recurso.name) ? 'MOI' : 'MOD';
  };
  const atribuicoesPorTarefa = new Map();
  (json.assignments || []).forEach((a) => {
    const recurso = recursos.get(a.resource_unique_id);
    if (!recurso) return;
    if (!atribuicoesPorTarefa.has(a.task_unique_id)) atribuicoesPorTarefa.set(a.task_unique_id, []);
    atribuicoesPorTarefa.get(a.task_unique_id).push({ ...a, recurso, categoria: categoriaDe(recurso) });
  });

  // --------------------------------------------- % previsto pela linha de base
  const tStatus = minutos(dataStatus);
  const fracaoLb = (t, instanteMin) => {
    const ini = minutos(dataLocal(t.baseline_start));
    const fim = minutos(dataLocal(t.baseline_finish));
    if (ini === null || fim === null) return 0;
    if (fim <= ini) return instanteMin >= fim ? 1 : 0;
    return Math.min(Math.max((instanteMin - ini) / (fim - ini), 0), 1);
  };
  /** Peso da tarefa na linha de base: duração LB (como o MS Project consolida o %). */
  const pesoLb = (t) => {
    if (Number(t.baseline_duration) > 0) return Number(t.baseline_duration) / 60;
    const ini = minutos(dataLocal(t.baseline_start));
    const fim = minutos(dataLocal(t.baseline_finish));
    return ini !== null && fim !== null ? Math.max(fim - ini, 0) : 0;
  };

  const folhasDe = new Map(); // unique_id do resumo → folhas
  const filhos = new Map();
  validas.forEach((t) => {
    if (!filhos.has(t.parent_task_unique_id)) filhos.set(t.parent_task_unique_id, []);
    filhos.get(t.parent_task_unique_id).push(t);
  });
  const coletarFolhas = (t) => {
    if (folhasDe.has(t.unique_id)) return folhasDe.get(t.unique_id);
    const lista = t.summary ? (filhos.get(t.unique_id) || []).flatMap(coletarFolhas) : [t];
    folhasDe.set(t.unique_id, lista);
    return lista;
  };

  const realConsolidado = (t) => {
    if (!t.summary) return Number(t.percent_complete) || 0;
    const folhasResumo = coletarFolhas(t);
    const peso = folhasResumo.reduce((s, f) => s + (Number(f.duration) > 0 ? Number(f.duration) : 0), 0);
    if (!peso) return Number(t.percent_complete) || 0;
    return folhasResumo.reduce((s, f) => s + (Number(f.duration) > 0 ? Number(f.duration) : 0) * (Number(f.percent_complete) || 0), 0) / peso;
  };

  const previstoNoStatus = (t) => {
    const folhas = coletarFolhas(t);
    const peso = folhas.reduce((s, f) => s + pesoLb(f), 0);
    if (peso === 0) {
      const marcos = folhas.filter((f) => f.baseline_finish);
      return marcos.length ? (marcos.filter((f) => fracaoLb(f, tStatus) >= 1).length / marcos.length) * 100 : 0;
    }
    return (folhas.reduce((s, f) => s + pesoLb(f) * fracaoLb(f, tStatus), 0) / peso) * 100;
  };

  // ---------------------------------------------------------- Atividades
  const formatarLatencia = (segundos) => {
    if (!segundos) return '';
    const dias = segundos / 60 / minutosPorDia;
    const texto = Number.isInteger(dias) ? String(dias) : String(arredondar(dias, 2)).replace('.', ',');
    return `${dias > 0 ? '+' : ''}${texto} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`;
  };

  const atividades = validas.map((t, indice) => {
    const pai = porUnique.get(t.parent_task_unique_id);
    const predecessoras = (t.predecessors || [])
      .map((p) => {
        const origem = porUnique.get(p.predecessor_task_unique_id);
        if (!origem || origem.id === undefined) return null;
        const tipo = TIPO_VINCULO[p.type] || 'TI';
        return `${origem.id}${tipo === 'TI' && !p.lag ? '' : tipo}${formatarLatencia(p.lag)}`;
      })
      .filter(Boolean)
      .join(';');

    const atribuicoes = atribuicoesPorTarefa.get(t.unique_id) || [];
    const maoDeObra = atribuicoes.filter((a) => a.categoria !== 'EQUIPAMENTO');
    const equipamentos = atribuicoes.filter((a) => a.categoria === 'EQUIPAMENTO');

    return {
      ordem: indice + 1,
      id_origem: t.id,
      codigo_atividade: String(t.wbs).slice(0, 60),
      codigo_pai: pai && pai.unique_id !== 0 && pai.wbs ? String(pai.wbs).slice(0, 60) : null,
      descricao: String(t.name).trim(),
      nivel: t.outline_level || String(t.wbs).split('.').length,
      resumo: Boolean(t.summary),
      data_inicio: dataLocal(t.start),
      data_fim: dataLocal(t.finish),
      data_inicio_lb: dataLocal(t.baseline_start),
      data_fim_lb: dataLocal(t.baseline_finish),
      avanco_fisico_previsto: arredondar(Math.min(previstoNoStatus(t), 100), 4),
      avanco_fisico_real: arredondar(realConsolidado(t), 4),
      predecessoras: predecessoras || null,
      caminho_critico: Boolean(t.critical) && !t.summary,
      recursos_mao_de_obra: maoDeObra.length
        ? maoDeObra.map((a) => ({
            funcao: a.recurso.name,
            quantidade: arredondar((Number(a.assignment_units) || 100) / 100, 2),
            categoria: a.categoria,
            horas_previstas: arredondar((Number(a.work) || 0) / 3600, 1),
            horas_realizadas: arredondar((Number(a.actual_work) || 0) / 3600, 1),
          }))
        : null,
      recursos_equipamentos: equipamentos.length
        ? equipamentos.map((a) => ({ equipamento: a.recurso.name, quantidade: arredondar((Number(a.assignment_units) || 100) / 100, 2) }))
        : null,
      dados_origem: {
        unique_id: t.unique_id,
        id: t.id,
        critica_ms_project: Boolean(t.critical),
        percentual_concluido_ms_project: Number(t.percent_complete) || 0,
        // O MPXJ omite valores zero: folga ausente numa tarefa (não resumo) é 0.
        folga_total_dias: t.summary ? emDias(t.total_slack) : emDias(t.total_slack ?? 0),
        folga_livre_dias: t.summary ? emDias(t.free_slack) : emDias(t.free_slack ?? 0),
        duracao_dias: emDias(t.duration),
        duracao_lb_dias: emDias(t.baseline_duration),
        inicio_cedo: dataLocal(t.early_start),
        termino_cedo: dataLocal(t.early_finish),
        inicio_tarde: dataLocal(t.late_start),
        termino_tarde: dataLocal(t.late_finish),
        inicio_real: dataLocal(t.actual_start),
        termino_real: dataLocal(t.actual_finish),
        restricao: t.constraint_type || null,
        data_restricao: dataLocal(t.constraint_date),
        marco: Boolean(t.milestone),
        farol: t.number20 ?? null,
      },
    };
  });

  // Duplicidade de EDT (o restante do módulo usa o EDT como chave estável).
  const vistos = new Set();
  const duplicados = new Set();
  atividades.forEach((a) => {
    if (vistos.has(a.codigo_atividade)) duplicados.add(a.codigo_atividade);
    vistos.add(a.codigo_atividade);
  });
  if (duplicados.size) avisos.push(`Códigos EDT repetidos no MS Project: ${[...duplicados].slice(0, 10).join(', ')}.`);

  // --------------------------------------------------------- Eixo semanal
  const folhas = validas.filter((t) => !t.summary);
  const instantes = folhas.flatMap((t) => [t.start, t.finish, t.baseline_start, t.baseline_finish].map(dataLocal).filter(Boolean));
  const inicioEixo = segundaDe(new Date(Math.min(...instantes.map((d) => d.getTime()))));
  const fimEixo = segundaDe(new Date(Math.max(...instantes.map((d) => d.getTime()))));
  const semanas = [];
  for (let s = inicioEixo; s <= fimEixo; s = somarDias(s, 7)) semanas.push(s);
  const semanaStatus = dataStatus ? segundaDe(dataStatus) : null;
  const fimDaSemana = (segunda) => minutos(meiaNoite(somarDias(segunda, 7)));

  // ------------------------------------------------------------ Curva S
  /** Peso atual: duração (o % concluído do resumo no MS Project é ponderado por ela). */
  const pesoAtual = (t) => {
    if (Number(t.duration) > 0) return Number(t.duration) / 60;
    const ini = minutos(dataLocal(t.start));
    const fim = minutos(dataLocal(t.finish));
    return ini !== null && fim !== null ? Math.max(fim - ini, 0) : 0;
  };
  const W_LB = folhas.reduce((s, t) => s + pesoLb(t), 0);
  const W_AT = folhas.reduce((s, t) => s + pesoAtual(t), 0);

  /** Progresso real da tarefa até o instante (≤ data de status), reconstruído. */
  const realAte = (t, instanteMin) => {
    const pc = (Number(t.percent_complete) || 0) / 100;
    if (pc <= 0) return 0;
    const ini = minutos(dataLocal(t.actual_start || t.start));
    if (ini === null) return 0;
    // Avanço lançado com início real após a data de corte é contabilizado na própria data de corte.
    if (ini >= tStatus) return instanteMin >= tStatus ? pc : 0;
    if (instanteMin <= ini) return 0;
    const fimReal = minutos(dataLocal(t.actual_finish));
    // Término real lançado após a data de status conta como concluído na data de status.
    const fim = fimReal !== null ? Math.min(fimReal, tStatus) : tStatus;
    if (fim <= ini) return pc;
    return pc * Math.min((instanteMin - ini) / (fim - ini), 1);
  };
  /** Tendência: saldo (1 − %) distribuído do status até o término atual. */
  const tendenciaAte = (t, instanteMin) => {
    const pc = (Number(t.percent_complete) || 0) / 100;
    const base = realAte(t, tStatus);
    if (pc >= 1 || instanteMin <= tStatus) return base;
    const ini = Math.max(tStatus, minutos(dataLocal(t.resume || t.start)) ?? tStatus);
    const fim = minutos(dataLocal(t.finish));
    // Término atual já no passado com saldo: conclui logo após a data de status.
    if (fim === null || fim <= ini) return base + (1 - pc);
    return base + (1 - pc) * Math.min(Math.max((instanteMin - ini) / (fim - ini), 0), 1);
  };

  const curvaS = semanas.map((segunda) => {
    const fimSemana = fimDaSemana(segunda);
    const sexta = somarDias(segunda, 4);
    // Na semana de status o ponto é datado na própria data de corte.
    const ponto = { semana: semanaIso(segunda), data: segunda === semanaStatus ? dataIso(dataStatus) : sexta, fisico: {} };
    if (W_LB > 0) ponto.fisico.previsto_acum = arredondar((folhas.reduce((s, t) => s + pesoLb(t) * fracaoLb(t, fimSemana), 0) / W_LB) * 100, 4);
    if (semanaStatus && W_AT > 0) {
      if (segunda <= semanaStatus) {
        const ate = segunda === semanaStatus ? tStatus : fimSemana;
        ponto.fisico.real_acum = arredondar((folhas.reduce((s, t) => s + pesoAtual(t) * realAte(t, ate), 0) / W_AT) * 100, 4);
      }
      if (segunda >= semanaStatus) {
        const ate = segunda === semanaStatus ? tStatus : fimSemana;
        ponto.fisico.tendencia_acum = arredondar((folhas.reduce((s, t) => s + pesoAtual(t) * tendenciaAte(t, ate), 0) / W_AT) * 100, 4);
      }
    }
    return ponto;
  });

  // ------------------------------------------------------ Histogramas
  const sobreposicao = (iniMin, fimMin, segunda) => {
    const a = minutos(meiaNoite(segunda));
    const b = fimDaSemana(segunda);
    return Math.max(0, Math.min(fimMin, b) - Math.max(iniMin, a));
  };
  const porRecurso = new Map();
  (json.assignments || []).forEach((a) => {
    const recurso = recursos.get(a.resource_unique_id);
    if (!recurso) return;
    const chave = recurso.unique_id;
    if (!porRecurso.has(chave)) porRecurso.set(chave, { recurso, atribuicoes: [] });
    porRecurso.get(chave).atribuicoes.push(a);
  });

  const montarRecurso = ({ recurso, atribuicoes }) => {
    const linhas = semanas.map((segunda) => {
      const realizada = semanaStatus && segunda <= semanaStatus;
      let previsto = 0;
      let realizado = 0;
      let previstoHh = 0;
      let realizadoHh = 0;
      atribuicoes.forEach((a) => {
        const unidades = (Number(a.assignment_units) || 100) / 100;
        // Antes da semana de status: demanda da linha de base. Da semana de status em
        // diante: demanda do cronograma atual (trabalho restante entre a data de status
        // e o término); o já executado na semana aparece no realizado.
        const futura = semanaStatus && segunda >= semanaStatus;
        const horasPlano = futura
          ? Math.max((Number(a.work) || 0) - (Number(a.actual_work) || 0), 0) / 3600
          : (Number(a.work) || 0) / 3600;
        const iniPlano = futura
          ? Math.max(tStatus, minutos(dataLocal(a.resume || a.start)) ?? tStatus)
          : minutos(dataLocal(a.baseline_start || a.start));
        const fimPlano = minutos(dataLocal(futura ? a.finish : a.baseline_finish || a.finish));
        if (iniPlano !== null && fimPlano !== null && horasPlano > 0) {
          const sob = sobreposicao(iniPlano, Math.max(fimPlano, iniPlano), segunda);
          const pontual = fimPlano <= iniPlano && iniPlano >= minutos(meiaNoite(segunda)) && iniPlano < fimDaSemana(segunda);
          if (sob > 0 || pontual) {
            previsto += unidades;
            previstoHh += fimPlano > iniPlano ? horasPlano * (sob / (fimPlano - iniPlano)) : horasPlano;
          }
        }
        if (realizada && a.actual_start && Number(a.actual_work) > 0) {
          const iniR = minutos(dataLocal(a.actual_start));
          const fimR = Math.min(minutos(dataLocal(a.stop || a.finish)) ?? tStatus, tStatus);
          const sob = sobreposicao(iniR, Math.max(fimR, iniR), segunda);
          if (sob > 0) {
            realizado += unidades;
            realizadoHh += fimR > iniR ? ((Number(a.actual_work) || 0) / 3600) * (sob / (fimR - iniR)) : 0;
          }
        }
      });
      return {
        semana: semanaIso(segunda),
        inicio: segunda,
        previsto: arredondar(previsto, 2),
        realizado: realizada ? arredondar(realizado, 2) : 0,
        previsto_hh: arredondar(previstoHh, 1),
        realizado_hh: realizada ? arredondar(realizadoHh, 1) : 0,
        previsto_dias: arredondar(previstoHh / (minutosPorDia / 60), 2),
        realizado_dias: realizada ? arredondar(realizadoHh / (minutosPorDia / 60), 2) : 0,
      };
    });
    const comValor = linhas.filter((l) => l.previsto || l.realizado || l.previsto_hh || l.realizado_hh);
    return {
      nome: recurso.name,
      unidade: 'Unid.',
      categoria: categoriaDe(recurso),
      capacidade_maxima: arredondar((Number(recurso.max_units) || 100) / 100, 2),
      pico_previsto: Math.max(0, ...linhas.map((l) => l.previsto)),
      pico_realizado: Math.max(0, ...linhas.map((l) => l.realizado)),
      semanas: comValor.length ? linhas : [],
    };
  };

  const recursosHistograma = [...porRecurso.values()].map(montarRecurso).filter((r) => r.semanas.length);
  // Recursos com o mesmo nome (ex.: dois "Soldador Especializado II") são somados.
  const agrupados = new Map();
  recursosHistograma.forEach((r) => {
    const chave = `${r.categoria}|${r.nome.trim().toLowerCase()}`;
    if (!agrupados.has(chave)) {
      agrupados.set(chave, r);
      return;
    }
    const atual = agrupados.get(chave);
    atual.capacidade_maxima = arredondar(atual.capacidade_maxima + r.capacidade_maxima, 2);
    atual.semanas = atual.semanas.map((s, i) => ({
      ...s,
      previsto: arredondar(s.previsto + r.semanas[i].previsto, 2),
      realizado: arredondar(s.realizado + r.semanas[i].realizado, 2),
      previsto_hh: arredondar(s.previsto_hh + r.semanas[i].previsto_hh, 1),
      realizado_hh: arredondar(s.realizado_hh + r.semanas[i].realizado_hh, 1),
      previsto_dias: arredondar(s.previsto_dias + r.semanas[i].previsto_dias, 2),
      realizado_dias: arredondar(s.realizado_dias + r.semanas[i].realizado_dias, 2),
    }));
    atual.pico_previsto = Math.max(...atual.semanas.map((s) => s.previsto));
    atual.pico_realizado = Math.max(...atual.semanas.map((s) => s.realizado));
  });
  const recursosFinais = [...agrupados.values()];
  // Remove semanas sem nenhum valor em todos os recursos (início/fim do eixo).
  const ativas = semanas.map((_, i) => recursosFinais.some((r) => r.semanas[i].previsto || r.semanas[i].realizado || r.semanas[i].previsto_hh || r.semanas[i].realizado_hh));
  recursosFinais.forEach((r) => {
    r.semanas = r.semanas.filter((_, i) => ativas[i]);
  });
  const maoDeObra = recursosFinais.filter((r) => r.categoria !== 'EQUIPAMENTO');
  const eqp = recursosFinais.filter((r) => r.categoria === 'EQUIPAMENTO');
  if (!maoDeObra.length) avisos.push('Nenhum recurso de mão de obra atribuído às tarefas: a carga de trabalho ficará vazia.');

  // Efetivo previsto/realizado total por semana na Curva S (conferência na carga).
  curvaS.forEach((ponto) => {
    const segunda = segundaDe(meiaNoite(ponto.data));
    const soma = (campo) => maoDeObra.reduce((s, r) => s + (r.semanas.find((x) => x.inicio === segunda)?.[campo] || 0), 0);
    ponto.efetivo = { previsto: arredondar(soma('previsto'), 2), real: semanaStatus && segunda <= semanaStatus ? arredondar(soma('realizado'), 2) : null };
  });

  // -------------------------------------------------------------- Resumo
  const raiz = validas.find((t) => (t.outline_level || 1) === Math.min(...validas.map((x) => x.outline_level || 1)));
  const atividadeRaiz = atividades.find((a) => a.id_origem === raiz?.id) || atividades[0];
  const folhasAtv = atividades.filter((a) => !a.resumo);
  const extremo = (lista, maior) => {
    const v = lista.filter(Boolean).map((d) => d.getTime());
    return v.length ? new Date(maior ? Math.max(...v) : Math.min(...v)) : null;
  };
  const inicioLb = extremo(atividades.map((a) => a.data_inicio_lb), false);
  const terminoLb = extremo(atividades.map((a) => a.data_fim_lb), true);
  const inicio = extremo(atividades.map((a) => a.data_inicio), false);
  const termino = extremo(atividades.map((a) => a.data_fim), true);
  const previsto = atividadeRaiz?.avanco_fisico_previsto ?? 0;
  const real = atividadeRaiz?.avanco_fisico_real ?? 0;
  const textoSs = [propriedades.project_title, raiz?.name, ...validas.slice(0, 5).map((t) => t.name)].join(' ');
  const ss = textoSs.match(/SS\s*-?\s*\d+\s*\/\s*\d+/i);

  const resumo = {
    titulo: raiz?.name ? String(raiz.name).trim() : propriedades.project_title || null,
    titulo_projeto: propriedades.project_title || null,
    ss_arquivo: ss ? ss[0].replace(/\s+/g, '').toUpperCase() : null,
    atividade_raiz: atividadeRaiz?.descricao || null,
    total_atividades: atividades.length,
    total_resumos: atividades.length - folhasAtv.length,
    total_folhas: folhasAtv.length,
    niveis_eap: Math.max(...atividades.map((a) => a.nivel)),
    concluidas: folhasAtv.filter((a) => a.avanco_fisico_real >= 100).length,
    em_andamento: folhasAtv.filter((a) => a.avanco_fisico_real > 0 && a.avanco_fisico_real < 100).length,
    nao_iniciadas: folhasAtv.filter((a) => a.avanco_fisico_real === 0).length,
    avanco_previsto: previsto,
    avanco_real: real,
    aderencia: previsto > 0 ? arredondar((real / previsto) * 100, 2) : null,
    inicio_lb: inicioLb ? inicioLb.toISOString() : null,
    termino_lb: terminoLb ? terminoLb.toISOString() : null,
    inicio_tendencia: inicio ? inicio.toISOString() : null,
    termino_tendencia: termino ? termino.toISOString() : null,
    desvio_termino_dias:
      termino && terminoLb ? Math.round((Date.parse(dataIso(termino)) - Date.parse(dataIso(terminoLb))) / DIA_MS) : null,
    atividades_criticas_ms_project: folhasAtv.filter((a) => a.dados_origem.critica_ms_project).length,
    possui_predecessoras: atividades.some((a) => a.predecessoras),
    vinculos: validas.reduce((s, t) => s + (t.predecessors || []).length, 0),
    atribuicoes: (json.assignments || []).length,
    funcoes: maoDeObra.length,
    data_status: dataStatus ? dataStatus.toISOString() : null,
    data_status_arquivo: statusArquivo ? statusArquivo.toISOString() : null,
    data_linha_base: propriedades.baseline_date || null,
    calendario: especCalendario?.nome || null,
    minutos_por_dia: minutosPorDia,
    colunas_detectadas: ['codigo', 'descricao', 'inicio', 'fim', 'inicio_lb', 'fim_lb', 'real', 'predecessoras', 'recursos', 'critica'],
  };

  const fonte = {
    formato: propriedades.file_type || 'MPP',
    versao_formato: propriedades.mpp_file_type ?? null,
    aplicativo: propriedades.full_application_name || propriedades.short_application_name || null,
    revisao_arquivo: propriedades.revision ?? null,
    ultimo_salvamento: propriedades.last_saved || null,
    autor: propriedades.last_author || propriedades.author || null,
  };

  return {
    atividades,
    resumo,
    curva_s: curvaS,
    histograma_mao_de_obra: maoDeObra.length ? { recursos: maoDeObra, totais: [] } : null,
    histograma_equipamentos: eqp.length ? { recursos: eqp, totais: [] } : null,
    calendario: especCalendario,
    periodo_inicio: semanaStatus,
    periodo_fim: dataStatus ? dataIso(dataStatus) : null,
    data_status: dataStatus,
    fonte,
    avisos,
  };
}

module.exports = { mapearProjeto, calendarioDoProjeto, dataLocal };

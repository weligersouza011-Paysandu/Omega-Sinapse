'use strict';

const AppError = require('../errors/AppError');
const { criarCalendario } = require('./calendarioTrabalho');
const obraRepository = require('../repositories/obraRepository');
const cronogramaRepository = require('../repositories/cronogramaRepository');

/**
 * Motor do Caminho Crítico (CPM) sobre as atividades de uma versão de cronograma.
 *
 * - Rede (DAG): apenas atividades folha (itens de resumo da EAP não entram);
 *   vínculos para um resumo são expandidos para todas as folhas dele.
 * - Tempo: minutos ÚTEIS do calendário padrão (seg–sex, 08–12 e 13–17, 8 h/dia,
 *   fuso America/Sao_Paulo), como o calendário padrão do MS Project. Feriados
 *   não são considerados. Folgas e durações são expressas em dias úteis.
 * - Vínculos: TI/FS, II/SS, TT/FF, IT/SF, com latência ("+2 dias", "-4 hrs",
 *   "+1 sem", "+50%"). Referências por EDT ("1.4.2") ou por Id do MS Project.
 * - Passo para frente: ES = max(início programado, restrições dos vínculos);
 *   atividades iniciadas/concluídas mantêm as datas reais.
 * - Passo para trás: LF das atividades sem sucessoras = término do projeto
 *   (prazo "projeto") ou término da linha de base (prazo "contratual").
 * - Folga total = LF − EF; crítica quando folga ≤ 0 (e não concluída).
 */

/* -------------------------------------------------------------------------- */
/* Calendário de trabalho                                                     */
/* -------------------------------------------------------------------------- */

/** Tolerância (minutos úteis) para considerar folga nula. */
const TOLERANCIA_MIN = 1;

/** Minutos úteis → dias (no "dia" de duração do calendário, ex.: 300 min no MS Project da obra). */
function emDias(minutos, calendario) {
  return Math.round((minutos / calendario.minutosPorDia) * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Predecessoras                                                              */
/* -------------------------------------------------------------------------- */

const TIPOS_VINCULO = { TI: 'FS', FS: 'FS', II: 'SS', SS: 'SS', TT: 'FF', FF: 'FF', IT: 'SF', SF: 'SF' };

/** Latência → minutos úteis (ou fração da duração da predecessora, se "%"). */
function interpretarLatencia(texto, minutosPorDia = 480) {
  if (!texto) return { minutos: 0, percentual: null };
  const match = texto
    .replace(/\s+/g, '')
    .toLowerCase()
    .match(/^([+-])([\d.,]+)(%)?([a-zçãé.]*)$/);
  if (!match) return null;
  const sinal = match[1] === '-' ? -1 : 1;
  const valor = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(valor)) return null;
  if (match[3]) return { minutos: 0, percentual: (sinal * valor) / 100 };

  const unidade = match[4].replace(/\.$/, '').replace(/^e/, ''); // "ed" (decorridos) ≈ dias
  let fator = minutosPorDia;
  if (/^(h|hr|hrs|hora|horas)$/.test(unidade)) fator = 60;
  else if (/^(min|mins|minuto|minutos)$/.test(unidade)) fator = 1;
  else if (/^(s|sem|sems|semana|semanas|w|wk|wks)$/.test(unidade)) fator = minutosPorDia * 5;
  else if (/^(ms|mes|meses|mo|mon)$/.test(unidade)) fator = minutosPorDia * 20;
  else if (!/^(|d|dia|dias|day|days)$/.test(unidade)) return null;
  return { minutos: sinal * valor * fator, percentual: null };
}

/**
 * "12;1.4.2TI+2 dias;15II-1 dia" →
 * [{ ref: '12', tipo: 'FS', latencia }, { ref: '1.4.2', tipo: 'FS', ... }, ...]
 */
function interpretarPredecessoras(texto, minutosPorDia = 480) {
  if (!texto) return { vinculos: [], invalidos: [] };
  const vinculos = [];
  const invalidos = [];
  String(texto)
    .split(/;|,\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .forEach((parte) => {
      const match = parte.match(/^([0-9A-Za-z.\-_]+?)\s*(TI|II|TT|IT|FS|SS|FF|SF)?\s*([+-].*)?$/i);
      const latencia = match ? interpretarLatencia(match[3], minutosPorDia) : null;
      if (!match || !latencia) {
        invalidos.push(parte);
        return;
      }
      vinculos.push({ ref: match[1], tipo: TIPOS_VINCULO[(match[2] || 'TI').toUpperCase()], latencia });
    });
  return { vinculos, invalidos };
}

/* -------------------------------------------------------------------------- */
/* CPM                                                                        */
/* -------------------------------------------------------------------------- */

function data(valor) {
  if (!valor) return null;
  const convertida = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(convertida.getTime()) ? null : convertida;
}

/**
 * Função pura do CPM.
 * @param {object[]} atividades campos: codigo_atividade, ordem, id_origem?, resumo,
 *   data_inicio, data_fim, data_fim_lb?, avanco_fisico_real, predecessoras
 * @param {{ prazo?: 'projeto'|'contratual', terminoContratual?: Date }} opcoes
 * @returns {{ resultados: Map<string, object>, resumo: object, avisos: string[] }}
 */
function calcularPeloMotor(atividades, opcoes = {}) {
  const avisos = [];
  const calendario = criarCalendario(opcoes.calendario || null);
  const paraMinutosUteis = (d) => calendario.paraMinutos(d);
  const deMinutosUteis = (m, modo) => calendario.deMinutos(m, modo);
  const prazo = opcoes.prazo === 'contratual' ? 'contratual' : 'projeto';

  // --------------------------------------------------------------- Nós
  const porCodigo = new Map(atividades.map((a) => [a.codigo_atividade, a]));
  const porIdOrigem = new Map(atividades.filter((a) => a.id_origem != null).map((a) => [String(a.id_origem), a]));
  const porOrdem = new Map(atividades.map((a) => [String(a.ordem), a]));
  const usarIdOrigem = porIdOrigem.size > 0;

  const folhas = atividades.filter((a) => !a.resumo);
  const semDatas = folhas.filter((a) => !data(a.data_inicio) || !data(a.data_fim));
  if (semDatas.length) avisos.push(`${semDatas.length} atividade(s) sem datas ficaram fora da rede.`);

  const nos = new Map();
  folhas
    .filter((a) => data(a.data_inicio) && data(a.data_fim))
    .forEach((a) => {
      const inicio = paraMinutosUteis(data(a.data_inicio));
      const fim = paraMinutosUteis(data(a.data_fim));
      nos.set(a.codigo_atividade, {
        atividade: a,
        inicioProgramado: inicio,
        duracao: Math.max(fim - inicio, 0),
        concluida: Number(a.avanco_fisico_real) >= 100,
        iniciada: Number(a.avanco_fisico_real) > 0,
        predecessoras: [],
        sucessoras: [],
      });
    });

  if (!nos.size) {
    throw new AppError(422, 'A versão do cronograma não possui atividades com datas para calcular o caminho crítico.');
  }

  /** Folhas de uma atividade (ela própria, se for folha). */
  const folhasDe = (codigo) => {
    if (nos.has(codigo)) return [codigo];
    const prefixo = `${codigo}.`;
    return [...nos.keys()].filter((c) => c.startsWith(prefixo));
  };

  const resolver = (ref) => {
    if (/^\d+$/.test(ref)) {
      if (usarIdOrigem) return porIdOrigem.get(ref) || null;
      return porCodigo.get(ref) || porOrdem.get(ref) || null;
    }
    return porCodigo.get(ref) || null;
  };

  // ----------------------------------------------------------- Arestas
  let totalVinculos = 0;
  const naoResolvidas = new Set();
  const invalidas = new Set();
  atividades.forEach((a) => {
    if (!a.predecessoras) return;
    const { vinculos, invalidos } = interpretarPredecessoras(a.predecessoras, calendario.minutosPorDia);
    invalidos.forEach((item) => invalidas.add(item));
    const destinos = folhasDe(a.codigo_atividade);
    vinculos.forEach((vinculo) => {
      const origem = resolver(vinculo.ref);
      if (!origem) {
        naoResolvidas.add(vinculo.ref);
        return;
      }
      folhasDe(origem.codigo_atividade).forEach((de) => {
        destinos.forEach((para) => {
          if (de === para) return;
          totalVinculos += 1;
          const aresta = { de, para, tipo: vinculo.tipo, latencia: vinculo.latencia };
          nos.get(para).predecessoras.push(aresta);
          nos.get(de).sucessoras.push(aresta);
        });
      });
    });
  });
  if (naoResolvidas.size) {
    avisos.push(`Predecessoras não encontradas na versão: ${[...naoResolvidas].slice(0, 10).join(', ')}.`);
  }
  if (invalidas.size) {
    avisos.push(`Predecessoras em formato não reconhecido: ${[...invalidas].slice(0, 10).join(', ')}.`);
  }

  const metodo = totalVinculos > 0 ? 'cpm' : 'sem_amarracoes';
  if (metodo === 'sem_amarracoes') {
    avisos.push(
      'O cronograma não possui amarrações de precedência: a folga de cada atividade foi medida até o término do prazo de referência, sem a lógica da rede.'
    );
  }

  // ---------------------------------------- Ordenação topológica (Kahn)
  const ordenar = () => {
    const grauEntrada = new Map([...nos.keys()].map((c) => [c, 0]));
    nos.forEach((no) => no.sucessoras.forEach((a) => grauEntrada.set(a.para, grauEntrada.get(a.para) + 1)));
    const fila = [...nos.keys()].filter((c) => grauEntrada.get(c) === 0);
    const resultado = [];
    while (fila.length) {
      const codigo = fila.shift();
      resultado.push(codigo);
      nos.get(codigo).sucessoras.forEach((a) => {
        grauEntrada.set(a.para, grauEntrada.get(a.para) - 1);
        if (grauEntrada.get(a.para) === 0) fila.push(a.para);
      });
    }
    return resultado;
  };

  let ordem = ordenar();
  if (ordem.length < nos.size) {
    // Atividades presas em ciclo (ou a jusante dele): descarta os vínculos entre
    // elas e reordena — o restante da rede continua válido.
    const ordenadas = new Set(ordem);
    const presas = new Set([...nos.keys()].filter((c) => !ordenadas.has(c)));
    avisos.push(
      `Ciclo de precedência envolvendo ${[...presas].slice(0, 10).join(', ')}${presas.size > 10 ? '…' : ''}: os vínculos entre essas atividades foram ignorados.`
    );
    nos.forEach((no) => {
      no.predecessoras = no.predecessoras.filter((a) => !(presas.has(a.de) && presas.has(a.para)));
      no.sucessoras = no.sucessoras.filter((a) => !(presas.has(a.de) && presas.has(a.para)));
    });
    ordem = ordenar();
  }

  const latenciaEmMinutos = (aresta) =>
    aresta.latencia.percentual !== null
      ? aresta.latencia.percentual * nos.get(aresta.de).duracao
      : aresta.latencia.minutos;

  // -------------------------------------------------- Passo para frente
  ordem.forEach((codigo) => {
    const no = nos.get(codigo);
    if (no.iniciada) {
      // Datas reais/programadas de atividades em andamento ou concluídas são fixas.
      no.es = no.inicioProgramado;
    } else {
      let es = no.inicioProgramado; // restrição "não iniciar antes de"
      no.predecessoras.forEach((a) => {
        const p = nos.get(a.de);
        const l = latenciaEmMinutos(a);
        if (a.tipo === 'FS') es = Math.max(es, p.ef + l);
        else if (a.tipo === 'SS') es = Math.max(es, p.es + l);
        else if (a.tipo === 'FF') es = Math.max(es, p.ef + l - no.duracao);
        else if (a.tipo === 'SF') es = Math.max(es, p.es + l - no.duracao);
      });
      no.es = es;
    }
    no.ef = no.es + no.duracao;
  });

  const terminoProjeto = Math.max(...[...nos.values()].map((no) => no.ef));
  const terminoContratual = data(opcoes.terminoContratual);
  const referencia =
    prazo === 'contratual' && terminoContratual ? paraMinutosUteis(terminoContratual) : terminoProjeto;
  if (prazo === 'contratual' && !terminoContratual) {
    avisos.push('Término da linha de base indisponível: usado o término do projeto como prazo de referência.');
  }

  // --------------------------------------------------- Passo para trás
  [...ordem].reverse().forEach((codigo) => {
    const no = nos.get(codigo);
    let lf = referencia;
    no.sucessoras.forEach((a) => {
      const s = nos.get(a.para);
      // Sucessora já iniciada tem datas reais: o progresso sobrepõe a lógica
      // (como no MS Project) e ela não restringe mais as datas tarde da predecessora.
      if (s.iniciada) return;
      const l = latenciaEmMinutos(a);
      if (a.tipo === 'FS') lf = Math.min(lf, s.ls - l);
      else if (a.tipo === 'SS') lf = Math.min(lf, s.ls - l + no.duracao);
      else if (a.tipo === 'FF') lf = Math.min(lf, s.lf - l);
      else if (a.tipo === 'SF') lf = Math.min(lf, s.lf - l + no.duracao);
    });
    no.lf = lf;
    no.ls = lf - no.duracao;
  });

  // ----------------------------------------------------------- Folgas
  const resultados = new Map();
  nos.forEach((no, codigo) => {
    const folga = no.lf - no.ef;
    const critica = !no.concluida && folga <= TOLERANCIA_MIN;
    resultados.set(codigo, {
      es: deMinutosUteis(no.es, 'inicio'),
      ef: deMinutosUteis(no.ef, 'fim'),
      ls: deMinutosUteis(no.ls, 'inicio'),
      lf: deMinutosUteis(no.lf, 'fim'),
      duracao_dias: emDias(no.duracao, calendario),
      folga_total_dias: Math.abs(folga) <= TOLERANCIA_MIN ? 0 : emDias(folga, calendario),
      caminho_critico: critica,
      concluida: no.concluida,
      predecessoras: no.predecessoras.length,
      sucessoras: no.sucessoras.length,
    });
  });

  const criticas = [...resultados.values()].filter((r) => r.caminho_critico);
  const folgaMinima = Math.min(...[...resultados.values()].filter((r) => !r.concluida).map((r) => r.folga_total_dias));

  return {
    resultados,
    resumo: {
      metodo,
      prazo_referencia: prazo === 'contratual' && terminoContratual ? 'contratual' : 'projeto',
      calendario: calendario.nome,
      minutos_por_dia: calendario.minutosPorDia,
      atividades_na_rede: nos.size,
      vinculos: totalVinculos,
      atividades_criticas: criticas.length,
      folga_minima_dias: Number.isFinite(folgaMinima) ? folgaMinima : null,
      termino_projeto: deMinutosUteis(terminoProjeto, 'fim'),
      termino_referencia: deMinutosUteis(referencia, 'fim'),
      atraso_vs_referencia_dias: emDias(Math.max(terminoProjeto - referencia, 0), calendario),
    },
    avisos,
  };
}

/* -------------------------------------------------------------------------- */
/* CPM calculado pelo MS Project                                              */
/* -------------------------------------------------------------------------- */

function temDadosMsProject(atividades) {
  return atividades.some((a) => !a.resumo && a.dados_origem && typeof a.dados_origem.critica_ms_project === 'boolean');
}

/**
 * Usa o caminho crítico calculado pelo próprio MS Project (campos Crítica,
 * Folga total e datas cedo/tarde gravados no .mpp), que considera o calendário,
 * as restrições, as tarefas divididas e o progresso exatamente como o
 * planejador vê no Project. Para o prazo "contratual", a folga é reduzida pelo
 * atraso do término do projeto em relação ao término da linha de base.
 */
function calcularPeloMsProject(atividades, opcoes = {}) {
  const avisos = [];
  const calendario = criarCalendario(opcoes.calendario || null);
  const prazo = opcoes.prazo === 'contratual' ? 'contratual' : 'projeto';
  const folhas = atividades.filter((a) => !a.resumo && data(a.data_inicio) && data(a.data_fim));
  if (!folhas.length) {
    throw new AppError(422, 'A versão do cronograma não possui atividades com datas para calcular o caminho crítico.');
  }

  const termino = Math.max(...folhas.map((a) => calendario.paraMinutos(data(a.data_fim))));
  const terminoContratual = data(opcoes.terminoContratual);
  let atraso = 0;
  if (prazo === 'contratual') {
    if (terminoContratual) atraso = Math.max(termino - calendario.paraMinutos(terminoContratual), 0);
    else avisos.push('Término da linha de base indisponível: usado o término do projeto como prazo de referência.');
  }
  const atrasoDias = emDias(atraso, calendario);

  const resultados = new Map();
  folhas.forEach((a) => {
    const o = a.dados_origem || {};
    const concluida = Number(a.avanco_fisico_real) >= 100;
    // O MPXJ omite folga zero: ausência de valor em tarefa não concluída = 0.
    const folgaProjeto = o.folga_total_dias === null || o.folga_total_dias === undefined ? 0 : Number(o.folga_total_dias);
    const folga = prazo === 'contratual' ? Math.round((folgaProjeto - atrasoDias) * 100) / 100 : folgaProjeto;
    const critica = !concluida && (prazo === 'contratual' ? folga <= 0 : Boolean(o.critica_ms_project));
    const inicioCedo = data(o.inicio_cedo) || data(a.data_inicio);
    const terminoCedo = data(o.termino_cedo) || data(a.data_fim);
    resultados.set(a.codigo_atividade, {
      es: inicioCedo,
      ef: terminoCedo,
      ls: data(o.inicio_tarde) || inicioCedo,
      lf: data(o.termino_tarde) || terminoCedo,
      duracao_dias: o.duracao_dias ?? emDias(calendario.paraMinutos(data(a.data_fim)) - calendario.paraMinutos(data(a.data_inicio)), calendario),
      folga_total_dias: folga,
      caminho_critico: critica,
      concluida,
      predecessoras: a.predecessoras ? String(a.predecessoras).split(';').length : 0,
      sucessoras: null,
    });
  });

  const criticas = [...resultados.values()].filter((r) => r.caminho_critico);
  const abertas = [...resultados.values()].filter((r) => !r.concluida);
  const folgaMinima = abertas.length ? Math.min(...abertas.map((r) => r.folga_total_dias)) : null;
  return {
    resultados,
    resumo: {
      metodo: 'ms_project',
      prazo_referencia: prazo === 'contratual' && terminoContratual ? 'contratual' : 'projeto',
      calendario: calendario.nome,
      minutos_por_dia: calendario.minutosPorDia,
      atividades_na_rede: folhas.length,
      vinculos: atividades.reduce((t, a) => t + (a.predecessoras ? String(a.predecessoras).split(';').length : 0), 0),
      atividades_criticas: criticas.length,
      folga_minima_dias: folgaMinima,
      termino_projeto: calendario.deMinutos(termino, 'fim'),
      termino_referencia: terminoContratual && prazo === 'contratual' ? terminoContratual : calendario.deMinutos(termino, 'fim'),
      atraso_vs_referencia_dias: atrasoDias,
    },
    avisos,
  };
}

/**
 * Caminho crítico de uma versão: com os dados de CPM do MS Project (.mpp),
 * usa-os diretamente; sem eles (ou com `opcoes.motor = true`), calcula pelo
 * motor próprio (passos para frente/trás com o calendário da obra).
 */
function calcularCaminhoCritico(atividades, opcoes = {}) {
  if (!opcoes.motor && temDadosMsProject(atividades)) return calcularPeloMsProject(atividades, opcoes);
  return calcularPeloMotor(atividades, opcoes);
}

/**
 * Aplica o CPM às atividades recém-lidas no upload, gravando `folga_total_dias`
 * e `caminho_critico`. Com dados do MS Project, também roda o motor próprio e
 * registra a concordância entre os dois (conferência da lógica da rede).
 */
function aplicarNoUpload(atividades, { possuiColunaCritica = false, calendario = null } = {}) {
  try {
    const { resultados, resumo, avisos } = calcularCaminhoCritico(atividades, { calendario });
    const manterPlanilha = resumo.metodo === 'sem_amarracoes' && possuiColunaCritica;
    atividades.forEach((a) => {
      const r = resultados.get(a.codigo_atividade);
      a.folga_total_dias = r ? r.folga_total_dias : null;
      if (!manterPlanilha) a.caminho_critico = r ? r.caminho_critico : false;
    });

    let concordancia = null;
    if (resumo.metodo === 'ms_project') {
      try {
        const motor = calcularPeloMotor(atividades, { calendario });
        const comparadas = atividades.filter((a) => !a.resumo && Number(a.avanco_fisico_real) < 100 && motor.resultados.has(a.codigo_atividade));
        const divergentes = comparadas.filter((a) => motor.resultados.get(a.codigo_atividade).caminho_critico !== a.caminho_critico);
        concordancia = {
          comparadas: comparadas.length,
          iguais: comparadas.length - divergentes.length,
          percentual: comparadas.length ? Math.round(((comparadas.length - divergentes.length) / comparadas.length) * 1000) / 10 : null,
          divergentes: divergentes.slice(0, 30).map((a) => a.codigo_atividade),
        };
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }

    return {
      resumo: { ...resumo, origem_marcacao: manterPlanilha ? 'planilha' : resumo.metodo, concordancia_motor: concordancia },
      avisos,
    };
  } catch (err) {
    if (err instanceof AppError) return { resumo: null, avisos: [err.message] };
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Rede (diagrama)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Ligações de precedência entre as atividades folha, já resolvidas (Id do MS
 * Project ou EDT; vínculos com itens de resumo expandidos para as folhas).
 * @returns {{ de: string, para: string, tipo: string, latencia_dias: number|null }[]}
 */
function montarArestas(atividades, folhas, minutosPorDia) {
  const porCodigo = new Map(atividades.map((a) => [a.codigo_atividade, a]));
  const porIdOrigem = new Map(atividades.filter((a) => a.id_origem != null).map((a) => [String(a.id_origem), a]));
  const porOrdem = new Map(atividades.map((a) => [String(a.ordem), a]));
  const usarIdOrigem = porIdOrigem.size > 0;
  const folhasDe = (codigo) => {
    if (folhas.has(codigo)) return [codigo];
    const prefixo = `${codigo}.`;
    return [...folhas].filter((c) => c.startsWith(prefixo));
  };
  const resolver = (ref) => {
    if (/^\d+$/.test(ref)) return usarIdOrigem ? porIdOrigem.get(ref) : porCodigo.get(ref) || porOrdem.get(ref);
    return porCodigo.get(ref);
  };
  const vistas = new Set();
  const arestas = [];
  atividades.forEach((a) => {
    if (!a.predecessoras) return;
    const destinos = folhasDe(a.codigo_atividade);
    interpretarPredecessoras(a.predecessoras, minutosPorDia).vinculos.forEach((v) => {
      const origem = resolver(v.ref);
      if (!origem) return;
      folhasDe(origem.codigo_atividade).forEach((de) => {
        destinos.forEach((para) => {
          const chave = `${de}>${para}`;
          if (de === para || vistas.has(chave)) return;
          vistas.add(chave);
          arestas.push({
            de,
            para,
            tipo: v.tipo,
            latencia_dias:
              v.latencia.percentual !== null ? null : Math.round((v.latencia.minutos / minutosPorDia) * 100) / 100,
          });
        });
      });
    });
  });
  return arestas;
}

/* -------------------------------------------------------------------------- */
/* Endpoint                                                                   */
/* -------------------------------------------------------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function diasUteisEntre(a, b, calendario) {
  if (!a || !b) return null;
  return emDias(calendario.paraMinutos(data(a)) - calendario.paraMinutos(data(b)), calendario);
}

/**
 * GET /api/obras/:obraId/caminho-critico
 * Query: versao_id (UUID, padrão = revisão mais recente), prazo = projeto|contratual,
 *        todas = true (devolve todas as atividades da rede, não só as críticas).
 */
async function obterCaminhoCritico(obraIdParam, query = {}) {
  const obraId = Number(obraIdParam);
  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw new AppError(400, 'O parâmetro "obraId" deve ser um número inteiro positivo.');
  }
  const prazo = String(query.prazo || 'projeto').toLowerCase();
  if (!['projeto', 'contratual'].includes(prazo)) {
    throw new AppError(400, 'O parâmetro "prazo" aceita "projeto" ou "contratual".');
  }
  if (query.versao_id && !UUID.test(String(query.versao_id))) {
    throw new AppError(400, 'O parâmetro "versao_id" deve ser o UUID de uma versão do cronograma.');
  }

  const obra = await obraRepository.findById(obraId);
  if (!obra) throw new AppError(404, `Obra ${obraId} não encontrada.`);

  const versoes = await cronogramaRepository.listarVersoesLeves(obraId);
  if (!versoes.length) {
    throw new AppError(404, 'A obra ainda não possui cronograma enviado. Envie o cronograma para calcular o caminho crítico.');
  }
  const idVersao = query.versao_id || versoes[versoes.length - 1].id;
  const versao = await cronogramaRepository.buscarPorId(idVersao);
  if (!versao || versao.obra_id !== obraId) {
    throw new AppError(404, 'Versão de cronograma não encontrada para esta obra.');
  }

  const atividades = versao.atividades || [];
  const raiz = atividades.find((a) => a.nivel === Math.min(...atividades.map((x) => x.nivel)));
  const terminoContratual = versao.resumo?.termino_lb || raiz?.data_fim_lb || null;
  const { resultados, resumo, avisos } = calcularCaminhoCritico(atividades, {
    prazo,
    terminoContratual,
    calendario: versao.calendario || null,
  });
  const calendarioVersao = criarCalendario(versao.calendario || null);

  // Contexto: trilha da EAP e restrições abertas ligadas à atividade.
  const porCodigo = new Map(atividades.map((a) => [a.codigo_atividade, a]));
  const trilha = (atividade) => {
    const caminho = [];
    let pai = atividade.codigo_pai ? porCodigo.get(atividade.codigo_pai) : null;
    while (pai && pai.nivel > 1) {
      caminho.unshift(pai.descricao);
      pai = pai.codigo_pai ? porCodigo.get(pai.codigo_pai) : null;
    }
    return caminho;
  };
  const restricoesAbertas = (obra.restricoes || []).filter((r) => ['PENDENTE', 'EM_ANDAMENTO'].includes(r.status));
  const restricoesDa = (atividade) => {
    const nome = normalizar(atividade.descricao);
    return restricoesAbertas
      .filter((r) => {
        const alvo = normalizar(r.atividade);
        return alvo && (alvo === nome || alvo === normalizar(atividade.codigo_atividade) || (alvo.length > 8 && nome.includes(alvo)));
      })
      .map((r) => ({ id: r.id, descricao: r.descricao, responsavel: r.responsavel, prazo: r.prazo, status: r.status }));
  };

  const equipe = (obra.planejadores || []).map((p) => p.nome);
  const todas = String(query.todas || '').toLowerCase() === 'true';

  const itens = atividades
    .filter((a) => resultados.has(a.codigo_atividade))
    .map((a) => ({ atividade: a, cpm: resultados.get(a.codigo_atividade) }))
    .filter(({ cpm }) => todas || cpm.caminho_critico)
    .sort((x, y) => x.cpm.folga_total_dias - y.cpm.folga_total_dias || x.cpm.es - y.cpm.es)
    .map(({ atividade: a, cpm }) => {
      const caminhoEap = trilha(a);
      const lista = (valor) => (Array.isArray(valor) ? valor : []);
      const funcoes = lista(a.recursos_mao_de_obra).map((r) => r.funcao).filter(Boolean);
      const equipamentos = lista(a.recursos_equipamentos).map((r) => r.equipamento).filter(Boolean);
      const atrasoLb = diasUteisEntre(a.data_fim, a.data_fim_lb, calendarioVersao);
      const restricoes = restricoesDa(a);
      return {
        id: a.id,
        codigo_atividade: a.codigo_atividade,
        descricao: a.descricao,
        frente: caminhoEap[1] || caminhoEap[0] || null,
        caminho_eap: caminhoEap,
        inicio: a.data_inicio,
        termino: a.data_fim,
        inicio_lb: a.data_inicio_lb,
        termino_lb: a.data_fim_lb,
        inicio_cedo: cpm.es,
        termino_cedo: cpm.ef,
        inicio_tarde: cpm.ls,
        termino_tarde: cpm.lf,
        duracao_dias: cpm.duracao_dias,
        folga_total_dias: cpm.folga_total_dias,
        caminho_critico: cpm.caminho_critico,
        /** Dias úteis que a atividade empurra além do prazo de referência. */
        impacto_prazo_dias: cpm.folga_total_dias < 0 ? -cpm.folga_total_dias : 0,
        /** Atraso do término (tendência) em relação à linha de base, em dias úteis. */
        atraso_termino_vs_lb_dias: atrasoLb !== null && atrasoLb > 0 ? atrasoLb : 0,
        avanco_fisico_previsto: a.avanco_fisico_previsto,
        avanco_fisico_real: a.avanco_fisico_real,
        situacao: cpm.concluida ? 'CONCLUIDA' : a.avanco_fisico_real > 0 ? 'EM_ANDAMENTO' : 'NAO_INICIADA',
        predecessoras: a.predecessoras,
        responsavel: {
          funcoes,
          equipamentos,
          restricoes,
          // Sem recurso vinculado na atividade, o responsável é a equipe de planejamento da obra.
          planejadores: funcoes.length ? [] : equipe,
        },
      };
    });

  // Rede completa (todas as folhas com datas) para o diagrama do caminho crítico.
  const folhasRede = new Set([...resultados.keys()]);
  const rede = {
    nos: atividades
      .filter((a) => resultados.has(a.codigo_atividade))
      .map((a) => {
        const cpm = resultados.get(a.codigo_atividade);
        const caminhoEap = trilha(a);
        return {
          codigo: a.codigo_atividade,
          id_origem: a.id_origem ?? null,
          descricao: a.descricao,
          frente: caminhoEap[1] || caminhoEap[0] || null,
          inicio: a.data_inicio,
          termino: a.data_fim,
          termino_lb: a.data_fim_lb,
          inicio_cedo: cpm.es,
          termino_tarde: cpm.lf,
          duracao_dias: cpm.duracao_dias,
          folga_total_dias: cpm.folga_total_dias,
          caminho_critico: cpm.caminho_critico,
          avanco_fisico_real: a.avanco_fisico_real,
          situacao: cpm.concluida ? 'CONCLUIDA' : a.avanco_fisico_real > 0 ? 'EM_ANDAMENTO' : 'NAO_INICIADA',
        };
      }),
    arestas: montarArestas(atividades, folhasRede, calendarioVersao.minutosPorDia),
  };

  return {
    obra_id: obraId,
    versao: {
      id: versao.id,
      versao: versao.versao,
      numero_revisao: versao.numero_revisao,
      data_snapshot: versao.data_snapshot,
      periodo_fim: versao.periodo_fim,
    },
    resumo,
    total: itens.length,
    data: itens,
    rede,
    avisos,
  };
}

module.exports = {
  obterCaminhoCritico,
  calcularCaminhoCritico,
  calcularPeloMotor,
  calcularPeloMsProject,
  aplicarNoUpload,
  // Exportados para testes.
  interpretarPredecessoras,

};

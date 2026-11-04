'use strict';

const AppError = require('../errors/AppError');
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

const FUSO_OFFSET_MIN = -3 * 60;
const MINUTOS_DIA_UTIL = 480;
const MINUTOS_SEMANA_UTIL = MINUTOS_DIA_UTIL * 5;
/** Expediente em minutos desde 00:00 local. */
const EXPEDIENTE = [
  [8 * 60, 12 * 60],
  [13 * 60, 17 * 60],
];
const DIA_MS = 24 * 60 * 60 * 1000;
/** Tolerância (minutos úteis) para considerar folga nula. */
const TOLERANCIA_MIN = 1;

/** 1970-01-01 foi quinta-feira; dia da semana (0 = domingo) do dia `d` desde a época. */
function diaDaSemana(d) {
  return (((d + 4) % 7) + 7) % 7;
}

function ehDiaUtil(d) {
  const semana = diaDaSemana(d);
  return semana >= 1 && semana <= 5;
}

/** Minutos úteis decorridos no dia até o minuto `m` (0–1440). */
function minutosUteisNoDia(m) {
  return EXPEDIENTE.reduce((total, [inicio, fim]) => total + Math.max(0, Math.min(m, fim) - inicio), 0);
}

/** Dias úteis no intervalo [0, d). */
function diasUteisAntes(d) {
  const semanas = Math.floor(d / 7);
  let total = semanas * 5;
  for (let dia = semanas * 7; dia < d; dia += 1) if (ehDiaUtil(dia)) total += 1;
  return total;
}

/** Instante → minutos úteis desde a época (escala contínua do CPM). */
function paraMinutosUteis(data) {
  const localMin = Math.floor(data.getTime() / 60000) + FUSO_OFFSET_MIN;
  const dia = Math.floor(localMin / 1440);
  const minutoDoDia = localMin - dia * 1440;
  return diasUteisAntes(dia) * MINUTOS_DIA_UTIL + (ehDiaUtil(dia) ? minutosUteisNoDia(minutoDoDia) : 0);
}

/**
 * Minutos úteis → instante. Em fronteiras de expediente, `modo = 'inicio'`
 * devolve o começo do próximo período (08:00/13:00) e `'fim'` o término do
 * anterior (12:00/17:00), como o MS Project.
 */
function deMinutosUteis(minutos, modo = 'inicio') {
  let dia = Math.floor(minutos / MINUTOS_SEMANA_UTIL) * 7;
  let restante = minutos - diasUteisAntes(dia) * MINUTOS_DIA_UTIL;
  // Avança até o dia útil que contém o minuto.
  for (;;) {
    if (ehDiaUtil(dia)) {
      const cabe = modo === 'fim' ? restante <= MINUTOS_DIA_UTIL : restante < MINUTOS_DIA_UTIL;
      if (cabe) break;
      restante -= MINUTOS_DIA_UTIL;
    }
    dia += 1;
  }
  let minutoDoDia = EXPEDIENTE[0][0];
  for (const [inicio, fim] of EXPEDIENTE) {
    const duracao = fim - inicio;
    const cabe = modo === 'fim' ? restante <= duracao : restante < duracao;
    if (cabe) {
      minutoDoDia = inicio + restante;
      break;
    }
    restante -= duracao;
  }
  return new Date((dia * 1440 + minutoDoDia - FUSO_OFFSET_MIN) * 60000);
}

function emDias(minutos) {
  return Math.round((minutos / MINUTOS_DIA_UTIL) * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Predecessoras                                                              */
/* -------------------------------------------------------------------------- */

const TIPOS_VINCULO = { TI: 'FS', FS: 'FS', II: 'SS', SS: 'SS', TT: 'FF', FF: 'FF', IT: 'SF', SF: 'SF' };

/** Latência → minutos úteis (ou fração da duração da predecessora, se "%"). */
function interpretarLatencia(texto) {
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
  let fator = MINUTOS_DIA_UTIL;
  if (/^(h|hr|hrs|hora|horas)$/.test(unidade)) fator = 60;
  else if (/^(min|mins|minuto|minutos)$/.test(unidade)) fator = 1;
  else if (/^(s|sem|sems|semana|semanas|w|wk|wks)$/.test(unidade)) fator = MINUTOS_SEMANA_UTIL;
  else if (/^(ms|mes|meses|mo|mon)$/.test(unidade)) fator = MINUTOS_DIA_UTIL * 20;
  else if (!/^(|d|dia|dias|day|days)$/.test(unidade)) return null;
  return { minutos: sinal * valor * fator, percentual: null };
}

/**
 * "12;1.4.2TI+2 dias;15II-1 dia" →
 * [{ ref: '12', tipo: 'FS', latencia }, { ref: '1.4.2', tipo: 'FS', ... }, ...]
 */
function interpretarPredecessoras(texto) {
  if (!texto) return { vinculos: [], invalidos: [] };
  const vinculos = [];
  const invalidos = [];
  String(texto)
    .split(/;|,\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .forEach((parte) => {
      const match = parte.match(/^([0-9A-Za-z.\-_]+?)\s*(TI|II|TT|IT|FS|SS|FF|SF)?\s*([+-].*)?$/i);
      const latencia = match ? interpretarLatencia(match[3]) : null;
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
function calcularCaminhoCritico(atividades, opcoes = {}) {
  const avisos = [];
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
    const { vinculos, invalidos } = interpretarPredecessoras(a.predecessoras);
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
      duracao_dias: emDias(no.duracao),
      folga_total_dias: Math.abs(folga) <= TOLERANCIA_MIN ? 0 : emDias(folga),
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
      calendario: 'Seg–Sex, 08:00–12:00 e 13:00–17:00 (8 h/dia), sem feriados',
      atividades_na_rede: nos.size,
      vinculos: totalVinculos,
      atividades_criticas: criticas.length,
      folga_minima_dias: Number.isFinite(folgaMinima) ? folgaMinima : null,
      termino_projeto: deMinutosUteis(terminoProjeto, 'fim'),
      termino_referencia: deMinutosUteis(referencia, 'fim'),
      atraso_vs_referencia_dias: emDias(Math.max(terminoProjeto - referencia, 0)),
    },
    avisos,
  };
}

/**
 * Aplica o CPM às atividades recém-lidas no upload, gravando `folga_total_dias`
 * e `caminho_critico`. Quando não há amarrações e a planilha traz a coluna
 * "Crítica" do MS Project, o valor da planilha é preservado.
 */
function aplicarNoUpload(atividades, { possuiColunaCritica = false } = {}) {
  try {
    const { resultados, resumo, avisos } = calcularCaminhoCritico(atividades);
    const manterPlanilha = resumo.metodo === 'sem_amarracoes' && possuiColunaCritica;
    atividades.forEach((a) => {
      const r = resultados.get(a.codigo_atividade);
      a.folga_total_dias = r ? r.folga_total_dias : null;
      if (!manterPlanilha) a.caminho_critico = r ? r.caminho_critico : false;
    });
    return { resumo: { ...resumo, origem_marcacao: manterPlanilha ? 'planilha' : 'cpm' }, avisos };
  } catch (err) {
    if (err instanceof AppError) return { resumo: null, avisos: [err.message] };
    throw err;
  }
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

function diasUteisEntre(a, b) {
  if (!a || !b) return null;
  return emDias(paraMinutosUteis(data(a)) - paraMinutosUteis(data(b)));
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
  const { resultados, resumo, avisos } = calcularCaminhoCritico(atividades, { prazo, terminoContratual });

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
      const atrasoLb = diasUteisEntre(a.data_fim, a.data_fim_lb);
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
    avisos,
  };
}

module.exports = {
  obterCaminhoCritico,
  calcularCaminhoCritico,
  aplicarNoUpload,
  // Exportados para testes.
  interpretarPredecessoras,
  paraMinutosUteis,
  deMinutosUteis,
};

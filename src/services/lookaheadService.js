'use strict';

const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');
const cronogramaRepository = require('../repositories/cronogramaRepository');
const lookaheadRepository = require('../repositories/lookaheadRepository');

/**
 * Lookahead de 6 semanas (6WLA) — Last Planner System.
 *
 * - Horizonte: 6 semanas (segunda a domingo, fuso America/Sao_Paulo) a partir
 *   da semana da data de referência (padrão: hoje).
 * - Atividades: folhas da EAP da versão analisada (padrão: a mais recente), não
 *   concluídas, cuja execução programada (início → término de tendência) cruza
 *   a semana. Uma atividade longa aparece em todas as semanas que atravessa.
 * - Restrições: valem para a atividade com o mesmo EDT e são herdadas pelas
 *   folhas quando cadastradas num item de resumo. Como o vínculo estável é o
 *   EDT, a restrição acompanha a atividade nas revisões seguintes.
 * - Liberada = nenhuma restrição PENDENTE; Bloqueada = ao menos uma.
 * - PPC (Percentual de Planos Concluídos) das 4 semanas anteriores: atividades
 *   que o plano vigente na época previa terminar na semana × concluídas (100%)
 *   segundo a versão analisada.
 */

const SEMANAS = 6;
const SEMANAS_PPC = 4;
const DIA_MS = 24 * 60 * 60 * 1000;
const FUSO_OFFSET_HORAS = -3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PERFIS_ESCRITA = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const TIPOS = ['PROJETOS', 'SUPRIMENTOS', 'LIBERACAO_AREA', 'SMS', 'EQUIPAMENTO'];
const STATUS = ['PENDENTE', 'BAIXADA'];

/** Sinônimos aceitos no cadastro (comparados sem acento/caixa). */
const SINONIMOS_TIPO = {
  PROJETO: 'PROJETOS',
  ENGENHARIA: 'PROJETOS',
  SUPRIMENTO: 'SUPRIMENTOS',
  MATERIAL: 'SUPRIMENTOS',
  MATERIAIS: 'SUPRIMENTOS',
  LIBERACAO_DE_AREA: 'LIBERACAO_AREA',
  LIBERACAO_DE_FRENTE: 'LIBERACAO_AREA',
  LIBERACAO_FRENTE: 'LIBERACAO_AREA',
  AREA: 'LIBERACAO_AREA',
  SEGURANCA: 'SMS',
  EQUIPAMENTOS: 'EQUIPAMENTO',
};
const SINONIMOS_STATUS = { ABERTA: 'PENDENTE', REMOVIDA: 'BAIXADA', CONCLUIDA: 'BAIXADA', RESOLVIDA: 'BAIXADA' };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function chaveEnum(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Meia-noite local (BRT) do dia AAAA-MM-DD, como instante UTC. */
function inicioDoDia(ano, mes, dia) {
  return new Date(Date.UTC(ano, mes - 1, dia, -FUSO_OFFSET_HORAS, 0));
}

/** Data local (BRT) AAAA-MM-DD de um instante. */
function dataLocal(instante) {
  return new Date(instante.getTime() + FUSO_OFFSET_HORAS * 3600000).toISOString().slice(0, 10);
}

function segundaDaSemana(instante) {
  const [ano, mes, dia] = dataLocal(instante).split('-').map(Number);
  const meiaNoite = inicioDoDia(ano, mes, dia);
  const diaSemana = (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() + 6) % 7; // 0 = segunda
  return new Date(meiaNoite.getTime() - diaSemana * DIA_MS);
}

/** Semana ISO-8601 de uma data local AAAA-MM-DD. */
function semanaIso(dataTexto) {
  const d = new Date(`${dataTexto}T00:00:00Z`);
  const quinta = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DIA_MS);
  const inicioAno = new Date(Date.UTC(quinta.getUTCFullYear(), 0, 1));
  return { ano: quinta.getUTCFullYear(), semana: Math.ceil(((quinta - inicioAno) / DIA_MS + 1) / 7) };
}

function montarSemanas(primeiraSegunda, quantidade, deslocamento = 0) {
  return Array.from({ length: quantidade }, (_, indice) => {
    const inicio = new Date(primeiraSegunda.getTime() + (indice + deslocamento) * 7 * DIA_MS);
    const fim = new Date(inicio.getTime() + 7 * DIA_MS); // exclusivo
    const iso = semanaIso(dataLocal(inicio));
    return {
      inicio,
      fim,
      inicio_data: dataLocal(inicio),
      fim_data: dataLocal(new Date(fim.getTime() - DIA_MS)),
      semana_iso: iso.semana,
      ano: iso.ano,
    };
  });
}

function dataReferenciaDe(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return new Date();
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new AppError(400, 'O parâmetro "data_referencia" deve estar no formato AAAA-MM-DD.');
  return new Date(inicioDoDia(Number(match[1]), Number(match[2]), Number(match[3])).getTime() + 12 * 3600000);
}

function instante(valor) {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function percentual(parte, total) {
  return total > 0 ? Math.round((parte / total) * 10000) / 100 : null;
}

/** Dias de calendário entre duas datas AAAA-MM-DD (b − a). */
function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS);
}

/**
 * Situação de prazo da restrição na data de referência:
 *  - vencida: pendente com data limite anterior a hoje (dias_atraso > 0);
 *  - dias_para_vencer: pendente com prazo futuro (0 = vence hoje);
 *  - bloqueia_inicio: a data limite cai depois do início programado da atividade.
 */
function enriquecerRestricao(restricao, { hoje, inicioAtividade }) {
  const pendente = restricao.status === 'PENDENTE';
  const limite = restricao.data_limite || null;
  const diasAteLimite = pendente && limite ? diasEntre(hoje, limite) : null;
  return {
    ...restricao,
    vencida: Boolean(pendente && limite && limite < hoje),
    dias_atraso: pendente && limite && limite < hoje ? -diasAteLimite : 0,
    dias_para_vencer: diasAteLimite !== null && diasAteLimite >= 0 ? diasAteLimite : null,
    sem_prazo: pendente && !limite,
    bloqueia_inicio: Boolean(pendente && limite && inicioAtividade && limite > inicioAtividade),
  };
}

/** Restrições que valem para a atividade: mesmo EDT ou EDT de um ancestral. */
function restricoesDaAtividade(atividade, restricoesPorCodigo) {
  const segmentos = atividade.codigo_atividade.split('.');
  const resultado = [];
  for (let tamanho = segmentos.length; tamanho >= 1; tamanho -= 1) {
    const codigo = segmentos.slice(0, tamanho).join('.');
    (restricoesPorCodigo.get(codigo) || []).forEach((restricao) =>
      resultado.push({ ...restricao, herdada: codigo !== atividade.codigo_atividade, herdada_de: codigo !== atividade.codigo_atividade ? codigo : null })
    );
  }
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Versões                                                                    */
/* -------------------------------------------------------------------------- */

async function garantirObra(obraIdParam) {
  const obraId = Number(obraIdParam);
  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw new AppError(400, 'O parâmetro "obraId" deve ser um número inteiro positivo.');
  }
  if (!(await obraRepository.existsById(obraId))) {
    throw new AppError(404, `Obra ${obraId} não encontrada.`);
  }
  return obraId;
}

async function versaoAnalisada(obraId, versaoId) {
  if (versaoId && !UUID.test(String(versaoId))) {
    throw new AppError(400, 'O parâmetro "versao_id" deve ser o UUID de uma versão do cronograma.');
  }
  const versoes = await cronogramaRepository.listarVersoesLeves(obraId);
  if (!versoes.length) {
    throw new AppError(404, 'A obra ainda não possui cronograma enviado. Envie o cronograma para montar o lookahead.');
  }
  const versao = versaoId ? versoes.find((v) => v.id === versaoId) : versoes[versoes.length - 1];
  if (!versao) throw new AppError(404, 'Versão de cronograma não encontrada para esta obra.');
  return { versao, versoes };
}

/* -------------------------------------------------------------------------- */
/* PPC                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * PPC das semanas anteriores ao horizonte. O "plano" de cada semana é a última
 * revisão enviada antes do início dela (término programado); sem revisão
 * anterior, usa-se o término da linha de base da versão analisada.
 */
async function calcularPpc(semanasPassadas, versoes, versaoAtual, folhasAtuais) {
  const concluidas = new Set(
    folhasAtuais.filter((a) => Number(a.avanco_fisico_real) >= 100).map((a) => a.codigo_atividade)
  );
  const cache = new Map([[versaoAtual.id, folhasAtuais]]);
  const folhasDa = async (versao) => {
    if (!cache.has(versao.id)) {
      const atividades = await lookaheadRepository.listarAtividades(versao.id);
      cache.set(versao.id, atividades.filter((a) => !a.resumo));
    }
    return cache.get(versao.id);
  };

  const semanas = [];
  for (const semana of semanasPassadas) {
    const anteriores = versoes.filter(
      (v) => v.numero_revisao <= versaoAtual.numero_revisao && instante(v.data_snapshot) <= semana.inicio
    );
    const plano = anteriores[anteriores.length - 1] || null;
    // eslint-disable-next-line no-await-in-loop
    const folhasPlano = plano ? await folhasDa(plano) : folhasAtuais;
    const campo = plano ? 'data_fim' : 'data_fim_lb';

    const planejadas = folhasPlano.filter((a) => {
      const fim = instante(a[campo]);
      return fim && fim >= semana.inicio && fim < semana.fim;
    });
    const concluidasNaSemana = planejadas.filter((a) => concluidas.has(a.codigo_atividade));
    semanas.push({
      semana_iso: semana.semana_iso,
      ano: semana.ano,
      inicio: semana.inicio_data,
      fim: semana.fim_data,
      fonte_plano: plano ? plano.versao : 'linha_base',
      planejadas: planejadas.length,
      concluidas: concluidasNaSemana.length,
      ppc: percentual(concluidasNaSemana.length, planejadas.length),
      nao_concluidas: planejadas
        .filter((a) => !concluidas.has(a.codigo_atividade))
        .map((a) => ({ codigo_atividade: a.codigo_atividade, descricao: a.descricao })),
    });
  }

  const planejadas = semanas.reduce((total, s) => total + s.planejadas, 0);
  const feitas = semanas.reduce((total, s) => total + s.concluidas, 0);
  const ultima = [...semanas].reverse().find((s) => s.ppc !== null) || null;
  return {
    ppc_ultima_semana: ultima ? ultima.ppc : null,
    ppc_medio: percentual(feitas, planejadas),
    semanas,
  };
}

/* -------------------------------------------------------------------------- */
/* GET /api/obras/:obraId/lookahead                                           */
/* -------------------------------------------------------------------------- */

/**
 * Query: data_referencia (AAAA-MM-DD, padrão hoje), versao_id (UUID, padrão a
 * revisão mais recente).
 */
async function obterLookahead(obraIdParam, query = {}) {
  const obraId = await garantirObra(obraIdParam);
  const referencia = dataReferenciaDe(query.data_referencia);
  const { versao, versoes } = await versaoAnalisada(obraId, query.versao_id);

  const [atividades, restricoes] = await Promise.all([
    lookaheadRepository.listarAtividades(versao.id),
    lookaheadRepository.listarRestricoes(obraId),
  ]);

  const porCodigo = new Map(atividades.map((a) => [a.codigo_atividade, a]));
  const folhas = atividades.filter((a) => !a.resumo);

  // Frente de serviço = 2º nível abaixo da raiz (ex.: "EXECUÇÃO MECÂNICA - SPCI").
  const frenteDe = (atividade) => {
    const trilha = [];
    let pai = atividade.codigo_pai ? porCodigo.get(atividade.codigo_pai) : null;
    while (pai && pai.nivel > 1) {
      trilha.unshift(pai.descricao);
      pai = pai.codigo_pai ? porCodigo.get(pai.codigo_pai) : null;
    }
    return trilha[1] || trilha[0] || null;
  };

  const restricoesPorCodigo = new Map();
  restricoes.forEach((restricao) => {
    if (!restricoesPorCodigo.has(restricao.codigo_atividade)) restricoesPorCodigo.set(restricao.codigo_atividade, []);
    restricoesPorCodigo.get(restricao.codigo_atividade).push(restricao);
  });

  const primeiraSegunda = segundaDaSemana(referencia);
  const semanas = montarSemanas(primeiraSegunda, SEMANAS);
  const inicioHorizonte = semanas[0].inicio;
  const fimHorizonte = semanas[SEMANAS - 1].fim;
  const hoje = dataLocal(referencia);

  // ------------------------------------------- Atividades do horizonte
  const noHorizonte = folhas
    .filter((a) => Number(a.avanco_fisico_real) < 100)
    .filter((a) => {
      const inicio = instante(a.data_inicio);
      const fim = instante(a.data_fim);
      return inicio && fim && inicio < fimHorizonte && fim >= inicioHorizonte;
    })
    .map((a) => {
      const inicioAtividade = dataLocal(instante(a.data_inicio));
      const aplicaveis = restricoesDaAtividade(a, restricoesPorCodigo).map((r) =>
        enriquecerRestricao(r, { hoje, inicioAtividade })
      );
      // Pendentes primeiro (vencidas no topo), baixadas depois.
      aplicaveis.sort(
        (x, y) =>
          Number(y.status === 'PENDENTE') - Number(x.status === 'PENDENTE') ||
          Number(y.vencida) - Number(x.vencida) ||
          String(x.data_limite || '9999').localeCompare(String(y.data_limite || '9999'))
      );
      const pendentes = aplicaveis.filter((r) => r.status === 'PENDENTE');
      return {
        id: a.id,
        codigo_atividade: a.codigo_atividade,
        descricao: a.descricao,
        frente: frenteDe(a),
        inicio: a.data_inicio,
        termino: a.data_fim,
        inicio_lb: a.data_inicio_lb,
        termino_lb: a.data_fim_lb,
        avanco_fisico_previsto: a.avanco_fisico_previsto,
        avanco_fisico_real: a.avanco_fisico_real,
        caminho_critico: a.caminho_critico,
        folga_total_dias: a.folga_total_dias,
        recursos_mao_de_obra: Array.isArray(a.recursos_mao_de_obra) ? a.recursos_mao_de_obra : [],
        recursos_equipamentos: Array.isArray(a.recursos_equipamentos) ? a.recursos_equipamentos : [],
        status_liberacao: pendentes.length ? 'BLOQUEADA' : 'LIBERADA',
        restricoes_pendentes: pendentes.length,
        restricoes_baixadas: aplicaveis.length - pendentes.length,
        /** Restrição pendente com data limite já vencida. */
        restricao_vencida: pendentes.some((r) => r.vencida),
        restricoes_vencidas: pendentes.filter((r) => r.vencida).length,
        /** Restrição pendente cuja data limite é posterior ao início programado. */
        restricao_apos_inicio: pendentes.some((r) => r.bloqueia_inicio),
        /** Bloqueada e com ao menos uma restrição fora do prazo. */
        bloqueio_vencido: pendentes.some((r) => r.vencida),
        restricoes: aplicaveis,
      };
    });

  const semanasResposta = semanas.map((semana, indice) => {
    const itens = noHorizonte
      .filter((a) => instante(a.inicio) < semana.fim && instante(a.termino) >= semana.inicio)
      .map((a) => ({
        ...a,
        inicia_na_semana: instante(a.inicio) >= semana.inicio,
        termina_na_semana: instante(a.termino) < semana.fim,
      }));
    const liberadas = itens.filter((a) => a.status_liberacao === 'LIBERADA').length;
    return {
      numero: indice + 1,
      rotulo: `Semana ${indice + 1}`,
      semana_iso: semana.semana_iso,
      ano: semana.ano,
      inicio: semana.inicio_data,
      fim: semana.fim_data,
      total: itens.length,
      liberadas,
      bloqueadas: itens.length - liberadas,
      bloqueadas_vencidas: itens.filter((a) => a.bloqueio_vencido).length,
      restricoes_pendentes: itens.reduce((t, a) => t + a.restricoes_pendentes, 0),
      percentual_liberado: percentual(liberadas, itens.length),
      /** Atividades que terminam na semana: compromissos que entram no PPC. */
      compromissos: itens.filter((a) => a.termina_na_semana).length,
      criticas: itens.filter((a) => a.caminho_critico).length,
      atividades: itens,
    };
  });

  // --------------------------------------------------------------- PPC
  const ppc = await calcularPpc(montarSemanas(primeiraSegunda, SEMANAS_PPC, -SEMANAS_PPC), versoes, versao, folhas);

  // ------------------------------------------------------------ Resumo
  const liberadas = noHorizonte.filter((a) => a.status_liberacao === 'LIBERADA').length;
  const pendentes = restricoes.filter((r) => r.status === 'PENDENTE');
  const codigosAtuais = new Set(porCodigo.keys());
  const porTipo = Object.fromEntries(TIPOS.map((tipo) => [tipo, pendentes.filter((r) => r.tipo === tipo).length]));

  return {
    obra_id: obraId,
    versao: { id: versao.id, versao: versao.versao, numero_revisao: versao.numero_revisao, data_snapshot: versao.data_snapshot },
    data_referencia: hoje,
    horizonte: { inicio: semanas[0].inicio_data, fim: semanas[SEMANAS - 1].fim_data, semanas: SEMANAS },
    resumo: {
      atividades_no_horizonte: noHorizonte.length,
      liberadas,
      bloqueadas: noHorizonte.length - liberadas,
      percentual_liberado: percentual(liberadas, noHorizonte.length),
      criticas_bloqueadas: noHorizonte.filter((a) => a.caminho_critico && a.status_liberacao === 'BLOQUEADA').length,
      restricoes_pendentes: pendentes.length,
      restricoes_vencidas: pendentes.filter((r) => r.data_limite && r.data_limite < hoje).length,
      atividades_bloqueadas_vencidas: noHorizonte.filter((a) => a.bloqueio_vencido).length,
      restricoes_pendentes_por_tipo: porTipo,
      /** Restrições cujo EDT não existe mais na versão analisada. */
      restricoes_sem_atividade: restricoes.filter((r) => !codigosAtuais.has(r.codigo_atividade)).length,
      ppc_ultima_semana: ppc.ppc_ultima_semana,
      ppc_medio_4_semanas: ppc.ppc_medio,
    },
    semanas: semanasResposta,
    ppc,
  };
}

/* -------------------------------------------------------------------------- */
/* POST /api/obras/:obraId/restricoes (restrição de atividade)                */
/* -------------------------------------------------------------------------- */

/** O corpo é de uma restrição de atividade do lookahead (e não do painel)? */
function ehRestricaoDeAtividade(payload = {}) {
  return Boolean(payload.atividade_id || payload.atividadeId || payload.codigo_atividade || UUID.test(String(payload.id || '')));
}

function enumDe(valor, permitidos, sinonimos, campo) {
  const chave = chaveEnum(valor);
  const normalizado = permitidos.includes(chave) ? chave : sinonimos[chave];
  if (!normalizado) {
    throw new AppError(400, `O campo "${campo}" deve ser um dos valores: ${permitidos.join(', ')}.`);
  }
  return normalizado;
}

function textoOpcional(valor, max) {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const texto = String(valor).trim();
  return texto ? texto.slice(0, max) : null;
}

function dataLimiteDe(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || String(valor).trim() === '') return null;
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const data = match ? new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`) : null;
  if (!data || Number.isNaN(data.getTime())) {
    throw new AppError(400, 'O campo "data_limite" deve estar no formato AAAA-MM-DD.');
  }
  return data;
}

/** Campos comuns de criação/edição (undefined = não alterar). */
function camposEditaveis(payload) {
  const dados = {};
  if (payload.tipo !== undefined) dados.tipo = enumDe(payload.tipo, TIPOS, SINONIMOS_TIPO, 'tipo');
  if (payload.descricao !== undefined) {
    const descricao = textoOpcional(payload.descricao, 2000);
    if (!descricao) throw new AppError(400, 'O campo "descricao" não pode ficar vazio.');
    dados.descricao = descricao;
  }
  const responsavel = textoOpcional(payload.responsavel, 255);
  if (responsavel !== undefined) dados.responsavel = responsavel;
  const planoAcao = textoOpcional(payload.plano_acao ?? payload.planoAcao, 4000);
  if (planoAcao !== undefined) dados.plano_acao = planoAcao;
  const limite = dataLimiteDe(payload.data_limite ?? payload.dataLimite);
  if (limite !== undefined) dados.data_limite = limite;
  if (payload.status !== undefined) {
    dados.status = enumDe(payload.status, STATUS, SINONIMOS_STATUS, 'status');
    dados.data_baixa = dados.status === 'BAIXADA' ? new Date() : null;
  }
  return dados;
}

/**
 * Cadastra (sem `id`) ou atualiza (com `id`) uma restrição de atividade.
 * Cadastro: `atividade_id` (UUID) ou `codigo_atividade` (+ `versao_id` opcional,
 * padrão a revisão mais recente), `tipo`, `descricao`; opcionais `responsavel`,
 * `plano_acao`, `data_limite` (AAAA-MM-DD) e `status`.
 */
async function salvarRestricao(obraIdParam, payload = {}, usuario) {
  if (!usuario || !PERFIS_ESCRITA.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_ESCRITA.join(', ')} podem cadastrar restrições.`);
  }
  const obraId = await garantirObra(obraIdParam);

  // -------------------------------------------------------- Atualização
  if (payload.id !== undefined && payload.id !== null && payload.id !== '') {
    if (!UUID.test(String(payload.id))) throw new AppError(400, 'O "id" da restrição deve ser um UUID.');
    const existente = await lookaheadRepository.buscarRestricao(payload.id);
    if (!existente || existente.obra_id !== obraId) {
      throw new AppError(404, 'Restrição não encontrada para esta obra.');
    }
    const dados = camposEditaveis(payload);
    if (dados.status && dados.status === existente.status) delete dados.data_baixa; // mantém a data original
    if (!Object.keys(dados).length) {
      throw new AppError(
        400,
        'Informe ao menos um campo para atualizar (status, descricao, tipo, responsavel, plano_acao, data_limite).'
      );
    }
    return { criada: false, restricao: await lookaheadRepository.atualizarRestricao(payload.id, dados) };
  }

  // ------------------------------------------------------------ Cadastro
  let atividade = null;
  const atividadeId = payload.atividade_id ?? payload.atividadeId;
  if (atividadeId) {
    if (!UUID.test(String(atividadeId))) throw new AppError(400, 'O campo "atividade_id" deve ser um UUID.');
    atividade = await lookaheadRepository.buscarAtividade(atividadeId);
  } else if (payload.codigo_atividade) {
    const { versao } = await versaoAnalisada(obraId, payload.versao_id);
    atividade = await lookaheadRepository.buscarAtividadePorCodigo(versao.id, String(payload.codigo_atividade).trim());
  } else {
    throw new AppError(400, 'Informe a atividade da restrição: "atividade_id" ou "codigo_atividade".');
  }
  if (!atividade || atividade.versao.obra_id !== obraId) {
    throw new AppError(404, 'Atividade do cronograma não encontrada para esta obra.');
  }

  if (payload.tipo === undefined) throw new AppError(400, `Informe o "tipo" da restrição: ${TIPOS.join(', ')}.`);
  if (payload.descricao === undefined) throw new AppError(400, 'Informe a "descricao" da restrição.');
  const dados = camposEditaveis(payload);
  if (!dados.status) {
    dados.status = 'PENDENTE';
    dados.data_baixa = null;
  }

  const restricao = await lookaheadRepository.criarRestricao({
    ...dados,
    obra_id: obraId,
    atividade_id: atividade.id,
    codigo_atividade: atividade.codigo_atividade,
    criado_por: usuario.id ?? null,
  });
  return { criada: true, restricao: { ...restricao, atividade_descricao: atividade.descricao } };
}

module.exports = {
  obterLookahead,
  salvarRestricao,
  ehRestricaoDeAtividade,
  TIPOS,
  STATUS,
};

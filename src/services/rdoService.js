'use strict';

const AppError = require('../errors/AppError');
const cloudinary = require('../config/cloudinary');
const uploadService = require('./uploadService');
const repo = require('../repositories/rdoRepository');
const { escolherPercentualVigente, diaBrasilia } = require('../utils/avancoAtividade');
const { totalHH, hhDoLancamento, esperaPtsMinutos, totalDesvios, normalizarPercentual, arredondar } = require('../utils/rdoCalculos');

/**
 * RDO — Relatório Diário de Obra.
 *
 * O RDO é sempre de UMA obra em andamento, lançado de dentro dela (1 por obra, por dia, por encarregado).
 * Fluxo: RASCUNHO → FINALIZADO (encarregado assina) → APROVADO | DEVOLVIDO (→ FINALIZADO de novo).
 * Só ao aprovar o avanço entra em `avanco_atividade_aprovado`; o % vigente de uma atividade é o mais
 * recente entre esse histórico e a última revisão do cronograma (utils/avancoAtividade).
 *
 * Ordem do formulário: identificação (encarregado e supervisor), DSS, efetivo do dia, atividades
 * (mão de obra só do efetivo), equipamentos, PTS e desvios.
 */

const PERFIS_CAMPO = ['ENCARREGADO', 'ADMIN'];
const PERFIS_VALIDADORES = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const STATUS_EDITAVEIS = ['RASCUNHO', 'DEVOLVIDO'];
const STATUS_VALIDOS = ['RASCUNHO', 'FINALIZADO', 'APROVADO', 'DEVOLVIDO'];
const LIMITE_FOTOS_POR_ATIVIDADE = 12;
const PASTA_FOTOS = `${process.env.CLOUDINARY_FOLDER_RDO || 'synapse/rdo'}`;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/* -------------------------------------------------------------------------- */
/* Helpers de validação                                                       */
/* -------------------------------------------------------------------------- */

const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
const tem = (obj, campo) => Object.prototype.hasOwnProperty.call(obj, campo);

function idValido(valor, campo = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, `O campo "${campo}" deve ser um número inteiro positivo.`);
  return n;
}

function texto(valor, campo, max, { obrigatorio = false } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw new AppError(400, `O campo "${campo}" é obrigatório.`);
    return null;
  }
  const t = String(valor).trim();
  if (t.length > max) throw new AppError(400, `O campo "${campo}" aceita no máximo ${max} caracteres.`);
  return t;
}

function dataDia(valor, campo) {
  const t = String(valor ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(new Date(`${t}T00:00:00Z`).getTime())) {
    throw new AppError(400, `O campo "${campo}" deve ser uma data no formato AAAA-MM-DD.`);
  }
  return new Date(`${t}T00:00:00Z`);
}

function horas(valor, campo, { minimo = 0 } = {}) {
  const n = Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < minimo || n > 24 || (minimo > 0 && n === 0)) {
    throw new AppError(400, `O campo "${campo}" deve ser um número de horas entre ${minimo > 0 ? 'mais de 0' : '0'} e 24.`);
  }
  return arredondar(n, 2);
}

/** "HH:MM" no dia do RDO (horário de Brasília) → instante. */
function horaParaInstante(dia, hora, campo) {
  if (!HORA.test(String(hora ?? ''))) throw new AppError(400, `O campo "${campo}" deve ser uma hora no formato HH:MM.`);
  return new Date(`${dia}T${hora}:00-03:00`);
}

/** Instante → "HH:MM" no horário de Brasília. */
function instanteParaHora(valor) {
  if (!valor) return null;
  return new Date(new Date(valor).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16);
}

function exigirPerfil(usuario, perfis, acao) {
  if (!usuario?.perfil) throw new AppError(401, 'Usuário não autenticado.');
  if (!perfis.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${perfis.join(', ')} podem ${acao}.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Escopo por obra                                                            */
/* -------------------------------------------------------------------------- */

/** Ids de obra que o usuário enxerga/lança; `null` = todas (ADMIN e SUPERVISOR). */
async function escopoDeObras(usuario) {
  if (usuario.perfil === 'ADMIN' || usuario.perfil === 'SUPERVISOR') return null;
  if (usuario.perfil === 'ENCARREGADO') return repo.obraIdsDoEncarregado(usuario.id);
  if (usuario.perfil === 'PLANEJADOR') return repo.obraIdsDoPlanejador(usuario.id);
  throw new AppError(403, 'Seu perfil não tem acesso ao RDO.');
}

function garantirObrasNoEscopo(escopo, obraIds) {
  if (escopo === null) return;
  const fora = obraIds.find((id) => !escopo.includes(id));
  if (fora !== undefined) throw new AppError(403, `Você não está vinculado à obra ${fora}.`);
}

/** O RDO só é lançado em obra em andamento. */
function exigirObraEmAndamento(obra) {
  if (obra.status !== 'EM_ANDAMENTO') {
    throw new AppError(409, 'O RDO só pode ser lançado em obra em andamento.');
  }
}

/* -------------------------------------------------------------------------- */
/* % vigente da atividade                                                     */
/* -------------------------------------------------------------------------- */

/**
 * % vigente de uma atividade (o mais recente entre RDO aprovado e cronograma).
 * `versao` e `atividadeCronograma` podem vir prontos para evitar consultas repetidas.
 */
async function percentualVigente(obraId, codigo, { client = repo.prisma, versao, atividadeCronograma } = {}) {
  const v = versao === undefined ? await repo.ultimaVersao(obraId, client) : versao;
  const ativ = atividadeCronograma !== undefined
    ? atividadeCronograma
    : v ? await repo.atividadeNaVersao(v.id, codigo, client) : null;
  const aprovado = await repo.ultimoAvancoAprovado(obraId, codigo, client);
  return escolherPercentualVigente({
    aprovado: aprovado ? { percentual: aprovado.percentual, data: aprovado.data } : null,
    cronograma: ativ && v ? { percentual: ativ.avanco_fisico_real, data: v.data_snapshot } : null,
  });
}

/* -------------------------------------------------------------------------- */
/* Consultas de apoio ao formulário                                           */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/rdos/obras — obras do escopo do usuário. O encarregado só vê as obras EM ANDAMENTO a que
 * está vinculado (é onde ele pode lançar RDO). Traz o supervisor do último RDO da obra como sugestão.
 */
async function listarObras(usuario) {
  const escopo = await escopoDeObras(usuario);
  let obras = await repo.obrasPorIds(escopo);
  if (usuario.perfil === 'ENCARREGADO') obras = obras.filter((o) => o.status === 'EM_ANDAMENTO');
  const supervisores = await repo.ultimosSupervisores(obras.map((o) => o.id));
  return obras.map((o) => ({
    id: o.id,
    contrato_id: o.contrato_id,
    status: o.status,
    ss: o.orcamento?.ss ?? null,
    pep: o.orcamento?.pep ?? null,
    descricao: o.orcamento?.descricao ?? null,
    cliente: o.orcamento?.cliente ?? null,
    supervisor_padrao: supervisores.get(o.id) || null,
  }));
}

/** GET /api/rdo-cadastros/supervisores — usuários Supervisor ativos (lista do campo "supervisor"). */
async function listarSupervisores() {
  return repo.supervisoresAtivos();
}

/** GET /api/rdos/obras/:obraId/atividades — atividades-folha da revisão vigente, com o % vigente. */
async function listarAtividadesDaObra(obraIdParam, usuario) {
  const obraId = idValido(obraIdParam, 'obraId');
  const escopo = await escopoDeObras(usuario);
  garantirObrasNoEscopo(escopo, [obraId]);

  const versao = await repo.ultimaVersao(obraId);
  if (!versao) return { versao: null, atividades: [] };

  const [folhas, avancos] = await Promise.all([repo.folhasDaVersao(versao.id), repo.ultimosAvancosDaObra(obraId)]);
  const atividades = folhas.map((f) => {
    const aprovado = avancos.get(f.codigo_atividade);
    const vigente = escolherPercentualVigente({
      aprovado: aprovado ? { percentual: aprovado.percentual, data: aprovado.data } : null,
      cronograma: { percentual: f.avanco_fisico_real, data: versao.data_snapshot },
    });
    const percentual = arredondar(vigente.percentual, 2);
    return {
      codigo_atividade: f.codigo_atividade,
      codigo_pai: f.codigo_pai,
      descricao: f.descricao,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
      percentual_vigente: percentual,
      concluida: percentual >= 100,
      origem_percentual: vigente.origem,
    };
  });
  return { versao: { id: versao.id, versao: versao.versao, data_snapshot: versao.data_snapshot }, atividades };
}

/**
 * GET /api/obras/:id/avanco-rdo — avanço físico da obra com o que os RDOs aprovados já apuraram.
 * Pondera as atividades-folha da revisão vigente pela duração (como o MS Project) e compara o %
 * do cronograma com o % vigente (o mais recente entre RDO aprovado e cronograma).
 */
async function resumoAvancoDaObra(obraIdParam) {
  const obraId = idValido(obraIdParam, 'obraId');
  if (!(await repo.prisma.obra.findUnique({ where: { id: obraId }, select: { id: true } }))) {
    throw new AppError(404, `Obra ${obraId} não encontrada.`);
  }
  const versao = await repo.ultimaVersao(obraId);
  if (!versao) return { obra_id: obraId, versao: null, percentual_cronograma: null, percentual_com_rdo: null, atividades_total: 0, atividades_com_rdo: 0, ultimo_rdo_aprovado_em: null, atualizadas: [] };

  const [folhas, avancos] = await Promise.all([repo.folhasDaVersao(versao.id), repo.ultimosAvancosDaObra(obraId)]);
  let pesoTotal = 0;
  let somaCronograma = 0;
  let somaVigente = 0;
  let ultimo = null;
  const atualizadas = [];

  folhas.forEach((f) => {
    const duracao = Number(f.dados_origem?.duracao_dias);
    const peso = Number.isFinite(duracao) && duracao > 0 ? duracao : 1;
    const noCronograma = Number(f.avanco_fisico_real) || 0;
    const aprovado = avancos.get(f.codigo_atividade);
    const vigente = escolherPercentualVigente({
      aprovado: aprovado ? { percentual: aprovado.percentual, data: aprovado.data } : null,
      cronograma: { percentual: noCronograma, data: versao.data_snapshot },
    });
    pesoTotal += peso;
    somaCronograma += peso * noCronograma;
    somaVigente += peso * vigente.percentual;
    if (vigente.origem === 'RDO') {
      atualizadas.push({
        codigo_atividade: f.codigo_atividade,
        descricao: f.descricao,
        percentual_cronograma: arredondar(noCronograma, 2),
        percentual_vigente: arredondar(vigente.percentual, 2),
        data: vigente.data,
      });
      if (!ultimo || vigente.data > ultimo) ultimo = vigente.data;
    }
  });

  atualizadas.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  return {
    obra_id: obraId,
    versao: { id: versao.id, versao: versao.versao, data_snapshot: versao.data_snapshot },
    percentual_cronograma: pesoTotal ? arredondar(somaCronograma / pesoTotal, 2) : null,
    percentual_com_rdo: pesoTotal ? arredondar(somaVigente / pesoTotal, 2) : null,
    atividades_total: folhas.length,
    atividades_com_rdo: atualizadas.length,
    ultimo_rdo_aprovado_em: ultimo,
    atualizadas: atualizadas.slice(0, 10),
  };
}

/* -------------------------------------------------------------------------- */
/* Montagem e validação do corpo do RDO                                       */
/* -------------------------------------------------------------------------- */

/** Campos simples do cabeçalho (clima, DSS, comentário, PTS necessária). */
function camposDoCabecalho(payload, { parcial }) {
  const dados = {};
  const mapa = [
    ['clima_manha', 40],
    ['clima_tarde', 40],
    ['clima_noite', 40],
    ['dss_tema', 200],
    ['comentario_geral', 5000],
  ];
  mapa.forEach(([campo, max]) => {
    if (!parcial || tem(payload, campo)) dados[campo] = texto(payload[campo], campo, max);
  });
  if (!parcial || tem(payload, 'dss_participantes')) {
    if (vazio(payload.dss_participantes)) dados.dss_participantes = null;
    else {
      const n = Number(payload.dss_participantes);
      if (!Number.isInteger(n) || n < 0 || n > 10000) throw new AppError(400, 'O campo "dss_participantes" deve ser um inteiro entre 0 e 10000.');
      dados.dss_participantes = n;
    }
  }
  if (!parcial || tem(payload, 'pts_necessaria')) {
    const v = payload.pts_necessaria;
    if (vazio(v)) dados.pts_necessaria = null;
    else if (v === true || v === 'true') dados.pts_necessaria = true;
    else if (v === false || v === 'false') dados.pts_necessaria = false;
    else throw new AppError(400, 'O campo "pts_necessaria" deve ser true, false ou vazio.');
  }
  return dados;
}

/** Confere catálogos citados (existem e estão ativos). */
async function garantirCatalogo(client, modelo, ids, rotulo) {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return;
  const achados = await client[modelo].findMany({ where: { id: { in: unicos }, ativo: true }, select: { id: true } });
  const faltando = unicos.filter((id) => !achados.some((a) => a.id === id));
  if (faltando.length) throw new AppError(400, `${rotulo} inexistente ou inativo(a): ${faltando.join(', ')}.`);
}

/** Supervisor da obra: precisa ser um usuário Supervisor ativo. */
async function validarSupervisor(client, valor) {
  if (vazio(valor)) return null;
  const id = idValido(valor, 'supervisor_id');
  const u = await client.usuario.findUnique({ where: { id }, select: { id: true, perfil: true, ativo: true, excluido_em: true } });
  if (!u || u.excluido_em || u.ativo === false || u.perfil !== 'SUPERVISOR') {
    throw new AppError(400, 'O supervisor informado não existe, está inativo ou não tem o perfil Supervisor.');
  }
  return id;
}

/** Efetivo do dia: pessoas por função (quantidade) ou nominais (colaborador cadastrado). */
async function prepararEfetivo(client, lista) {
  if (!Array.isArray(lista)) throw new AppError(400, 'O campo "efetivo" deve ser uma lista.');
  const itens = lista.map((e, i) => {
    const rot = `efetivo[${i}]`;
    const tipo = String(e?.tipo || '').toUpperCase();
    if (!['FUNCAO', 'NOMINAL'].includes(tipo)) throw new AppError(400, `${rot}.tipo deve ser FUNCAO ou NOMINAL.`);
    if (tipo === 'FUNCAO') {
      const qtd = Number(String(e.quantidade ?? 1).replace(',', '.'));
      if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 999) throw new AppError(400, `${rot}.quantidade deve ser maior que 0.`);
      return { tipo, funcao_id: idValido(e.funcao_id, `${rot}.funcao_id`), colaborador_id: null, quantidade: arredondar(qtd, 2) };
    }
    return { tipo, funcao_id: null, colaborador_id: idValido(e.colaborador_id, `${rot}.colaborador_id`), quantidade: 1 };
  });
  const chaves = itens.map((e) => (e.tipo === 'FUNCAO' ? `F${e.funcao_id}` : `N${e.colaborador_id}`));
  const repetida = chaves.find((c, i) => chaves.indexOf(c) !== i);
  if (repetida) throw new AppError(400, 'O efetivo tem a mesma função ou o mesmo colaborador mais de uma vez.');
  await garantirCatalogo(client, 'funcaoMaoObra', itens.map((e) => e.funcao_id).filter(Boolean), 'Função');
  await garantirCatalogo(client, 'colaborador', itens.map((e) => e.colaborador_id).filter(Boolean), 'Colaborador');
  return itens;
}

function montarMaoObra(lista, prefixo) {
  if (lista === undefined || lista === null) return [];
  if (!Array.isArray(lista)) throw new AppError(400, `${prefixo}.mao_obra deve ser uma lista.`);
  return lista.map((item, i) => {
    const rot = `${prefixo}.mao_obra[${i}]`;
    const tipo = String(item?.tipo || '').toUpperCase();
    if (!['FUNCAO', 'NOMINAL'].includes(tipo)) throw new AppError(400, `${rot}.tipo deve ser FUNCAO ou NOMINAL.`);
    if (tipo === 'FUNCAO') {
      const qtd = Number(String(item.quantidade ?? 1).replace(',', '.'));
      if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 999) throw new AppError(400, `${rot}.quantidade deve ser maior que 0.`);
      return { tipo, funcao_id: idValido(item.funcao_id, `${rot}.funcao_id`), colaborador_id: null, quantidade: arredondar(qtd, 2), horas: horas(item.horas, `${rot}.horas`) };
    }
    return { tipo, funcao_id: null, colaborador_id: idValido(item.colaborador_id, `${rot}.colaborador_id`), quantidade: 1, horas: horas(item.horas, `${rot}.horas`) };
  });
}

/**
 * A mão de obra de cada atividade só pode citar gente do efetivo do dia: por função (até a quantidade
 * presente) ou nominal (o colaborador precisa estar no efetivo). Ninguém passa de 24 h no dia.
 * `listas` = mão de obra de cada atividade (cada item com tipo/funcao_id/colaborador_id/quantidade/horas).
 */
function validarMaoObraContraEfetivo(efetivo, listas) {
  const funcoes = new Map(efetivo.filter((e) => e.tipo === 'FUNCAO').map((e) => [e.funcao_id, Number(e.quantidade)]));
  const nominais = new Set(efetivo.filter((e) => e.tipo === 'NOMINAL').map((e) => e.colaborador_id));
  const horasPorPessoa = new Map();

  listas.forEach((lista) => {
    const porFuncaoNaAtividade = new Map();
    lista.forEach((m) => {
      if (m.tipo === 'FUNCAO') {
        if (!funcoes.has(m.funcao_id)) throw new AppError(400, 'A mão de obra cita uma função que não está no efetivo do dia. Adicione-a ao efetivo primeiro.');
        const total = (porFuncaoNaAtividade.get(m.funcao_id) || 0) + Number(m.quantidade);
        if (total > funcoes.get(m.funcao_id)) throw new AppError(400, 'A mão de obra de uma atividade tem mais pessoas de uma função do que o efetivo do dia.');
        porFuncaoNaAtividade.set(m.funcao_id, total);
      } else {
        if (!nominais.has(m.colaborador_id)) throw new AppError(400, 'A mão de obra cita um colaborador que não está no efetivo do dia. Adicione-o ao efetivo primeiro.');
        const total = (horasPorPessoa.get(m.colaborador_id) || 0) + Number(m.horas);
        if (total > 24) throw new AppError(400, 'Um colaborador não pode somar mais de 24 horas nas atividades do dia.');
        horasPorPessoa.set(m.colaborador_id, total);
      }
    });
  });
}

/**
 * Valida as atividades do corpo e devolve os dados prontos para gravar, com o % anterior vigente.
 * Regras: EDT existente e folha na revisão vigente da obra (exceto fora de escopo); sem EDT repetido;
 * % entre 0 e 100; recuo de % exige observação; atividade já em 100% não aceita avanço (fica em 100%);
 * atividade fora de escopo exige descrição e justificativa; mão de obra só do efetivo do dia.
 */
async function prepararAtividades(client, lista, { obraId, efetivo }) {
  if (!Array.isArray(lista)) throw new AppError(400, 'O campo "atividades" deve ser uma lista.');

  const itens = lista.map((a, i) => {
    const rot = `atividades[${i}]`;
    const foraDeEscopo = a?.fora_de_escopo === true || a?.fora_de_escopo === 'true';
    const base = {
      id: vazio(a?.id) ? null : idValido(a.id, `${rot}.id`),
      obra_id: obraId,
      fora_de_escopo: foraDeEscopo,
      observacao: texto(a?.observacao, `${rot}.observacao`, 2000),
      mao_obra: montarMaoObra(a?.mao_obra, rot),
    };
    if (foraDeEscopo) {
      return {
        ...base,
        codigo_atividade: null,
        descricao_snapshot: texto(a?.descricao, `${rot}.descricao`, 500, { obrigatorio: true }),
        justificativa: texto(a?.justificativa, `${rot}.justificativa`, 2000, { obrigatorio: true }),
        percentual_declarado: 0,
      };
    }
    const codigo = texto(a?.codigo_atividade, `${rot}.codigo_atividade`, 60, { obrigatorio: true });
    const declarado = vazio(a?.percentual_declarado) ? null : normalizarPercentual(a.percentual_declarado);
    if (declarado === null && !vazio(a?.percentual_declarado)) throw new AppError(400, `${rot}.percentual_declarado deve ser um número entre 0 e 100.`);
    return { ...base, codigo_atividade: codigo, descricao_snapshot: '', justificativa: null, percentual_declarado: declarado };
  });

  const chaves = itens.filter((a) => !a.fora_de_escopo).map((a) => a.codigo_atividade);
  const repetida = chaves.find((c, i) => chaves.indexOf(c) !== i);
  if (repetida) throw new AppError(400, `A atividade ${repetida} aparece mais de uma vez no RDO.`);

  const versao = await repo.ultimaVersao(obraId, client);
  const prontos = [];
  for (const a of itens) {
    if (a.fora_de_escopo) {
      prontos.push({ ...a, percentual_anterior: 0 });
      continue;
    }
    if (!versao) throw new AppError(409, 'A obra ainda não tem cronograma importado.');
    // eslint-disable-next-line no-await-in-loop
    const ativ = await repo.atividadeNaVersao(versao.id, a.codigo_atividade, client);
    if (!ativ) throw new AppError(400, `A atividade ${a.codigo_atividade} não existe no cronograma vigente da obra.`);
    if (ativ.resumo) throw new AppError(400, `A atividade ${a.codigo_atividade} é um agrupamento (resumo); lance o avanço nas atividades filhas.`);
    // eslint-disable-next-line no-await-in-loop
    const vigente = await percentualVigente(obraId, a.codigo_atividade, { client, versao, atividadeCronograma: ativ });
    const anterior = arredondar(vigente.percentual, 2);

    // Atividade concluída: aceita observação, mão de obra e fotos, mas não recebe avanço.
    if (anterior >= 100) {
      prontos.push({ ...a, descricao_snapshot: ativ.descricao, percentual_anterior: anterior, percentual_declarado: 100 });
      continue;
    }
    if (a.percentual_declarado === null) throw new AppError(400, `Informe o % declarado da atividade ${a.codigo_atividade}.`);
    if (a.percentual_declarado < anterior && !a.observacao) {
      throw new AppError(400, `A atividade ${a.codigo_atividade} regride de ${anterior}% para ${a.percentual_declarado}%: explique o motivo na observação.`);
    }
    prontos.push({ ...a, descricao_snapshot: ativ.descricao, percentual_anterior: anterior });
  }

  validarMaoObraContraEfetivo(efetivo, prontos.map((a) => a.mao_obra));
  return prontos;
}

async function prepararEquipamentos(client, lista) {
  if (!Array.isArray(lista)) throw new AppError(400, 'O campo "equipamentos" deve ser uma lista.');
  const itens = lista.map((e, i) => ({
    equipamento_id: idValido(e?.equipamento_id, `equipamentos[${i}].equipamento_id`),
    horas_trabalhadas: horas(e?.horas_trabalhadas ?? 0, `equipamentos[${i}].horas_trabalhadas`),
    horas_paradas: horas(e?.horas_paradas ?? 0, `equipamentos[${i}].horas_paradas`),
    observacao: texto(e?.observacao, `equipamentos[${i}].observacao`, 1000),
  }));
  await garantirCatalogo(client, 'equipamentoCadastro', itens.map((e) => e.equipamento_id), 'Equipamento');
  return itens;
}

/** PTS: só horas (o dia é o do RDO). A liberação pode ficar em aberto se ainda não saiu. */
function prepararPts(lista, dia) {
  if (!Array.isArray(lista)) throw new AppError(400, 'O campo "pts" deve ser uma lista.');
  return lista.map((p, i) => {
    const solicitado = horaParaInstante(dia, p?.hora_solicitacao, `pts[${i}].hora_solicitacao`);
    const liberado = vazio(p?.hora_liberacao) ? null : horaParaInstante(dia, p.hora_liberacao, `pts[${i}].hora_liberacao`);
    if (liberado && liberado < solicitado) throw new AppError(400, `pts[${i}]: a liberação não pode ser anterior à solicitação.`);
    return { numero: texto(p?.numero, `pts[${i}].numero`, 60), solicitado_em: solicitado, liberado_em: liberado };
  });
}

async function prepararDesvios(client, lista) {
  if (!Array.isArray(lista)) throw new AppError(400, 'O campo "desvios" deve ser uma lista.');
  const itens = lista.map((d, i) => ({
    motivo_id: idValido(d?.motivo_id, `desvios[${i}].motivo_id`),
    horas: horas(d?.horas, `desvios[${i}].horas`, { minimo: 0.01 }),
    observacao: texto(d?.observacao, `desvios[${i}].observacao`, 1000),
  }));
  await garantirCatalogo(client, 'motivoDesvio', itens.map((d) => d.motivo_id), 'Motivo de desvio');
  return itens;
}

/* -------------------------------------------------------------------------- */
/* Apresentação                                                               */
/* -------------------------------------------------------------------------- */

/** Atividades fora de escopo entram como desvio automático, em HH da própria atividade. */
function desviosAutomaticos(atividades) {
  return atividades
    .filter((a) => a.fora_de_escopo)
    .map((a) => ({ origem: 'FORA_DE_ESCOPO', atividade_id: a.id, descricao: a.descricao_snapshot, justificativa: a.justificativa, horas: a.hh }));
}

function apresentar(rdo) {
  const atividades = rdo.atividades.map((a) => ({
    ...a,
    hh: totalHH(a.mao_obra),
    mao_obra: a.mao_obra.map((m) => ({ ...m, hh: hhDoLancamento(m) })),
  }));
  const automaticos = desviosAutomaticos(atividades);
  const desvios = totalDesvios(rdo.desvios);
  const horasAutomaticas = arredondar(automaticos.reduce((s, d) => s + Number(d.horas || 0), 0));
  const pts = rdo.pts.map((p) => ({
    ...p,
    hora_solicitacao: instanteParaHora(p.solicitado_em),
    hora_liberacao: instanteParaHora(p.liberado_em),
    espera_minutos: esperaPtsMinutos(p.solicitado_em, p.liberado_em),
  }));
  const pessoas = (rdo.efetivo || []).reduce((s, e) => s + Number(e.quantidade), 0);
  return {
    ...rdo,
    atividades,
    pts,
    desvios_automaticos: automaticos,
    totais: {
      hh: arredondar(atividades.reduce((s, a) => s + a.hh, 0)),
      pessoas: arredondar(pessoas),
      desvios: { ...desvios, total: arredondar(desvios.total + horasAutomaticas), fora_de_escopo: horasAutomaticas },
      espera_pts_minutos: pts.reduce((s, p) => s + (p.espera_minutos || 0), 0),
    },
  };
}

/** Versão enxuta (listagens/resumo): só o que as telas de resumo usam. */
function apresentarResumo(rdo) {
  const completo = apresentar(rdo);
  return {
    id: completo.id,
    obra_id: completo.obra_id,
    data: completo.data,
    status: completo.status,
    encarregado: completo.encarregado,
    supervisor: completo.supervisor,
    pts_necessaria: completo.pts_necessaria,
    pts: completo.pts,
    dss_tema: completo.dss_tema,
    comentario_geral: completo.comentario_geral,
    motivo_devolucao: completo.motivo_devolucao,
    atividades: completo.atividades.map((a) => ({
      id: a.id,
      codigo_atividade: a.codigo_atividade,
      descricao_snapshot: a.descricao_snapshot,
      fora_de_escopo: a.fora_de_escopo,
      justificativa: a.justificativa,
      percentual_anterior: a.percentual_anterior,
      percentual_declarado: a.percentual_declarado,
      percentual_validado: a.percentual_validado,
      hh: a.hh,
      fotos: a.fotos,
    })),
    totais: completo.totais,
  };
}

/** Garante que o usuário pode ver o RDO (escopo do encarregado/planejador). */
async function garantirAcessoLeitura(rdo, usuario) {
  if (usuario.perfil === 'ADMIN' || usuario.perfil === 'SUPERVISOR') return;
  if (usuario.perfil === 'ENCARREGADO') {
    if (rdo.encarregado_id !== usuario.id) throw new AppError(403, 'Este RDO pertence a outro encarregado.');
    return;
  }
  if (usuario.perfil === 'PLANEJADOR') {
    const escopo = await escopoDeObras(usuario);
    if (!escopo.includes(rdo.obra_id)) throw new AppError(403, 'Este RDO não é de uma obra sob o seu planejamento.');
    return;
  }
  throw new AppError(403, 'Seu perfil não tem acesso ao RDO.');
}

async function carregar(idParam) {
  const id = idValido(idParam);
  const rdo = await repo.buscarSimples(id);
  if (!rdo) throw new AppError(404, `RDO ${id} não encontrado.`);
  return rdo;
}

function garantirEditavel(rdo, usuario) {
  exigirPerfil(usuario, PERFIS_CAMPO, 'editar o RDO');
  if (usuario.perfil === 'ENCARREGADO' && rdo.encarregado_id !== usuario.id) {
    throw new AppError(403, 'Este RDO pertence a outro encarregado.');
  }
  if (!STATUS_EDITAVEIS.includes(rdo.status)) {
    throw new AppError(409, `O RDO está ${rdo.status} e não pode mais ser editado.`);
  }
}

function historico(tx, rdoId, de, para, usuarioId, motivo = null) {
  return tx.rdoHistoricoStatus.create({ data: { rdo_id: rdoId, de, para, usuario_id: usuarioId ?? null, motivo } });
}

/* -------------------------------------------------------------------------- */
/* Gravação de atividades (upsert) e seções do RDO                            */
/* -------------------------------------------------------------------------- */

/** Aplica a lista de atividades: atualiza as que têm id, cria as novas e remove as ausentes. */
async function gravarAtividades(tx, rdoId, preparadas) {
  const existentes = await tx.rdoAtividade.findMany({ where: { rdo_id: rdoId }, select: { id: true, fotos: { select: { public_id: true } } } });
  const idsExistentes = new Set(existentes.map((a) => a.id));
  const invalido = preparadas.find((a) => a.id !== null && !idsExistentes.has(a.id));
  if (invalido) throw new AppError(404, `A atividade ${invalido.id} não pertence a este RDO.`);

  const mantidos = new Set(preparadas.filter((a) => a.id !== null).map((a) => a.id));
  const removidos = existentes.filter((a) => !mantidos.has(a.id));
  const fotosOrfas = removidos.flatMap((a) => a.fotos.map((f) => f.public_id).filter(Boolean));
  if (removidos.length) await tx.rdoAtividade.deleteMany({ where: { id: { in: removidos.map((a) => a.id) } } });

  for (const a of preparadas) {
    const dados = {
      obra_id: a.obra_id,
      codigo_atividade: a.codigo_atividade,
      descricao_snapshot: a.descricao_snapshot,
      fora_de_escopo: a.fora_de_escopo,
      justificativa: a.justificativa,
      percentual_anterior: a.percentual_anterior,
      percentual_declarado: a.percentual_declarado,
      observacao: a.observacao,
    };
    let atividadeId = a.id;
    if (a.id === null) {
      // eslint-disable-next-line no-await-in-loop
      atividadeId = (await tx.rdoAtividade.create({ data: { ...dados, rdo_id: rdoId }, select: { id: true } })).id;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await tx.rdoAtividade.update({ where: { id: a.id }, data: dados });
      // eslint-disable-next-line no-await-in-loop
      await tx.rdoMaoObra.deleteMany({ where: { rdo_atividade_id: a.id } });
    }
    if (a.mao_obra.length) {
      // eslint-disable-next-line no-await-in-loop
      await tx.rdoMaoObra.createMany({ data: a.mao_obra.map((m) => ({ ...m, rdo_atividade_id: atividadeId })) });
    }
  }
  return fotosOrfas;
}

async function gravarSecoes(tx, rdoId, { efetivo, equipamentos, pts, desvios }) {
  if (efetivo) {
    await tx.rdoEfetivo.deleteMany({ where: { rdo_id: rdoId } });
    if (efetivo.length) await tx.rdoEfetivo.createMany({ data: efetivo.map((e) => ({ ...e, rdo_id: rdoId })) });
  }
  if (equipamentos) {
    await tx.rdoEquipamento.deleteMany({ where: { rdo_id: rdoId } });
    if (equipamentos.length) await tx.rdoEquipamento.createMany({ data: equipamentos.map((e) => ({ ...e, rdo_id: rdoId })) });
  }
  if (pts) {
    await tx.rdoPts.deleteMany({ where: { rdo_id: rdoId } });
    if (pts.length) await tx.rdoPts.createMany({ data: pts.map((p) => ({ ...p, rdo_id: rdoId })) });
  }
  if (desvios) {
    await tx.rdoDesvio.deleteMany({ where: { rdo_id: rdoId } });
    if (desvios.length) await tx.rdoDesvio.createMany({ data: desvios.map((d) => ({ ...d, rdo_id: rdoId })) });
  }
}

/** Remove imagens do Cloudinary sem derrubar a operação se falhar. */
async function apagarImagens(publicIds) {
  await Promise.all(
    publicIds.filter(Boolean).map((id) =>
      cloudinary.uploader.destroy(id).catch((err) => console.error('[rdo] Falha ao apagar imagem:', err.message))
    )
  );
}

/** "Não necessária" não pode ter PTS lançada: a lista é esvaziada. */
function ajustarPts(ptsNecessaria, pts) {
  if (ptsNecessaria === false) return [];
  return pts;
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/rdos — cria o RDO do dia numa obra em andamento (1 por obra, por dia, por encarregado).
 * Corpo: { obra_id, data?, supervisor_id?, clima_*, dss_*, pts_necessaria?, efetivo?, atividades?,
 *          equipamentos?, pts?, desvios?, comentario_geral? }
 */
async function criar(payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_CAMPO, 'criar RDO');

  const obraId = idValido(payload.obra_id, 'obra_id');
  let encarregadoId = usuario.id;
  if (usuario.perfil === 'ADMIN' && !vazio(payload.encarregado_id)) encarregadoId = idValido(payload.encarregado_id, 'encarregado_id');
  const diaTexto = vazio(payload.data) ? diaBrasilia(new Date()) : String(payload.data).trim();
  const data = dataDia(diaTexto, 'data');

  // O encarregado só lança nas obras a que está vinculado; o admin lança em qualquer uma.
  const escopo = encarregadoId === usuario.id ? await escopoDeObras(usuario) : await repo.obraIdsDoEncarregado(encarregadoId);
  garantirObrasNoEscopo(escopo, [obraId]);
  const cabecalho = camposDoCabecalho(payload, { parcial: false });

  const id = await repo.prisma.$transaction(async (tx) => {
    const obra = await tx.obra.findUnique({ where: { id: obraId }, select: { id: true, status: true, contrato_id: true } });
    if (!obra) throw new AppError(404, `Obra ${obraId} não encontrada.`);
    exigirObraEmAndamento(obra);

    const duplicado = await tx.rdo.findUnique({ where: { uq_rdo_obra_encarregado_dia: { obra_id: obraId, encarregado_id: encarregadoId, data } }, select: { id: true } });
    if (duplicado) throw new AppError(409, `Já existe o RDO ${duplicado.id} deste encarregado nesta obra e data.`, { rdo_id: duplicado.id });

    // Sem supervisor informado, sugere o do último RDO da obra.
    const supervisorId = tem(payload, 'supervisor_id')
      ? await validarSupervisor(tx, payload.supervisor_id)
      : (await repo.ultimosSupervisores([obraId], tx)).get(obraId)?.id ?? null;

    const efetivo = payload.efetivo ? await prepararEfetivo(tx, payload.efetivo) : [];
    const atividades = Array.isArray(payload.atividades) && payload.atividades.length
      ? await prepararAtividades(tx, payload.atividades, { obraId, efetivo })
      : [];
    const equipamentos = payload.equipamentos ? await prepararEquipamentos(tx, payload.equipamentos) : null;
    const pts = payload.pts ? ajustarPts(cabecalho.pts_necessaria, prepararPts(payload.pts, diaTexto)) : null;
    const desvios = payload.desvios ? await prepararDesvios(tx, payload.desvios) : null;

    const rdo = await tx.rdo.create({
      data: { ...cabecalho, data, obra_id: obraId, contrato_id: obra.contrato_id, supervisor_id: supervisorId, encarregado_id: encarregadoId, status: 'RASCUNHO' },
      select: { id: true },
    });
    await gravarAtividades(tx, rdo.id, atividades.map((a) => ({ ...a, id: null })));
    await gravarSecoes(tx, rdo.id, { efetivo, equipamentos, pts, desvios });
    await historico(tx, rdo.id, null, 'RASCUNHO', usuario.id);
    return rdo.id;
  }, { timeout: 30000, maxWait: 10000 });

  return apresentar(await repo.buscarCompleto(id));
}

/** PUT /api/rdos/:id — atualiza o rascunho/devolvido. Seções ausentes do corpo ficam como estão. */
async function atualizar(idParam, payload = {}, usuario) {
  const existente = await carregar(idParam);
  garantirEditavel(existente, usuario);
  const cabecalho = camposDoCabecalho(payload, { parcial: true });

  let orfas = [];
  await repo.prisma.$transaction(async (tx) => {
    const dados = { ...cabecalho };
    const diaAtual = diaBrasilia(existente.data);
    let diaTexto = diaAtual;
    if (tem(payload, 'data') && !vazio(payload.data)) {
      diaTexto = String(payload.data).trim();
      const novaData = dataDia(diaTexto, 'data');
      const conflito = await tx.rdo.findFirst({ where: { obra_id: existente.obra_id, encarregado_id: existente.encarregado_id, data: novaData, NOT: { id: existente.id } }, select: { id: true } });
      if (conflito) throw new AppError(409, `Já existe o RDO ${conflito.id} deste encarregado nesta obra e data.`, { rdo_id: conflito.id });
      dados.data = novaData;
    }
    if (tem(payload, 'supervisor_id')) dados.supervisor_id = await validarSupervisor(tx, payload.supervisor_id);

    // Efetivo final do RDO (o do corpo ou o já gravado) — a mão de obra é validada contra ele.
    const efetivoNovo = payload.efetivo !== undefined ? await prepararEfetivo(tx, payload.efetivo) : null;
    const efetivoFinal = efetivoNovo || (await tx.rdoEfetivo.findMany({ where: { rdo_id: existente.id } })).map((e) => ({ ...e, quantidade: Number(e.quantidade) }));

    if (payload.atividades !== undefined) {
      const preparadas = await prepararAtividades(tx, payload.atividades, { obraId: existente.obra_id, efetivo: efetivoFinal });
      orfas = await gravarAtividades(tx, existente.id, preparadas);
    } else if (efetivoNovo) {
      const maoObraAtual = await tx.rdoMaoObra.findMany({ where: { atividade: { rdo_id: existente.id } } });
      const agrupada = new Map();
      maoObraAtual.forEach((m) => agrupada.set(m.rdo_atividade_id, [...(agrupada.get(m.rdo_atividade_id) || []), { ...m, quantidade: Number(m.quantidade), horas: Number(m.horas) }]));
      validarMaoObraContraEfetivo(efetivoFinal, [...agrupada.values()]);
    }

    const ptsNecessaria = tem(payload, 'pts_necessaria') ? cabecalho.pts_necessaria : existente.pts_necessaria;
    let pts = null;
    if (payload.pts !== undefined) pts = ajustarPts(ptsNecessaria, prepararPts(payload.pts, diaTexto));
    else if (ptsNecessaria === false && tem(payload, 'pts_necessaria')) pts = [];
    else if (diaTexto !== diaAtual) {
      // O dia mudou e as PTS ficaram como estavam: refaz os instantes no novo dia, mantendo as horas.
      const atuais = await tx.rdoPts.findMany({ where: { rdo_id: existente.id } });
      pts = prepararPts(atuais.map((p) => ({ numero: p.numero, hora_solicitacao: instanteParaHora(p.solicitado_em), hora_liberacao: instanteParaHora(p.liberado_em) })), diaTexto);
    }

    const equipamentos = payload.equipamentos !== undefined ? await prepararEquipamentos(tx, payload.equipamentos) : null;
    const desvios = payload.desvios !== undefined ? await prepararDesvios(tx, payload.desvios) : null;
    await gravarSecoes(tx, existente.id, { efetivo: efetivoNovo, equipamentos, pts, desvios });
    await tx.rdo.update({ where: { id: existente.id }, data: dados });
  }, { timeout: 30000, maxWait: 10000 });

  await apagarImagens(orfas);
  return apresentar(await repo.buscarCompleto(existente.id));
}

/** GET /api/rdos/:id */
async function obter(idParam, usuario) {
  const simples = await carregar(idParam);
  await garantirAcessoLeitura(simples, usuario);
  return apresentar(await repo.buscarCompleto(simples.id));
}

/** Filtros comuns de listagem (status, encarregado, obra, período) respeitando o escopo do perfil. */
async function montarFiltro(filtros, usuario) {
  const escopo = await escopoDeObras(usuario);
  const where = {};

  if (!vazio(filtros.status)) {
    const status = String(filtros.status).toUpperCase();
    if (!STATUS_VALIDOS.includes(status)) throw new AppError(400, `Status inválido. Valores aceitos: ${STATUS_VALIDOS.join(', ')}.`);
    where.status = status;
  }
  if (usuario.perfil === 'ENCARREGADO') where.encarregado_id = usuario.id;
  else if (!vazio(filtros.encarregado_id)) where.encarregado_id = idValido(filtros.encarregado_id, 'encarregado_id');

  if (!vazio(filtros.obra_id)) {
    const obraId = idValido(filtros.obra_id, 'obra_id');
    garantirObrasNoEscopo(escopo, [obraId]);
    where.obra_id = obraId;
  } else if (escopo !== null && usuario.perfil !== 'ENCARREGADO') {
    where.obra_id = { in: escopo };
  }

  if (!vazio(filtros.data_de) || !vazio(filtros.data_ate)) {
    where.data = {};
    if (!vazio(filtros.data_de)) where.data.gte = dataDia(filtros.data_de, 'data_de');
    if (!vazio(filtros.data_ate)) where.data.lte = dataDia(filtros.data_ate, 'data_ate');
  }
  return where;
}

/** GET /api/rdos?status=&obra_id=&encarregado_id=&data_de=&data_ate=&limite=&deslocamento= */
async function listar(filtros = {}, usuario) {
  const where = await montarFiltro(filtros, usuario);
  const limite = Math.min(Math.max(Number(filtros.limite) || 50, 1), 200);
  const deslocamento = Math.max(Number(filtros.deslocamento) || 0, 0);
  const { itens, total } = await repo.listar({ where, limite, deslocamento });
  return { total, limite, deslocamento, itens };
}

/**
 * GET /api/rdos/obras/:obraId/resumo — resumo dos RDOs da obra: indicadores e, por dia, atividades com
 * fotos, supervisor, PTS e desvios. Alimenta a aba RDO da obra (até 100 RDOs mais recentes).
 */
async function resumoDaObra(obraIdParam, filtros = {}, usuario) {
  const obraId = idValido(obraIdParam, 'obraId');
  const where = await montarFiltro({ ...filtros, obra_id: obraId }, usuario);
  const rdos = await repo.listarParaResumo(where, 100);
  const itens = rdos.map(apresentarResumo);

  const aprovados = itens.filter((r) => r.status === 'APROVADO').length;
  const indicadores = {
    rdos: itens.length,
    aprovados,
    aguardando_validacao: itens.filter((r) => r.status === 'FINALIZADO').length,
    hh: arredondar(itens.reduce((s, r) => s + r.totais.hh, 0)),
    fotos: itens.reduce((s, r) => s + r.atividades.reduce((x, a) => x + a.fotos.length, 0), 0),
    desvios_horas: arredondar(itens.reduce((s, r) => s + r.totais.desvios.total, 0)),
    pts_necessarias: itens.filter((r) => r.pts_necessaria === true).length,
    espera_pts_minutos: itens.reduce((s, r) => s + r.totais.espera_pts_minutos, 0),
  };
  return { obra_id: obraId, indicadores, itens, truncado: itens.length >= 100 };
}

/**
 * GET /api/rdos/fotos?obra_id=&data_de=&data_ate=&status=&limite=&deslocamento= — controle de fotos:
 * todas as fotos de evidência, com obra, RDO, atividade e quem lançou.
 */
async function listarFotos(filtros = {}, usuario) {
  const where = await montarFiltro(filtros, usuario);
  const limite = Math.min(Math.max(Number(filtros.limite) || 60, 1), 200);
  const deslocamento = Math.max(Number(filtros.deslocamento) || 0, 0);
  const { itens, total } = await repo.listarFotos({ where, limite, deslocamento });
  return {
    total,
    limite,
    deslocamento,
    itens: itens.map((f) => ({
      id: f.id,
      url: f.url,
      legenda: f.legenda,
      created_at: f.created_at,
      rdo_id: f.atividade.rdo.id,
      data: f.atividade.rdo.data,
      status: f.atividade.rdo.status,
      encarregado: f.atividade.rdo.encarregado,
      obra: { id: f.atividade.rdo.obra.id, ss: f.atividade.rdo.obra.orcamento?.ss ?? null, descricao: f.atividade.rdo.obra.orcamento?.descricao ?? null },
      atividade: { id: f.atividade.id, codigo_atividade: f.atividade.codigo_atividade, descricao: f.atividade.descricao_snapshot, fora_de_escopo: f.atividade.fora_de_escopo },
    })),
  };
}

/**
 * POST /api/rdos/:id/finalizar — o encarregado assina. Exige: obra em andamento; supervisor; efetivo;
 * ao menos uma atividade; resposta sobre PTS (e a PTS lançada quando necessária); foto de evidência
 * nas atividades que avançaram.
 */
async function finalizar(idParam, usuario) {
  const rdo = await carregar(idParam);
  garantirEditavel(rdo, usuario);

  const [obra, efetivo, pts] = await Promise.all([
    repo.prisma.obra.findUnique({ where: { id: rdo.obra_id }, select: { status: true } }),
    repo.prisma.rdoEfetivo.count({ where: { rdo_id: rdo.id } }),
    repo.prisma.rdoPts.count({ where: { rdo_id: rdo.id } }),
  ]);
  exigirObraEmAndamento(obra);
  if (!rdo.supervisor_id) throw new AppError(400, 'Informe o supervisor da obra antes de finalizar o RDO.');
  if (efetivo === 0) throw new AppError(400, 'Informe o efetivo do dia (quem esteve na obra) antes de finalizar o RDO.');
  if (rdo.atividades.length === 0) throw new AppError(400, 'Inclua ao menos uma atividade antes de finalizar o RDO.');
  if (rdo.pts_necessaria === null) throw new AppError(400, 'Responda se foi necessária a emissão de PTS antes de finalizar o RDO.');
  if (rdo.pts_necessaria === true && pts === 0) throw new AppError(400, 'Foi necessária PTS: informe a hora de solicitação (e de liberação, se já saiu).');

  const semFoto = rdo.atividades.filter(
    (a) => !a.fora_de_escopo && Number(a.percentual_declarado) > Number(a.percentual_anterior) && a._count.fotos === 0
  );
  if (semFoto.length) {
    throw new AppError(400, `Anexe ao menos uma foto de evidência nas atividades que avançaram: ${semFoto.map((a) => a.codigo_atividade).join(', ')}.`, {
      atividades_sem_foto: semFoto.map((a) => a.id),
    });
  }

  await repo.prisma.$transaction(async (tx) => {
    const atual = await tx.rdo.findUnique({ where: { id: rdo.id }, select: { status: true } });
    if (!STATUS_EDITAVEIS.includes(atual.status)) throw new AppError(409, `O RDO está ${atual.status} e não pode ser finalizado.`);
    await tx.rdo.update({ where: { id: rdo.id }, data: { status: 'FINALIZADO', assinado_em: new Date(), motivo_devolucao: null, decidido_por_id: null, decidido_em: null } });
    await historico(tx, rdo.id, atual.status, 'FINALIZADO', usuario.id);
  });
  return apresentar(await repo.buscarCompleto(rdo.id));
}

/**
 * POST /api/rdos/:id/aprovar — { atividades?: [{ id, percentual_validado }] }.
 * Tudo numa transação, com trava por obra: o % anterior é relido no momento da aprovação e a
 * validação nunca pode ficar abaixo dele (senão 409 CONFLITO_AVANCO e o planejador revisa).
 * Atividades sem mudança de % (inclusive as já concluídas) não geram novo registro de avanço.
 */
async function aprovar(idParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_VALIDADORES, 'aprovar o RDO');
  const simples = await carregar(idParam);
  await garantirAcessoLeitura(simples, usuario);
  garantirObrasNoEscopo(await escopoDeObras(usuario), [simples.obra_id]);

  const validacoes = new Map();
  if (payload.atividades !== undefined) {
    if (!Array.isArray(payload.atividades)) throw new AppError(400, 'O campo "atividades" deve ser uma lista.');
    payload.atividades.forEach((v, i) => {
      const valor = normalizarPercentual(v?.percentual_validado);
      if (valor === null) throw new AppError(400, `atividades[${i}].percentual_validado deve ser um número entre 0 e 100.`);
      validacoes.set(idValido(v?.id, `atividades[${i}].id`), valor);
    });
  }

  await repo.prisma.$transaction(async (tx) => {
    // Trava por obra: duas aprovações na mesma obra se enfileiram.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${simples.obra_id}::bigint)`;

    const rdo = await tx.rdo.findUnique({ where: { id: simples.id }, include: { atividades: true } });
    if (rdo.status !== 'FINALIZADO') throw new AppError(409, `O RDO está ${rdo.status}; só RDO FINALIZADO pode ser aprovado.`);

    const desconhecida = [...validacoes.keys()].find((id) => !rdo.atividades.some((a) => a.id === id));
    if (desconhecida !== undefined) throw new AppError(404, `A atividade ${desconhecida} não pertence a este RDO.`);

    const conflitos = [];
    const aplicar = [];
    for (const a of rdo.atividades) {
      if (a.fora_de_escopo) continue;
      // eslint-disable-next-line no-await-in-loop
      const vigente = await percentualVigente(a.obra_id, a.codigo_atividade, { client: tx });
      const anterior = arredondar(vigente.percentual, 2);
      const validado = validacoes.has(a.id) ? validacoes.get(a.id) : Number(a.percentual_declarado);
      if (validado < anterior) {
        conflitos.push({ id: a.id, codigo_atividade: a.codigo_atividade, percentual_anterior: anterior, percentual_validado: validado });
      } else {
        aplicar.push({ a, anterior, validado });
      }
    }
    if (conflitos.length) {
      throw new AppError(409, 'O avanço validado ficou abaixo do % vigente da atividade (outro RDO ou o cronograma já avançou). Revise os percentuais.', {
        codigo: 'CONFLITO_AVANCO',
        conflitos,
      });
    }

    for (const { a, anterior, validado } of aplicar) {
      // eslint-disable-next-line no-await-in-loop
      await tx.rdoAtividade.update({ where: { id: a.id }, data: { percentual_anterior: anterior, percentual_validado: validado } });
      if (validado > anterior) {
        // eslint-disable-next-line no-await-in-loop
        await tx.avancoAtividadeAprovado.create({
          data: { obra_id: a.obra_id, codigo_atividade: a.codigo_atividade, data: rdo.data, percentual: validado, rdo_atividade_id: a.id },
        });
      }
    }

    await tx.rdo.update({ where: { id: rdo.id }, data: { status: 'APROVADO', decidido_por_id: usuario.id, decidido_em: new Date(), motivo_devolucao: null } });
    await historico(tx, rdo.id, 'FINALIZADO', 'APROVADO', usuario.id);
  }, { timeout: 30000, maxWait: 10000 });

  return apresentar(await repo.buscarCompleto(simples.id));
}

/** POST /api/rdos/:id/devolver — { motivo } (obrigatório). */
async function devolver(idParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_VALIDADORES, 'devolver o RDO');
  const motivo = texto(payload.motivo, 'motivo', 2000, { obrigatorio: true });
  const simples = await carregar(idParam);
  await garantirAcessoLeitura(simples, usuario);
  garantirObrasNoEscopo(await escopoDeObras(usuario), [simples.obra_id]);

  await repo.prisma.$transaction(async (tx) => {
    const atual = await tx.rdo.findUnique({ where: { id: simples.id }, select: { status: true } });
    if (atual.status !== 'FINALIZADO') throw new AppError(409, `O RDO está ${atual.status}; só RDO FINALIZADO pode ser devolvido.`);
    await tx.rdo.update({ where: { id: simples.id }, data: { status: 'DEVOLVIDO', decidido_por_id: usuario.id, decidido_em: new Date(), motivo_devolucao: motivo } });
    await historico(tx, simples.id, 'FINALIZADO', 'DEVOLVIDO', usuario.id, motivo);
  });
  return apresentar(await repo.buscarCompleto(simples.id));
}

/** DELETE /api/rdos/:id — só rascunho. */
async function excluir(idParam, usuario) {
  const rdo = await carregar(idParam);
  garantirEditavel(rdo, usuario);
  if (rdo.status !== 'RASCUNHO') throw new AppError(409, 'Só é possível excluir um RDO em rascunho; um RDO devolvido deve ser corrigido e finalizado.');

  const fotos = await repo.prisma.rdoFoto.findMany({ where: { atividade: { rdo_id: rdo.id } }, select: { public_id: true } });
  await repo.prisma.rdo.delete({ where: { id: rdo.id } });
  await apagarImagens(fotos.map((f) => f.public_id));
  return { ok: true };
}

/* ------------------------------ Fotos de evidência ------------------------------ */

/** POST /api/rdos/:id/atividades/:atividadeId/fotos — multipart, campo "foto" (+ legenda opcional). */
async function adicionarFoto(idParam, atividadeIdParam, arquivo, payload = {}, usuario) {
  const rdo = await carregar(idParam);
  garantirEditavel(rdo, usuario);
  const atividadeId = idValido(atividadeIdParam, 'atividadeId');
  const atividade = await repo.prisma.rdoAtividade.findFirst({ where: { id: atividadeId, rdo_id: rdo.id }, select: { id: true, _count: { select: { fotos: true } } } });
  if (!atividade) throw new AppError(404, `Atividade ${atividadeId} não encontrada neste RDO.`);
  if (atividade._count.fotos >= LIMITE_FOTOS_POR_ATIVIDADE) {
    throw new AppError(400, `Limite de ${LIMITE_FOTOS_POR_ATIVIDADE} fotos por atividade atingido.`);
  }
  if (!arquivo?.buffer) throw new AppError(400, 'Envie a imagem no campo "foto" (multipart/form-data).');
  const legenda = texto(payload.legenda, 'legenda', 255);

  const enviado = await uploadService.processarFoto(arquivo, { pasta: PASTA_FOTOS });
  return repo.prisma.rdoFoto.create({
    data: { rdo_atividade_id: atividadeId, url: enviado.url, public_id: enviado.public_id, legenda },
  });
}

/** DELETE /api/rdos/:id/fotos/:fotoId */
async function removerFoto(idParam, fotoIdParam, usuario) {
  const rdo = await carregar(idParam);
  garantirEditavel(rdo, usuario);
  const fotoId = idValido(fotoIdParam, 'fotoId');
  const foto = await repo.prisma.rdoFoto.findFirst({ where: { id: fotoId, atividade: { rdo_id: rdo.id } } });
  if (!foto) throw new AppError(404, `Foto ${fotoId} não encontrada neste RDO.`);
  await repo.prisma.rdoFoto.delete({ where: { id: foto.id } });
  await apagarImagens([foto.public_id]);
  return { ok: true };
}

module.exports = {
  PERFIS_CAMPO,
  PERFIS_VALIDADORES,
  percentualVigente,
  listarObras,
  listarSupervisores,
  listarAtividadesDaObra,
  resumoAvancoDaObra,
  resumoDaObra,
  listarFotos,
  criar,
  atualizar,
  obter,
  listar,
  finalizar,
  aprovar,
  devolver,
  excluir,
  adicionarFoto,
  removerFoto,
};

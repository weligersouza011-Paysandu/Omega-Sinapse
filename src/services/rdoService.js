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
 * Fluxo: RASCUNHO → FINALIZADO (encarregado assina) → APROVADO | DEVOLVIDO (→ FINALIZADO de novo).
 * Só ao aprovar o avanço entra em `avanco_atividade_aprovado`; o % vigente de uma atividade é o
 * mais recente entre esse histórico e a última revisão do cronograma (utils/avancoAtividade).
 */

const PERFIS_CAMPO = ['ENCARREGADO', 'ADMIN'];
const PERFIS_VALIDADORES = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const STATUS_EDITAVEIS = ['RASCUNHO', 'DEVOLVIDO'];
const STATUS_VALIDOS = ['RASCUNHO', 'FINALIZADO', 'APROVADO', 'DEVOLVIDO'];
const LIMITE_FOTOS_POR_ATIVIDADE = 12;
const PASTA_FOTOS = `${process.env.CLOUDINARY_FOLDER_RDO || 'synapse/rdo'}`;

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

function instante(valor, campo, { obrigatorio = false } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw new AppError(400, `O campo "${campo}" é obrigatório.`);
    return null;
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new AppError(400, `O campo "${campo}" deve ser uma data e hora válidas.`);
  return d;
}

function horas(valor, campo, { minimo = 0 } = {}) {
  const n = Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < minimo || n > 24 || (minimo > 0 && n === 0)) {
    throw new AppError(400, `O campo "${campo}" deve ser um número de horas entre ${minimo > 0 ? 'mais de 0' : '0'} e 24.`);
  }
  return arredondar(n, 2);
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
/* Consulta de apoio ao formulário                                            */
/* -------------------------------------------------------------------------- */

/** GET /api/rdos/obras — obras que o usuário pode lançar/ver (cabeçalho do RDO). */
async function listarObras(usuario) {
  const escopo = await escopoDeObras(usuario);
  const obras = await repo.obrasPorIds(escopo);
  return obras.map((o) => ({
    id: o.id,
    contrato_id: o.contrato_id,
    status: o.status,
    ss: o.orcamento?.ss ?? null,
    pep: o.orcamento?.pep ?? null,
    descricao: o.orcamento?.descricao ?? null,
    cliente: o.orcamento?.cliente ?? null,
  }));
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
    return {
      codigo_atividade: f.codigo_atividade,
      codigo_pai: f.codigo_pai,
      descricao: f.descricao,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
      percentual_vigente: arredondar(vigente.percentual, 2),
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
 * Valida as atividades do corpo e devolve os dados prontos para gravar, com o % anterior vigente.
 * Regras: obra no escopo do usuário; todas as obras no mesmo contrato; EDT existente e folha na revisão
 * vigente (exceto fora de escopo); sem EDT repetido; % entre 0 e 100; recuo de % exige observação.
 */
async function prepararAtividades(client, lista, escopo) {
  if (!Array.isArray(lista)) throw new AppError(400, 'O campo "atividades" deve ser uma lista.');

  const itens = lista.map((a, i) => {
    const rot = `atividades[${i}]`;
    const foraDeEscopo = a?.fora_de_escopo === true || a?.fora_de_escopo === 'true';
    const obraId = idValido(a?.obra_id, `${rot}.obra_id`);
    const base = {
      id: vazio(a?.id) ? null : idValido(a.id, `${rot}.id`),
      obra_id: obraId,
      fora_de_escopo: foraDeEscopo,
      observacao: texto(a?.observacao, `${rot}.observacao`, 2000),
      mao_obra: montarMaoObra(a?.mao_obra, rot),
    };
    if (foraDeEscopo) {
      return { ...base, codigo_atividade: null, descricao_snapshot: texto(a?.descricao, `${rot}.descricao`, 500, { obrigatorio: true }), percentual_declarado: 0 };
    }
    const codigo = texto(a?.codigo_atividade, `${rot}.codigo_atividade`, 60, { obrigatorio: true });
    const declarado = normalizarPercentual(a?.percentual_declarado);
    if (declarado === null) throw new AppError(400, `${rot}.percentual_declarado deve ser um número entre 0 e 100.`);
    return { ...base, codigo_atividade: codigo, descricao_snapshot: '', percentual_declarado: declarado };
  });

  const chaves = itens.filter((a) => !a.fora_de_escopo).map((a) => `${a.obra_id}|${a.codigo_atividade}`);
  const repetida = chaves.find((c, i) => chaves.indexOf(c) !== i);
  if (repetida) throw new AppError(400, `A atividade ${repetida.split('|')[1]} aparece mais de uma vez no RDO.`);

  const obraIds = [...new Set(itens.map((a) => a.obra_id))];
  garantirObrasNoEscopo(escopo, obraIds);
  const obras = await client.obra.findMany({ where: { id: { in: obraIds } }, select: { id: true, contrato_id: true } });
  const inexistente = obraIds.find((id) => !obras.some((o) => o.id === id));
  if (inexistente !== undefined) throw new AppError(404, `Obra ${inexistente} não encontrada.`);
  const contratos = [...new Set(obras.map((o) => o.contrato_id))];
  if (contratos.length > 1) throw new AppError(400, 'Todas as obras de um RDO devem pertencer ao mesmo contrato.');

  const versoes = new Map();
  for (const obraId of obraIds) {
    // eslint-disable-next-line no-await-in-loop
    versoes.set(obraId, await repo.ultimaVersao(obraId, client));
  }

  const prontos = [];
  for (const a of itens) {
    if (a.fora_de_escopo) {
      prontos.push({ ...a, percentual_anterior: 0 });
      continue;
    }
    const versao = versoes.get(a.obra_id);
    if (!versao) throw new AppError(409, `A obra ${a.obra_id} ainda não tem cronograma importado.`);
    // eslint-disable-next-line no-await-in-loop
    const ativ = await repo.atividadeNaVersao(versao.id, a.codigo_atividade, client);
    if (!ativ) throw new AppError(400, `A atividade ${a.codigo_atividade} não existe no cronograma vigente da obra ${a.obra_id}.`);
    if (ativ.resumo) throw new AppError(400, `A atividade ${a.codigo_atividade} é um agrupamento (resumo); lance o avanço nas atividades filhas.`);
    // eslint-disable-next-line no-await-in-loop
    const vigente = await percentualVigente(a.obra_id, a.codigo_atividade, { client, versao, atividadeCronograma: ativ });
    const anterior = arredondar(vigente.percentual, 2);
    if (a.percentual_declarado < anterior && !a.observacao) {
      throw new AppError(400, `A atividade ${a.codigo_atividade} regride de ${anterior}% para ${a.percentual_declarado}%: explique o motivo na observação.`);
    }
    prontos.push({ ...a, descricao_snapshot: ativ.descricao, percentual_anterior: anterior });
  }

  await garantirCatalogo(client, 'funcaoMaoObra', prontos.flatMap((a) => a.mao_obra.map((m) => m.funcao_id).filter(Boolean)), 'Função');
  await garantirCatalogo(client, 'colaborador', prontos.flatMap((a) => a.mao_obra.map((m) => m.colaborador_id).filter(Boolean)), 'Colaborador');

  return { atividades: prontos, contratoId: contratos[0] ?? null };
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

function prepararPts(lista) {
  if (!Array.isArray(lista)) throw new AppError(400, 'O campo "pts" deve ser uma lista.');
  return lista.map((p, i) => {
    const solicitado = instante(p?.solicitado_em, `pts[${i}].solicitado_em`, { obrigatorio: true });
    const liberado = instante(p?.liberado_em, `pts[${i}].liberado_em`);
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

function apresentar(rdo) {
  const atividades = rdo.atividades.map((a) => ({
    ...a,
    hh: totalHH(a.mao_obra),
    mao_obra: a.mao_obra.map((m) => ({ ...m, hh: hhDoLancamento(m) })),
  }));
  return {
    ...rdo,
    atividades,
    pts: rdo.pts.map((p) => ({ ...p, espera_minutos: esperaPtsMinutos(p.solicitado_em, p.liberado_em) })),
    totais: {
      hh: arredondar(atividades.reduce((s, a) => s + a.hh, 0)),
      desvios: totalDesvios(rdo.desvios),
      espera_pts_minutos: rdo.pts.reduce((s, p) => s + (esperaPtsMinutos(p.solicitado_em, p.liberado_em) || 0), 0),
    },
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
    const obraIds = [...new Set(rdo.atividades.map((a) => a.obra_id))];
    if (obraIds.length === 0 || !obraIds.some((id) => escopo.includes(id))) {
      throw new AppError(403, 'Este RDO não é de uma obra sob o seu planejamento.');
    }
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

async function gravarSecoes(tx, rdoId, { equipamentos, pts, desvios }) {
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

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

/** POST /api/rdos — cria o RDO do dia (1 por encarregado por dia). */
async function criar(payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_CAMPO, 'criar RDO');

  let encarregadoId = usuario.id;
  if (usuario.perfil === 'ADMIN' && !vazio(payload.encarregado_id)) encarregadoId = idValido(payload.encarregado_id, 'encarregado_id');
  const data = vazio(payload.data) ? dataDia(diaBrasilia(new Date()), 'data') : dataDia(payload.data, 'data');

  const escopo = encarregadoId === usuario.id ? await escopoDeObras(usuario) : await repo.obraIdsDoEncarregado(encarregadoId);
  const cabecalho = camposDoCabecalho(payload, { parcial: false });

  const id = await repo.prisma.$transaction(async (tx) => {
    const duplicado = await tx.rdo.findUnique({ where: { uq_rdo_encarregado_dia: { encarregado_id: encarregadoId, data } }, select: { id: true } });
    if (duplicado) throw new AppError(409, `Já existe o RDO ${duplicado.id} deste encarregado nesta data.`, { rdo_id: duplicado.id });

    const preparado = Array.isArray(payload.atividades) && payload.atividades.length
      ? await prepararAtividades(tx, payload.atividades, escopo)
      : { atividades: [], contratoId: null };
    const equipamentos = payload.equipamentos ? await prepararEquipamentos(tx, payload.equipamentos) : null;
    const pts = payload.pts ? prepararPts(payload.pts) : null;
    const desvios = payload.desvios ? await prepararDesvios(tx, payload.desvios) : null;

    const rdo = await tx.rdo.create({
      data: { ...cabecalho, data, encarregado_id: encarregadoId, contrato_id: preparado.contratoId, status: 'RASCUNHO' },
      select: { id: true },
    });
    await gravarAtividades(tx, rdo.id, preparado.atividades.map((a) => ({ ...a, id: null })));
    await gravarSecoes(tx, rdo.id, { equipamentos, pts, desvios });
    await historico(tx, rdo.id, null, 'RASCUNHO', usuario.id);
    return rdo.id;
  }, { timeout: 30000, maxWait: 10000 });

  return apresentar(await repo.buscarCompleto(id));
}

/** PUT /api/rdos/:id — atualiza o rascunho/devolvido. Seções ausentes do corpo ficam como estão. */
async function atualizar(idParam, payload = {}, usuario) {
  const existente = await carregar(idParam);
  garantirEditavel(existente, usuario);
  const escopo = await escopoDeObras(usuario);
  const cabecalho = camposDoCabecalho(payload, { parcial: true });

  let orfas = [];
  await repo.prisma.$transaction(async (tx) => {
    const dados = { ...cabecalho };
    if (tem(payload, 'data') && !vazio(payload.data)) {
      const novaData = dataDia(payload.data, 'data');
      const conflito = await tx.rdo.findFirst({ where: { encarregado_id: existente.encarregado_id, data: novaData, NOT: { id: existente.id } }, select: { id: true } });
      if (conflito) throw new AppError(409, `Já existe o RDO ${conflito.id} deste encarregado nesta data.`, { rdo_id: conflito.id });
      dados.data = novaData;
    }
    if (payload.atividades !== undefined) {
      const preparado = await prepararAtividades(tx, payload.atividades, escopo);
      orfas = await gravarAtividades(tx, existente.id, preparado.atividades);
      dados.contrato_id = preparado.contratoId;
    }
    const equipamentos = payload.equipamentos !== undefined ? await prepararEquipamentos(tx, payload.equipamentos) : null;
    const pts = payload.pts !== undefined ? prepararPts(payload.pts) : null;
    const desvios = payload.desvios !== undefined ? await prepararDesvios(tx, payload.desvios) : null;
    await gravarSecoes(tx, existente.id, { equipamentos, pts, desvios });
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

/** GET /api/rdos?status=&obra_id=&encarregado_id=&data_de=&data_ate=&limite=&deslocamento= */
async function listar(filtros = {}, usuario) {
  const escopo = await escopoDeObras(usuario);
  const where = {};

  if (!vazio(filtros.status)) {
    const status = String(filtros.status).toUpperCase();
    if (!STATUS_VALIDOS.includes(status)) throw new AppError(400, `Status inválido. Valores aceitos: ${STATUS_VALIDOS.join(', ')}.`);
    where.status = status;
  }
  if (usuario.perfil === 'ENCARREGADO') where.encarregado_id = usuario.id;
  else if (!vazio(filtros.encarregado_id)) where.encarregado_id = idValido(filtros.encarregado_id, 'encarregado_id');

  const atividadesFiltro = {};
  if (escopo !== null && usuario.perfil !== 'ENCARREGADO') atividadesFiltro.obra_id = { in: escopo };
  if (!vazio(filtros.obra_id)) {
    const obraId = idValido(filtros.obra_id, 'obra_id');
    garantirObrasNoEscopo(escopo, [obraId]);
    atividadesFiltro.obra_id = obraId;
  }
  if (Object.keys(atividadesFiltro).length) where.atividades = { some: atividadesFiltro };

  if (!vazio(filtros.data_de) || !vazio(filtros.data_ate)) {
    where.data = {};
    if (!vazio(filtros.data_de)) where.data.gte = dataDia(filtros.data_de, 'data_de');
    if (!vazio(filtros.data_ate)) where.data.lte = dataDia(filtros.data_ate, 'data_ate');
  }

  const limite = Math.min(Math.max(Number(filtros.limite) || 50, 1), 200);
  const deslocamento = Math.max(Number(filtros.deslocamento) || 0, 0);
  const { itens, total } = await repo.listar({ where, limite, deslocamento });
  return { total, limite, deslocamento, itens };
}

/** POST /api/rdos/:id/finalizar — o encarregado assina; exige ao menos uma atividade e foto das que avançaram. */
async function finalizar(idParam, usuario) {
  const rdo = await carregar(idParam);
  garantirEditavel(rdo, usuario);

  if (rdo.atividades.length === 0) throw new AppError(400, 'Inclua ao menos uma atividade antes de finalizar o RDO.');
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
 */
async function aprovar(idParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_VALIDADORES, 'aprovar o RDO');
  const simples = await carregar(idParam);
  await garantirAcessoLeitura(simples, usuario);
  garantirObrasNoEscopo(await escopoDeObras(usuario), simples.atividades.map((a) => a.obra_id));

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
    const obraIds = [...new Set(simples.atividades.map((a) => a.obra_id))].sort((a, b) => a - b);
    // Trava por obra (ordenada, sem deadlock): duas aprovações na mesma obra se enfileiram.
    for (const obraId of obraIds) {
      // eslint-disable-next-line no-await-in-loop
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${obraId}::bigint)`;
    }

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
      // eslint-disable-next-line no-await-in-loop
      await tx.avancoAtividadeAprovado.create({
        data: { obra_id: a.obra_id, codigo_atividade: a.codigo_atividade, data: rdo.data, percentual: validado, rdo_atividade_id: a.id },
      });
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
  garantirObrasNoEscopo(await escopoDeObras(usuario), simples.atividades.map((a) => a.obra_id));

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
  listarAtividadesDaObra,
  resumoAvancoDaObra,
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

'use strict';

const AppError = require('../errors/AppError');
const contratoRepository = require('../repositories/contratoRepository');
const qqpRepository = require('../repositories/qqpRepository');
const { projetarCustosQqp } = require('./projecaoFinanceiraService');

/**
 * QQP (Quadro de Quantidades e Preços) do contrato e recursos planejados por
 * obra. Os itens do QQP trazem o preço contratual; cada recurso da obra diz
 * quantos recursos entram, em que período, e alimenta a projeção de custos.
 */

const PERFIS_QUE_GEREM_QQP = ['SUPERVISOR', 'ADMIN'];
const PERFIS_QUE_PLANEJAM_RECURSOS = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const CATEGORIAS = ['HH', 'EQUIPAMENTO', 'INSUMO', 'OUTROS'];
const UNIDADES = ['HORA', 'DIA', 'MES', 'UNIDADE'];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const temCampo = (obj, campo) => Object.prototype.hasOwnProperty.call(obj, campo);
const estaVazio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

function validarUsuario(usuario) {
  if (!usuario || usuario.id === undefined || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!PERFIS_VALIDOS.includes(usuario.perfil)) {
    throw new AppError(403, `Perfil desconhecido: "${usuario.perfil}".`);
  }
}

function exigirPerfil(usuario, perfis, acao) {
  validarUsuario(usuario);
  if (!perfis.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${perfis.join(', ')} podem ${acao}.`);
  }
}

function validarId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser um número inteiro positivo.`);
  }
  return numero;
}

function numeroPositivo(valor, rotulo, casas) {
  if (estaVazio(valor)) {
    throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new AppError(400, `O campo "${rotulo}" deve ser um número maior que zero.`);
  }
  const fator = 10 ** casas;
  return Math.round(numero * fator) / fator;
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
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

function opcaoDe(valor, lista, rotulo) {
  const texto = String(valor ?? '').trim().toUpperCase();
  if (!lista.includes(texto)) {
    throw new AppError(400, `"${rotulo}" inválido. Valores aceitos: ${lista.join(', ')}.`);
  }
  return texto;
}

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const dataISO = (valor) => (valor ? new Date(valor).toISOString().slice(0, 10) : null);

function formatarItem(item) {
  return {
    id: item.id,
    contrato_id: item.contrato_id,
    codigo: item.codigo,
    descricao: item.descricao,
    categoria: item.categoria,
    unidade: item.unidade,
    preco_unitario: numero(item.preco_unitario),
    ativo: item.ativo,
    recursos_em_uso: item._count?.recursos ?? 0,
  };
}

function formatarRecurso(recurso) {
  return {
    id: recurso.id,
    obra_id: recurso.obra_id,
    item_id: recurso.item_id,
    item: recurso.item ? formatarItem(recurso.item) : null,
    quantidade: numero(recurso.quantidade),
    horas_dia: numero(recurso.horas_dia),
    data_inicio: dataISO(recurso.data_inicio),
    data_fim: dataISO(recurso.data_fim),
    inclui_sabados: recurso.inclui_sabados,
    observacao: recurso.observacao ?? null,
  };
}

async function garantirContrato(idParam) {
  const id = validarId(idParam);
  if (!(await contratoRepository.existsById(id))) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/* Itens do QQP (contrato)                                                    */
/* -------------------------------------------------------------------------- */

/** GET /api/contratos/:id/qqp */
async function listarItens(idParam, usuario) {
  validarUsuario(usuario);
  const contratoId = await garantirContrato(idParam);
  const itens = (await qqpRepository.listarItens(contratoId)).map(formatarItem);
  return { data: itens, total: itens.length };
}

/** POST /api/contratos/:id/qqp */
async function criarItem(idParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_GEREM_QQP, 'cadastrar itens do QQP');
  const contratoId = await garantirContrato(idParam);

  if (estaVazio(payload.codigo)) throw new AppError(400, 'O campo "codigo" é obrigatório.');
  if (estaVazio(payload.descricao)) throw new AppError(400, 'O campo "descricao" é obrigatório.');
  const codigo = String(payload.codigo).trim().toUpperCase();
  if (codigo.length > 40) throw new AppError(400, 'O campo "codigo" aceita no máximo 40 caracteres.');

  const dados = {
    codigo,
    descricao: String(payload.descricao).trim(),
    categoria: opcaoDe(payload.categoria, CATEGORIAS, 'categoria'),
    unidade: opcaoDe(payload.unidade, UNIDADES, 'unidade'),
    preco_unitario: numeroPositivo(payload.preco_unitario, 'preco_unitario', 4),
    ativo: payload.ativo === undefined ? true : Boolean(payload.ativo),
  };

  if (await qqpRepository.buscarItemPorCodigo(contratoId, codigo)) {
    throw new AppError(409, `Já existe um item do QQP com o código ${codigo} neste contrato.`);
  }
  return formatarItem(await qqpRepository.criarItem(contratoId, dados));
}

/** PUT /api/contratos/:id/qqp/:itemId */
async function atualizarItem(idParam, itemIdParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_GEREM_QQP, 'alterar itens do QQP');
  const contratoId = await garantirContrato(idParam);
  const itemId = validarId(itemIdParam, 'itemId');

  const existente = await qqpRepository.buscarItem(contratoId, itemId);
  if (!existente) throw new AppError(404, `Item ${itemId} do QQP não encontrado neste contrato.`);

  const dados = {};
  if (temCampo(payload, 'codigo')) {
    if (estaVazio(payload.codigo)) throw new AppError(400, 'O campo "codigo" não pode ficar vazio.');
    dados.codigo = String(payload.codigo).trim().toUpperCase();
    if (dados.codigo.length > 40) throw new AppError(400, 'O campo "codigo" aceita no máximo 40 caracteres.');
  }
  if (temCampo(payload, 'descricao')) {
    if (estaVazio(payload.descricao)) throw new AppError(400, 'O campo "descricao" não pode ficar vazio.');
    dados.descricao = String(payload.descricao).trim();
  }
  if (temCampo(payload, 'categoria')) dados.categoria = opcaoDe(payload.categoria, CATEGORIAS, 'categoria');
  if (temCampo(payload, 'unidade')) {
    dados.unidade = opcaoDe(payload.unidade, UNIDADES, 'unidade');
    if (dados.unidade !== existente.unidade && existente._count.recursos > 0) {
      throw new AppError(409, 'A unidade não pode mudar enquanto houver recursos de obra usando este item.');
    }
  }
  if (temCampo(payload, 'preco_unitario')) dados.preco_unitario = numeroPositivo(payload.preco_unitario, 'preco_unitario', 4);
  if (temCampo(payload, 'ativo')) dados.ativo = Boolean(payload.ativo);

  if (Object.keys(dados).length === 0) throw new AppError(400, 'Informe ao menos um campo do item para alterar.');

  if (dados.codigo && dados.codigo !== existente.codigo && (await qqpRepository.buscarItemPorCodigo(contratoId, dados.codigo))) {
    throw new AppError(409, `Já existe um item do QQP com o código ${dados.codigo} neste contrato.`);
  }
  return formatarItem(await qqpRepository.atualizarItem(contratoId, itemId, dados));
}

/** DELETE /api/contratos/:id/qqp/:itemId — só sem recursos de obra usando o item. */
async function excluirItem(idParam, itemIdParam, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_GEREM_QQP, 'excluir itens do QQP');
  const contratoId = await garantirContrato(idParam);
  const itemId = validarId(itemIdParam, 'itemId');

  const existente = await qqpRepository.buscarItem(contratoId, itemId);
  if (!existente) throw new AppError(404, `Item ${itemId} do QQP não encontrado neste contrato.`);
  if (existente._count.recursos > 0) {
    throw new AppError(
      409,
      `O item ${existente.codigo} está em uso em ${existente._count.recursos} alocação(ões) de obra. Desative-o em vez de excluir.`
    );
  }
  await qqpRepository.excluirItem(contratoId, itemId);
  return { id: itemId, excluido: true };
}

/* -------------------------------------------------------------------------- */
/* Recursos planejados da obra                                                */
/* -------------------------------------------------------------------------- */

async function garantirObraComContrato(obraIdParam) {
  const obraId = validarId(obraIdParam);
  const obra = await qqpRepository.contratoDaObra(obraId);
  if (!obra) throw new AppError(404, `Obra ${obraId} não encontrada.`);
  if (!obra.contrato_id) {
    throw new AppError(409, 'Vincule a obra a um contrato com QQP antes de planejar os recursos.');
  }
  return { obraId, contratoId: obra.contrato_id };
}

/**
 * Valida os campos de uma alocação (completa) e devolve o que deve ser gravado.
 * `estado` é o recurso já com as alterações aplicadas.
 */
function validarAlocacao(estado, item) {
  const dados = {
    item_id: item.id,
    quantidade: numeroPositivo(estado.quantidade, 'quantidade', 3),
    data_inicio: parseData(estado.data_inicio, 'data_inicio'),
    inclui_sabados: Boolean(estado.inclui_sabados),
    observacao: estaVazio(estado.observacao) ? null : String(estado.observacao).trim(),
    horas_dia: null,
    data_fim: null,
  };

  if (item.unidade !== 'UNIDADE') {
    dados.data_fim = parseData(estado.data_fim, 'data_fim');
    if (dados.data_fim < dados.data_inicio) {
      throw new AppError(400, 'A data de fim da alocação não pode ser anterior à data de início.');
    }
  }
  if (item.unidade === 'HORA' && !estaVazio(estado.horas_dia)) {
    const horas = Number(estado.horas_dia);
    if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
      throw new AppError(400, 'O campo "horas_dia" deve ficar entre 0 e 24.');
    }
    dados.horas_dia = Math.round(horas * 100) / 100;
  }
  return dados;
}

async function carregarItemDoContrato(contratoId, itemIdParam, { exigirAtivo }) {
  const itemId = validarId(itemIdParam, 'item_id');
  const item = await qqpRepository.buscarItem(contratoId, itemId);
  if (!item) throw new AppError(400, `O item ${itemId} não pertence ao QQP do contrato da obra.`);
  if (exigirAtivo && !item.ativo) throw new AppError(400, `O item ${item.codigo} está desativado no QQP.`);
  return item;
}

/** GET /api/obras/:id/recursos-qqp — alocações + custo projetado por ciclo. */
async function listarRecursos(obraIdParam, usuario) {
  validarUsuario(usuario);
  const obraId = validarId(obraIdParam);
  const obra = await qqpRepository.contratoDaObra(obraId);
  if (!obra) throw new AppError(404, `Obra ${obraId} não encontrada.`);

  const recursos = await qqpRepository.listarRecursosDaObra(obraId);
  const projecao = projetarCustosQqp(recursos);
  const custoPorRecurso = new Map(projecao.por_recurso.map((linha) => [linha.recurso_id, linha]));

  return {
    contrato_id: obra.contrato_id,
    data: recursos.map((recurso) => ({
      ...formatarRecurso(recurso),
      dias_uteis: custoPorRecurso.get(recurso.id)?.dias_uteis ?? 0,
      custo_total: custoPorRecurso.get(recurso.id)?.custo_total ?? 0,
    })),
    totais: projecao.totais,
  };
}

/** POST /api/obras/:id/recursos-qqp */
async function criarRecurso(obraIdParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_PLANEJAM_RECURSOS, 'planejar recursos da obra');
  const { obraId, contratoId } = await garantirObraComContrato(obraIdParam);
  const item = await carregarItemDoContrato(contratoId, payload.item_id, { exigirAtivo: true });
  const dados = validarAlocacao(payload, item);
  return formatarRecurso(await qqpRepository.criarRecurso(obraId, dados));
}

/** PUT /api/obras/:id/recursos-qqp/:recursoId */
async function atualizarRecurso(obraIdParam, recursoIdParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_PLANEJAM_RECURSOS, 'planejar recursos da obra');
  const { obraId, contratoId } = await garantirObraComContrato(obraIdParam);
  const recursoId = validarId(recursoIdParam, 'recursoId');

  const existente = await qqpRepository.buscarRecurso(obraId, recursoId);
  if (!existente) throw new AppError(404, `Recurso ${recursoId} não encontrado nesta obra.`);

  const trocouItem = temCampo(payload, 'item_id') && Number(payload.item_id) !== existente.item_id;
  const item = trocouItem
    ? await carregarItemDoContrato(contratoId, payload.item_id, { exigirAtivo: true })
    : existente.item;

  const estado = {
    quantidade: temCampo(payload, 'quantidade') ? payload.quantidade : existente.quantidade,
    horas_dia: temCampo(payload, 'horas_dia') ? payload.horas_dia : existente.horas_dia,
    data_inicio: temCampo(payload, 'data_inicio') ? payload.data_inicio : existente.data_inicio,
    data_fim: temCampo(payload, 'data_fim') ? payload.data_fim : existente.data_fim,
    inclui_sabados: temCampo(payload, 'inclui_sabados') ? payload.inclui_sabados : existente.inclui_sabados,
    observacao: temCampo(payload, 'observacao') ? payload.observacao : existente.observacao,
  };
  const dados = validarAlocacao(estado, item);
  return formatarRecurso(await qqpRepository.atualizarRecurso(obraId, recursoId, dados));
}

/** DELETE /api/obras/:id/recursos-qqp/:recursoId */
async function excluirRecurso(obraIdParam, recursoIdParam, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_PLANEJAM_RECURSOS, 'planejar recursos da obra');
  const obraId = validarId(obraIdParam);
  const recursoId = validarId(recursoIdParam, 'recursoId');
  if (!(await qqpRepository.excluirRecurso(obraId, recursoId))) {
    throw new AppError(404, `Recurso ${recursoId} não encontrado nesta obra.`);
  }
  return { id: recursoId, excluido: true };
}

module.exports = {
  PERFIS_QUE_GEREM_QQP,
  PERFIS_QUE_PLANEJAM_RECURSOS,
  listarItens,
  criarItem,
  atualizarItem,
  excluirItem,
  listarRecursos,
  criarRecurso,
  atualizarRecurso,
  excluirRecurso,
};

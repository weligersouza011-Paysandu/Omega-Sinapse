'use strict';

const AppError = require('../errors/AppError');
const contratoRepository = require('../repositories/contratoRepository');

/**
 * Módulo de Medição e Projeção Financeira — Fase 1.
 *
 * Contrato-mãe com a Vale (ex.: CT-251 Eletromecânica), seus Termos Aditivos
 * (TAC) e as obras (SS) vinculadas. O teto vigente é o valor inicial somado aos
 * aditivos; o saldo é o teto menos o valor dos orçamentos das obras vinculadas.
 */

/** Perfis que cadastram contratos, registram TACs e vinculam obras. */
const PERFIS_QUE_GEREM_CONTRATOS = ['SUPERVISOR', 'ADMIN'];

const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN', 'CLIENTE'];

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
  if (!PERFIS_QUE_GEREM_CONTRATOS.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_QUE_GEREM_CONTRATOS.join(' ou ')} podem gerir contratos.`);
  }
}

function validarId(id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, 'O parâmetro "id" deve ser um número inteiro positivo.');
  }
  return numero;
}

function textoObrigatorio(valor, rotulo, limite = null) {
  if (estaVazio(valor)) {
    throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  }
  const texto = String(valor).trim();
  if (limite && texto.length > limite) {
    throw new AppError(400, `O campo "${rotulo}" aceita no máximo ${limite} caracteres.`);
  }
  return texto;
}

/** Valor monetário estritamente positivo. */
function valorPositivo(valor, rotulo) {
  if (estaVazio(valor)) {
    throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new AppError(400, `O campo "${rotulo}" deve ser um número maior que zero.`);
  }
  return Math.round(numero * 100) / 100;
}

/** Data de calendário (AAAA-MM-DD ou ISO), gravada à meia-noite UTC. */
function dataObrigatoria(valor, rotulo) {
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

function arredondar(valor) {
  return Math.round(Number(valor || 0) * 100) / 100;
}

function dataISO(valor) {
  return valor ? new Date(valor).toISOString().slice(0, 10) : null;
}

/**
 * Formata o contrato com o consolidado financeiro:
 *  - teto_atual: valor inicial + aditivos;
 *  - valor_comprometido: soma do valor vigente dos orçamentos das obras vinculadas;
 *  - saldo: teto_atual − valor_comprometido.
 */
function montarContrato(registro) {
  if (!registro) return null;

  const { aditivos = [], obras = [], _count: contagem, ...contrato } = registro;
  const valorInicial = arredondar(contrato.valor_inicial);
  const totalAditivos = arredondar(aditivos.reduce((soma, tac) => soma + Number(tac.valor_aditivo), 0));
  const tetoAtual = arredondar(valorInicial + totalAditivos);
  const comprometido = arredondar(obras.reduce((soma, obra) => soma + Number(obra.orcamento?.valor || 0), 0));
  const saldo = arredondar(tetoAtual - comprometido);

  const hoje = dataISO(new Date());
  const inicio = dataISO(contrato.data_inicio);
  const fim = dataISO(contrato.data_fim);

  return {
    id: contrato.id,
    id_vale: contrato.id_vale,
    descricao: contrato.descricao,
    valor_inicial: valorInicial,
    data_inicio: inicio,
    data_fim: fim,
    em_vigencia: inicio <= hoje && hoje <= fim,
    quantidade_boletins: contagem?.boletins ?? 0,
    quantidade_itens_qqp: contagem?.itens_qqp ?? 0,
    possui_curva: (contagem?.curva_financeira ?? 0) > 0,
    created_at: contrato.created_at,
    updated_at: contrato.updated_at,
    aditivos: aditivos.map(({ usuario, ...tac }) => ({
      id: tac.id,
      numero_tac: tac.numero_tac,
      valor_aditivo: arredondar(tac.valor_aditivo),
      novo_valor_total: arredondar(tac.novo_valor_total),
      data_assinatura: dataISO(tac.data_assinatura),
      motivo: tac.motivo,
      registrado_por: usuario ? usuario.nome : null,
      created_at: tac.created_at,
    })),
    obras: obras.map((obra) => ({
      id: obra.id,
      status: obra.status,
      osi: obra.osi_numero,
      ss: obra.orcamento?.ss ?? null,
      pep: obra.orcamento?.pep ?? null,
      descricao: obra.orcamento?.descricao ?? null,
      valor: arredondar(obra.orcamento?.valor),
    })),
    consolidado: {
      valor_inicial: valorInicial,
      total_aditivos: totalAditivos,
      quantidade_aditivos: aditivos.length,
      teto_atual: tetoAtual,
      valor_comprometido: comprometido,
      saldo,
      percentual_comprometido: tetoAtual > 0 ? arredondar((comprometido / tetoAtual) * 100) : 0,
      quantidade_obras: obras.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

/** GET /api/contratos — contratos com aditivos e saldo consolidado. */
async function listarContratos(usuario) {
  validarUsuario(usuario);
  const registros = await contratoRepository.findAll();
  const data = registros.map(montarContrato);
  return { data, total: data.length };
}

/** GET /api/contratos/:id */
async function obterContrato(idParam, usuario) {
  validarUsuario(usuario);
  const id = validarId(idParam);
  const contrato = await contratoRepository.findById(id);
  if (!contrato) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }
  return montarContrato(contrato);
}

/** POST /api/contratos — cadastra o contrato-mãe. */
async function criarContrato(payload = {}, usuario) {
  exigirGestor(usuario);

  const idVale = textoObrigatorio(payload.id_vale, 'id_vale', 60).toUpperCase();
  const descricao = textoObrigatorio(payload.descricao, 'descricao');
  const valorInicial = valorPositivo(payload.valor_inicial, 'valor_inicial');
  const dataInicio = dataObrigatoria(payload.data_inicio, 'data_inicio');
  const dataFim = dataObrigatoria(payload.data_fim, 'data_fim');

  if (dataFim < dataInicio) {
    throw new AppError(400, 'A data de fim do contrato não pode ser anterior à data de início.');
  }

  if (await contratoRepository.findByIdVale(idVale)) {
    throw new AppError(409, `Já existe um contrato cadastrado com o identificador ${idVale}.`);
  }

  const contrato = await contratoRepository.create({
    id_vale: idVale,
    descricao,
    valor_inicial: valorInicial,
    data_inicio: dataInicio,
    data_fim: dataFim,
  });
  return montarContrato(contrato);
}

/**
 * PUT /api/contratos/:id — corrige o contrato (identificador, descrição, valor inicial e vigência).
 * Só os campos enviados mudam.
 */
async function atualizarContrato(idParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const id = validarId(idParam);

  const existente = await contratoRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }

  const tem = (campo) => Object.prototype.hasOwnProperty.call(payload, campo);
  const dados = {};
  if (tem('id_vale')) dados.id_vale = textoObrigatorio(payload.id_vale, 'id_vale', 60).toUpperCase();
  if (tem('descricao')) dados.descricao = textoObrigatorio(payload.descricao, 'descricao');
  if (tem('valor_inicial')) dados.valor_inicial = valorPositivo(payload.valor_inicial, 'valor_inicial');
  if (tem('data_inicio')) dados.data_inicio = dataObrigatoria(payload.data_inicio, 'data_inicio');
  if (tem('data_fim')) dados.data_fim = dataObrigatoria(payload.data_fim, 'data_fim');
  if (Object.keys(dados).length === 0) {
    throw new AppError(400, 'Informe ao menos um campo do contrato para alterar.');
  }

  const inicio = dados.data_inicio || new Date(`${dataISO(existente.data_inicio)}T00:00:00Z`);
  const fim = dados.data_fim || new Date(`${dataISO(existente.data_fim)}T00:00:00Z`);
  if (fim < inicio) {
    throw new AppError(400, 'A data de fim do contrato não pode ser anterior à data de início.');
  }

  if (dados.id_vale && dados.id_vale !== existente.id_vale && (await contratoRepository.findByIdVale(dados.id_vale))) {
    throw new AppError(409, `Já existe um contrato cadastrado com o identificador ${dados.id_vale}.`);
  }

  return montarContrato(await contratoRepository.atualizar(id, dados));
}

/**
 * DELETE /api/contratos/:id — somente ADMIN. Remove também os boletins, TACs, QQP e a
 * curva do contrato; as obras vinculadas apenas deixam de ter contrato. Quando há
 * dados dependentes é preciso confirmar com `forcar=true`.
 */
async function excluirContrato(idParam, query = {}, usuario) {
  validarUsuario(usuario);
  if (usuario.perfil !== 'ADMIN') {
    throw new AppError(403, 'Apenas administradores podem excluir contratos.');
  }
  const id = validarId(idParam);

  const existente = await contratoRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }

  const dependencias = await contratoRepository.resumirDependencias(id);
  if (dependencias.recursos_em_uso > 0) {
    throw new AppError(
      409,
      `O QQP deste contrato está em uso em ${dependencias.recursos_em_uso} alocação(ões) de obra. Remova essas alocações antes de excluir o contrato.`
    );
  }

  const temDados = dependencias.boletins + dependencias.aditivos + dependencias.itens_qqp + dependencias.curva_ciclos > 0;
  const forcar = String(query?.forcar ?? '').toLowerCase() === 'true';
  if (temDados && !forcar) {
    throw new AppError(
      409,
      'Este contrato tem boletins, TACs ou curva cadastrados. Confirme a exclusão para apagar tudo.',
      dependencias
    );
  }

  await contratoRepository.excluir(id);
  return { id, id_vale: existente.id_vale, excluido: true, removidos: dependencias };
}

/**
 * POST /api/contratos/:id/tac — registra um Termo Aditivo e atualiza o teto.
 * Devolve o contrato com o novo consolidado.
 */
async function registrarTac(idParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const id = validarId(idParam);

  const dados = {
    numero_tac: textoObrigatorio(payload.numero_tac, 'numero_tac', 30).toUpperCase(),
    valor_aditivo: valorPositivo(payload.valor_aditivo, 'valor_aditivo'),
    data_assinatura: dataObrigatoria(payload.data_assinatura, 'data_assinatura'),
    motivo: textoObrigatorio(payload.motivo, 'motivo'),
  };

  let aditivo;
  try {
    aditivo = await contratoRepository.registrarAditivo(id, dados, usuario.id ?? null);
  } catch (err) {
    if (err?.code === 'P2002') {
      throw new AppError(409, `O ${dados.numero_tac} já está registrado neste contrato.`);
    }
    throw err;
  }
  if (!aditivo) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }

  return montarContrato(await contratoRepository.findById(id));
}

/** PUT /api/contratos/:id/tac/:tacId — corrige o TAC (número, valor, assinatura, motivo). */
async function atualizarTac(idParam, tacIdParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const id = validarId(idParam);
  const tacId = validarId(tacIdParam, 'tacId');

  if (!(await contratoRepository.existsById(id))) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }
  const existente = await contratoRepository.buscarAditivo(id, tacId);
  if (!existente) {
    throw new AppError(404, `TAC ${tacId} não encontrado neste contrato.`);
  }

  const tem = (campo) => Object.prototype.hasOwnProperty.call(payload, campo);
  const dados = {};
  if (tem('numero_tac')) {
    dados.numero_tac = textoObrigatorio(payload.numero_tac, 'numero_tac', 30).toUpperCase();
    if (dados.numero_tac !== existente.numero_tac && (await contratoRepository.existeNumeroTac(id, dados.numero_tac, tacId))) {
      throw new AppError(409, `O ${dados.numero_tac} já está registrado neste contrato.`);
    }
  }
  if (tem('valor_aditivo')) dados.valor_aditivo = valorPositivo(payload.valor_aditivo, 'valor_aditivo');
  if (tem('data_assinatura')) dados.data_assinatura = dataObrigatoria(payload.data_assinatura, 'data_assinatura');
  if (tem('motivo')) dados.motivo = textoObrigatorio(payload.motivo, 'motivo');
  if (Object.keys(dados).length === 0) {
    throw new AppError(400, 'Informe ao menos um campo do TAC para alterar.');
  }

  await contratoRepository.atualizarAditivo(id, tacId, dados);
  return montarContrato(await contratoRepository.findById(id));
}

/** DELETE /api/contratos/:id/tac/:tacId — remove o TAC e recalcula o teto. */
async function excluirTac(idParam, tacIdParam, usuario) {
  exigirGestor(usuario);
  const id = validarId(idParam);
  const tacId = validarId(tacIdParam, 'tacId');

  if (!(await contratoRepository.existsById(id))) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }
  if (!(await contratoRepository.buscarAditivo(id, tacId))) {
    throw new AppError(404, `TAC ${tacId} não encontrado neste contrato.`);
  }
  const dependencias = await contratoRepository.contarDependenciasDoAditivo(tacId);
  if (dependencias.itensQqp > 0 || dependencias.projecoes > 0) {
    throw new AppError(
      409,
      `O TAC tem ${dependencias.itensQqp} item(ns) no QQP e ${dependencias.projecoes} projeção(ões) de BMM. Remova-os antes de excluir o TAC.`
    );
  }

  await contratoRepository.excluirAditivo(id, tacId);
  return montarContrato(await contratoRepository.findById(id));
}

/**
 * POST /api/contratos/:id/obras — vincula obras ao contrato.
 * Corpo: { obra_ids: [1, 2, 3] }. Uma obra já ligada a outro contrato passa
 * para este (cada obra tem um único contrato-mãe).
 */
async function vincularObras(idParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const id = validarId(idParam);

  const lista = Array.isArray(payload.obra_ids) ? payload.obra_ids : [];
  const obraIds = [...new Set(lista.map(Number))];
  if (obraIds.length === 0 || obraIds.some((obraId) => !Number.isInteger(obraId) || obraId <= 0)) {
    throw new AppError(400, 'Informe "obra_ids" com os IDs das obras (números inteiros positivos).');
  }

  if (!(await contratoRepository.existsById(id))) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }

  const existentes = await contratoRepository.obrasExistentes(obraIds);
  const faltando = obraIds.filter((obraId) => !existentes.includes(obraId));
  if (faltando.length > 0) {
    throw new AppError(404, `Obra(s) não encontrada(s): ${faltando.join(', ')}.`);
  }

  await contratoRepository.vincularObras(id, obraIds);
  return montarContrato(await contratoRepository.findById(id));
}

module.exports = {
  atualizarTac,
  excluirTac,
  atualizarContrato,
  excluirContrato,
  PERFIS_QUE_GEREM_CONTRATOS,
  listarContratos,
  obterContrato,
  criarContrato,
  registrarTac,
  vincularObras,
  montarContrato,
};

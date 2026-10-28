'use strict';

const AppError = require('../errors/AppError');
const orcamentoRepository = require('../repositories/orcamentoRepository');
const obraRepository = require('../repositories/obraRepository');

/** Perfis reconhecidos pelo RBAC do módulo. */
const PERFIS = {
  ORCAMENTISTA: 'ORCAMENTISTA',
  PLANEJADOR: 'PLANEJADOR',
  SUPERVISOR: 'SUPERVISOR',
  ADMIN: 'ADMIN',
};

/** Somente estes perfis podem gravar/atualizar o campo `art`. */
const PERFIS_QUE_EDITAM_ART = [PERFIS.PLANEJADOR, PERFIS.SUPERVISOR, PERFIS.ADMIN];

/** Somente estes perfis podem atribuir `planejador_id`. */
const PERFIS_QUE_ATRIBUEM_PLANEJADOR = [PERFIS.SUPERVISOR, PERFIS.ADMIN];

/**
 * Fluxo operacional do orçamento (espelha o enum StatusOrcamento do schema).
 * A ordem reflete o ciclo: levantamento → envio → aprovação → OSI.
 */
const STATUS_VALIDOS = [
  'VISITA_TECNICA',
  'AGUARDANDO_APROVACAO',
  'APROVADO',
  'DESATIVADO',
  'ENCAMINHADO_OSI',
  'OSI_EMITIDA',
];

/** Estado inicial de todo orçamento recém-aberto. */
const STATUS_INICIAL = 'VISITA_TECNICA';

/** Status que representam decisão tomada pelo cliente (base da taxa de aprovação). */
const STATUS_DECIDIDOS = ['APROVADO', 'DESATIVADO'];

/**
 * Escopo COMERCIAL — etapas sob responsabilidade do Técnico Orçamentista.
 *
 * A listagem padrão (`escopo=comercial`) devolve apenas estas etapas, mantendo
 * a visão do orçamentista focada no seu ciclo. Os orçamentos já encaminhados ao
 * Planejamento (ENCAMINHADO_OSI / OSI_EMITIDA) permanecem íntegros no banco e
 * voltam a aparecer somente quando o cliente pede explicitamente `escopo=todos`.
 */
const STATUS_COMERCIAL = ['VISITA_TECNICA', 'AGUARDANDO_APROVACAO', 'APROVADO', 'DESATIVADO'];

/**
 * Escopo OBRAS — etapas de efetivação e execução (aprovado em diante).
 *
 * Alimenta a seção de Obras: o orçamento aprovado passa a ser um projeto em
 * execução, conduzido pelo Planejamento (abertura e emissão da OSI). Os status
 * comerciais anteriores (visita técnica, aguardando aprovação e desativado)
 * permanecem restritos à aba de Orçamentos.
 */
const STATUS_OBRAS = ['APROVADO', 'ENCAMINHADO_OSI', 'OSI_EMITIDA'];

/** Escopos aceitos pelo filtro de listagem → lista de status permitidos. */
const ESCOPOS = {
  comercial: STATUS_COMERCIAL,
  obras: STATUS_OBRAS,
  todos: null,
};

const ESCOPOS_VALIDOS = Object.keys(ESCOPOS);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function temCampo(obj, campo) {
  return Object.prototype.hasOwnProperty.call(obj, campo);
}

function estaVazio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

function validarUsuario(usuario) {
  if (!usuario || usuario.id === undefined || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!Object.values(PERFIS).includes(usuario.perfil)) {
    throw new AppError(403, `Perfil desconhecido: "${usuario.perfil}".`);
  }
}

function validarId(id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, 'O parâmetro "id" deve ser um número inteiro positivo.');
  }
  return numero;
}

/** Converte e valida um valor monetário. */
function normalizarValor(valor, { obrigatorio = false } = {}) {
  if (estaVazio(valor)) {
    if (obrigatorio) {
      throw new AppError(400, 'O campo "valor" é obrigatório.');
    }
    return 0;
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new AppError(400, 'O campo "valor" deve ser um número maior ou igual a zero.');
  }
  return numero;
}

/** Campos cuja ausência impede a abertura do orçamento ([campo, rótulo]). */
const CAMPOS_OBRIGATORIOS = [
  ['pep', 'PEP (CC)'],
  ['cliente', 'Cliente / Área'],
  ['endereco', 'Endereço'],
  ['descricao', 'Detalhamento do Serviço'],
  ['documentos_referencia', 'Documentos de Referência'],
  ['observacao_inicial', 'Justificativa / Observação da Revisão'],
];

/** Campos obrigatórios + foto_1 — em modo parcial só valida o que vier no payload. */
function validarCamposObrigatorios(payload, { parcial = false } = {}) {
  for (const [campo, rotulo] of CAMPOS_OBRIGATORIOS) {
    if (parcial && !temCampo(payload, campo)) continue;
    if (estaVazio(payload[campo])) {
      throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
    }
  }

  const deveValidarFoto1 = !parcial || temCampo(payload, 'foto_1');
  if (deveValidarFoto1 && estaVazio(payload.foto_1)) {
    throw new AppError(400, 'O campo "foto_1" é obrigatório.');
  }
}

/**
 * Normaliza a lista de fiscais recebida na requisição.
 * Aceita array (JSON) ou string JSON (multipart/form-data).
 * @returns {{nome:string, contato:string|null}[]}
 */
function normalizarFiscais(valor) {
  if (estaVazio(valor)) {
    return [];
  }

  let lista = valor;
  if (typeof valor === 'string') {
    try {
      lista = JSON.parse(valor);
    } catch {
      throw new AppError(400, 'O campo "fiscais" deve ser uma lista válida.');
    }
  }

  if (!Array.isArray(lista)) {
    throw new AppError(400, 'O campo "fiscais" deve ser uma lista de fiscais.');
  }

  return lista
    .filter((item) => item && !estaVazio(item.nome))
    .map((item) => ({
      nome: String(item.nome).trim(),
      contato: estaVazio(item.contato) ? null : String(item.contato).trim(),
    }));
}

/** Exige ao menos um fiscal, e que todos tenham contato informado. */
function validarFiscais(fiscais) {
  if (fiscais.length === 0) {
    throw new AppError(400, 'Informe ao menos um fiscal com nome e contato.');
  }

  const semContato = fiscais.find((fiscal) => !fiscal.contato);
  if (semContato) {
    throw new AppError(400, `Informe o contato do fiscal "${semContato.nome}".`);
  }
}

/** RBAC: apenas PLANEJADOR/SUPERVISOR/ADMIN podem gravar o campo `art`. */
function validarPermissaoArt(payload, usuario) {
  if (temCampo(payload, 'art') && !estaVazio(payload.art) && !PERFIS_QUE_EDITAM_ART.includes(usuario.perfil)) {
    throw new AppError(
      403,
      'Apenas perfis PLANEJADOR, SUPERVISOR ou ADMIN podem informar o campo "art".'
    );
  }
}

/** RBAC: apenas SUPERVISOR/ADMIN podem atribuir `planejador_id`. */
function validarPermissaoPlanejador(payload, usuario) {
  if (
    temCampo(payload, 'planejador_id') &&
    !estaVazio(payload.planejador_id) &&
    !PERFIS_QUE_ATRIBUEM_PLANEJADOR.includes(usuario.perfil)
  ) {
    throw new AppError(
      403,
      'Apenas perfis SUPERVISOR ou ADMIN podem atribuir o "planejador_id".'
    );
  }
}

function validarStatus(status) {
  if (!estaVazio(status) && !STATUS_VALIDOS.includes(status)) {
    throw new AppError(400, `Status inválido. Valores aceitos: ${STATUS_VALIDOS.join(', ')}.`);
  }
}

/** Formata o rótulo da revisão: 0 -> "Rev 00", 1 -> "Rev 01". */
function rotuloRevisao(numero) {
  return `Rev ${String(numero).padStart(2, '0')}`;
}

/**
 * Garante a obra correspondente quando o orçamento passa a integrar o ciclo de
 * execução (aprovado em diante). A operação é idempotente: aprovado o orçamento,
 * ele passa a ter acompanhamento operacional no módulo de Obras (ISO 9001).
 */
async function garantirObraDoOrcamento(orcamento) {
  if (!orcamento || !STATUS_OBRAS.includes(orcamento.status)) {
    return;
  }

  await obraRepository.garantirParaOrcamento(orcamento.id, {
    planejador_id: orcamento.planejador_id ?? null,
  });
}

/**
 * Converte um parâmetro de data (AAAA-MM-DD ou ISO) em Date.
 * Para o limite superior, uma data sem hora é estendida até 23:59:59.999,
 * garantindo que os registros criados ao longo do dia entrem no filtro.
 */
function normalizarData(valor, campo, { fimDoDia = false } = {}) {
  if (estaVazio(valor)) return undefined;

  const texto = String(valor).trim();
  const data = new Date(texto);

  if (Number.isNaN(data.getTime())) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser uma data válida (AAAA-MM-DD).`);
  }

  if (fimDoDia && /^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    data.setUTCHours(23, 59, 59, 999);
  }

  return data;
}

/** Padroniza a resposta incluindo o rótulo "Rev XX" em cada revisão. */
function formatarOrcamento(orcamento) {
  if (!orcamento) {
    return null;
  }
  const revisoes = Array.isArray(orcamento.revisoes) ? orcamento.revisoes : [];
  return {
    ...orcamento,
    revisoes: revisoes.map((revisao) => ({
      ...revisao,
      rotulo: rotuloRevisao(revisao.numero_revisao),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

/** POST /api/orcamentos */
async function criarOrcamento(payload, usuario) {
  validarUsuario(usuario);
  validarCamposObrigatorios(payload, { parcial: false });
  validarPermissaoArt(payload, usuario);
  validarPermissaoPlanejador(payload, usuario);
  validarStatus(payload.status);

  const fiscais = normalizarFiscais(payload.fiscais);
  validarFiscais(fiscais);

  const dados = {
    pep: String(payload.pep).trim(),
    cliente: estaVazio(payload.cliente) ? null : String(payload.cliente).trim(),
    ss: estaVazio(payload.ss) ? null : String(payload.ss).trim(),
    descricao: estaVazio(payload.descricao) ? null : String(payload.descricao).trim(),
    endereco: estaVazio(payload.endereco) ? null : String(payload.endereco).trim(),
    documentos_referencia: estaVazio(payload.documentos_referencia)
      ? null
      : String(payload.documentos_referencia).trim(),
    status: estaVazio(payload.status) ? STATUS_INICIAL : payload.status,
    valor: normalizarValor(payload.valor, { obrigatorio: true }),
    art: PERFIS_QUE_EDITAM_ART.includes(usuario.perfil) && !estaVazio(payload.art)
      ? String(payload.art).trim()
      : null,
    orcamentista_id: usuario.id,
    planejador_id: PERFIS_QUE_ATRIBUEM_PLANEJADOR.includes(usuario.perfil) && !estaVazio(payload.planejador_id)
      ? Number(payload.planejador_id)
      : null,
    foto_1: String(payload.foto_1).trim(),
    foto_2: estaVazio(payload.foto_2) ? null : String(payload.foto_2).trim(),
    foto_3: estaVazio(payload.foto_3) ? null : String(payload.foto_3).trim(),
    observacao_inicial: estaVazio(payload.observacao_inicial) ? null : String(payload.observacao_inicial).trim(),
    fiscais,
  };

  const orcamento = await orcamentoRepository.create(dados);
  // Orçamento já nasce no ciclo de execução? Garante a obra correspondente.
  await garantirObraDoOrcamento(orcamento);
  return formatarOrcamento(orcamento);
}

/** GET /api/orcamentos/:id */
async function obterOrcamentoPorId(idParam) {
  const id = validarId(idParam);
  const orcamento = await orcamentoRepository.findById(id);

  if (!orcamento) {
    throw new AppError(404, `Orçamento ${id} não encontrado.`);
  }

  return formatarOrcamento(orcamento);
}

/** GET /api/orcamentos */
async function listarOrcamentos(query = {}) {
  const page = query.page !== undefined ? Number(query.page) : 1;
  const limit = query.limit !== undefined ? Number(query.limit) : 20;

  if (!Number.isInteger(page) || page <= 0) {
    throw new AppError(400, 'O parâmetro "page" deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw new AppError(400, 'O parâmetro "limit" deve ser um inteiro entre 1 e 100.');
  }

  const escopo = estaVazio(query.escopo) ? 'comercial' : String(query.escopo).trim().toLowerCase();
  if (!ESCOPOS_VALIDOS.includes(escopo)) {
    throw new AppError(400, `Escopo inválido. Valores aceitos: ${ESCOPOS_VALIDOS.join(', ')}.`);
  }

  const status = estaVazio(query.status) ? undefined : String(query.status).trim();

  const resultado = await orcamentoRepository.findAll({
    status,
    // O escopo limita as etapas quando o cliente não escolhe um status específico.
    statuses: !status && ESCOPOS[escopo] ? ESCOPOS[escopo] : undefined,
    pep: estaVazio(query.pep) ? undefined : String(query.pep).trim(),
    busca: estaVazio(query.busca) ? undefined : String(query.busca).trim(),
    page,
    limit,
  });

  return {
    ...resultado,
    data: resultado.data.map((orcamento) => formatarOrcamento(orcamento)),
  };
}

/** GET /api/orcamentos/opcoes */
async function listarOpcoes() {
  return orcamentoRepository.listarOpcoes();
}

/**
 * GET /api/orcamentos/estatisticas
 *
 * Indicadores do Dashboard BI. Além das agregações do banco, deriva KPIs de
 * gestão: taxa de aprovação (aprovados ÷ decididos) e a distribuição completa
 * por status — os 6 status oficiais sempre aparecem, mesmo com quantidade zero.
 */
async function obterEstatisticas(query = {}) {
  const filtros = {
    de: normalizarData(query.de, 'de'),
    ate: normalizarData(query.ate, 'ate', { fimDoDia: true }),
    busca: estaVazio(query.busca) ? undefined : String(query.busca).trim(),
  };

  if (filtros.de && filtros.ate && filtros.de > filtros.ate) {
    throw new AppError(400, 'A data inicial ("de") não pode ser posterior à final ("ate").');
  }

  const dados = await orcamentoRepository.obterEstatisticas(filtros);

  const porStatus = STATUS_VALIDOS.map((status) => {
    const linha = dados.porStatus.find((item) => item.status === status);
    return {
      status,
      quantidade: linha ? linha.quantidade : 0,
      valor: linha ? linha.valor : 0,
    };
  });

  const quantidadeDe = (status) => porStatus.find((item) => item.status === status).quantidade;
  const aprovados = quantidadeDe('APROVADO');
  const decididos = STATUS_DECIDIDOS.reduce((soma, status) => soma + quantidadeDe(status), 0);

  return {
    filtros: {
      de: filtros.de ? filtros.de.toISOString() : null,
      ate: filtros.ate ? filtros.ate.toISOString() : null,
      busca: filtros.busca || null,
    },
    resumo: {
      total: dados.total,
      valorTotal: dados.valorTotal,
      ticketMedio: dados.ticketMedio,
      aprovados,
      decididos,
      // Sem decisões registradas não há taxa — 0 evita divisão por zero.
      taxaAprovacao: decididos === 0 ? 0 : aprovados / decididos,
    },
    porStatus,
    top: dados.top,
  };
}

/** PUT /api/orcamentos/:id */
async function atualizarOrcamento(idParam, payload, usuario) {
  const id = validarId(idParam);
  validarUsuario(usuario);

  const existente = await orcamentoRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Orçamento ${id} não encontrado.`);
  }

  validarCamposObrigatorios(payload, { parcial: true });
  validarPermissaoArt(payload, usuario);
  validarPermissaoPlanejador(payload, usuario);
  validarStatus(payload.status);

  const valorAtual = Number(existente.valor);
  const novoValor = temCampo(payload, 'valor')
    ? normalizarValor(payload.valor, { obrigatorio: true })
    : null;
  const houveAlteracaoDeValor = novoValor !== null && novoValor !== valorAtual;

  // Monta apenas os campos permitidos que vieram na requisição, respeitando o RBAC.
  const dados = {};
  if (temCampo(payload, 'pep')) dados.pep = String(payload.pep).trim();
  if (temCampo(payload, 'cliente')) dados.cliente = estaVazio(payload.cliente) ? null : String(payload.cliente).trim();
  if (temCampo(payload, 'ss')) dados.ss = estaVazio(payload.ss) ? null : String(payload.ss).trim();
  if (temCampo(payload, 'descricao')) dados.descricao = estaVazio(payload.descricao) ? null : String(payload.descricao).trim();
  if (temCampo(payload, 'endereco')) dados.endereco = estaVazio(payload.endereco) ? null : String(payload.endereco).trim();
  if (temCampo(payload, 'documentos_referencia')) {
    dados.documentos_referencia = estaVazio(payload.documentos_referencia)
      ? null
      : String(payload.documentos_referencia).trim();
  }
  if (temCampo(payload, 'status')) dados.status = payload.status;
  if (temCampo(payload, 'foto_1')) dados.foto_1 = String(payload.foto_1).trim();
  if (temCampo(payload, 'foto_2')) dados.foto_2 = estaVazio(payload.foto_2) ? null : String(payload.foto_2).trim();
  if (temCampo(payload, 'foto_3')) dados.foto_3 = estaVazio(payload.foto_3) ? null : String(payload.foto_3).trim();

  // Fiscais: a lista enviada substitui integralmente a anterior.
  if (temCampo(payload, 'fiscais')) {
    const fiscais = normalizarFiscais(payload.fiscais);
    validarFiscais(fiscais);
    dados.fiscais = fiscais;
  }

  // ART só é aceita de perfis autorizados (campo ignorado para os demais).
  if (temCampo(payload, 'art') && PERFIS_QUE_EDITAM_ART.includes(usuario.perfil)) {
    dados.art = estaVazio(payload.art) ? null : String(payload.art).trim();
  }

  // planejador_id só é aceito de SUPERVISOR/ADMIN.
  if (temCampo(payload, 'planejador_id') && PERFIS_QUE_ATRIBUEM_PLANEJADOR.includes(usuario.perfil)) {
    dados.planejador_id = estaVazio(payload.planejador_id) ? null : Number(payload.planejador_id);
  }

  if (Object.keys(dados).length > 0) {
    await orcamentoRepository.update(id, dados);
  }

  // Alteração de valor exige justificativa e gera nova revisão.
  if (houveAlteracaoDeValor) {
    if (estaVazio(payload.observacao)) {
      throw new AppError(400, 'É obrigatório informar "observacao" ao alterar o valor do orçamento.');
    }
    await orcamentoRepository.addRevisao(id, novoValor, String(payload.observacao).trim(), usuario.id);
  }

  const atualizado = await orcamentoRepository.findById(id);
  // Ao entrar no ciclo de execução (aprovado em diante) a obra é criada.
  await garantirObraDoOrcamento(atualizado);
  return formatarOrcamento(atualizado);
}

/** POST /api/orcamentos/:id/revisoes */
async function adicionarRevisao(idParam, payload, usuario) {
  const id = validarId(idParam);
  validarUsuario(usuario);

  const existente = await orcamentoRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Orçamento ${id} não encontrado.`);
  }

  const valor = normalizarValor(payload.valor, { obrigatorio: true });

  if (estaVazio(payload.observacao)) {
    throw new AppError(400, 'O campo "observacao" é obrigatório para registrar uma revisão de valor.');
  }

  const revisao = await orcamentoRepository.addRevisao(
    id,
    valor,
    String(payload.observacao).trim(),
    usuario.id
  );

  return {
    orcamento_id: id,
    revisao: {
      ...revisao,
      rotulo: rotuloRevisao(revisao.numero_revisao),
    },
  };
}

module.exports = {
  PERFIS,
  STATUS_VALIDOS,
  STATUS_COMERCIAL,
  STATUS_OBRAS,
  STATUS_INICIAL,
  criarOrcamento,
  obterOrcamentoPorId,
  listarOrcamentos,
  listarOpcoes,
  obterEstatisticas,
  atualizarOrcamento,
  adicionarRevisao,
};

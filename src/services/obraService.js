'use strict';

const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');
const usuarioRepository = require('../repositories/usuarioRepository');

/** Perfis reconhecidos pelo RBAC do módulo. */
const PERFIS = {
  ORCAMENTISTA: 'ORCAMENTISTA',
  PLANEJADOR: 'PLANEJADOR',
  SUPERVISOR: 'SUPERVISOR',
  ADMIN: 'ADMIN',
};

/** Somente SUPERVISOR/ADMIN atribuem o planejador responsável pela obra. */
const PERFIS_QUE_ATRIBUEM_PLANEJADOR = [PERFIS.SUPERVISOR, PERFIS.ADMIN];

/** Tamanho máximo da equipe de planejamento de uma obra (principal + secundário). */
const MAX_PLANEJADORES = 2;

/** Perfis autorizados a registrar a emissão da OSI. */
const PERFIS_QUE_EMITEM_OSI = [PERFIS.PLANEJADOR, PERFIS.SUPERVISOR, PERFIS.ADMIN];

/** Ciclo de vida operacional da obra (espelha o enum StatusObra do schema). */
const STATUS_VALIDOS = ['PARA_INICIAR', 'EM_ANDAMENTO', 'PARALISADA', 'CONCLUIDA'];

/** Carteiras do dashboard executivo (espelha o enum CategoriaObra do schema). */
const CATEGORIAS_VALIDAS = ['CADEIA_DE_AJUDA', 'CARTEIRA_DA_COORDENACAO'];

const STATUS_INICIAL = 'PARA_INICIAR';

/**
 * Etapas de execução que só podem ser assumidas com a documentação de partida
 * completa (ISO 9001): OSI emitida e Ata de Reunião de Partida anexada.
 */
const STATUS_QUE_EXIGEM_DOCUMENTACAO = ['EM_ANDAMENTO', 'CONCLUIDA'];

const ROTULOS_STATUS = {
  PARA_INICIAR: 'Para Iniciar',
  EM_ANDAMENTO: 'Em Andamento',
  PARALISADA: 'Paralisada',
  CONCLUIDA: 'Concluída',
};

const ROTULOS_PENDENCIA = {
  osi: 'OSI assinada (anexo)',
  ata: 'Ata de Reunião de Partida',
};

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

function validarStatus(status) {
  if (!STATUS_VALIDOS.includes(status)) {
    throw new AppError(400, `Status da obra inválido. Valores aceitos: ${STATUS_VALIDOS.join(', ')}.`);
  }
}

/** Monta a mensagem das pendências documentais em aberto. */
function descreverPendencias(pendencias) {
  const itens = [];
  if (pendencias.osi) itens.push(ROTULOS_PENDENCIA.osi);
  if (pendencias.ata) itens.push(ROTULOS_PENDENCIA.ata);
  return itens.join(' e ');
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/obras
 * ?status=PARA_INICIAR&pendencia=pendentes&busca=&pep=&page=&limit=
 */
async function listarObras(query = {}) {
  const page = query.page !== undefined ? Number(query.page) : 1;
  const limit = query.limit !== undefined ? Number(query.limit) : 20;

  if (!Number.isInteger(page) || page <= 0) {
    throw new AppError(400, 'O parâmetro "page" deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw new AppError(400, 'O parâmetro "limit" deve ser um inteiro entre 1 e 100.');
  }

  const status = estaVazio(query.status) ? undefined : String(query.status).trim().toUpperCase();
  if (status) {
    validarStatus(status);
  }

  const PENDENCIAS_VALIDAS = ['osi', 'ata', 'pendentes', 'ok'];
  const pendencia = estaVazio(query.pendencia) ? undefined : String(query.pendencia).trim().toLowerCase();
  if (pendencia && !PENDENCIAS_VALIDAS.includes(pendencia)) {
    throw new AppError(400, `Filtro de pendência inválido. Valores aceitos: ${PENDENCIAS_VALIDAS.join(', ')}.`);
  }

  return obraRepository.findAll({
    status,
    pendencia,
    pep: estaVazio(query.pep) ? undefined : String(query.pep).trim(),
    busca: estaVazio(query.busca) ? undefined : String(query.busca).trim(),
    page,
    limit,
  });
}

/** GET /api/obras/:id */
async function obterObra(idParam) {
  const id = validarId(idParam);
  const obra = await obraRepository.findById(id);

  if (!obra) {
    throw new AppError(404, `Obra ${id} não encontrada.`);
  }

  return obra;
}

/** GET /api/obras/planejadores — técnicos planejadores ativos (para atribuição). */
async function listarPlanejadores() {
  return usuarioRepository.findManyByPerfil(PERFIS.PLANEJADOR);
}

/**
 * Lê a equipe de planejadores do payload e a valida.
 *
 * Aceita `planejadores_ids` (lista em ordem; o primeiro é o principal — também
 * aceito como `planejadoresIds`) ou o campo legado `planejador_id` (equipe de
 * um só). Devolve `undefined` quando o payload não trata de planejadores.
 */
async function normalizarPlanejadores(payload, existente, usuario) {
  const campoLista = ['planejadores_ids', 'planejadoresIds'].find((campo) => temCampo(payload, campo));
  if (!campoLista && !temCampo(payload, 'planejador_id')) {
    return undefined;
  }

  if (!PERFIS_QUE_ATRIBUEM_PLANEJADOR.includes(usuario.perfil)) {
    throw new AppError(403, 'Apenas perfis SUPERVISOR ou ADMIN podem atribuir o planejador da obra.');
  }

  let bruto;
  if (campoLista) {
    bruto = payload[campoLista] ?? [];
    if (!Array.isArray(bruto)) {
      throw new AppError(400, `O campo "${campoLista}" deve ser uma lista de IDs de usuários.`);
    }
  } else {
    bruto = estaVazio(payload.planejador_id) ? [] : [payload.planejador_id];
  }

  const ids = bruto.map(Number);
  if (ids.some((valor) => !Number.isInteger(valor) || valor <= 0)) {
    throw new AppError(400, 'Os IDs de planejadores devem ser números inteiros positivos.');
  }
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, 'O mesmo planejador não pode ser atribuído duas vezes à obra.');
  }
  if (ids.length > MAX_PLANEJADORES) {
    throw new AppError(400, `Uma obra pode ter no máximo ${MAX_PLANEJADORES} planejadores.`);
  }

  // Quem já estava na equipe pode continuar mesmo se tiver sido desativado
  // depois; a exigência de usuário ativo vale apenas para novas atribuições.
  const atuais = new Set(existente.planejadores_ids || []);
  for (const planejadorId of ids) {
    // eslint-disable-next-line no-await-in-loop
    const planejador = await usuarioRepository.findById(planejadorId);
    if (!planejador) {
      throw new AppError(404, `Usuário ${planejadorId} não encontrado.`);
    }
    if (planejador.perfil !== PERFIS.PLANEJADOR) {
      throw new AppError(400, `"${planejador.nome}" não tem o perfil PLANEJADOR.`);
    }
    if (planejador.ativo === false && !atuais.has(planejadorId)) {
      throw new AppError(400, `O planejador "${planejador.nome}" está inativo.`);
    }
  }

  return ids;
}

/**
 * PUT /api/obras/:id
 * Atualiza status operacional, planejadores responsáveis, observações, OSI
 * assinada e Ata.
 */
async function atualizarObra(idParam, payload, usuario) {
  const id = validarId(idParam);
  validarUsuario(usuario);

  const existente = await obraRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Obra ${id} não encontrada.`);
  }

  const dados = {};

  // ----------------------------------------------------------- Planejadores
  const planejadoresIds = await normalizarPlanejadores(payload, existente, usuario);

  // ------------------------------------------------------------- Categoria
  if (temCampo(payload, 'categoria')) {
    if (!PERFIS_QUE_ATRIBUEM_PLANEJADOR.includes(usuario.perfil)) {
      throw new AppError(403, 'Apenas perfis SUPERVISOR ou ADMIN podem classificar a obra.');
    }

    if (estaVazio(payload.categoria)) {
      dados.categoria = null;
    } else {
      const categoria = String(payload.categoria).trim().toUpperCase();
      if (!CATEGORIAS_VALIDAS.includes(categoria)) {
        throw new AppError(
          400,
          `Categoria inválida. Valores aceitos: ${CATEGORIAS_VALIDAS.join(', ')}.`
        );
      }
      dados.categoria = categoria;
    }
  }

  // ------------------------------------------------------- OSI assinada
  // A OSI emitida no sistema é impressa, assinada e anexada aqui; uma OSI já
  // assinada fora do sistema também pode ser anexada direto (com o número).
  if (temCampo(payload, 'osi_anexo_url')) {
    if (estaVazio(payload.osi_anexo_url)) {
      dados.osi_anexo_url = null;
      dados.osi_anexada_em = null;
      dados.osi_anexada_por = null;
    } else {
      dados.osi_anexo_url = String(payload.osi_anexo_url).trim();
      dados.osi_anexada_em = new Date();
      dados.osi_anexada_por = usuario.id ?? null;
    }
  }
  if (temCampo(payload, 'osi_numero') && !estaVazio(payload.osi_numero)) {
    dados.osi_numero = String(payload.osi_numero).trim().slice(0, 60);
  }

  // ------------------------------------------------------------------- Ata
  if (temCampo(payload, 'ata_partida_url')) {
    dados.ata_partida_url = estaVazio(payload.ata_partida_url) ? null : String(payload.ata_partida_url).trim();
  }

  // ---------------------------------------------------------- Observações
  if (temCampo(payload, 'observacoes')) {
    dados.observacoes = estaVazio(payload.observacoes) ? null : String(payload.observacoes).trim();
  }

  // ---------------------------------------------------------------- Status
  if (temCampo(payload, 'status')) {
    if (estaVazio(payload.status)) {
      throw new AppError(400, 'O campo "status" é obrigatório.');
    }

    const novoStatus = String(payload.status).trim().toUpperCase();
    validarStatus(novoStatus);

    if (novoStatus !== existente.status) {
      // Régua ISO 9001: não se inicia nem conclui a obra com documentação pendente.
      // A Ata pode ser anexada na mesma requisição que altera o status.
      const pendencias = {
        ...existente.pendencias,
        osi: temCampo(dados, 'osi_anexo_url') ? !dados.osi_anexo_url : existente.pendencias.osi,
        ata: temCampo(dados, 'ata_partida_url') ? !dados.ata_partida_url : existente.pendencias.ata,
      };
      pendencias.total = (pendencias.osi ? 1 : 0) + (pendencias.ata ? 1 : 0);
      pendencias.completa = !pendencias.osi && !pendencias.ata;

      if (STATUS_QUE_EXIGEM_DOCUMENTACAO.includes(novoStatus) && !pendencias.completa) {
        throw new AppError(
          422,
          `Documentação pendente: conclua a ${descreverPendencias(pendencias)} antes de mover a obra para "${ROTULOS_STATUS[novoStatus]}".`
        );
      }

      dados.status = novoStatus;
    }
  }

  if (Object.keys(dados).length === 0 && !planejadoresIds) {
    return existente;
  }

  if (Object.keys(dados).length > 0) {
    await obraRepository.update(id, dados);
  }
  if (planejadoresIds) {
    await obraRepository.definirPlanejadores(id, planejadoresIds);
  }
  return obraRepository.findById(id);
}

/**
 * POST /api/obras/:id/osi
 * Registra a emissão da Ordem de Serviço Interna.
 */
async function registrarOsi(idParam, payload, usuario) {
  const id = validarId(idParam);
  validarUsuario(usuario);

  if (!PERFIS_QUE_EMITEM_OSI.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_QUE_EMITEM_OSI.join(', ')} podem emitir a OSI.`);
  }

  const existente = await obraRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Obra ${id} não encontrada.`);
  }

  const numero = payload.osi_numero ?? payload.numero;
  if (estaVazio(numero)) {
    throw new AppError(400, 'Informe o número da OSI no campo "osi_numero".');
  }

  await obraRepository.registrarOsi(id, {
    numero: String(numero).trim(),
    usuarioId: usuario.id,
  });

  return obraRepository.findById(id);
}

module.exports = {
  PERFIS,
  STATUS_VALIDOS,
  STATUS_INICIAL,
  STATUS_QUE_EXIGEM_DOCUMENTACAO,
  PERFIS_QUE_ATRIBUEM_PLANEJADOR,
  PERFIS_QUE_EMITEM_OSI,
  MAX_PLANEJADORES,
  ROTULOS_STATUS,
  listarObras,
  obterObra,
  listarPlanejadores,
  atualizarObra,
  registrarOsi,
};

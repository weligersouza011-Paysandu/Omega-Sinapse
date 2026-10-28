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

/** Perfis autorizados a registrar a emissão da OSI. */
const PERFIS_QUE_EMITEM_OSI = [PERFIS.PLANEJADOR, PERFIS.SUPERVISOR, PERFIS.ADMIN];

/** Ciclo de vida operacional da obra (espelha o enum StatusObra do schema). */
const STATUS_VALIDOS = ['PARA_INICIAR', 'EM_ANDAMENTO', 'PARALISADA', 'CONCLUIDA'];

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
  osi: 'Emissão da OSI',
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
 * PUT /api/obras/:id
 * Atualiza status operacional, planejador responsável, observações e Ata.
 */
async function atualizarObra(idParam, payload, usuario) {
  const id = validarId(idParam);
  validarUsuario(usuario);

  const existente = await obraRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Obra ${id} não encontrada.`);
  }

  const dados = {};

  // ------------------------------------------------------------ Planejador
  if (temCampo(payload, 'planejador_id')) {
    if (!PERFIS_QUE_ATRIBUEM_PLANEJADOR.includes(usuario.perfil)) {
      throw new AppError(403, 'Apenas perfis SUPERVISOR ou ADMIN podem atribuir o planejador da obra.');
    }

    if (estaVazio(payload.planejador_id)) {
      dados.planejador_id = null;
    } else {
      const planejadorId = Number(payload.planejador_id);
      if (!Number.isInteger(planejadorId) || planejadorId <= 0) {
        throw new AppError(400, 'O campo "planejador_id" deve ser um número inteiro positivo.');
      }

      const planejador = await usuarioRepository.findById(planejadorId);
      if (!planejador) {
        throw new AppError(404, `Usuário ${planejadorId} não encontrado.`);
      }
      if (planejador.perfil !== PERFIS.PLANEJADOR) {
        throw new AppError(400, 'O responsável pela obra deve ter o perfil PLANEJADOR.');
      }
      if (planejador.ativo === false) {
        throw new AppError(400, `O planejador "${planejador.nome}" está inativo.`);
      }

      dados.planejador_id = planejadorId;
    }
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

  if (Object.keys(dados).length === 0) {
    return existente;
  }

  await obraRepository.update(id, dados);
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
  ROTULOS_STATUS,
  listarObras,
  obterObra,
  listarPlanejadores,
  atualizarObra,
  registrarOsi,
};

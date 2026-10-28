'use strict';

const obraService = require('../services/obraService');

/**
 * GET /api/obras
 * Lista as obras (projetos em execução) com paginação e filtros
 * (?status=&pendencia=&busca=&pep=&page=&limit=).
 */
async function listarObras(req, res, next) {
  try {
    const resultado = await obraService.listarObras(req.query);
    return res.status(200).json(resultado);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/obras/planejadores
 * Lista os técnicos planejadores ativos (para atribuição em uma obra).
 */
async function listarPlanejadores(req, res, next) {
  try {
    const planejadores = await obraService.listarPlanejadores();
    return res.status(200).json({ data: planejadores });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/obras/:id */
async function obterObra(req, res, next) {
  try {
    const obra = await obraService.obterObra(req.params.id);
    return res.status(200).json(obra);
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/obras/:id
 * Atualiza o ciclo de vida operacional (status), o planejador responsável,
 * as observações e a Ata de Reunião de Partida.
 */
async function atualizarObra(req, res, next) {
  try {
    const obra = await obraService.atualizarObra(req.params.id, req.body || {}, req.user);
    return res.status(200).json(obra);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/obras/:id/osi
 * Registra a emissão da Ordem de Serviço Interna (número + responsável).
 */
async function registrarOsi(req, res, next) {
  try {
    const obra = await obraService.registrarOsi(req.params.id, req.body || {}, req.user);
    return res.status(200).json(obra);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listarObras,
  listarPlanejadores,
  obterObra,
  atualizarObra,
  registrarOsi,
};

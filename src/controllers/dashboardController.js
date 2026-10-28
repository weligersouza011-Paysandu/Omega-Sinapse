'use strict';

const dashboardService = require('../services/dashboardService');

/**
 * GET /api/dashboard
 * Dashboard executivo de planejamento (obras, mapa, indicadores, Curva S e
 * restrições 6WLA) em uma única resposta.
 */
async function obterDashboard(req, res, next) {
  try {
    const dados = await dashboardService.obterDashboard(req.query || {});
    return res.status(200).json(dados);
  } catch (err) {
    return next(err);
  }
}

/** POST /api/obras/:id/restricoes — cadastra uma restrição 6WLA. */
async function criarRestricao(req, res, next) {
  try {
    const restricao = await dashboardService.criarRestricao(
      req.params.id,
      req.body || {},
      req.user
    );
    return res.status(201).json(restricao);
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/obras/:id/restricoes/:restricaoId */
async function atualizarRestricao(req, res, next) {
  try {
    const restricao = await dashboardService.atualizarRestricao(
      req.params.id,
      req.params.restricaoId,
      req.body || {},
      req.user
    );
    return res.status(200).json(restricao);
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/obras/:id/restricoes/:restricaoId */
async function removerRestricao(req, res, next) {
  try {
    await dashboardService.removerRestricao(
      req.params.id,
      req.params.restricaoId,
      req.user
    );
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  obterDashboard,
  criarRestricao,
  atualizarRestricao,
  removerRestricao,
};

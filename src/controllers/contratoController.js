'use strict';

const contratoService = require('../services/contratoService');

/** Envolve um caso de uso assíncrono no contrato de resposta do Express. */
function acao(metodo, status = 200) {
  return async (req, res, next) => {
    try {
      return res.status(status).json(await metodo(req));
    } catch (err) {
      return next(err);
    }
  };
}

/** GET /api/contratos */
const listarContratos = acao((req) => contratoService.listarContratos(req.user));

/** GET /api/contratos/:id */
const obterContrato = acao((req) => contratoService.obterContrato(req.params.id, req.user));

/** POST /api/contratos */
const criarContrato = acao((req) => contratoService.criarContrato(req.body || {}, req.user), 201);

/** POST /api/contratos/:id/tac */
const registrarTac = acao((req) => contratoService.registrarTac(req.params.id, req.body || {}, req.user), 201);

/** POST /api/contratos/:id/obras */
const vincularObras = acao((req) => contratoService.vincularObras(req.params.id, req.body || {}, req.user));

module.exports = { listarContratos, obterContrato, criarContrato, registrarTac, vincularObras };

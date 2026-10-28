'use strict';

const authService = require('../services/authService');

/**
 * POST /api/auth/login
 * Valida e-mail/senha e devolve o token JWT + dados do usuário.
 */
async function login(req, res, next) {
  try {
    const resultado = await authService.login(req.body || {});
    return res.status(200).json(resultado);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me
 * Retorna o usuário autenticado (requer token válido).
 */
async function me(req, res, next) {
  try {
    const usuario = await authService.obterUsuario(req.user.id);
    return res.status(200).json({ usuario });
  } catch (err) {
    return next(err);
  }
}

module.exports = { login, me };

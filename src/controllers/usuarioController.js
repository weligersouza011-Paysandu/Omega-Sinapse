'use strict';

const usuarioService = require('../services/usuarioService');

/**
 * GET /api/usuarios
 * Lista usuários com paginação e filtros (?perfil=&busca=&ativo=&page=&limit=).
 */
async function listarUsuarios(req, res, next) {
  try {
    const resultado = await usuarioService.listarUsuarios(req.query);
    return res.status(200).json(resultado);
  } catch (err) {
    return next(err);
  }
}

/** POST /api/usuarios */
async function criarUsuario(req, res, next) {
  try {
    const usuario = await usuarioService.criarUsuario(req.body || {});
    return res.status(201).json(usuario);
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/usuarios/:id */
async function atualizarUsuario(req, res, next) {
  try {
    const usuario = await usuarioService.atualizarUsuario(req.params.id, req.body || {});
    return res.status(200).json(usuario);
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/usuarios/:id/senha */
async function atualizarSenha(req, res, next) {
  try {
    const usuario = await usuarioService.atualizarSenha(req.params.id, req.body || {});
    return res.status(200).json(usuario);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  atualizarSenha,
};

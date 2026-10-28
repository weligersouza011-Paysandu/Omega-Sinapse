'use strict';

const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');

/** Perfis aceitos pelo sistema (RBAC). */
const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

/**
 * ACESSO TEMPORÁRIO (BYPASS) — válido somente quando `AUTH_BYPASS=true` no .env.
 *
 * Enquanto ligado, o middleware `autenticar` deixa passar as requisições sem
 * exigir JWT, populando `req.user` com um usuário ADMIN fixo (mesmo usuário
 * injetado no front-end por `USUARIO_BYPASS` em frontend/src/config/demo.js).
 *
 * ATENÇÃO: destinado apenas à fase de validação dos dados reais. Remova a
 * variável do .env (ou defina `false`) para restabelecer a autenticação JWT.
 */
const BYPASS_ATIVO = process.env.AUTH_BYPASS === 'true';

/** Usuário injetado no bypass; o id pode ser ajustado via `AUTH_BYPASS_USER_ID`. */
function usuarioBypass() {
  const idConfigurado = Number(process.env.AUTH_BYPASS_USER_ID);
  return {
    id: Number.isInteger(idConfigurado) && idConfigurado > 0 ? idConfigurado : 1,
    perfil: 'ADMIN',
    nome: process.env.AUTH_BYPASS_NOME || 'Acesso Temporário',
    email: process.env.AUTH_BYPASS_EMAIL || 'acesso.temporario@omega.local',
  };
}

/** Extrai o token do header Authorization (Bearer) ou do cookie/header x-access-token. */
function extrairToken(req) {
  const header = req.headers.authorization || req.headers['x-access-token'];

  if (!header) {
    return null;
  }
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return String(header).trim();
}

/**
 * Middleware de AUTENTICAÇÃO.
 * Valida o JWT e popula `req.user = { id, perfil, nome, email }`.
 * O payload esperado do token é: { sub | id, perfil, nome?, email? }
 */
function autenticar(req, res, next) {
  // Acesso temporário: ignora o JWT e injeta o usuário ADMIN padrão.
  if (BYPASS_ATIVO) {
    req.user = usuarioBypass();
    return next();
  }

  const token = extrairToken(req);

  if (!token) {
    return next(new AppError(401, 'Token de autenticação ausente.'));
  }

  if (!process.env.JWT_SECRET) {
    return next(new AppError(500, 'JWT_SECRET não configurado no servidor.'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const id = Number(payload.sub !== undefined ? payload.sub : payload.id);
    const perfil = payload.perfil;

    if (!Number.isInteger(id) || id <= 0) {
      return next(new AppError(401, 'Token inválido: identificador de usuário ausente.'));
    }
    if (!perfil || !PERFIS_VALIDOS.includes(perfil)) {
      return next(new AppError(401, `Token inválido: perfil "${perfil}" não reconhecido.`));
    }

    req.user = {
      id,
      perfil,
      nome: payload.nome || null,
      email: payload.email || null,
    };

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError(401, 'Token expirado. Faça login novamente.'));
    }
    return next(new AppError(401, 'Token inválido ou corrompido.'));
  }
}

/**
 * Middleware de AUTORIZAÇÃO por perfil (RBAC).
 * Uso: router.put('/:id', autenticar, autorizar('SUPERVISOR', 'ADMIN'), handler)
 */
function autorizar(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'Usuário não autenticado.'));
    }
    if (!perfisPermitidos.includes(req.user.perfil)) {
      return next(
        new AppError(403, `Acesso negado. Perfis autorizados: ${perfisPermitidos.join(', ')}.`)
      );
    }
    return next();
  };
}

module.exports = { autenticar, autorizar, PERFIS_VALIDOS, BYPASS_ATIVO };

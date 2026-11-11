'use strict';

const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');
const { obterJwtSecret } = require('../config/jwtSecret');
const usuarioRepository = require('../repositories/usuarioRepository');

/** Perfis aceitos pelo sistema (RBAC). */
const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN', 'CLIENTE'];

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
async function autenticar(req, res, next) {
  // Acesso temporário: ignora o JWT e injeta o usuário ADMIN padrão.
  if (BYPASS_ATIVO) {
    req.user = usuarioBypass();
    return next();
  }

  const token = extrairToken(req);

  if (!token) {
    return next(new AppError(401, 'Token de autenticação ausente.'));
  }

  let secret;
  try {
    secret = await obterJwtSecret();
  } catch (err) {
    return next(err);
  }

  try {
    const payload = jwt.verify(token, secret);

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
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError(401, 'Token expirado. Faça login novamente.'));
    }
    return next(new AppError(401, 'Token inválido ou corrompido.'));
  }

  // Cliente: as páginas liberadas vêm sempre do banco (mudanças valem na hora, sem novo login).
  if (req.user.perfil === 'CLIENTE') {
    try {
      const registro = await usuarioRepository.findById(req.user.id);
      if (!registro || registro.ativo === false || registro.perfil !== 'CLIENTE') {
        return next(new AppError(401, 'Acesso do cliente desativado ou alterado. Faça login novamente.'));
      }
      req.user.paginas_permitidas = registro.paginas_permitidas || [];
    } catch (err) {
      return next(err);
    }
  }
  return next();
}

const METODOS_DE_CONSULTA = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Restringe o perfil CLIENTE: só consulta (GET) e só nas APIs das páginas liberadas para ele.
 * Os demais perfis passam direto. Sem páginas informadas, a API fica fechada para o cliente.
 * Uso: app.use('/api/contratos', autenticar, acessoCliente('medicao'), contratoRoutes)
 */
function acessoCliente(...paginas) {
  return (req, res, next) => {
    if (req.user?.perfil !== 'CLIENTE') return next();
    if (!METODOS_DE_CONSULTA.includes(req.method)) {
      return next(new AppError(403, 'O perfil Cliente tem acesso somente para consulta.'));
    }
    const liberadas = req.user.paginas_permitidas || [];
    if (!paginas.some((pagina) => liberadas.includes(pagina))) {
      return next(new AppError(403, 'Esta página não está liberada para o seu usuário.'));
    }
    return next();
  };
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

module.exports = { autenticar, autorizar, acessoCliente, PERFIS_VALIDOS, BYPASS_ATIVO };

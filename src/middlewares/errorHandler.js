'use strict';

const AppError = require('../errors/AppError');
const { Prisma } = require('@prisma/client');

// Mapa de erros nativos do PostgreSQL para HTTP.
// Códigos PG ainda podem surgir de consultas `$queryRaw` (ex.: lock de linha).
const PG_ERRORS = {
  '23505': { status: 409, message: 'Registro duplicado: já existe um recurso com estes dados.' },
  '23503': { status: 400, message: 'Referência inválida: o registro referenciado não existe.' },
  '23502': { status: 400, message: 'Campo obrigatório ausente no banco de dados.' },
  '22P02': { status: 400, message: 'Formato de dado inválido para o tipo da coluna.' },
};

// Mapa de erros conhecidos do Prisma (PrismaClientKnownRequestError.code).
const PRISMA_ERRORS = {
  P2000: { status: 400, message: 'Valor informado excede o tamanho permitido na coluna.' },
  P2002: { status: 409, message: 'Registro duplicado: já existe um recurso com estes dados.' },
  P2003: { status: 400, message: 'Referência inválida: o registro referenciado não existe.' },
  P2011: { status: 400, message: 'Campo obrigatório ausente no banco de dados.' },
  P2025: { status: 404, message: 'Registro não encontrado.' },
  // Falhas transitórias de conexão (Neon suspenso por inatividade) — o cliente
  // já reenvia automaticamente; se persistir, devolvemos 503 em vez de 500.
  P1001: {
    status: 503,
    message: 'Banco de dados indisponível no momento (iniciando). Tente novamente em alguns instantes.',
  },
  P1002: {
    status: 503,
    message: 'Tempo esgotado ao conectar ao banco de dados. Tente novamente em alguns instantes.',
  },
  P1017: {
    status: 503,
    message: 'A conexão com o banco de dados foi encerrada. Tente novamente em alguns instantes.',
  },
  P2024: {
    status: 503,
    message: 'Muitas requisições simultâneas ao banco de dados. Tente novamente em alguns instantes.',
  },
};

/** Monta a mensagem de um erro conhecido do Prisma. */
function mensagemPrisma(err) {
  const mapeado = PRISMA_ERRORS[err.code];
  if (!mapeado) {
    return { status: 500, message: null };
  }

  // P2002/P2003 expõem em `meta.target` os campos/constraints envolvidos.
  const alvo = err.meta && (err.meta.target || err.meta.field_name);
  if (alvo) {
    const campos = Array.isArray(alvo) ? alvo.join(', ') : String(alvo);
    return {
      status: mapeado.status,
      message: `${mapeado.message} (campos: ${campos})`,
    };
  }

  return { status: mapeado.status, message: mapeado.message };
}

/**
 * Middleware global de tratamento de erros.
 * DEVE ser o último middleware registrado em src/app.js.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const pgError = PG_ERRORS[err.code];
  const prismaError = PRISMA_ERRORS[err.code];

  let status = err.status || 500;
  let mensagem = err.message;

  // Erros de aplicação (AppError) já trazem o status correto e têm prioridade.
  if (!(err instanceof AppError)) {
    if (prismaError) {
      const mapeado = mensagemPrisma(err);
      status = mapeado.status;
      mensagem = mapeado.message || prismaError.message;
    } else if (pgError) {
      status = pgError.status;
      mensagem = pgError.message;
    } else if (err instanceof Prisma.PrismaClientValidationError) {
      // Payload incompatível com o schema Prisma (enum inválido, campo inexistente...).
      status = 400;
      mensagem = 'Dados inválidos na requisição.';
    }
  }

  // Erros do Multer (upload): tamanho excedido, campo inesperado, etc.
  if (err.name === 'MulterError') {
    status = 400;
    mensagem =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo muito grande. O tamanho máximo permitido por imagem foi excedido.'
        : `Falha no upload do arquivo: ${err.message}`;
  }

  // Nunca vazar detalhes internos de erro 500 para o cliente.
  if (status >= 500) {
    console.error(`[erro] ${req.method} ${req.originalUrl}:`, err);
  }
  // Erros inesperados (não controlados) nunca expõem detalhes internos.
  // AppError 500 é usado para falhas de configuração explícitas (ex.: JWT_SECRET).
  if (status === 500 && !(err instanceof AppError)) {
    mensagem = 'Erro interno do servidor.';
  }

  const payload = { erro: mensagem };
  if (err.details !== undefined) {
    payload.detalhes = err.details;
  }

  return res.status(status).json(payload);
}

/** Middleware de rota não encontrada (404). */
function notFoundHandler(req, res) {
  return res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFoundHandler };

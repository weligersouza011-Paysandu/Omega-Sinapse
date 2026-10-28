'use strict';

/**
 * Erro de aplicação com status HTTP associado.
 * Lançado pelos services quando uma regra de negócio é violada e
 * capturado pelo middleware global de erros em src/middlewares/errorHandler.js.
 */
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;

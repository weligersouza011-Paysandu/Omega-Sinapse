'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL não definida. Configure a variável de ambiente com a connection string do Neon PostgreSQL.'
  );
}

/**
 * Instância única (singleton) do PrismaClient.
 * O Prisma gerencia o pool de conexões internamente — não há mais `pg.Pool`.
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * O Neon (plano gratuito) suspende a instância após alguns minutos de inatividade:
 * a primeira query depois disso pode falhar com erro de conexão enquanto o banco
 * "acorda". Esses códigos são transitórios — a tentativa seguinte costuma funcionar.
 */
const CODIGOS_TRANSITORIOS = new Set([
  'P1001', // não foi possível alcançar o servidor
  'P1002', // tempo limite de conexão esgotado
  'P1017', // conexão encerrada pelo servidor
  'P2024', // tempo limite do pool de conexões
]);

const TENTATIVAS = 4;
const ESPERA_BASE_MS = 400;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

prisma.$use(async (params, next) => {
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      return await next(params);
    } catch (err) {
      const transitorio = CODIGOS_TRANSITORIOS.has(err?.code);
      if (!transitorio || tentativa >= TENTATIVAS) throw err;
      await esperar(ESPERA_BASE_MS * tentativa);
    }
  }
});

module.exports = prisma;

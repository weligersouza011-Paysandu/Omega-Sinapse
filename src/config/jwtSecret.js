'use strict';

const crypto = require('crypto');
const prisma = require('./prisma');

/**
 * Gerencia o segredo usado para assinar/validar os JWT.
 *
 * Prioridade:
 *   1. `JWT_SECRET` do ambiente (recomendado em produção);
 *   2. segredo persistido na tabela `configuracoes_sistema` (auto-provisionado);
 *   3. geração de um novo segredo aleatório + persistência no banco.
 *
 * O fallback existe para que o login funcione mesmo quando a variável não foi
 * configurada no painel do provedor. Como o segredo fica no banco, os tokens
 * continuam válidos após reinícios do serviço.
 */

const CHAVE_JWT_SECRET = 'jwt_secret';
const TAMANHO_BYTES = 48;

let segredoEmCache = null;
let carregamentoEmAndamento = null;

/** Normaliza o segredo vindo do ambiente (ignora string vazia). */
function segredoDoAmbiente() {
  const valor = process.env.JWT_SECRET;
  if (typeof valor !== 'string') {
    return null;
  }
  const normalizado = valor.trim();
  return normalizado.length > 0 ? normalizado : null;
}

/**
 * Lê (ou cria) o segredo persistido no banco.
 * O `upsert` com `update: {}` evita corrida entre instâncias: quem chegar
 * depois reaproveita o valor gravado pela primeira.
 */
async function carregarSegredoPersistido() {
  const existente = await prisma.configuracaoSistema.findUnique({
    where: { chave: CHAVE_JWT_SECRET },
    select: { valor: true },
  });

  if (existente && existente.valor) {
    return existente.valor;
  }

  const gerado = crypto.randomBytes(TAMANHO_BYTES).toString('hex');
  const registro = await prisma.configuracaoSistema.upsert({
    where: { chave: CHAVE_JWT_SECRET },
    update: {},
    create: { chave: CHAVE_JWT_SECRET, valor: gerado },
    select: { valor: true },
  });

  return registro.valor;
}

/**
 * Retorna o segredo efetivo para os JWT.
 * @returns {Promise<string>}
 */
async function obterJwtSecret() {
  const doAmbiente = segredoDoAmbiente();
  if (doAmbiente) {
    return doAmbiente;
  }

  if (segredoEmCache) {
    return segredoEmCache;
  }

  if (!carregamentoEmAndamento) {
    carregamentoEmAndamento = carregarSegredoPersistido();
  }

  try {
    segredoEmCache = await carregamentoEmAndamento;
    return segredoEmCache;
  } finally {
    carregamentoEmAndamento = null;
  }
}

/** Descarta o cache (útil em testes). */
function limparCacheJwtSecret() {
  segredoEmCache = null;
  carregamentoEmAndamento = null;
}

module.exports = {
  obterJwtSecret,
  limparCacheJwtSecret,
  CHAVE_JWT_SECRET,
};

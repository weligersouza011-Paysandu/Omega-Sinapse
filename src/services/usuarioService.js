'use strict';

const bcrypt = require('bcryptjs');
const AppError = require('../errors/AppError');
const usuarioRepository = require('../repositories/usuarioRepository');
const authService = require('./authService');

/** Perfis reconhecidos pelo RBAC (espelha o enum PerfilUsuario do schema). */
const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

/** Rótulos oficiais exibidos na tela de Gestão de Usuários. */
const ROTULOS_PERFIL = {
  ORCAMENTISTA: 'Orçamentista',
  PLANEJADOR: 'Técnico Planejador',
  SUPERVISOR: 'Gestor / Supervisor',
  ADMIN: 'Administrador',
};

const SALT_ROUNDS = 10;
const SENHA_MIN_CARACTERES = 4;

function estaVazio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

function temCampo(obj, campo) {
  return Object.prototype.hasOwnProperty.call(obj, campo);
}

function validarId(id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, 'O parâmetro "id" deve ser um número inteiro positivo.');
  }
  return numero;
}

function validarPerfil(perfil) {
  if (!PERFIS_VALIDOS.includes(perfil)) {
    throw new AppError(400, `Perfil inválido. Valores aceitos: ${PERFIS_VALIDOS.join(', ')}.`);
  }
}

/** Normaliza um booleano recebido como string ("true"/"false") ou booleano. */
function normalizarBooleano(valor) {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') {
    if (valor.toLowerCase() === 'true') return true;
    if (valor.toLowerCase() === 'false') return false;
  }
  throw new AppError(400, 'O campo "ativo" deve ser verdadeiro ou falso.');
}

/** GET /api/usuarios */
async function listarUsuarios(query = {}) {
  const page = query.page !== undefined ? Number(query.page) : 1;
  const limit = query.limit !== undefined ? Number(query.limit) : 20;

  if (!Number.isInteger(page) || page <= 0) {
    throw new AppError(400, 'O parâmetro "page" deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw new AppError(400, 'O parâmetro "limit" deve ser um inteiro entre 1 e 100.');
  }

  const perfil = estaVazio(query.perfil) ? undefined : String(query.perfil).trim().toUpperCase();
  if (perfil) {
    validarPerfil(perfil);
  }

  const ativo = estaVazio(query.ativo) ? undefined : normalizarBooleano(String(query.ativo).trim());

  return usuarioRepository.findAll({
    perfil,
    ativo,
    busca: estaVazio(query.busca) ? undefined : String(query.busca).trim(),
    page,
    limit,
  });
}

/** POST /api/usuarios */
async function criarUsuario(payload = {}) {
  // Reaproveita o fluxo de criação já validado do authService (bcrypt + unicidade),
  // normalizando perfil e status inicial quando informados.
  const dados = { ...payload };

  if (!estaVazio(payload.perfil)) {
    dados.perfil = String(payload.perfil).trim().toUpperCase();
  }
  if (temCampo(payload, 'ativo')) {
    dados.ativo = normalizarBooleano(payload.ativo);
  }

  return authService.criarUsuario(dados);
}

/**
 * PUT /api/usuarios/:id
 * Atualiza os dados cadastrais (nome, matrícula, e-mail, perfil e ativo).
 */
async function atualizarUsuario(idParam, payload) {
  const id = validarId(idParam);

  const existente = await usuarioRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Usuário ${id} não encontrado.`);
  }

  const dados = {};

  if (temCampo(payload, 'nome')) {
    if (estaVazio(payload.nome)) {
      throw new AppError(400, 'O campo "nome" é obrigatório.');
    }
    dados.nome = String(payload.nome).trim();
  }

  if (temCampo(payload, 'perfil')) {
    if (estaVazio(payload.perfil)) {
      throw new AppError(400, 'O campo "perfil" é obrigatório.');
    }
    const perfil = String(payload.perfil).trim().toUpperCase();
    validarPerfil(perfil);
    dados.perfil = perfil;
  }

  if (temCampo(payload, 'ativo')) {
    dados.ativo = normalizarBooleano(payload.ativo);
  }

  if (temCampo(payload, 'email')) {
    if (estaVazio(payload.email)) {
      throw new AppError(400, 'O campo "email" é obrigatório.');
    }
    const email = String(payload.email).trim().toLowerCase();
    const conflito = await usuarioRepository.findByEmail(email);
    if (conflito && conflito.id !== id) {
      throw new AppError(409, 'Já existe um usuário com este e-mail.');
    }
    dados.email = email;
  }

  if (temCampo(payload, 'matricula')) {
    const matricula = estaVazio(payload.matricula) ? null : String(payload.matricula).trim();
    if (matricula) {
      const conflito = await usuarioRepository.findByMatricula(matricula);
      if (conflito && conflito.id !== id) {
        throw new AppError(409, 'Já existe um usuário com esta matrícula.');
      }
    }
    dados.matricula = matricula;
  }

  return usuarioRepository.update(id, dados);
}

/** PUT /api/usuarios/:id/senha */
async function atualizarSenha(idParam, payload = {}) {
  const id = validarId(idParam);

  const existente = await usuarioRepository.findById(id);
  if (!existente) {
    throw new AppError(404, `Usuário ${id} não encontrado.`);
  }

  const senha = payload.senha ?? payload.nova_senha;
  if (estaVazio(senha)) {
    throw new AppError(400, 'Informe a nova senha no campo "senha".');
  }
  if (String(senha).length < SENHA_MIN_CARACTERES) {
    throw new AppError(400, `A senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
  }

  const senha_hash = await bcrypt.hash(String(senha), SALT_ROUNDS);
  return usuarioRepository.updateSenha(id, senha_hash);
}

module.exports = {
  PERFIS_VALIDOS,
  ROTULOS_PERFIL,
  SENHA_MIN_CARACTERES,
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  atualizarSenha,
};

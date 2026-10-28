'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');
const usuarioRepository = require('../repositories/usuarioRepository');

const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const SALT_ROUNDS = 10;
const SENHA_MIN_CARACTERES = 4;

function estaVazio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

/** Gera o JWT com o payload { id, nome, matricula, email, perfil } exigido pelo middleware. */
function gerarToken(usuario) {
  if (!process.env.JWT_SECRET) {
    throw new AppError(500, 'JWT_SECRET não configurado no servidor.');
  }
  return jwt.sign(
    {
      id: usuario.id,
      nome: usuario.nome,
      matricula: usuario.matricula ?? null,
      email: usuario.email,
      perfil: usuario.perfil,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

/**
 * Autentica por matrícula OU e-mail + senha.
 * @param {{identificador?:string, matricula?:string, email?:string, senha:string}} credenciais
 * @returns {Promise<{token:string, usuario:object}>}
 */
async function login({ identificador, matricula, email, senha }) {
  const login = String(identificador ?? matricula ?? email ?? '').trim();

  if (estaVazio(login) || estaVazio(senha)) {
    throw new AppError(400, 'Informe o e-mail e a senha para autenticar.');
  }

  const usuario = await usuarioRepository.findByLogin(login);

  // Mesma mensagem para usuário inexistente e senha incorreta (evita enumeração de contas).
  const credenciaisInvalidas = new AppError(401, 'E-mail ou senha inválidos.');

  if (!usuario) {
    throw credenciaisInvalidas;
  }

  const senhaConfere = await bcrypt.compare(String(senha), usuario.senha_hash);
  if (!senhaConfere) {
    throw credenciaisInvalidas;
  }

  if (usuario.ativo === false) {
    throw new AppError(403, 'Usuário inativo. Procure um administrador.');
  }

  const token = gerarToken(usuario);

  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      matricula: usuario.matricula,
      email: usuario.email,
      perfil: usuario.perfil,
    },
  };
}

/** Retorna os dados do usuário autenticado a partir do ID. */
async function obterUsuario(id) {
  const usuario = await usuarioRepository.findById(id);
  if (!usuario) {
    throw new AppError(404, 'Usuário não encontrado.');
  }
  return {
    id: usuario.id,
    nome: usuario.nome,
    matricula: usuario.matricula,
    email: usuario.email,
    perfil: usuario.perfil,
  };
}

/**
 * Cria um usuário com senha criptografada (bcrypt).
 * @param {{nome:string, matricula?:string, email:string, senha:string, perfil:string}} dados
 */
async function criarUsuario({ nome, matricula, email, senha, perfil, ativo }) {
  if (estaVazio(nome) || estaVazio(email) || estaVazio(senha) || estaVazio(perfil)) {
    throw new AppError(400, 'Informe "nome", "email", "senha" e "perfil".');
  }
  if (!PERFIS_VALIDOS.includes(perfil)) {
    throw new AppError(400, `Perfil inválido. Valores aceitos: ${PERFIS_VALIDOS.join(', ')}.`);
  }
  if (String(senha).length < SENHA_MIN_CARACTERES) {
    throw new AppError(400, `A senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
  }

  const emailNormalizado = String(email).trim().toLowerCase();
  const matriculaNormalizada = estaVazio(matricula) ? null : String(matricula).trim();

  if (await usuarioRepository.findByEmail(emailNormalizado)) {
    throw new AppError(409, 'Já existe um usuário com este e-mail.');
  }
  if (matriculaNormalizada && (await usuarioRepository.findByMatricula(matriculaNormalizada))) {
    throw new AppError(409, 'Já existe um usuário com esta matrícula.');
  }

  const senha_hash = await bcrypt.hash(String(senha), SALT_ROUNDS);

  return usuarioRepository.create({
    nome: String(nome).trim(),
    matricula: matriculaNormalizada,
    email: emailNormalizado,
    senha_hash,
    perfil,
    ...(typeof ativo === 'boolean' ? { ativo } : {}),
  });
}

module.exports = {
  login,
  obterUsuario,
  criarUsuario,
  gerarToken,
  PERFIS_VALIDOS,
  SENHA_MIN_CARACTERES,
};

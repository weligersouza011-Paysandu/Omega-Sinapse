'use strict';

const prisma = require('../config/prisma');

/** Colunas públicas do usuário (nunca expõe senha_hash). */
const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  matricula: true,
  email: true,
  perfil: true,
  ativo: true,
  created_at: true,
  updated_at: true,
};

/** Colunas internas do usuário (uso exclusivo do authService). */
const CAMPOS_INTERNOS = { ...CAMPOS_PUBLICOS, senha_hash: true };

/**
 * Busca um usuário por matrícula OU e-mail (case-insensitive), incluindo o hash
 * da senha — usado apenas internamente pelo authService no login.
 * @param {string} identificador matrícula ou e-mail
 * @returns {Promise<object|null>}
 */
async function findByLogin(identificador) {
  return prisma.usuario.findFirst({
    where: {
      OR: [
        { matricula: identificador },
        { email: { equals: identificador, mode: 'insensitive' } },
      ],
    },
    select: CAMPOS_INTERNOS,
  });
}

/**
 * Busca um usuário pelo e-mail (case-insensitive), incluindo o hash da senha.
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function findByEmail(email) {
  return prisma.usuario.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: CAMPOS_INTERNOS,
  });
}

/**
 * Busca um usuário pela matrícula (sem o hash da senha).
 * @param {string} matricula
 * @returns {Promise<object|null>}
 */
async function findByMatricula(matricula) {
  return prisma.usuario.findUnique({
    where: { matricula },
    select: CAMPOS_PUBLICOS,
  });
}

/**
 * Busca um usuário pelo ID (sem o hash da senha).
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  return prisma.usuario.findUnique({
    where: { id },
    select: CAMPOS_PUBLICOS,
  });
}

/**
 * Cria um usuário.
 * @param {{nome:string, matricula?:string|null, email:string, senha_hash:string, perfil:string}} dados
 * @returns {Promise<object>} usuário criado (sem senha_hash)
 */
async function create(dados) {
  return prisma.usuario.create({
    data: {
      nome: dados.nome,
      matricula: dados.matricula ?? null,
      email: dados.email,
      senha_hash: dados.senha_hash,
      perfil: dados.perfil,
      // O status inicial é opcional; sem ele o schema aplica o default (true).
      ...(typeof dados.ativo === 'boolean' ? { ativo: dados.ativo } : {}),
    },
    select: CAMPOS_PUBLICOS,
  });
}

/**
 * Lista usuários com paginação e filtros opcionais (tela de Gestão de Usuários).
 * @param {{perfil?:string, busca?:string, ativo?:boolean, page?:number, limit?:number}} filtros
 * @returns {Promise<{data:object[], total:number, page:number, limit:number, totalPages:number}>}
 */
async function findAll(filtros = {}) {
  const { perfil, busca, ativo } = filtros;
  const page = filtros.page && filtros.page > 0 ? filtros.page : 1;
  const limit = filtros.limit && filtros.limit > 0 ? filtros.limit : 20;

  const where = {};

  if (perfil) {
    where.perfil = perfil;
  }
  if (typeof ativo === 'boolean') {
    where.ativo = ativo;
  }
  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { email: { contains: busca, mode: 'insensitive' } },
      { matricula: { contains: busca, mode: 'insensitive' } },
    ];
  }

  const [total, data] = await prisma.$transaction([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({
      where,
      select: CAMPOS_PUBLICOS,
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/**
 * Lista os usuários ativos de um perfil (ex.: PLANEJADOR, para atribuição em obras).
 * @param {string} perfil
 * @returns {Promise<object[]>}
 */
async function findManyByPerfil(perfil) {
  return prisma.usuario.findMany({
    where: { perfil, ativo: true },
    select: CAMPOS_PUBLICOS,
    orderBy: { nome: 'asc' },
  });
}

/**
 * Atualiza os dados cadastrais do usuário. Somente os campos informados
 * (e permitidos) são gravados — a senha tem fluxo próprio.
 * @param {number} id
 * @param {{nome?:string, matricula?:string|null, email?:string, perfil?:string, ativo?:boolean}} dados
 * @returns {Promise<object|null>} usuário atualizado (sem senha_hash)
 */
async function update(id, dados) {
  const campos = {};
  for (const campo of ['nome', 'matricula', 'email', 'perfil', 'ativo']) {
    if (Object.prototype.hasOwnProperty.call(dados, campo)) {
      campos[campo] = dados[campo];
    }
  }

  if (Object.keys(campos).length === 0) {
    return findById(id);
  }

  return prisma.usuario.update({
    where: { id },
    data: campos,
    select: CAMPOS_PUBLICOS,
  });
}

/**
 * Redefine a senha do usuário (hash já calculado pelo service).
 * @param {number} id
 * @param {string} senha_hash
 * @returns {Promise<object|null>}
 */
async function updateSenha(id, senha_hash) {
  return prisma.usuario.update({
    where: { id },
    data: { senha_hash },
    select: CAMPOS_PUBLICOS,
  });
}

module.exports = {
  findByLogin,
  findByEmail,
  findByMatricula,
  findById,
  create,
  findAll,
  findManyByPerfil,
  update,
  updateSenha,
  CAMPOS_PUBLICOS,
};

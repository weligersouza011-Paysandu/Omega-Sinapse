'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x';

const test = require('node:test');
const assert = require('node:assert/strict');

const usuarioRepository = require('../src/repositories/usuarioRepository');
const usuarioService = require('../src/services/usuarioService');

/** Troca métodos do repositório e devolve a função que restaura os originais. */
function trocar(alvo, substitutos) {
  const originais = {};
  for (const [nome, fn] of Object.entries(substitutos)) {
    originais[nome] = alvo[nome];
    alvo[nome] = fn;
  }
  return () => Object.assign(alvo, originais);
}

const ana = { id: 5, nome: 'Ana', email: 'ana@omegaservice.com.br', perfil: 'PLANEJADOR', ativo: true, excluido_em: null };

test('exclusão lógica mantém o registro, libera o e-mail e invalida a senha', async () => {
  let gravado;
  const restaurar = trocar(usuarioRepository, {
    findById: async () => ana,
    excluirLogicamente: async (id, dados) => {
      gravado = { id, ...dados };
      return { id, nome: ana.nome };
    },
  });
  try {
    const resultado = await usuarioService.excluirUsuario('5', { id: 1 });
    assert.equal(resultado.nome, 'Ana');
    assert.equal(gravado.email_original, ana.email);
    assert.notEqual(gravado.email, ana.email);
    assert.match(gravado.email, /@excluido\.invalid$/);
    assert.ok(gravado.senha_hash && gravado.senha_hash.length > 20);
  } finally {
    restaurar();
  }
});

test('não permite excluir o próprio usuário', async () => {
  const restaurar = trocar(usuarioRepository, { findById: async () => ana });
  try {
    await assert.rejects(usuarioService.excluirUsuario('5', { id: 5 }), { status: 400 });
  } finally {
    restaurar();
  }
});

test('não permite excluir o único administrador ativo', async () => {
  const admin = { ...ana, perfil: 'ADMIN' };
  const restaurar = trocar(usuarioRepository, {
    findById: async () => admin,
    contarAdminsAtivos: async () => 1,
  });
  try {
    await assert.rejects(usuarioService.excluirUsuario('5', { id: 1 }), { status: 400 });
  } finally {
    restaurar();
  }
});

test('usuário já excluído ou inexistente retorna 404', async () => {
  const restaurar = trocar(usuarioRepository, {
    findById: async () => ({ ...ana, excluido_em: new Date() }),
  });
  try {
    await assert.rejects(usuarioService.excluirUsuario('5', { id: 1 }), { status: 404 });
  } finally {
    restaurar();
  }
});

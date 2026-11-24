'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://teste:teste@localhost:5432/teste';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bloquearPerfis, PERFIS_VALIDOS } = require('../src/middlewares/auth');
const { CADASTROS } = require('../src/services/rdoCadastroService');
const rdoService = require('../src/services/rdoService');

function executar(middleware, user) {
  let resultado;
  middleware({ user }, {}, (erro) => { resultado = erro; });
  return resultado;
}

test('ENCARREGADO é um perfil válido e fica bloqueado nos demais módulos', () => {
  assert.ok(PERFIS_VALIDOS.includes('ENCARREGADO'));
  const bloqueio = bloquearPerfis('ENCARREGADO');
  const erro = executar(bloqueio, { id: 1, perfil: 'ENCARREGADO' });
  assert.equal(erro?.status, 403);
  assert.equal(executar(bloqueio, { id: 2, perfil: 'PLANEJADOR' }), undefined);
});

test('cadastros: nome obrigatório e tamanho máximo', () => {
  assert.throws(() => CADASTROS.funcoes.campos({}, false), /obrigatório/);
  assert.throws(() => CADASTROS.motivos.campos({ descricao: 'x'.repeat(161) }, false), /no máximo 160/);
  assert.deepEqual(CADASTROS.motivos.campos({ descricao: ' Chuva ' }, false), { descricao: 'Chuva' });
});

test('cadastros: atualização parcial só leva os campos enviados', () => {
  assert.deepEqual(CADASTROS.colaboradores.campos({ matricula: '123' }, true), { matricula: '123' });
});

test('rdoService: perfis de campo e de validação', () => {
  assert.deepEqual(rdoService.PERFIS_CAMPO, ['ENCARREGADO', 'ADMIN']);
  assert.ok(!rdoService.PERFIS_VALIDADORES.includes('ENCARREGADO'));
});

test('rdoService: criar RDO exige perfil de campo (planejador não lança RDO)', async () => {
  await assert.rejects(() => rdoService.criar({}, { id: 5, perfil: 'PLANEJADOR' }), (e) => e.status === 403);
});

test('rdoService: aprovar e devolver exigem perfil validador (encarregado não se aprova)', async () => {
  await assert.rejects(() => rdoService.aprovar(1, {}, { id: 9, perfil: 'ENCARREGADO' }), (e) => e.status === 403);
  await assert.rejects(() => rdoService.devolver(1, { motivo: 'x' }, { id: 9, perfil: 'ENCARREGADO' }), (e) => e.status === 403);
});

'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://teste:teste@localhost:5432/teste';

const test = require('node:test');
const assert = require('node:assert/strict');
const orcamentoService = require('../src/services/orcamentoService');

const usuario = { id: 1, perfil: 'PLANEJADOR', nome: 'Teste' };

test('Canteiro Central: identificado pelo tipo_cadastro', () => {
  assert.equal(orcamentoService.ehCanteiroCentral({ tipo_cadastro: 'canteiro_central' }), true);
  assert.equal(orcamentoService.ehCanteiroCentral({ tipo_cadastro: 'ORCAMENTO' }), false);
  assert.equal(orcamentoService.ehCanteiroCentral({}), false);
});

test('Canteiro Central: só nome/descrição e local são obrigatórios', () => {
  assert.throws(() => orcamentoService.montarDadosCanteiro({ endereco: 'Serra Norte' }, usuario), /Nome \/ Descrição da base/);
  assert.throws(() => orcamentoService.montarDadosCanteiro({ descricao: 'CEP' }, usuario), /Local \/ Referência/);

  const dados = orcamentoService.montarDadosCanteiro({ descricao: ' 998 - CEP ', endereco: 'Serra Norte' }, usuario);
  assert.equal(dados.descricao, '998 - CEP');
  assert.equal(dados.cliente, 'Vale'); // padrão
  assert.equal(dados.ss, null);
  assert.equal(dados.pep, 'CANTEIRO-CENTRAL');
  assert.equal(dados.valor, 0);
  assert.equal(dados.status, 'OSI_EMITIDA');
  assert.equal(dados.foto_1, '');
  assert.deepEqual(dados.fiscais, []);
  assert.equal(dados.orcamentista_id, 1);

  const comSs = orcamentoService.montarDadosCanteiro({ descricao: 'CEP', endereco: 'X', ss: 'SS998', cliente: 'Vale Serra Norte' }, usuario);
  assert.equal(comSs.ss, 'SS998');
  assert.equal(comSs.pep, 'CANTEIRO-SS998');
  assert.equal(comSs.cliente, 'Vale Serra Norte');
});

test('Orçamento normal continua exigindo PEP, documentos, justificativa e foto', async () => {
  const base = {
    pep: 'C0-1', cliente: 'Vale', endereco: 'X', descricao: 'Serviço', documentos_referencia: 'Doc',
    observacao_inicial: 'Inicial', valor: '10', fiscais: JSON.stringify([{ nome: 'F', contato: '1' }]), foto_1: 'http://f',
  };
  await assert.rejects(orcamentoService.criarOrcamento({ ...base, pep: '' }, usuario), /PEP \(CC\)/);
  await assert.rejects(orcamentoService.criarOrcamento({ ...base, documentos_referencia: '' }, usuario), /Documentos de Referência/);
  await assert.rejects(orcamentoService.criarOrcamento({ ...base, observacao_inicial: '' }, usuario), /Justificativa/);
  await assert.rejects(orcamentoService.criarOrcamento({ ...base, foto_1: '' }, usuario), /foto_1/);
  // tipo_cadastro diferente de CANTEIRO_CENTRAL não afrouxa nada.
  await assert.rejects(orcamentoService.criarOrcamento({ ...base, pep: '', tipo_cadastro: 'ORCAMENTO' }, usuario), /PEP \(CC\)/);
});

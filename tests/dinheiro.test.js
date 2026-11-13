'use strict';

// Port de tests/test_projection_math.js do sistema Projeção Financeira.
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/utils/dinheiro');

/** Mesma conta do Projeção: preço × dias × pessoas ÷ dias úteis, em centavos. */
const semanaMes = (preco, dias, pessoas, diasUteis) => d.centavosDoProduto([preco, dias, pessoas], diasUteis);

test('arredondamento por semana idêntico ao Projeção (itens MES)', () => {
  const casos = [
    ['1.005', 1, 1, 1, 101n],
    ['1.00499999999999999999', 1, 1, 1, 100n],
    ['1.00500000000000000001', 1, 1, 1, 101n],
    ['42.21', 1, 0.5, 21, 101n],
    ['42.20999999999999999999', 1, 0.5, 21, 100n],
    ['1', 1, 1, 3, 33n],
    ['10000000.05', 1, 1e-7, 1, 100n],
    [1e-7, 1, 10000000, 1, 100n],
    ['1', 1, 5e-324, 1, 0n],
    ['1.005', 0, 1, 1, 0n],
  ];
  for (const [preco, dias, pessoas, diasUteis, esperado] of casos) {
    assert.equal(semanaMes(preco, dias, pessoas, diasUteis), esperado, `${preco} x ${dias} x ${pessoas} / ${diasUteis}`);
  }
});

test('decimal em centavos e total do item do QQP', () => {
  assert.equal(d.arredondarEmCentavos('999.995'), 100000n);
  assert.equal(d.arredondarEmCentavos('0,005'), 1n);
  assert.equal(d.totalDoItemEmCentavos('1.00000000000000000001', '1.005'), 101n);
});

test('soma de semanas arredondadas (exemplo do Projeção: 309 centavos)', () => {
  const linhaA = [1, 2, 3].map(() => semanaMes('1.005', 1, 3, 3)); // 1,005 por semana -> 101
  const linhaB = [1, 2, 3].map(() => semanaMes('0.015', 1, 3, 3)); // 0,015 -> 2
  assert.equal(d.somarCentavos(linhaA), 303n);
  assert.equal(d.somarCentavos(linhaB), 6n);
  assert.equal(d.somarCentavos([...linhaA, ...linhaB]), 309n);
});

test('conversões de centavos', () => {
  assert.equal(d.centavosParaTexto(309n), '3.09');
  assert.equal(d.centavosParaTexto(5n), '0.05');
  assert.equal(d.centavosParaReais(309n), 3.09);
  assert.throws(() => d.centavosParaReais(10n ** 16n), /menor/);
  assert.throws(() => d.centavosParaReais(9999999999999999n), /precisão/);
});

test('valores inválidos são recusados', () => {
  assert.throws(() => d.partesDecimais('-1'));
  assert.throws(() => d.partesDecimais('abc'));
  assert.throws(() => d.partesDecimais(null));
  assert.throws(() => d.centavosDoProduto(['1'], 0));
});

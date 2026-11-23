'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { calcularAderencia, minutosDeAtraso } = require('../src/utils/aderenciaDemanda');

const VENCIMENTO = new Date('2026-11-23T18:00:00-03:00');
const apos = (minutos) => new Date(VENCIMENTO.getTime() + minutos * 60 * 1000);

test('entrega antes ou exatamente no prazo mantém 100%', () => {
  assert.equal(calcularAderencia(VENCIMENTO, apos(-120)), 100);
  assert.equal(calcularAderencia(VENCIMENTO, VENCIMENTO), 100);
});

test('menos de 30 minutos de atraso ainda não desconta', () => {
  assert.equal(calcularAderencia(VENCIMENTO, apos(1)), 100);
  assert.equal(calcularAderencia(VENCIMENTO, apos(29)), 100);
});

test('cada 30 minutos de atraso desconta 0,5 ponto', () => {
  assert.equal(calcularAderencia(VENCIMENTO, apos(30)), 99.5);
  assert.equal(calcularAderencia(VENCIMENTO, apos(59)), 99.5);
  assert.equal(calcularAderencia(VENCIMENTO, apos(60)), 99);
  assert.equal(calcularAderencia(VENCIMENTO, apos(90)), 98.5);
  assert.equal(calcularAderencia(VENCIMENTO, apos(24 * 60)), 76);
});

test('piso em 0% para atrasos muito longos', () => {
  assert.equal(calcularAderencia(VENCIMENTO, apos(200 * 60)), 0);
  assert.equal(calcularAderencia(VENCIMENTO, apos(10 * 24 * 60)), 0);
});

test('aceita strings ISO e timestamps', () => {
  assert.equal(calcularAderencia('2026-11-23T18:00:00-03:00', '2026-11-23T19:00:00-03:00'), 99);
  assert.equal(calcularAderencia(VENCIMENTO.getTime(), apos(30).getTime()), 99.5);
});

test('minutosDeAtraso é 0 no prazo e trunca frações', () => {
  assert.equal(minutosDeAtraso(VENCIMENTO, apos(-5)), 0);
  assert.equal(minutosDeAtraso(VENCIMENTO, new Date(VENCIMENTO.getTime() + 90 * 1000)), 1);
});

test('data inválida lança erro explícito', () => {
  assert.throws(() => calcularAderencia('x', VENCIMENTO), TypeError);
  assert.throws(() => calcularAderencia(VENCIMENTO, undefined), TypeError);
});

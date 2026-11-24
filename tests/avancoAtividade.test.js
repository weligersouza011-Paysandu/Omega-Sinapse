'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { escolherPercentualVigente, diaBrasilia } = require('../src/utils/avancoAtividade');
const { totalHH, hhDoLancamento, esperaPtsMinutos, totalDesvios, normalizarPercentual } = require('../src/utils/rdoCalculos');

test('o mais recente vale: RDO posterior ao status do cronograma', () => {
  const r = escolherPercentualVigente({
    aprovado: { percentual: 60, data: '2026-11-20' },
    cronograma: { percentual: 40, data: new Date('2026-11-15T15:00:00Z') },
  });
  assert.deepEqual([r.percentual, r.origem], [60, 'RDO']);
});

test('o mais recente vale: cronograma reimportado depois do RDO', () => {
  const r = escolherPercentualVigente({
    aprovado: { percentual: 60, data: '2026-11-10' },
    cronograma: { percentual: 55, data: new Date('2026-11-15T15:00:00Z') },
  });
  assert.deepEqual([r.percentual, r.origem], [55, 'CRONOGRAMA']);
});

test('empate de data: o RDO vale', () => {
  const r = escolherPercentualVigente({
    aprovado: { percentual: 70, data: '2026-11-15' },
    cronograma: { percentual: 50, data: new Date('2026-11-15T15:00:00Z') },
  });
  assert.equal(r.origem, 'RDO');
});

test('uma fonte só, ou nenhuma', () => {
  assert.equal(escolherPercentualVigente({ cronograma: { percentual: 30, data: '2026-11-01' } }).origem, 'CRONOGRAMA');
  assert.equal(escolherPercentualVigente({ aprovado: { percentual: 30, data: '2026-11-01' } }).origem, 'RDO');
  assert.deepEqual(escolherPercentualVigente({}), { percentual: 0, origem: 'NENHUMA', data: null });
});

test('instante às 01:00 UTC ainda é o dia anterior em Brasília; DATE à meia-noite UTC mantém o dia', () => {
  assert.equal(diaBrasilia(new Date('2026-11-15T01:00:00Z')), '2026-11-14');
  assert.equal(diaBrasilia(new Date('2026-11-15T00:00:00Z')), '2026-11-15');
});

test('HH = quantidade × horas, somado por atividade', () => {
  assert.equal(hhDoLancamento({ quantidade: 3, horas: 8.8 }), 26.4);
  assert.equal(totalHH([{ quantidade: 3, horas: 8 }, { quantidade: 1, horas: 4.5 }]), 28.5);
  assert.equal(totalHH([]), 0);
});

test('espera do PTS em minutos; nula se não liberado ou invertida', () => {
  assert.equal(esperaPtsMinutos('2026-11-24T10:00:00Z', '2026-11-24T11:35:00Z'), 95);
  assert.equal(esperaPtsMinutos('2026-11-24T10:00:00Z', null), null);
  assert.equal(esperaPtsMinutos('2026-11-24T11:00:00Z', '2026-11-24T10:00:00Z'), null);
});

test('desvios: total e por motivo', () => {
  const r = totalDesvios([{ motivo_id: 1, horas: 2 }, { motivo_id: 1, horas: 1.5 }, { motivo_id: 2, horas: 1 }]);
  assert.equal(r.total, 4.5);
  assert.deepEqual(r.por_motivo, { 1: 3.5, 2: 1 });
});

test('percentual: aceita vírgula, recusa fora da faixa e texto', () => {
  assert.equal(normalizarPercentual('45,5'), 45.5);
  assert.equal(normalizarPercentual(100), 100);
  assert.equal(normalizarPercentual(0), 0);
  assert.equal(normalizarPercentual(100.01), null);
  assert.equal(normalizarPercentual(-1), null);
  assert.equal(normalizarPercentual('abc'), null);
  assert.equal(normalizarPercentual(''), null);
});

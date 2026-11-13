'use strict';

// Paridade do motor da Projeção de BMM com o sistema Projeção Financeira.
// A fixture foi gerada pelo próprio código do Projeção (scripts/gerarFixtureProjecao.py):
// semanas, dias úteis, valor de cada item × semana e total devem bater centavo a centavo.
const test = require('node:test');
const assert = require('node:assert/strict');
const casos = require('./fixtures/projecoes-projecao.json');
const { conferirProjecao } = require('../scripts/conferirProjecoesProjecao');

for (const caso of casos) {
  test(`projeção ${caso.referencia} igual ao Projeção (${caso.data_json.items.length} itens, R$ ${caso.data_json.total})`, () => {
    const r = conferirProjecao(caso.data_json, new Set(caso.feriados_personalizados));
    assert.deepEqual(r.divergencias, []);
    assert.equal(r.total_synapse, caso.data_json.total);
  });
}

test('a conferência acusa divergência de valor', () => {
  const caso = structuredClone(casos[1]);
  const semana = Object.values(caso.data_json.items[0].weeklyQuantities).find((q) => q.value > 0);
  semana.value += 0.01;
  const r = conferirProjecao(caso.data_json, new Set());
  assert.equal(r.ok, false);
  assert.ok(r.divergencias.some((d) => d.includes('IT-01')));
});

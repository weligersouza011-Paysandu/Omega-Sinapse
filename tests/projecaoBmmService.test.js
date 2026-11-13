'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularGrade } = require('../src/services/projecaoBmmService');
const du = require('../src/utils/diasUteis');

const ciclo = du.cicloDaReferencia('2026-10'); // 16/09/2026 a 15/10/2026
const semanas = du.semanasDoIntervalo(ciclo.inicio, ciclo.fim);
const D = semanas.reduce((soma, s) => soma + s.dias_uteis, 0);
const cheia = semanas.find((s) => s.dias_uteis === 5);

function itens(...lista) {
  return new Map(lista.map((item) => [item.id, item]));
}
const MES = { id: 1, codigo: 'M1', unidade: 'MES', preco_unitario: '21000.00000000', ativo: true };
const HORA = { id: 2, codigo: 'H1', unidade: 'HORA', preco_unitario: '100.5', ativo: true };
const DIA = { id: 3, codigo: 'D1', unidade: 'DIA', preco_unitario: '250', ativo: true };
const UN = { id: 4, codigo: 'U1', unidade: 'UNIDADE', preco_unitario: '12.345', ativo: true };

test('MES = preço × dias × pessoas ÷ dias úteis do ciclo (igual ao Projeção)', () => {
  const linhas = [{ item_qqp_id: 1, semanas: [{ semana_inicio: cheia.semana_inicio, dias: 5, pessoas: 2 }] }];
  const r = calcularGrade({ semanas, itensQqp: itens(MES), linhas });
  // 21000 × 5 × 2 ÷ D em centavos, meio para cima (conta inteira, sem ponto flutuante).
  const numerador = 21000n * 5n * 2n * 100n;
  const divisor = BigInt(D);
  const esperado = numerador / divisor + ((numerador % divisor) * 2n >= divisor ? 1n : 0n);
  assert.equal(r.diasUteis, D);
  assert.equal(r.totalCentavos, esperado);
});

test('mês inteiro com 1 pessoa = preço mensal', () => {
  const linhas = [{
    item_qqp_id: 1,
    semanas: semanas.map((s) => ({ semana_inicio: s.semana_inicio, dias: s.dias_uteis, pessoas: 1 })),
  }];
  const r = calcularGrade({ semanas, itensQqp: itens(MES), linhas });
  // Cada semana arredonda sozinha; a soma fica a até meio centavo por semana do preço mensal.
  const diferenca = r.totalCentavos - 2100000n;
  assert.ok(diferenca <= BigInt(semanas.length) && diferenca >= -BigInt(semanas.length), `diferença ${diferenca}`);
});

test('HORA, DIA e UNIDADE', () => {
  const s = cheia.semana_inicio;
  const r = calcularGrade({
    semanas,
    itensQqp: itens(HORA, DIA, UN),
    linhas: [
      { item_qqp_id: 2, horas_dia: 9, semanas: [{ semana_inicio: s, dias: 3, pessoas: 2 }] }, // 100,5 × 3 × 2 × 9 = 5427
      { item_qqp_id: 3, semanas: [{ semana_inicio: s, dias: 4, pessoas: '1,5' }] }, // 250 × 4 × 1,5 = 1500
      { item_qqp_id: 4, semanas: [{ semana_inicio: s, dias: 0, pessoas: 3 }] }, // 12,345 × 3 = 37,035 -> 37,04
    ],
  });
  assert.deepEqual(r.itens.map((i) => i.totalCentavos), [542700n, 150000n, 3704n]);
  assert.equal(r.totalCentavos, 542700n + 150000n + 3704n);
  assert.equal(r.totaisSemanas.get(s), r.totalCentavos);
});

test('HORA sem horas_dia usa 8 horas', () => {
  const r = calcularGrade({
    semanas,
    itensQqp: itens(HORA),
    linhas: [{ item_qqp_id: 2, semanas: [{ semana_inicio: cheia.semana_inicio, dias: 1, pessoas: 1 }] }],
  });
  assert.equal(r.totalCentavos, 80400n);
  assert.equal(r.itens[0].horasDia, '8');
});

test('limites de dias, semanas e quantidades', () => {
  const calcular = (semana) => calcularGrade({ semanas, itensQqp: itens(DIA), linhas: [{ item_qqp_id: 3, semanas: [semana] }] });
  assert.throws(() => calcular({ semana_inicio: cheia.semana_inicio, dias: 6, pessoas: 1 }), /entre 0 e 5/);
  assert.throws(() => calcular({ semana_inicio: cheia.semana_inicio, dias: 1.5, pessoas: 1 }), /inteiros/);
  assert.throws(() => calcular({ semana_inicio: cheia.semana_inicio, dias: 1, pessoas: -1 }), /maior ou igual a zero/);
  assert.throws(() => calcular({ semana_inicio: cheia.semana_inicio, dias: 1, pessoas: '0.00001' }), /4 casas/);
  assert.throws(() => calcular({ semana_inicio: '2026-11-02', dias: 1, pessoas: 1 }), /não pertence ao ciclo/);
  assert.throws(() => calcular({ semana_inicio: cheia.semana_inicio, dias: 0, pessoas: 0 }), /maior que zero/);
});

test('item fora do QQP, repetido ou lista vazia', () => {
  const s = [{ semana_inicio: cheia.semana_inicio, dias: 1, pessoas: 1 }];
  assert.throws(() => calcularGrade({ semanas, itensQqp: itens(DIA), linhas: [{ item_qqp_id: 99, semanas: s }] }), /não pertencem/);
  assert.throws(
    () => calcularGrade({ semanas, itensQqp: itens(DIA), linhas: [{ item_qqp_id: 3, semanas: s }, { item_qqp_id: 3, semanas: s }] }),
    /repetidos/
  );
  assert.throws(() => calcularGrade({ semanas, itensQqp: itens(DIA), linhas: [] }), /pelo menos um item/);
});

test('semanas omitidas valem zero e o preço enviado pelo navegador é ignorado', () => {
  const r = calcularGrade({
    semanas,
    itensQqp: itens(DIA),
    linhas: [{ item_qqp_id: 3, preco_unitario: 999999, semanas: [{ semana_inicio: cheia.semana_inicio, dias: 1, pessoas: 1 }] }],
  });
  assert.equal(r.totalCentavos, 25000n);
  assert.equal(r.itens[0].semanas.length, semanas.length);
  assert.equal(r.itens[0].semanas.filter((s) => s.centavos > 0n).length, 1);
});

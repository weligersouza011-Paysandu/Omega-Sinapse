'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const du = require('../src/utils/diasUteis');

const total = (semanas) => semanas.reduce((soma, s) => soma + s.dias_uteis, 0);

test('ciclo 16→15 da referência, inclusive janeiro (começa em dezembro anterior)', () => {
  const jan = du.cicloDaReferencia('2027-01');
  assert.equal(du.iso(jan.inicio), '2026-12-16');
  assert.equal(du.iso(jan.fim), '2027-01-15');
  const out = du.cicloDaReferencia('2026-10');
  assert.equal(du.iso(out.inicio), '2026-09-16');
  assert.equal(du.iso(out.fim), '2026-10-15');
  assert.equal(du.cicloDaReferencia('2026-13'), null);
  assert.equal(du.cicloDaReferencia('26-10'), null);
});

test('semanas segunda→domingo recortadas ao ciclo, rotuladas pela sexta', () => {
  const ciclo = du.cicloDaReferencia('2026-09'); // 16/08/2026 (domingo) a 15/09/2026 (terça)
  const semanas = du.semanasDoIntervalo(ciclo.inicio, ciclo.fim);
  assert.equal(semanas[0].semana_inicio, '2026-08-10');
  assert.equal(semanas[0].inicio, '2026-08-16');
  assert.equal(semanas[0].dias_uteis, 0);
  assert.equal(semanas[0].sexta, '2026-08-14');
  const ultima = semanas[semanas.length - 1];
  assert.equal(ultima.semana_inicio, '2026-09-14');
  assert.equal(ultima.fim, '2026-09-15');
  assert.equal(ultima.dias_uteis, 2);
  // 07/09 (Independência) cai numa segunda-feira.
  assert.equal(semanas.find((s) => s.semana_inicio === '2026-09-07').dias_uteis, 4);
  assert.equal(total(semanas), du.contarDiasUteis(ciclo.inicio, ciclo.fim));
});

test('15/08 é feriado no PA (UF padrão) e não em outra UF', () => {
  const dia = new Date(Date.UTC(2025, 7, 15)); // sexta-feira
  assert.equal(du.ehDiaUtil(dia), false);
  assert.equal(du.ehDiaUtil(dia, { uf: 'SP' }), true);
  assert.ok(du.feriadosEstaduais(2025, 'PA').has('2025-08-15'));
});

test('feriado personalizado tira o dia útil da semana', () => {
  const ciclo = du.cicloDaReferencia('2026-10');
  const sem = du.semanasDoIntervalo(ciclo.inicio, ciclo.fim);
  const com = du.semanasDoIntervalo(ciclo.inicio, ciclo.fim, { feriadosExtras: new Set(['2026-09-21']) });
  assert.equal(total(com), total(sem) - 1);
  assert.equal(com.find((s) => s.semana_inicio === '2026-09-21').dias_uteis, 4);
});

test('as semanas da projeção ignoram sábados mesmo se a opção vier ligada', () => {
  const ciclo = du.cicloDaReferencia('2026-10');
  const semanas = du.semanasDoIntervalo(ciclo.inicio, ciclo.fim, { sabados: true });
  assert.equal(total(semanas), du.contarDiasUteis(ciclo.inicio, ciclo.fim));
});

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

test('20/11 (Consciência Negra) é feriado nacional a partir de 2024', () => {
  assert.ok(du.feriadosNacionais(2026).has('2026-11-20'));
  assert.ok(!du.feriadosNacionais(2023).has('2023-11-20'));
  const ciclo = du.cicloDaReferencia('2026-12'); // 16/11 a 15/12/2026
  const semanas = du.semanasDoIntervalo(ciclo.inicio, ciclo.fim);
  assert.equal(semanas.find((s) => s.semana_inicio === '2026-11-16').dias_uteis, 4);
});

test('feriados nacionais iguais aos da BrasilAPI usada pelo Projeção (2025 a 2027, sem o domingo de Páscoa)', () => {
  const brasilApi = {
    2025: '2025-01-01 2025-03-03 2025-03-04 2025-04-18 2025-04-21 2025-05-01 2025-06-19 2025-09-07 2025-10-12 2025-11-02 2025-11-15 2025-11-20 2025-12-25',
    2026: '2026-01-01 2026-02-16 2026-02-17 2026-04-03 2026-04-21 2026-05-01 2026-06-04 2026-09-07 2026-10-12 2026-11-02 2026-11-15 2026-11-20 2026-12-25',
    2027: '2027-01-01 2027-02-08 2027-02-09 2027-03-26 2027-04-21 2027-05-01 2027-05-27 2027-09-07 2027-10-12 2027-11-02 2027-11-15 2027-11-20 2027-12-25',
  };
  for (const [ano, texto] of Object.entries(brasilApi)) {
    assert.deepEqual([...du.feriadosNacionais(Number(ano))].sort(), texto.split(' '));
  }
});

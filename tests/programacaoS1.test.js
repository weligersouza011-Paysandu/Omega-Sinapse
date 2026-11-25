'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://teste:teste@localhost:5432/teste';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const u = require('../src/utils/programacaoS1');
const { camposAlocacao, camposFrente } = require('../src/services/programacaoService');

/** Planilha sintética no layout da reunião (aba "PRG S+1_"). */
function planilhaExemplo() {
  const v = (n) => Array(16).fill('').map((_, i) => (n[i] !== undefined ? n[i] : ''));
  const cab = (titulo, resp, codigo) => v({ 1: titulo, 4: resp, 5: codigo, 6: 'SEM', 7: 'SEG', 8: 'TER', 9: 'QUA', 10: 'QUI', 11: 'SEX', 12: 'SÁB', 13: 'DOM', 14: 'PRINCIPAIS ATIVIDADES', 15: 'PREMISSAS' });
  const mat = (codigo = '') => v({ 0: codigo, 1: 'MAT.', 2: 'NOME', 3: 'FUNÇÃO', 4: 'TURMA', 5: 'PREVISTO', 6: 48 });
  const pessoa = (n, m, nome, funcao, dias) => v({ 0: n, 1: m, 2: nome, 3: funcao, 4: 'X', 5: 1, 6: 'P', ...Object.fromEntries(dias.map((d, i) => [7 + i, d])) });
  const linhas = [
    v({ 1: 'PROGRAMAÇÃO DE MÃO DE OBRA S+1_SEMANA 48' }),
    v({ 1: 'ITEM', 6: 48, 7: 46349 }), // 23/11/2026 (segunda)
    v({ 1: '01', 2: 'MECÂNICO MONTADOR', 4: 'MEC', 5: 10 }), // quadro de saldo: ignorado
    cab('RETIRADA DE PENDÊNCIAS', 'Fulano', 'SS113/24'),
    mat(),
    v({ 0: 'MEC-02', 1: 'MECÂNICA', 14: 'Mecânica:\r\n> Montagem das colunas', 15: '> Munck dia 25' }),
    pessoa(1, '100', 'PESSOA A', 'MECÂNICO MONTADOR', [1, 1, 1, 1, 1, 1, '']),
    pessoa(2, '200', 'PESSOA B', 'SOLDADOR', [1, 1, '', '', '', '', '']),
    v({ 5: 'TOTAL', 7: 2 }),
    cab('TOPOGRAFIA', '', 'ITINERANTE'),
    mat('TOP-01'),
    pessoa(1, '300', 'PESSOA C', 'TOPÓGRAFO', [1, 1, 1, 1, 1, '', '']),
    cab('INSTALAÇÃO DE INCLINÔMETRO', '-', 'SS042/24'),
    mat('AND-01'),
    v({ 1: 'ANDAIME' }),
    pessoa(1, '100', 'PESSOA A', 'MECÂNICO MONTADOR', ['', '', 1, '', '', '', '']), // conflito na quarta
    cab('EFETIVO DISPONIVEL', '', 'ITINERANTE'),
    mat('DIS-01'),
    pessoa(1, '', '', '', [1, 1, 1, 1, 1, 1, '']), // linha em branco: ignorada
    cab('FÉRIAS E INSS', '', 'ITINERANTE'),
    mat('FER-01'),
    v({ 1: 'FÉRIAS' }),
    pessoa(1, '400', 'PESSOA D', 'SOLDADOR', [1, 1, 1, 1, 1, 1, '']),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'PRG S+1_');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('semana: mesma regra do WEEKNUM da planilha e segunda-feira da semana', () => {
  const s = u.identificarSemana(new Date('2026-11-26T12:00:00Z')); // quinta
  assert.equal(s.ano, 2026);
  assert.equal(s.semana, 48);
  assert.equal(s.data_inicio.toISOString().slice(0, 10), '2026-11-23');
  assert.deepEqual(u.datasDaSemana(s.data_inicio).slice(0, 2), ['2026-11-23', '2026-11-24']);
  assert.equal(u.numeroSemana(new Date('2026-01-01T00:00:00Z')), 1);
});

test('revisão vem do nome do arquivo', () => {
  assert.equal(u.revisaoDoNomeArquivo('Programação_S+1_Sem_ 48 rev02.xlsx'), 2);
  assert.equal(u.revisaoDoNomeArquivo('programacao.xlsx'), 0);
});

test('tipo da frente é inferido pelo título e código', () => {
  assert.equal(u.inferirTipoFrente('VALER', 'SS043/25'), 'OBRA');
  assert.equal(u.inferirTipoFrente('TOPOGRAFIA', 'ITINERANTE'), 'APOIO');
  assert.equal(u.inferirTipoFrente('EFETIVO DISPONIVEL', 'ITINERANTE'), 'DISPONIVEL');
  assert.equal(u.inferirTipoFrente('FÉRIAS E INSS', 'ITINERANTE'), 'AFASTAMENTO');
});

test('importação lê frentes, equipes, pessoas e presença no layout da reunião', () => {
  const r = u.lerPlanilhaProgramacao(XLSX, planilhaExemplo(), 'Sem 48 rev02.xlsx');
  assert.equal(r.semana, 48);
  assert.equal(r.revisao, 2);
  assert.deepEqual(r.frentes.map((f) => f.tipo), ['OBRA', 'APOIO', 'OBRA', 'AFASTAMENTO']); // disponível em branco some
  const [obra, topo, inclinometro] = r.frentes;
  assert.equal(obra.codigo, 'SS113/24');
  assert.equal(obra.responsavel, 'Fulano');
  assert.equal(inclinometro.responsavel, null);
  assert.equal(obra.equipes[0].codigo, 'MEC-02');
  assert.match(obra.equipes[0].atividades, /Montagem das colunas/);
  assert.equal(obra.equipes[0].premissas, '> Munck dia 25');
  assert.deepEqual(obra.equipes[0].alocacoes[1].dias, [true, true, false, false, false, false, false]);
  assert.equal(topo.equipes[0].codigo, 'TOP-01'); // código da linha "MAT."
  assert.equal(inclinometro.equipes[0].codigo, 'AND-01');
  assert.equal(inclinometro.equipes[0].disciplina, 'ANDAIME');
});

test('resumo: programados por dia, saldo por função e conflitos', () => {
  const r = u.lerPlanilhaProgramacao(XLSX, planilhaExemplo());
  const resumo = u.calcularResumo(r);
  assert.equal(resumo.total_pessoas, 4);
  assert.equal(resumo.afastados, 1);
  // Quarta: a PESSOA A está em duas equipes (conflito), mas conta uma vez.
  assert.deepEqual(resumo.programados_por_dia, [3, 3, 2, 2, 2, 1, 0]);
  const soldador = resumo.saldo_por_funcao.find((f) => f.funcao === 'SOLDADOR');
  assert.equal(soldador.efetivo, 1);
  assert.equal(soldador.afastados, 1);
  assert.deepEqual(soldador.sem_programacao, [0, 0, 1, 1, 1, 1, 1]);
  assert.equal(resumo.conflitos.length, 1);
  assert.equal(resumo.conflitos[0].dia, 2);
  assert.equal(resumo.conflitos[0].nome, 'PESSOA A');
});

test('validação: frente exige título; pessoa nova entra de segunda a sexta', () => {
  assert.throws(() => camposFrente({}, false), /obrigatório/);
  assert.throws(() => camposFrente({ titulo: 'X', tipo: 'OUTRO' }, false), /Tipo de frente inválido/);
  assert.deepEqual(camposAlocacao({ nome: 'A' }, false).dias, [true, true, true, true, true, false, false]);
  assert.deepEqual(camposAlocacao({ dias: [1] }, true), { dias: [true, false, false, false, false, false, false] });
});

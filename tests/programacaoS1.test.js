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

test('SS: "998" e "SS998" são a mesma obra; "SS 113/24" = "SS113/24"', () => {
  assert.equal(u.normalizarSs('998'), u.normalizarSs('SS998'));
  assert.equal(u.normalizarSs('SS 113/24'), u.normalizarSs('SS113/24'));
  assert.notEqual(u.normalizarSs('SS113/24'), u.normalizarSs('SS113/25'));
});

test('saldo pelo efetivo do contrato: disponíveis − programados, não programados e fora do efetivo', () => {
  const r = u.lerPlanilhaProgramacao(XLSX, planilhaExemplo());
  const efetivo = [
    { matricula: '100', nome: 'PESSOA A', funcao: 'Mecânico Montador', situacao: 'DISPONIVEL' },
    { matricula: '500', nome: 'PESSOA E', funcao: 'MECÂNICO MONTADOR', situacao: 'DISPONIVEL' },
    { matricula: '200', nome: 'PESSOA B', funcao: 'SOLDADOR', situacao: 'DISPONIVEL' },
    { matricula: '400', nome: 'PESSOA D', funcao: 'SOLDADOR', situacao: 'INDISPONIVEL' },
  ];
  const resumo = u.calcularResumo(r, efetivo);
  assert.equal(resumo.saldo_pelo_efetivo, true);
  const mec = resumo.saldo_por_funcao.find((f) => f.funcao === 'MECÂNICO MONTADOR');
  assert.equal(mec.efetivo, 2);
  assert.deepEqual(mec.sem_programacao, [1, 1, 1, 1, 1, 1, 2]);
  const topografo = resumo.saldo_por_funcao.find((f) => f.funcao === 'TOPÓGRAFO');
  assert.equal(topografo.sem_programacao[0], -1); // programado sem estar disponível no efetivo
  assert.deepEqual(resumo.nao_programados.map((c) => c.matricula), ['500']);
  assert.deepEqual(resumo.fora_do_efetivo.map((c) => c.matricula), ['300']);
});

test('efetivo do contrato: lê a aba EFETIVO A DISTRIBUIR (uma linha por matrícula)', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [' e ', 'COD', 'MAT', 'NOME', 'FUNÇÃO OMEGA', 'QQP', 'FUNÇÃO PLANEJAMENTO', 'CÓDIGO DISCIPLINA', 'DICIP.', 'SUPERVISOR', 'ENCARREGADO', 'SITE', 'FRENTE DE SERVIÇO', 'SITUAÇÃO', 'INICIO FÉRIAS', 'TÉRMINO FÉRIAS'],
    [1, 'MEC-011', 100, ' PESSOA A ', 'MECÂNICO MONTADOR I', '', 'mecânico montador', 'MEC-01', 'MECÂNICA', 'SUP', 'ENC', 'X', 'SS1', 'DISPONÍVEL', '', ''],
    [1, 'FER-011', 400, 'PESSOA D', 'SOLDADOR II', '', 'SOLDADOR', 'FER-01', 'MECÂNICA', 'SUP', 'ENC', 'X', 'FÉRIAS', 'INDISPONÍVEL', '01/11/2026', '30/11/2026'],
    [1, 'MEC-012', 100, 'DUPLICADA', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]), 'EFETIVO A DISTRIBUIR');
  const efetivo = u.lerPlanilhaEfetivo(XLSX, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(efetivo.length, 2);
  assert.equal(efetivo[0].nome, 'PESSOA A');
  assert.equal(efetivo[0].funcao, 'MECÂNICO MONTADOR');
  assert.equal(efetivo[0].cargo, 'MECÂNICO MONTADOR I');
  assert.equal(efetivo[1].situacao, 'INDISPONIVEL');
  assert.equal(efetivo[1].ferias_inicio.toISOString().slice(0, 10), '2026-11-01');
});

test('exportação usa o layout da reunião e pode ser lida de volta', () => {
  const lida = u.lerPlanilhaProgramacao(XLSX, planilhaExemplo(), 'x rev02.xlsx');
  const prog = { ...lida, revisao: 2, frentes: lida.frentes.map((f, i) => ({ ...f, id: i + 1 })) };
  const buffer = u.montarPlanilhaProgramacao(XLSX, prog, u.calcularResumo(prog));
  const relida = u.lerPlanilhaProgramacao(XLSX, buffer, 'exportada rev02.xlsx');
  assert.equal(relida.semana, 48);
  assert.equal(relida.data_inicio.toISOString().slice(0, 10), '2026-11-23');
  assert.deepEqual(relida.frentes.map((f) => f.titulo), lida.frentes.map((f) => f.titulo));
  assert.deepEqual(relida.frentes[0].equipes[0].alocacoes, lida.frentes[0].equipes[0].alocacoes);
  assert.equal(relida.frentes[0].equipes[0].premissas, lida.frentes[0].equipes[0].premissas);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['PRG S+1_', 'SALDO POR FUNÇÃO']);
});

test('recorte de semana: próxima (S+1), atual e última', () => {
  const lista = [
    { id: 1, data_inicio: new Date('2026-11-16T00:00:00Z') },
    { id: 2, data_inicio: new Date('2026-11-23T00:00:00Z') },
    { id: 3, data_inicio: new Date('2026-11-30T00:00:00Z') },
  ];
  const hoje = new Date('2026-11-25T15:00:00Z'); // quarta da semana 48
  assert.equal(u.escolherProgramacao(lista, 'proxima', hoje).id, 3);
  assert.equal(u.escolherProgramacao(lista, 'atual', hoje).id, 2);
  assert.equal(u.escolherProgramacao(lista, 'ultima', hoje).id, 3);
  assert.equal(u.escolherProgramacao(lista.slice(0, 2), 'proxima', hoje), null);
  assert.equal(u.escolherProgramacao([], 'atual', hoje), null);
});

test('visão da obra: só as frentes da obra e o efetivo nominal com dias (pessoa em 2 equipes unifica)', () => {
  const prog = {
    frentes: [
      { id: 1, obra_id: 10, equipes: [
        { codigo: 'MEC-01', alocacoes: [
          { matricula: '1', nome: 'B', funcao: 'SOLDADOR', colaborador_id: 7, dias: [true, true, false, false, false, false, false] },
          { matricula: '2', nome: 'A', funcao: 'PINTOR', dias: [true, false, false, false, false, false, false] },
        ] },
        { codigo: 'AND-01', alocacoes: [{ matricula: '1', nome: 'B', dias: [false, false, true, false, false, false, false] }] },
      ] },
      { id: 2, obra_id: 11, equipes: [{ codigo: 'X', alocacoes: [{ matricula: '3', nome: 'C', dias: [true, true, true, true, true, false, false] }] }] },
      { id: 3, obra_id: null, equipes: [] },
    ],
  };
  const v = u.visaoDaObra(prog, '10');
  assert.deepEqual(v.frentes.map((f) => f.id), [1]);
  assert.equal(v.total_pessoas, 2);
  assert.deepEqual(v.efetivo_nominal.map((p) => p.nome), ['A', 'B']);
  const b = v.efetivo_nominal.find((p) => p.matricula === '1');
  assert.deepEqual(b.dias, [true, true, true, false, false, false, false]);
  assert.deepEqual(b.equipes, ['MEC-01', 'AND-01']);
  assert.equal(b.colaborador_id, 7);
  assert.deepEqual(v.programados_por_dia, [2, 1, 1, 0, 0, 0, 0]);
});

test('programadosNoDia: pessoas da obra no dia e responsáveis das frentes', () => {
  const { programadosNoDia, indiceDoDia } = require('../src/utils/programacaoS1');
  assert.equal(indiceDoDia('2026-11-23'), 0); // segunda
  assert.equal(indiceDoDia('2026-11-29'), 6); // domingo
  const prog = {
    frentes: [
      { id: 1, obra_id: 7, responsavel: 'Jailson Texeira', equipes: [{ codigo: 'ELE-01', alocacoes: [
        { matricula: '1', nome: 'ANA', dias: [true, true, false, false, false, false, false] },
        { matricula: '2', nome: 'BIA', dias: [false, true, true, false, false, false, false] },
      ] }] },
      { id: 2, obra_id: 8, responsavel: 'Outro', equipes: [{ codigo: 'X', alocacoes: [{ matricula: '3', nome: 'CAU', dias: [true, true, true, true, true, true, true] }] }] },
    ],
  };
  const terca = programadosNoDia(prog, 7, '2026-11-24');
  assert.deepEqual(terca.pessoas.map((p) => p.nome), ['ANA', 'BIA']);
  assert.deepEqual(terca.responsaveis, ['Jailson Texeira']);
  assert.deepEqual(programadosNoDia(prog, 7, '2026-11-25').pessoas.map((p) => p.nome), ['BIA']);
  assert.deepEqual(programadosNoDia(prog, 7, '2026-11-26').pessoas, []);
});

test('casarSupervisor: nome igual, primeiro e último nome, ou nome curto contido', () => {
  const { casarSupervisor } = require('../src/utils/programacaoS1');
  const sup = [{ id: 1, nome: 'JAILSON TEXEIRA DOS SANTOS' }, { id: 2, nome: 'Marcos André Lima' }, { id: 3, nome: 'Marcos Souza' }];
  assert.equal(casarSupervisor(['Jailson Texeira'], sup)?.id, 1);
  assert.equal(casarSupervisor(['MARCOS ANDRE LIMA'], sup)?.id, 2);
  assert.equal(casarSupervisor(['Marcos Lima'], sup)?.id, 2);
  assert.equal(casarSupervisor(['Marcos'], sup), null); // ambíguo
  assert.equal(casarSupervisor(['Fulano'], sup), null);
  assert.equal(casarSupervisor(['Fulano', 'Marcos Souza'], sup)?.id, 3);
});

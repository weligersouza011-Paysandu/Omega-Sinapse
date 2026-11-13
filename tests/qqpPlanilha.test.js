'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { Prisma } = require('@prisma/client');
const qqpRepository = require('../src/repositories/qqpRepository');
const qqp = require('../src/services/qqpService');
const planilha = require('../src/services/qqpPlanilhaService');
const classificacao = require('../src/utils/classificacaoQqp');

const USUARIO = { id: 1, perfil: 'ADMIN', nome: 'Teste' };

function item(dados) {
  return {
    id: dados.id,
    contrato_id: 1,
    termo_aditivo_id: null,
    escopo_tac: 0,
    categoria_planilha: null,
    grupo: null,
    subgrupo: null,
    unidade_planilha: null,
    ativo: true,
    posicao: dados.id,
    _count: { recursos: 0, projecoes: 0 },
    ...dados,
    quantidade: dados.quantidade === undefined ? null : new Prisma.Decimal(dados.quantidade),
    preco_unitario: new Prisma.Decimal(dados.preco_unitario),
  };
}

const ITENS = [
  item({ id: 1, codigo: 'A1', descricao: 'Técnico', categoria: 'HH', unidade: 'HORA', categoria_planilha: 'Locação de Máquinas, Equipamentos e Mão de Obra', grupo: 'Mão de obra', subgrupo: 'Técnicos', unidade_planilha: 'h', quantidade: '1000', preco_unitario: '85.12345678' }),
  item({ id: 2, codigo: 'A2', descricao: 'Guindaste', categoria: 'EQUIPAMENTO', unidade: 'MES', categoria_planilha: 'Locação de Máquinas, Equipamentos e Mão de Obra', grupo: 'Equipamentos', subgrupo: 'Içamento', unidade_planilha: 'mês', quantidade: '12', preco_unitario: '45000' }),
  item({ id: 3, codigo: 'B1', descricao: 'Cabo', categoria: 'INSUMO', unidade: 'UNIDADE', categoria_planilha: 'Price list de materiais', grupo: 'Elétrica', subgrupo: 'Cabos', unidade_planilha: 'm', quantidade: '0.005', preco_unitario: '1.005' }),
];

/** Troca o acesso ao banco por dados em memória durante o teste. */
function comBancoFalso(t, itens = ITENS) {
  const originais = { estadoDoContrato: qqpRepository.estadoDoContrato, listarItens: qqpRepository.listarItens };
  qqpRepository.estadoDoContrato = async () => ({
    id: 1, id_vale: 'CT-1', descricao: 'Contrato de teste', numero_sap: '4600012345', qqp_revisao: 7, qqp_ordem: null, aditivos: [],
  });
  qqpRepository.listarItens = async () => itens;
  t.after(() => Object.assign(qqpRepository, originais));
}

test('classificação de unidade e categoria pelas regras do plano', () => {
  assert.equal(classificacao.unidadeDoTexto('mês'), 'MES');
  assert.equal(classificacao.unidadeDoTexto('Mensal'), 'MES');
  assert.equal(classificacao.unidadeDoTexto('h'), 'HORA');
  assert.equal(classificacao.unidadeDoTexto('HH'), 'HORA');
  assert.equal(classificacao.unidadeDoTexto('diária'), 'DIA');
  assert.equal(classificacao.unidadeDoTexto('un'), 'UNIDADE');
  assert.equal(classificacao.unidadeDoTexto('m²'), null);
  const locacao = 'Locação de Máquinas, Equipamentos e Mão de Obra';
  assert.equal(classificacao.categoriaDoTexto({ categoria: locacao, grupo: 'Mão de obra direta' }, 'HORA'), 'HH');
  assert.equal(classificacao.categoriaDoTexto({ categoria: locacao, grupo: 'Equipamentos pesados' }, 'MES'), 'EQUIPAMENTO');
  assert.equal(classificacao.categoriaDoTexto({ categoria: 'Price list de materiais', grupo: 'Elétrica' }, 'UNIDADE'), 'INSUMO');
  assert.equal(classificacao.categoriaDoTexto({ categoria: 'Serviços diversos', grupo: 'Pintura' }, 'UNIDADE'), null);
  assert.equal(classificacao.categoriaInformada('Equipamento'), 'EQUIPAMENTO');
  assert.equal(classificacao.unidadeInformada('Por mês'), 'MES');
});

test('árvore Categoria › Grupo › Subgrupo com totais exatos e ordem personalizada', () => {
  const itens = ITENS.map((i) => ({ ...qqp.formatarItem(i), total_centavos: null }));
  itens.forEach((i, n) => { i.total_centavos = [8512346n, 54000000n, 1n][n]; });
  const { arvore, total } = qqp.montarArvore(itens, {
    categorias: ['Price list de materiais'],
    grupos: { 'Locação de Máquinas, Equipamentos e Mão de Obra': ['Equipamentos'] },
    subgrupos: {},
  });
  assert.deepEqual(arvore.map((c) => c.categoria), ['Price list de materiais', 'Locação de Máquinas, Equipamentos e Mão de Obra']);
  assert.deepEqual(arvore[1].grupos.map((g) => g.grupo), ['Equipamentos', 'Mão de obra']);
  assert.equal(arvore[1].total, 625123.46);
  assert.equal(total, 625123.47);
});

test('formatarItem: total = quantidade × preço arredondado uma vez', () => {
  const f = qqp.formatarItem(ITENS[0]);
  assert.equal(f.preco_unitario_exato, '85.12345678');
  assert.equal(f.quantidade, '1000');
  assert.equal(f.total, 85123.46);
  assert.equal(qqp.formatarItem(ITENS[2]).total, 0.01); // 0,005 × 1,005 = 0,005025 -> 0,01
});

test('template exportado volta igual na importação (todas as linhas "igual")', async (t) => {
  comBancoFalso(t);
  const { buffer, nomeArquivo } = await planilha.gerarTemplate(1, { tac: '0' }, USUARIO);
  assert.match(nomeArquivo, /QQP 4600012345 – TAC0\.xlsx/);
  const previa = await planilha.importar(1, { buffer }, { tac: '0' }, USUARIO);
  assert.equal(previa.aplicado, false);
  assert.deepEqual(previa.erros, []);
  assert.deepEqual(previa.resumo, { novos: 0, substituidos: 0, iguais: 3, com_erro: 0, deduzidos: 0, com_aviso: 0 });
  assert.equal(previa.qqp_revisao, 7);
});

function xlsxDe(linhas) {
  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, XLSX.utils.aoa_to_sheet(linhas), 'QQP');
  return XLSX.write(pasta, { type: 'buffer', bookType: 'xlsx' });
}

test('planilha só com as 8 colunas do Projeção: deduz tipo e categoria e marca para revisão', async (t) => {
  comBancoFalso(t);
  const buffer = xlsxDe([
    ['Categoria', 'Grupo', 'Subgrupo', 'Código', 'Descrição', 'Unidade', 'Quantidade', 'Valor Unitário'],
    ['Locação de Máquinas, Equipamentos e Mão de Obra', 'Mão de obra', 'Técnicos', 'a1', 'Técnico sênior', 'h', 1000, '90,5'],
    ['Serviços', 'Pintura', 'Geral', 'C9', 'Pintura de piso', 'm²', 10, 25],
    ['Serviços', 'Pintura', 'Geral', 'C10', '', 'm²', -1, 'abc'],
    ['Serviços', 'Pintura', 'Geral', 'C9', 'Duplicado', 'm²', 1, 1],
  ]);
  const previa = await planilha.importar(1, { buffer }, { tac: '0' }, USUARIO);
  assert.equal(previa.resumo.substituidos, 1);
  assert.equal(previa.resumo.novos, 1);
  assert.equal(previa.resumo.com_erro, 2);
  const a1 = previa.linhas.find((l) => l.codigo === 'A1');
  assert.deepEqual(a1.mudancas, ['descricao', 'preco_unitario']);
  assert.equal(a1.preco_unitario, '90.5');
  assert.equal(a1.unidade, 'HORA');
  assert.equal(a1.categoria, 'HH');
  const c9 = previa.linhas.find((l) => l.codigo === 'C9');
  assert.equal(c9.unidade, 'UNIDADE');
  assert.equal(c9.categoria, 'OUTROS');
  assert.equal(c9.avisos.length, 2);
  assert.deepEqual(previa.erros.map((e) => e.linha), [4, 5]);
  await assert.rejects(planilha.importar(1, { buffer }, { tac: '0', confirmar: 'true', qqp_revisao: 7 }, USUARIO), /2 linha\(s\) com erro/);
});

test('cabeçalho errado e tipo de unidade inválido', async (t) => {
  comBancoFalso(t);
  assert.throws(() => planilha.lerPlanilha(xlsxDe([['Código', 'Descrição']])), /cabeçalhos/);
  const lido = planilha.lerPlanilha(xlsxDe([
    planilha.COLUNAS,
    ['Cat', 'G', 'S', 'X1', 'Item', 'vb', 1, 10, 'SEMANA', 'HH'],
  ]));
  assert.match(lido.erros[0].mensagens[0], /Tipo de unidade "SEMANA" inválido/);
});

test('mudança de unidade de item em uso por recurso de obra é recusada na prévia', async (t) => {
  const emUso = ITENS.map((i) => (i.codigo === 'A2' ? { ...i, _count: { recursos: 2, projecoes: 0 } } : i));
  comBancoFalso(t, emUso);
  const buffer = xlsxDe([
    planilha.COLUNAS,
    ['Locação de Máquinas, Equipamentos e Mão de Obra', 'Equipamentos', 'Içamento', 'A2', 'Guindaste', 'dia', 12, 45000, 'DIA', 'EQUIPAMENTO'],
  ]);
  const previa = await planilha.importar(1, { buffer }, { tac: '0' }, USUARIO);
  assert.match(previa.erros[0].mensagens[0], /não pode mudar/);
});

test('PDF do QQP é gerado', async (t) => {
  comBancoFalso(t);
  const { buffer, nomeArquivo, itens } = await planilha.gerarPdf(1, { tac: '0' }, USUARIO);
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.equal(itens, 3);
  assert.match(nomeArquivo, /\.pdf$/);
});

test('revisão: 428 sem versão e decimal exato com vírgula', () => {
  assert.equal(qqp.decimalExato('1.234,56789', 'x', { casas: 8, inteiros: 10 }), '1234.56789');
  assert.equal(qqp.decimalExato(0.1, 'x', { casas: 8, inteiros: 10 }), '0.1');
  assert.throws(() => qqp.decimalExato('0.123456789', 'x', { casas: 8, inteiros: 10 }), /8 casas/);
  return assert.rejects(qqp.gravarComRevisao(1, undefined, async () => {}), (err) => err.status === 428);
});

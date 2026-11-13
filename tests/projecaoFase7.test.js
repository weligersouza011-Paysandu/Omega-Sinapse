'use strict';

// Fase 7: solicitação de exclusão com aprovação, comparativo Projetado × Medido com margem
// e planejamento da migração das projeções antigas do Projeção.
const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../src/errors/AppError');
const repo = require('../src/repositories/projecaoBmmRepository');
const medicaoService = require('../src/services/medicaoService');
const servico = require('../src/services/projecaoBmmService');
const { planejarImportacao } = require('../scripts/importarProjecoesProjecao');
const casos = require('./fixtures/projecoes-projecao.json');

const ADMIN = { id: 1, perfil: 'ADMIN', nome: 'Admin' };
const SUPERVISOR = { id: 2, perfil: 'SUPERVISOR', nome: 'Sup' };
const PLANEJADOR_OUTRO = { id: 8, perfil: 'PLANEJADOR', nome: 'Outro' };

/** Banco simulado só com o que a solicitação de exclusão usa. */
function bancoFalso(t) {
  const originais = { ...repo };
  const originalCurva = medicaoService.aplicarAlteracaoNaCurva;
  const estado = {
    projecoes: [{ id: 5, contrato_id: 1, obra_id: 10, numero_bmm: '12', referencia: '2026-10', total: '1000.00', ciclo_inicio: new Date('2026-09-16'), ciclo_fim: new Date('2026-10-15'), itens: [] }],
    solicitacoes: [],
    curva: [],
  };
  Object.assign(repo, {
    buscarContrato: async (id) => (id === 1 ? { id: 1, id_vale: 'CT-1' } : null),
    buscarObra: async (id) => ({ id, contrato_id: 1, planejador_id: 7, planejadores: [] }),
    feriadosNoIntervalo: async () => new Set(),
    obter: async (id) => estado.projecoes.find((p) => p.id === id) || null,
    somarDoContratoNaReferencia: async (c, r) => {
      const l = estado.projecoes.filter((p) => p.referencia === r);
      return l.length ? l.reduce((s, p) => s + Number(p.total), 0).toFixed(2) : null;
    },
    criarSolicitacao: async (projecaoId, dados) => {
      if (!estado.projecoes.some((p) => p.id === projecaoId)) return { naoEncontrada: true };
      if (estado.solicitacoes.some((s) => s.projecao_id === projecaoId && s.status === 'PENDENTE')) return { duplicada: true };
      const solicitacao = { id: estado.solicitacoes.length + 1, projecao_id: projecaoId, status: 'PENDENTE', ...dados };
      estado.solicitacoes.push(solicitacao);
      return { solicitacao };
    },
    listarSolicitacoes: async (where) => estado.solicitacoes.filter((s) => Object.entries(where).every(([k, v]) => s[k] === v)),
    decidirSolicitacao: async (id, { aprovar, decisor, motivo }) => {
      const s = estado.solicitacoes.find((x) => x.id === id);
      if (!s) return { naoEncontrada: true };
      if (s.status !== 'PENDENTE') return { jaDecidida: true };
      Object.assign(s, { status: aprovar ? 'APROVADA' : 'REJEITADA', decidido_por_nome: decisor.nome, motivo_decisao: motivo });
      let projecaoExcluida = null;
      if (aprovar) {
        projecaoExcluida = estado.projecoes.find((p) => p.id === s.projecao_id);
        estado.projecoes = estado.projecoes.filter((p) => p.id !== s.projecao_id);
      }
      return { solicitacao: s, projecaoExcluida };
    },
  });
  medicaoService.aplicarAlteracaoNaCurva = async (args) => estado.curva.push(args);
  t.after(() => {
    Object.assign(repo, originais);
    medicaoService.aplicarAlteracaoNaCurva = originalCurva;
  });
  return estado;
}

test('solicitação de exclusão: um pedido pendente por projeção, só quem pode editar a obra, ADMIN não pede', async (t) => {
  const estado = bancoFalso(t);
  await assert.rejects(servico.solicitarExclusao(5, { motivo: 'x' }, ADMIN), /ADMIN exclui/);
  await assert.rejects(servico.solicitarExclusao(5, { motivo: '' }, SUPERVISOR), /motivo/);
  await assert.rejects(servico.solicitarExclusao(5, { motivo: 'erro' }, PLANEJADOR_OUTRO), (err) => err.status === 403);
  const pedido = await servico.solicitarExclusao(5, { motivo: 'Lançada em duplicidade' }, SUPERVISOR);
  assert.equal(pedido.status, 'PENDENTE');
  assert.equal(pedido.solicitante_nome, 'Sup');
  assert.equal(pedido.projecao_json.numero_bmm, '12');
  await assert.rejects(servico.solicitarExclusao(5, { motivo: 'de novo' }, SUPERVISOR), (err) => err.status === 409);
  // O solicitante vê só as suas; o ADMIN vê todas.
  assert.equal((await servico.listarSolicitacoes(1, {}, SUPERVISOR)).length, 1);
  assert.equal((await servico.listarSolicitacoes(1, {}, PLANEJADOR_OUTRO)).length, 0);
  assert.equal((await servico.listarSolicitacoes(1, { status: 'PENDENTE' }, ADMIN)).length, 1);
  assert.equal(estado.solicitacoes.length, 1);
});

test('decisão: só ADMIN; recusa exige motivo; aprovação exclui e limpa o Projetado; segunda decisão dá 409', async (t) => {
  const estado = bancoFalso(t);
  const pedido = await servico.solicitarExclusao(5, { motivo: 'Duplicada' }, SUPERVISOR);
  await assert.rejects(servico.decidirSolicitacao(pedido.id, { aprovar: true }, SUPERVISOR), (err) => err.status === 403);
  await assert.rejects(servico.decidirSolicitacao(pedido.id, { aprovar: 'sim' }, ADMIN), /true ou false/);
  await assert.rejects(servico.decidirSolicitacao(pedido.id, { aprovar: false }, ADMIN), /motivo da recusa/);

  const aprovada = await servico.decidirSolicitacao(pedido.id, { aprovar: true }, ADMIN);
  assert.equal(aprovada.status, 'APROVADA');
  assert.equal(aprovada.projecao_excluida, true);
  assert.equal(estado.projecoes.length, 0);
  assert.deepEqual(estado.curva.map((c) => [c.referencia, c.campo, c.novoCent]), [['2026-10', 'PROJETADO', null]]);
  await assert.rejects(servico.decidirSolicitacao(pedido.id, { aprovar: false, motivo: 'tarde' }, ADMIN), (err) => err instanceof AppError && err.status === 409);
});

test('comparativo: projetado × medido aprovado/em análise, desvio e margens sobre o custo planejado', () => {
  const ciclos = servico.montarComparativo({
    obras: [{ id: 10, orcamento: { ss: 'SS-10' } }, { id: 11, orcamento: { ss: 'SS-11' } }],
    projecoes: [
      { obra_id: 10, referencia: '2026-10', _sum: { total: '1000.00' }, _count: { _all: 2 } },
      { obra_id: 11, referencia: '2026-10', _sum: { total: '500.00' }, _count: { _all: 1 } },
    ],
    medicoes: [
      { obra_id: 10, valor: '900.00', boletim: { status: 'APROVADO', ciclo_fim: '2026-10-15', numero_bmm: 'BMM12' } },
      { obra_id: 10, valor: '50.00', boletim: { status: 'EM_ANALISE', ciclo_fim: '2026-10-15', numero_bmm: 'BMM12A' } },
      { obra_id: 11, valor: '999.00', boletim: { status: 'REJEITADO', ciclo_fim: '2026-10-15', numero_bmm: 'BMMX' } },
      { obra_id: 11, valor: '300.00', boletim: { status: 'APROVADO', ciclo_fim: '2026-11-15', numero_bmm: 'BMM13' } },
    ],
    custosPorObra: new Map([[10, new Map([['2026-10', 70000n]])]]),
    referenciaDaData: medicaoService.referenciaDaData,
  });
  assert.deepEqual(ciclos.map((c) => c.referencia), ['2026-11', '2026-10']);
  const out = ciclos[1];
  const obra10 = out.obras.find((o) => o.obra_id === 10);
  assert.equal(obra10.projetado, 1000);
  assert.equal(obra10.medido_aprovado, 900);
  assert.equal(obra10.medido_em_analise, 50);
  assert.equal(obra10.desvio, -100);
  assert.equal(obra10.desvio_percentual, -10);
  assert.equal(obra10.custo_planejado, 700);
  assert.equal(obra10.margem_projetada, 300);
  assert.equal(obra10.margem_medida, 200);
  const obra11 = out.obras.find((o) => o.obra_id === 11);
  assert.equal(obra11.medido_aprovado, null); // só boletim recusado: sem medição
  assert.equal(obra11.desvio, null);
  assert.deepEqual(out.totais, { projetado: 1500, medido_aprovado: 900, medido_em_analise: 50, desvio: -600, custo_planejado: 700, margem_projetada: 800, margem_medida: 200 });
  assert.equal(ciclos[0].obras[0].projetado, null);
  assert.equal(ciclos[0].obras[0].medido_aprovado, 300);
});

/** Contexto do Synapse com contrato, obra e o QQP com os códigos da fixture. */
function contextoSynapse(caso, extra = {}) {
  const itens = new Map(caso.data_json.items.map((item, i) => [item.code.toUpperCase(), { id: 100 + i, codigo: item.code.toUpperCase() }]));
  return {
    contratos: [{ id: 1, id_vale: 'CT-1', numero_sap: '4600012345', aditivos: [{ id: 50, numero_tac: 'TAC 01' }] }],
    obras: [{ id: 10, contrato_id: 1, ss: 'SS 113/24' }],
    itens: new Map([['1|0', itens]]),
    mapaContratos: {},
    existentes: new Set(),
    feriadosExtras: new Set(caso.feriados_personalizados),
    ...extra,
  };
}

test('migração das projeções antigas: casa contrato/TAC/obra/itens e confere o total com o Projeção', () => {
  const caso = casos[0];
  const origem = { id: 'p1', code: '7', data_json: caso.data_json, contract_number: '4600012345', tac_number: null, work_ss: 'ss113/24' };
  const plano = planejarImportacao(origem, contextoSynapse(caso));
  assert.equal(plano.ok, true, plano.motivo);
  assert.equal(plano.cabecalho.obra_id, 10);
  assert.equal(plano.cabecalho.termo_aditivo_id, null);
  assert.equal(plano.cabecalho.referencia, caso.referencia);
  assert.equal(Number(plano.cabecalho.total), caso.data_json.total);
  assert.ok(plano.itens.every((i) => i.unidade === 'MES'));

  const nada = (extra, motivo) => assert.match(planejarImportacao(origem, contextoSynapse(caso, extra)).motivo, motivo);
  nada({ contratos: [] }, /Contrato .* sem correspondente/);
  nada({ obras: [] }, /Obra SS .* não está vinculada/);
  nada({ itens: new Map() }, /Itens sem correspondente/);
  nada({ existentes: new Set([`10|${caso.data_json.bmmNumber}|${caso.referencia}`]) }, /Já existe/);
  assert.match(planejarImportacao({ ...origem, tac_number: 'TAC 09' }, contextoSynapse(caso)).motivo, /TAC "TAC 09" não existe/);
  // Pelo mapa manual de contratos (id_vale).
  assert.equal(planejarImportacao({ ...origem, contract_number: 'CT-ANTIGO' }, contextoSynapse(caso, { mapaContratos: { 'CT-ANTIGO': 'CT-1' } })).ok, true);
});

test('migração recusa projeção cujo total não bate com o recálculo', () => {
  const caso = structuredClone(casos[2]);
  caso.data_json.total += 0.01;
  const plano = planejarImportacao(
    { id: 'p2', code: '1', data_json: caso.data_json, contract_number: '4600012345', work_ss: 'SS 113/24' },
    contextoSynapse(caso)
  );
  assert.equal(plano.ok, false);
  assert.match(plano.motivo, /Total diferente/);
});

'use strict';

// Casos de uso da Projeção de BMM com o banco simulado em memória:
// BMM duplicado, permissões por perfil, edição que mantém contrato/TAC/obra,
// cópia entre ciclos e sincronização do "Projetado" da curva.
const test = require('node:test');
const assert = require('node:assert/strict');
const repo = require('../src/repositories/projecaoBmmRepository');
const medicaoService = require('../src/services/medicaoService');
const servico = require('../src/services/projecaoBmmService');
const du = require('../src/utils/diasUteis');

const ADMIN = { id: 1, perfil: 'ADMIN', nome: 'Admin' };
const SUPERVISOR = { id: 2, perfil: 'SUPERVISOR' };
const PLANEJADOR_DONO = { id: 7, perfil: 'PLANEJADOR' };
const PLANEJADOR_OUTRO = { id: 8, perfil: 'PLANEJADOR' };
const CLIENTE = { id: 9, perfil: 'CLIENTE' };

const ITENS = [
  { id: 1, codigo: 'MO-01', descricao: 'Técnico', unidade: 'MES', preco_unitario: '15000', ativo: true, escopo: 0 },
  { id: 2, codigo: 'MO-02', descricao: 'Eletricista', unidade: 'HORA', preco_unitario: '95.5', ativo: true, escopo: 0 },
  { id: 3, codigo: 'DES-01', descricao: 'Desativado', unidade: 'DIA', preco_unitario: '100', ativo: false, escopo: 0 },
  { id: 4, codigo: 'TAC-01', descricao: 'Item do TAC', unidade: 'DIA', preco_unitario: '200', ativo: true, escopo: 50 },
];

/** Banco em memória que imita o projecaoBmmRepository. */
function bancoFalso(t) {
  const originais = { ...repo };
  const originalCurva = medicaoService.aplicarAlteracaoNaCurva;
  const estado = { projecoes: [], curva: [], proximoId: 1 };

  const montar = (p) => ({
    ...p,
    termo_aditivo: p.termo_aditivo_id ? { id: p.termo_aditivo_id, numero_tac: 'TAC 01' } : null,
    obra: { id: p.obra_id, contrato_id: 1, orcamento: { ss: `SS-${p.obra_id}` } },
    usuario: null,
    itens: p.itens.map((i, n) => ({ ...i, id: n + 1, item_qqp: ITENS.find((x) => x.id === i.item_qqp_id) })),
  });

  Object.assign(repo, {
    buscarContrato: async (id) => (id === 1 ? { id: 1, id_vale: 'CT-1', data_inicio: new Date('2026-01-01'), data_fim: new Date('2027-12-31') } : null),
    buscarAditivo: async (contratoId, id) => (contratoId === 1 && id === 50 ? { id: 50, numero_tac: 'TAC 01' } : null),
    buscarObra: async (id) =>
      ({ 10: { id: 10, contrato_id: 1, planejador_id: 7, planejadores: [] }, 11: { id: 11, contrato_id: 1, planejador_id: null, planejadores: [{ usuario_id: 8 }] }, 99: { id: 99, contrato_id: 2, planejadores: [] } })[id] || null,
    itensDoEscopo: async (contratoId, escopo, ids) => ITENS.filter((i) => i.escopo === escopo && ids.includes(i.id)),
    feriadosNoIntervalo: async () => new Set(),
    obter: async (id) => {
      const p = estado.projecoes.find((x) => x.id === id);
      return p ? montar(p) : null;
    },
    listar: async (filtro) => estado.projecoes.filter((p) => Object.entries(filtro).every(([k, v]) => p[k] === v)).map(montar),
    criar: async (cabecalho, itens) => {
      if (estado.projecoes.some((p) => p.obra_id === cabecalho.obra_id && p.numero_bmm === cabecalho.numero_bmm && p.referencia === cabecalho.referencia)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const id = estado.proximoId++;
      estado.projecoes.push({ id, ...cabecalho, itens });
      return id;
    },
    substituir: async (id, cabecalho, itens) => {
      const p = estado.projecoes.find((x) => x.id === id);
      Object.assign(p, cabecalho, { itens });
    },
    excluir: async (id) => {
      estado.projecoes = estado.projecoes.filter((p) => p.id !== id);
      return true;
    },
    somarDoContratoNaReferencia: async (contratoId, referencia) => {
      const doMes = estado.projecoes.filter((p) => p.contrato_id === contratoId && p.referencia === referencia);
      return doMes.length ? String(doMes.reduce((s, p) => s + Number(p.total), 0).toFixed(2)) : null;
    },
  });
  medicaoService.aplicarAlteracaoNaCurva = async (args) => {
    if (args.referencia === '2030-01') throw new (require('../src/errors/AppError'))(400, 'O mês fica depois do fim do contrato.');
    estado.curva.push({ referencia: args.referencia, campo: args.campo, novoCent: args.novoCent });
  };
  t.after(() => {
    Object.assign(repo, originais);
    medicaoService.aplicarAlteracaoNaCurva = originalCurva;
  });
  return estado;
}

const semanasOut = du.semanasDoIntervalo(du.cicloDaReferencia('2026-10').inicio, du.cicloDaReferencia('2026-10').fim);
const cheia = semanasOut.find((s) => s.dias_uteis === 5);

function payload(extra = {}) {
  return {
    obra_id: 10,
    termo_aditivo_id: 0,
    numero_bmm: '12',
    referencia: '2026-10',
    itens: [{ item_qqp_id: 1, semanas: [{ semana_inicio: cheia.semana_inicio, dias: 5, pessoas: 1 }] }],
    ...extra,
  };
}

test('cria, grava o Projetado da curva e recusa BMM repetido na mesma obra e mês', async (t) => {
  const estado = bancoFalso(t);
  const criada = await servico.criar(1, payload(), ADMIN);
  const D = semanasOut.reduce((s, w) => s + w.dias_uteis, 0);
  assert.equal(criada.total, Math.round((15000 * 5 * 100) / D) / 100);
  assert.deepEqual(criada.curva, [{ referencia: '2026-10', atualizada: true, projetado: criada.total }]);
  assert.deepEqual(estado.curva.at(-1), { referencia: '2026-10', campo: 'PROJETADO', novoCent: Math.round(criada.total * 100) });
  await assert.rejects(servico.criar(1, payload(), ADMIN), (err) => err.status === 409 && /BMM 12/.test(err.message));
  // Mesmo BMM em outra obra ou outro mês é aceito; o Projetado soma as projeções do mês.
  const outra = await servico.criar(1, payload({ obra_id: 11 }), SUPERVISOR);
  assert.equal(estado.curva.at(-1).novoCent, Math.round(criada.total * 100) + Math.round(outra.total * 100));
});

test('permissões: PLANEJADOR só nas suas obras; CLIENTE não cadastra; só ADMIN exclui', async (t) => {
  bancoFalso(t);
  await servico.criar(1, payload(), PLANEJADOR_DONO);
  await servico.criar(1, payload({ obra_id: 11 }), PLANEJADOR_OUTRO); // planejador secundário da obra 11
  await assert.rejects(servico.criar(1, payload({ numero_bmm: '13' }), PLANEJADOR_OUTRO), (err) => err.status === 403);
  await assert.rejects(servico.criar(1, payload({ numero_bmm: '14' }), CLIENTE), (err) => err.status === 403);
  await assert.rejects(servico.excluir(1, SUPERVISOR), (err) => err.status === 403);
  const excluida = await servico.excluir(1, ADMIN);
  assert.equal(excluida.excluido, true);
});

test('obra de outro contrato, TAC de outro contrato e item de outro escopo são recusados', async (t) => {
  bancoFalso(t);
  await assert.rejects(servico.criar(1, payload({ obra_id: 99 }), ADMIN), /não está vinculada/);
  await assert.rejects(servico.criar(1, payload({ termo_aditivo_id: 77 }), ADMIN), (err) => err.status === 404);
  await assert.rejects(servico.criar(1, payload({ termo_aditivo_id: 50 }), ADMIN), /não pertencem ao QQP/);
  await assert.rejects(
    servico.criar(1, payload({ itens: [{ item_qqp_id: 3, semanas: [{ semana_inicio: cheia.semana_inicio, dias: 1, pessoas: 1 }] }] }), ADMIN),
    /desativado/
  );
  const doTac = await servico.criar(
    1,
    payload({ termo_aditivo_id: 50, itens: [{ item_qqp_id: 4, semanas: [{ semana_inicio: cheia.semana_inicio, dias: 2, pessoas: 1 }] }] }),
    ADMIN
  );
  assert.equal(doTac.total, 400);
});

test('edição mantém contrato/TAC/obra e ressincroniza os dois meses quando o mês muda', async (t) => {
  const estado = bancoFalso(t);
  const criada = await servico.criar(1, payload(), ADMIN);
  await assert.rejects(servico.atualizar(criada.id, { ...payload(), termo_aditivo_id: 50 }, ADMIN), /TAC original/);
  await assert.rejects(servico.atualizar(criada.id, { ...payload(), obra_id: 11 }, ADMIN), /obra original/);

  const nov = du.semanasDoIntervalo(du.cicloDaReferencia('2026-11').inicio, du.cicloDaReferencia('2026-11').fim).find((s) => s.dias_uteis === 5);
  const editada = await servico.atualizar(
    criada.id,
    { referencia: '2026-11', itens: [{ item_qqp_id: 1, semanas: [{ semana_inicio: nov.semana_inicio, dias: 5, pessoas: 1 }] }] },
    ADMIN
  );
  assert.equal(editada.referencia, '2026-11');
  assert.deepEqual(editada.curva.map((c) => c.referencia), ['2026-10', '2026-11']);
  // Outubro ficou sem projeção: o Projetado é limpo (null).
  assert.deepEqual(estado.curva.find((c) => c.referencia === '2026-10' && c.novoCent === null), { referencia: '2026-10', campo: 'PROJETADO', novoCent: null });
});

test('curva fora do contrato não impede gravar: devolve o motivo', async (t) => {
  bancoFalso(t);
  const semana = du.semanasDoIntervalo(du.cicloDaReferencia('2030-01').inicio, du.cicloDaReferencia('2030-01').fim).find((s) => s.dias_uteis > 0);
  const criada = await servico.criar(
    1,
    payload({ referencia: '2030-01', itens: [{ item_qqp_id: 1, semanas: [{ semana_inicio: semana.semana_inicio, dias: 1, pessoas: 1 }] }] }),
    ADMIN
  );
  assert.equal(criada.curva[0].atualizada, false);
  assert.match(criada.curva[0].motivo, /fim do contrato/);
});

test('cópia entre ciclos: semanas por ordem, dias limitados ao novo ciclo, item desativado avisado', async (t) => {
  bancoFalso(t);
  const out = semanasOut;
  const origem = await servico.criar(
    1,
    payload({
      itens: [
        { item_qqp_id: 1, semanas: out.filter((s) => s.dias_uteis).map((s) => ({ semana_inicio: s.semana_inicio, dias: s.dias_uteis, pessoas: 2 })) },
        { item_qqp_id: 2, horas_dia: 9, semanas: [{ semana_inicio: cheia.semana_inicio, dias: 5, pessoas: 1 }] },
      ],
    }),
    ADMIN
  );
  ITENS[1].ativo = false; // MO-02 desativado depois da projeção
  t.after(() => {
    ITENS[1].ativo = true;
  });

  const copia = await servico.copiarDe(origem.id, { referencia: '2026-12', numero_bmm: '14' }, ADMIN);
  const dez = du.semanasDoIntervalo(du.cicloDaReferencia('2026-12').inicio, du.cicloDaReferencia('2026-12').fim);
  assert.equal(copia.rascunho.numero_bmm, '14');
  assert.equal(copia.rascunho.itens.length, 1);
  assert.match(copia.avisos[0], /MO-02/);
  const semanasCopiadas = copia.rascunho.itens[0].semanas;
  const origemPorOrdem = out.map((s) => s.semana_inicio);
  semanasCopiadas.forEach((s) => {
    const n = dez.findIndex((d) => d.semana_inicio === s.semana_inicio);
    const original = out[origemPorOrdem.indexOf(out[n].semana_inicio)];
    assert.equal(s.dias, Math.min(original.dias_uteis, dez[n].dias_uteis));
    assert.equal(s.pessoas, '2');
  });
  assert.ok(copia.calculo.total > 0);
});

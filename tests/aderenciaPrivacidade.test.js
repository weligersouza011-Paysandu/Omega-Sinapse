'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

const test = require('node:test');
const assert = require('node:assert/strict');

const repositorio = require('../src/repositories/tarefaRepository');
const service = require('../src/services/tarefaService');
const { calcularMetricas } = require('../src/utils/metricasAderencia');

const em = (texto) => new Date(`${texto}-03:00`);

const master = { id: 1, perfil: 'SUPERVISOR', nome: 'Gestora' };
const admin = { id: 2, perfil: 'ADMIN', nome: 'Admin' };
const planejadorA = { id: 10, perfil: 'PLANEJADOR', nome: 'Ana' };
const planejadorB = { id: 11, perfil: 'PLANEJADOR', nome: 'Bruno' };

/** Troca métodos do repositório durante um teste e registra as chamadas. */
function simular(metodos) {
  const originais = {};
  const chamadas = {};
  for (const [nome, impl] of Object.entries(metodos)) {
    originais[nome] = repositorio[nome];
    chamadas[nome] = [];
    repositorio[nome] = async (...args) => {
      chamadas[nome].push(args);
      return impl(...args);
    };
  }
  return {
    chamadas,
    restaurar: () => Object.assign(repositorio, originais),
  };
}

async function comRepositorio(metodos, corpo) {
  const falso = simular(metodos);
  try {
    return await corpo(falso.chamadas);
  } finally {
    falso.restaurar();
  }
}

const listaVazia = { data: [], total: 0, page: 1, limit: 100, totalPages: 0 };

/* ------------------------------ Listagem de demandas ------------------------------ */

test('não-Master: a listagem é sempre filtrada pelo próprio usuário', async () => {
  await comRepositorio({ findAll: () => listaVazia }, async (chamadas) => {
    await service.listarTarefas({}, planejadorA);
    assert.equal(chamadas.findAll[0][0].usuarioId, planejadorA.id);
  });
});

test('não-Master: pedir as demandas de outra pessoa é recusado com 403', async () => {
  await comRepositorio({ findAll: () => listaVazia }, async (chamadas) => {
    await assert.rejects(
      () => service.listarTarefas({ usuario_id: String(planejadorB.id) }, planejadorA),
      (erro) => erro.status === 403
    );
    assert.equal(chamadas.findAll.length, 0, 'a consulta nem chega ao banco');
  });
});

test('não-Master pode pedir explicitamente o próprio id', async () => {
  await comRepositorio({ findAll: () => listaVazia }, async (chamadas) => {
    await service.listarTarefas({ usuario_id: String(planejadorA.id) }, planejadorA);
    assert.equal(chamadas.findAll[0][0].usuarioId, planejadorA.id);
  });
});

test('Master vê a equipe toda ou filtra por planejador', async () => {
  await comRepositorio({ findAll: () => listaVazia }, async (chamadas) => {
    await service.listarTarefas({}, master);
    await service.listarTarefas({ usuario_id: '11' }, admin);
    assert.equal(chamadas.findAll[0][0].usuarioId, undefined);
    assert.equal(chamadas.findAll[1][0].usuarioId, 11);
  });
});

test('não-Master não abre a demanda de outra pessoa pelo id', async () => {
  const alheia = { id: 99, usuario_id: planejadorB.id, status: 'A_FAZER', data_vencimento: em('2026-12-01T10:00:00') };
  await comRepositorio({ findById: () => alheia }, async () => {
    await assert.rejects(() => service.obterTarefa(99, planejadorA), (erro) => erro.status === 403);
    const aberta = await service.obterTarefa(99, master);
    assert.equal(aberta.id, 99);
  });
});

test('lista da equipe: não-Master só enxerga a si mesmo; painel de carga é só do Master', async () => {
  const equipe = [
    { id: 10, nome: 'Ana' },
    { id: 11, nome: 'Bruno' },
  ];
  await comRepositorio({ listarResponsaveis: () => equipe }, async () => {
    assert.deepEqual(await service.listarEquipe(planejadorA), [{ id: 10, nome: 'Ana' }]);
    assert.equal((await service.listarEquipe(master)).length, 2);
  });
  await assert.rejects(() => service.cargaEquipe({}, planejadorA), (erro) => erro.status === 403);
});

test('sem usuário autenticado nenhuma consulta é atendida', async () => {
  await assert.rejects(() => service.listarTarefas({}, undefined), (erro) => erro.status === 401);
  await assert.rejects(() => service.aderenciaEquipe({}, undefined), (erro) => erro.status === 401);
});

/* ------------------------------- Indicadores -------------------------------- */

const concluida = (usuarioId, nome, vencimento, entrega, categoria = null, aderencia) => ({
  id: Math.floor(Math.random() * 1e6),
  usuario_id: usuarioId,
  usuario: { nome },
  data_vencimento: em(vencimento),
  concluido_em: em(entrega),
  justificativa_categoria: categoria,
  aderencia,
});

const ENTREGAS = [
  concluida(10, 'Ana', '2026-11-10T18:00:00', '2026-11-10T17:00:00', null, 100),
  concluida(10, 'Ana', '2026-11-11T18:00:00', '2026-11-11T19:00:00', 'SOLICITACAO_EXTRA', 99),
  concluida(11, 'Bruno', '2026-11-10T18:00:00', '2026-11-10T20:00:00', 'SOLICITACAO_EXTRA', 98),
  concluida(11, 'Bruno', '2026-11-12T18:00:00', '2026-11-12T18:00:00', null, 100),
];

test('não-Master recebe só os próprios indicadores, sem ranking nem dados de terceiros', async () => {
  await comRepositorio({ findConcluidas: () => ENTREGAS.filter((t) => t.usuario_id === 10) }, async (chamadas) => {
    const resposta = await service.aderenciaEquipe({}, planejadorA);
    assert.equal(chamadas.findConcluidas[0][0].usuarioId, planejadorA.id);
    assert.equal(resposta.escopo, 'INDIVIDUAL');
    assert.equal(resposta.ranking, undefined);
    assert.ok(!JSON.stringify(resposta).includes('Bruno'));
  });
});

test('não-Master não consulta a aderência de outro usuário (403)', async () => {
  await comRepositorio({ findConcluidas: () => ENTREGAS }, async (chamadas) => {
    await assert.rejects(
      () => service.aderenciaEquipe({ usuario_id: '11' }, planejadorA),
      (erro) => erro.status === 403
    );
    assert.equal(chamadas.findConcluidas.length, 0);
  });
});

test('Master recebe a visão da equipe com ranking e pode filtrar por planejador e categoria', async () => {
  await comRepositorio({ findConcluidas: () => ENTREGAS }, async (chamadas) => {
    const equipe = await service.aderenciaEquipe({ categoria: 'solicitacao_extra' }, master);
    assert.equal(equipe.escopo, 'EQUIPE');
    assert.equal(equipe.ranking.length, 2);
    assert.equal(chamadas.findConcluidas[0][0].categoria, 'SOLICITACAO_EXTRA');

    const individual = await service.aderenciaEquipe({ usuario_id: '11' }, master);
    assert.equal(individual.escopo, 'INDIVIDUAL');
    assert.equal(individual.ranking, undefined);
    assert.equal(chamadas.findConcluidas[1][0].usuarioId, 11);
  });
});

test('período invertido e categoria inválida são recusados', async () => {
  await assert.rejects(
    () => service.aderenciaEquipe({ de: '2026-12-01', ate: '2026-11-01' }, master),
    (erro) => erro.status === 400
  );
  await assert.rejects(
    () => service.aderenciaEquipe({ categoria: 'INVENTADA' }, master),
    (erro) => erro.status === 400
  );
});

test('o e-mail de teste é restrito ao Master', async () => {
  await assert.rejects(() => service.dispararEmailDiario({}, planejadorA), (erro) => erro.status === 403);
});

test('vínculo da justificativa só aceita atividade do mesmo responsável', async () => {
  const atual = { id: 5, usuario_id: planejadorA.id, status: 'EM_ANDAMENTO' };
  const doOutro = { id: 6, usuario_id: planejadorB.id };
  const propria = { id: 7, usuario_id: planejadorA.id };
  await comRepositorio(
    { findById: (id) => (id === 6 ? doOutro : id === 7 ? propria : atual) },
    async () => {
      await assert.rejects(
        () => service.alterarStatus(5, { status: 'EM_ANDAMENTO', justificativa_tarefa_id: 6 }, planejadorA),
        (erro) => erro.status === 403
      );
    }
  );
});

/* ------------------------------- Cálculo das métricas ------------------------------- */

test('métricas: média, no prazo vs. atraso e distribuição por categoria', () => {
  const { resumo, por_categoria: categorias, ranking } = calcularMetricas(ENTREGAS, { incluirRanking: true });

  assert.equal(resumo.concluidas, 4);
  assert.equal(resumo.no_prazo, 2);
  assert.equal(resumo.com_atraso, 2);
  assert.equal(resumo.aderencia_media, 99.25);
  assert.equal(resumo.pontualidade, 50);
  assert.deepEqual(categorias, [{ categoria: 'SOLICITACAO_EXTRA', total: 2 }]);

  assert.deepEqual(ranking.map((r) => r.nome), ['Ana', 'Bruno']); // 99,5 vs 99
  assert.equal(ranking[0].aderencia_media, 99.5);
});

test('métricas sem entregas não inventam valores', () => {
  const { resumo, por_categoria: categorias } = calcularMetricas([]);
  assert.equal(resumo.concluidas, 0);
  assert.equal(resumo.aderencia_media, null);
  assert.equal(resumo.pontualidade, null);
  assert.deepEqual(categorias, []);
});

test('métricas recalculam a aderência quando ela ainda não foi gravada', () => {
  const legado = concluida(10, 'Ana', '2026-11-10T18:00:00', '2026-11-10T19:00:00', null, null);
  assert.equal(calcularMetricas([legado]).resumo.aderencia_media, 99);
});

test('atraso sem categoria cai em SEM_CATEGORIA', () => {
  const legado = concluida(10, 'Ana', '2026-11-10T18:00:00', '2026-11-10T19:00:00', null, 99);
  assert.deepEqual(calcularMetricas([legado]).por_categoria, [{ categoria: 'SEM_CATEGORIA', total: 1 }]);
});

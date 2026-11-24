'use strict';

/**
 * Teste de integração do RDO contra um Postgres de TESTE.
 *
 * Só roda com TEST_DATABASE_URL apontando para um banco local cujo nome contenha "teste"/"test"
 * (já migrado com `prisma migrate deploy`). Sem a variável, os testes são ignorados — o
 * `npm test` normal não precisa de banco. Nunca aponte para o banco de produção.
 *
 *   TEST_DATABASE_URL=postgresql://teste:teste@localhost:54329/rdo_teste npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const URL_TESTE = process.env.TEST_DATABASE_URL || '';
const seguro = /(localhost|127\.0\.0\.1)/.test(URL_TESTE) && /\/[^/?]*(teste|test)[^/?]*(\?|$)/i.test(URL_TESTE);
const pular = !URL_TESTE ? 'defina TEST_DATABASE_URL para rodar' : !seguro ? 'TEST_DATABASE_URL precisa ser um banco local de teste' : false;

test('RDO: fluxo completo contra o banco', { skip: pular }, async (t) => {
  process.env.DATABASE_URL = URL_TESTE;
  const prisma = require('../src/config/prisma');
  const rdo = require('../src/services/rdoService');
  const cadastros = require('../src/services/rdoCadastroService');

  const sufixo = String(Date.now());
  const dia = (n) => `2026-12-${String(n).padStart(2, '0')}`;

  /* ----------------------------- cenário base ----------------------------- */
  const novoUsuario = (perfil, nome) =>
    prisma.usuario.create({ data: { nome: `${nome} ${sufixo}`, email: `${perfil.toLowerCase()}.${nome}.${sufixo}@teste.local`, senha_hash: 'x', perfil } });
  const admin = await novoUsuario('ADMIN', 'admin');
  const encA = await novoUsuario('ENCARREGADO', 'encA');
  const encB = await novoUsuario('ENCARREGADO', 'encB');
  const encSemVinculo = await novoUsuario('ENCARREGADO', 'encX');
  const plan = await novoUsuario('PLANEJADOR', 'plan');
  const planFora = await novoUsuario('PLANEJADOR', 'planFora');
  const u = (x) => ({ id: x.id, perfil: x.perfil, nome: x.nome });

  const contrato = await prisma.contrato.create({
    data: { id_vale: `CT-T-${sufixo}`, descricao: 'Contrato de teste', valor_inicial: 1000, data_inicio: new Date('2026-01-01'), data_fim: new Date('2027-12-31') },
  });
  const orcamento = await prisma.orcamento.create({ data: { pep: 'C0-TESTE', ss: 'SS001/26', descricao: 'Obra de teste', foto_1: 'x' } });
  const obra = await prisma.obra.create({ data: { orcamento_id: orcamento.id, contrato_id: contrato.id, planejador_id: plan.id } });

  const criarVersao = async (numero, snapshot, reais) => {
    const v = await prisma.versaoCronograma.create({ data: { obra_id: obra.id, versao: `Rev ${numero}`, numero_revisao: numero, data_snapshot: new Date(snapshot) } });
    await prisma.atividadeCronograma.createMany({
      data: [
        { versao_cronograma_id: v.id, ordem: 1, codigo_atividade: '1', descricao: 'Resumo', nivel: 1, resumo: true },
        { versao_cronograma_id: v.id, ordem: 2, codigo_atividade: '1.1', codigo_pai: '1', descricao: 'Montar tubulação', nivel: 2, avanco_fisico_real: reais['1.1'] ?? 0 },
        { versao_cronograma_id: v.id, ordem: 3, codigo_atividade: '1.2', codigo_pai: '1', descricao: 'Soldar spools', nivel: 2, avanco_fisico_real: reais['1.2'] ?? 0 },
      ],
    });
    return v;
  };
  await criarVersao(0, '2026-12-01T15:00:00Z', { '1.1': 20 });

  await prisma.encarregadoObra.createMany({ data: [{ usuario_id: encA.id, obra_id: obra.id }, { usuario_id: encB.id, obra_id: obra.id }] });
  await prisma.obraPlanejador.create({ data: { obra_id: obra.id, usuario_id: plan.id, ordem: 0 } }).catch(() => {});

  const funcao = await cadastros.criar('funcoes', { nome: `Soldador ${sufixo}` }, u(admin));
  const equipamento = await cadastros.criar('equipamentos', { nome: `Guindaste ${sufixo}`, codigo: `G-${sufixo}` }, u(admin));
  const motivo = await cadastros.criar('motivos', { descricao: `Chuva ${sufixo}` }, u(admin));

  const corpo = (extra = {}) => ({
    data: dia(10),
    clima_manha: 'Ensolarado',
    atividades: [{
      obra_id: obra.id, codigo_atividade: '1.1', percentual_declarado: 50,
      mao_obra: [{ tipo: 'FUNCAO', funcao_id: funcao.id, quantidade: 3, horas: 8 }],
    }],
    equipamentos: [{ equipamento_id: equipamento.id, horas_trabalhadas: 6, horas_paradas: 2 }],
    pts: [{ numero: 'PTS-1', solicitado_em: '2026-12-10T10:00:00Z', liberado_em: '2026-12-10T11:30:00Z' }],
    desvios: [{ motivo_id: motivo.id, horas: 1.5 }],
    ...extra,
  });
  const comFoto = async (r) => {
    for (const a of r.atividades) if (!a.fora_de_escopo) await prisma.rdoFoto.create({ data: { rdo_atividade_id: a.id, url: 'https://exemplo/foto.webp' } });
  };

  /* ----------------------------- lançamento ----------------------------- */
  await t.test('atividades da obra trazem o % vigente do cronograma', async () => {
    const r = await rdo.listarAtividadesDaObra(obra.id, u(encA));
    const a = r.atividades.find((x) => x.codigo_atividade === '1.1');
    assert.equal(a.percentual_vigente, 20);
    assert.equal(a.origem_percentual, 'CRONOGRAMA');
    assert.ok(!r.atividades.some((x) => x.codigo_atividade === '1'), 'resumo não recebe avanço');
  });

  let r1;
  await t.test('encarregado cria o RDO e os totais saem calculados', async () => {
    r1 = await rdo.criar(corpo(), u(encA));
    assert.equal(r1.status, 'RASCUNHO');
    assert.equal(r1.contrato_id, contrato.id);
    assert.equal(Number(r1.atividades[0].percentual_anterior), 20);
    assert.equal(r1.atividades[0].descricao_snapshot, 'Montar tubulação');
    assert.equal(r1.totais.hh, 24);
    assert.equal(r1.pts[0].espera_minutos, 90);
    assert.equal(r1.totais.desvios.total, 1.5);
  });

  await t.test('um RDO por encarregado por dia', async () => {
    await assert.rejects(() => rdo.criar(corpo(), u(encA)), (e) => e.status === 409);
  });

  await t.test('encarregado só lança nas obras a que está vinculado', async () => {
    await assert.rejects(() => rdo.criar(corpo({ data: dia(11) }), u(encSemVinculo)), (e) => e.status === 403);
  });

  await t.test('atividade inexistente, resumo e % inválido são recusados', async () => {
    const base = (extra) => ({ data: dia(12), atividades: [{ obra_id: obra.id, codigo_atividade: '1.1', percentual_declarado: 50, ...extra }] });
    await assert.rejects(() => rdo.criar(base({ codigo_atividade: '9.9' }), u(encB)), (e) => e.status === 400);
    await assert.rejects(() => rdo.criar(base({ codigo_atividade: '1' }), u(encB)), (e) => /agrupamento/.test(e.message));
    await assert.rejects(() => rdo.criar(base({ percentual_declarado: 101 }), u(encB)), (e) => e.status === 400);
    await assert.rejects(() => rdo.criar(base({ percentual_declarado: 10 }), u(encB)), (e) => /regride/.test(e.message));
  });

  await t.test('atualizar mantém fotos das atividades que permanecem', async () => {
    await comFoto(r1);
    const atual = await rdo.obter(r1.id, u(encA));
    const atualizado = await rdo.atualizar(r1.id, {
      comentario_geral: 'ok',
      atividades: [{ id: atual.atividades[0].id, obra_id: obra.id, codigo_atividade: '1.1', percentual_declarado: 55 }],
    }, u(encA));
    assert.equal(atualizado.atividades[0].fotos.length, 1);
    assert.equal(Number(atualizado.atividades[0].percentual_declarado), 55);
    assert.equal(atualizado.pts.length, 1, 'seção ausente do corpo não é apagada');
  });

  /* ------------------------------ fluxo ------------------------------ */
  await t.test('finalizar exige foto nas atividades que avançaram', async () => {
    const semFoto = await rdo.criar(corpo({ data: dia(13) }), u(encB));
    await assert.rejects(() => rdo.finalizar(semFoto.id, u(encB)), (e) => /foto/.test(e.message));
    await rdo.excluir(semFoto.id, u(encB));
  });

  await t.test('finalizar assina; depois disso não edita', async () => {
    const f = await rdo.finalizar(r1.id, u(encA));
    assert.equal(f.status, 'FINALIZADO');
    assert.ok(f.assinado_em);
    await assert.rejects(() => rdo.atualizar(r1.id, { comentario_geral: 'x' }, u(encA)), (e) => e.status === 409);
  });

  await t.test('perfis sem permissão não aprovam', async () => {
    await assert.rejects(() => rdo.aprovar(r1.id, {}, u(encA)), (e) => e.status === 403);
    await assert.rejects(() => rdo.aprovar(r1.id, {}, u(planFora)), (e) => e.status === 403);
  });

  await t.test('devolver exige motivo; o encarregado corrige e finaliza de novo', async () => {
    await assert.rejects(() => rdo.devolver(r1.id, {}, u(plan)), (e) => e.status === 400);
    const d = await rdo.devolver(r1.id, { motivo: 'Faltou a foto da solda' }, u(plan));
    assert.equal(d.status, 'DEVOLVIDO');
    await rdo.atualizar(r1.id, { comentario_geral: 'corrigido' }, u(encA));
    const f = await rdo.finalizar(r1.id, u(encA));
    assert.equal(f.status, 'FINALIZADO');
    assert.equal(f.motivo_devolucao, null);
  });

  await t.test('aprovar grava o avanço e o RDO passa a valer como % vigente', async () => {
    const a = await rdo.aprovar(r1.id, {}, u(plan));
    assert.equal(a.status, 'APROVADO');
    assert.equal(Number(a.atividades[0].percentual_validado), 55);
    const lista = await rdo.listarAtividadesDaObra(obra.id, u(plan));
    const x = lista.atividades.find((y) => y.codigo_atividade === '1.1');
    assert.deepEqual([x.percentual_vigente, x.origem_percentual], [55, 'RDO']);
    assert.deepEqual(a.historico.map((h) => h.para), ['RASCUNHO', 'FINALIZADO', 'DEVOLVIDO', 'FINALIZADO', 'APROVADO']);
    await assert.rejects(() => rdo.aprovar(r1.id, {}, u(plan)), (e) => e.status === 409, 'não aprova duas vezes');
  });

  await t.test('dois RDOs na mesma atividade: o segundo a aprovar com % menor dá conflito', async () => {
    const dois = await rdo.criar(corpo({ data: dia(14), atividades: [{ obra_id: obra.id, codigo_atividade: '1.1', percentual_declarado: 80 }] }), u(encA));
    const tres = await rdo.criar(corpo({ data: dia(14), atividades: [{ obra_id: obra.id, codigo_atividade: '1.1', percentual_declarado: 60 }] }), u(encB));
    await comFoto(dois); await comFoto(tres);
    await rdo.finalizar(dois.id, u(encA)); await rdo.finalizar(tres.id, u(encB));

    await rdo.aprovar(dois.id, {}, u(plan));
    await assert.rejects(
      () => rdo.aprovar(tres.id, {}, u(plan)),
      (e) => e.status === 409 && e.details?.codigo === 'CONFLITO_AVANCO' && e.details.conflitos[0].percentual_anterior === 80
    );
    const pendente = await rdo.obter(tres.id, u(plan));
    assert.equal(pendente.status, 'FINALIZADO', 'a transação desfez tudo');

    const detalhe = await rdo.obter(tres.id, u(plan));
    const ok = await rdo.aprovar(tres.id, { atividades: [{ id: detalhe.atividades[0].id, percentual_validado: 80 }] }, u(plan));
    assert.equal(ok.status, 'APROVADO');
  });

  await t.test('aprovações simultâneas na mesma obra se enfileiram sem corromper', async () => {
    const mk = async (n, enc, pct) => {
      const r = await rdo.criar(corpo({ data: dia(n), atividades: [{ obra_id: obra.id, codigo_atividade: '1.2', percentual_declarado: pct }] }), u(enc));
      await comFoto(r); await rdo.finalizar(r.id, u(enc));
      return r.id;
    };
    const a = await mk(15, encA, 30);
    const b = await mk(15, encB, 30);
    const res = await Promise.allSettled([rdo.aprovar(a, {}, u(plan)), rdo.aprovar(b, {}, u(plan))]);
    assert.equal(res.filter((x) => x.status === 'fulfilled').length, 2);
    assert.equal(await prisma.avancoAtividadeAprovado.count({ where: { obra_id: obra.id, codigo_atividade: '1.2' } }), 2);
  });

  await t.test('resumo do avanço da obra compara cronograma e RDO', async () => {
    const r = await rdo.resumoAvancoDaObra(obra.id);
    assert.equal(r.percentual_cronograma, 10);
    assert.equal(r.percentual_com_rdo, 55);
    assert.equal(r.atividades_total, 2);
    assert.equal(r.atividades_com_rdo, 2);
    assert.equal(r.ultimo_rdo_aprovado_em, '2026-12-15');
  });

  await t.test('reimportação: o mais recente vale entre RDO e cronograma', async () => {
    // Revisão com status ANTES do último RDO aprovado (14/12): o RDO continua valendo.
    await criarVersao(1, '2026-12-05T15:00:00Z', { '1.1': 10 });
    let l = await rdo.listarAtividadesDaObra(obra.id, u(plan));
    assert.deepEqual([l.atividades[0].percentual_vigente, l.atividades[0].origem_percentual], [80, 'RDO']);
    // Revisão com status DEPOIS: o cronograma passa a valer. Os RDOs seguem ligados pelo EDT.
    await criarVersao(2, '2026-12-20T15:00:00Z', { '1.1': 90 });
    l = await rdo.listarAtividadesDaObra(obra.id, u(plan));
    assert.deepEqual([l.atividades[0].percentual_vigente, l.atividades[0].origem_percentual], [90, 'CRONOGRAMA']);
    const antigo = await rdo.obter(r1.id, u(plan));
    assert.equal(antigo.atividades[0].codigo_atividade, '1.1');
    assert.equal(antigo.atividades[0].descricao_snapshot, 'Montar tubulação');
  });

  await t.test('PDF do RDO é gerado (PDF válido, com as seções)', async () => {
    const { gerarPdfRdo } = require('../src/services/rdoPdfService');
    const completo = await rdo.obter(r1.id, u(plan));
    const pdf = await gerarPdfRdo(completo);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 3000);
  });

  await t.test('listagem respeita o escopo de cada perfil', async () => {
    const dosA = await rdo.listar({}, u(encA));
    assert.ok(dosA.itens.every((i) => i.encarregado.id === encA.id));
    const doPlan = await rdo.listar({ status: 'APROVADO', obra_id: obra.id }, u(plan));
    assert.ok(doPlan.total >= 3);
    assert.equal((await rdo.listar({}, u(planFora))).total, 0);
    await assert.rejects(() => rdo.listar({ obra_id: obra.id }, u(planFora)), (e) => e.status === 403);
  });

  await t.test('cadastros: nome repetido dá 409 do banco e desativar não apaga', async () => {
    await assert.rejects(() => cadastros.criar('funcoes', { nome: funcao.nome }, u(admin)), (e) => e.code === 'P2002');
    const off = await cadastros.atualizar('funcoes', funcao.id, { ativo: false }, u(plan));
    assert.equal(off.ativo, false);
    const comFuncaoInativa = corpo({ data: dia(16) });
    comFuncaoInativa.atividades[0].percentual_declarado = 95;
    await assert.rejects(() => rdo.criar(comFuncaoInativa, u(encA)), (e) => /inativo/.test(e.message));
    await cadastros.atualizar('funcoes', funcao.id, { ativo: true }, u(plan));
  });

  await t.test('vínculo encarregado-obras só para ENCARREGADO e só SUPERVISOR/ADMIN', async () => {
    await assert.rejects(() => cadastros.definirObrasDoEncarregado(plan.id, { obra_ids: [obra.id] }, u(admin)), (e) => e.status === 400);
    await assert.rejects(() => cadastros.definirObrasDoEncarregado(encA.id, { obra_ids: [obra.id] }, u(plan)), (e) => e.status === 403);
    const v = await cadastros.definirObrasDoEncarregado(encSemVinculo.id, { obra_ids: [obra.id] }, u(admin));
    assert.deepEqual(v.obra_ids, [obra.id]);
  });

  await prisma.$disconnect();
});

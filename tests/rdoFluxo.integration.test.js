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
  const sup = await novoUsuario('SUPERVISOR', 'sup');
  const u = (x) => ({ id: x.id, perfil: x.perfil, nome: x.nome });

  const contrato = await prisma.contrato.create({
    data: { id_vale: `CT-T-${sufixo}`, descricao: 'Contrato de teste', valor_inicial: 1000, data_inicio: new Date('2026-01-01'), data_fim: new Date('2027-12-31') },
  });
  const novaObra = async (ss, status) => {
    const orcamento = await prisma.orcamento.create({ data: { pep: 'C0-TESTE', ss, descricao: `Obra ${ss}`, foto_1: 'x' } });
    return prisma.obra.create({ data: { orcamento_id: orcamento.id, contrato_id: contrato.id, planejador_id: plan.id, status } });
  };
  const obra = await novaObra('SS001/26', 'EM_ANDAMENTO');
  const obraParada = await novaObra('SS002/26', 'PARALISADA');

  const criarVersao = async (numero, snapshot, reais) => {
    const v = await prisma.versaoCronograma.create({ data: { obra_id: obra.id, versao: `Rev ${numero}`, numero_revisao: numero, data_snapshot: new Date(snapshot) } });
    await prisma.atividadeCronograma.createMany({
      data: [
        { versao_cronograma_id: v.id, ordem: 1, codigo_atividade: '1', descricao: 'Resumo', nivel: 1, resumo: true },
        { versao_cronograma_id: v.id, ordem: 2, codigo_atividade: '1.1', codigo_pai: '1', descricao: 'Montar tubulação', nivel: 2, avanco_fisico_real: reais['1.1'] ?? 0 },
        { versao_cronograma_id: v.id, ordem: 3, codigo_atividade: '1.2', codigo_pai: '1', descricao: 'Soldar spools', nivel: 2, avanco_fisico_real: reais['1.2'] ?? 0 },
        { versao_cronograma_id: v.id, ordem: 4, codigo_atividade: '1.3', codigo_pai: '1', descricao: 'Teste hidrostático', nivel: 2, avanco_fisico_real: reais['1.3'] ?? 0 },
      ],
    });
    return v;
  };
  await criarVersao(0, '2026-12-01T15:00:00Z', { '1.1': 20, '1.3': 100 });

  await prisma.encarregadoObra.createMany({
    data: [
      { usuario_id: encA.id, obra_id: obra.id }, { usuario_id: encB.id, obra_id: obra.id },
      { usuario_id: encA.id, obra_id: obraParada.id },
    ],
  });
  await prisma.obraPlanejador.create({ data: { obra_id: obra.id, usuario_id: plan.id, ordem: 0 } }).catch(() => {});

  const funcao = await cadastros.criar('funcoes', { nome: `Soldador ${sufixo}` }, u(admin));
  const funcao2 = await cadastros.criar('funcoes', { nome: `Montador ${sufixo}` }, u(admin));
  const colab = await cadastros.criar('colaboradores', { nome: `Carlos ${sufixo}`, matricula: `M${sufixo}` }, u(admin));
  const colabFora = await cadastros.criar('colaboradores', { nome: `Pedro ${sufixo}`, matricula: `P${sufixo}` }, u(admin));
  const equipamento = await cadastros.criar('equipamentos', { nome: `Guindaste ${sufixo}`, codigo: `G-${sufixo}` }, u(admin));
  const motivo = await cadastros.criar('motivos', { descricao: `Chuva ${sufixo}` }, u(admin));

  const efetivoPadrao = () => [
    { tipo: 'FUNCAO', funcao_id: funcao.id, quantidade: 4 },
    { tipo: 'NOMINAL', colaborador_id: colab.id },
  ];
  const corpo = (extra = {}) => ({
    obra_id: obra.id,
    data: dia(10),
    supervisor_id: sup.id,
    clima_manha: 'Ensolarado',
    dss_tema: 'Trabalho em altura',
    dss_participantes: 6,
    efetivo: efetivoPadrao(),
    atividades: [{
      codigo_atividade: '1.1', percentual_declarado: 50,
      mao_obra: [{ tipo: 'FUNCAO', funcao_id: funcao.id, quantidade: 3, horas: 8 }],
    }],
    equipamentos: [{ equipamento_id: equipamento.id, horas_trabalhadas: 6, horas_paradas: 2 }],
    pts_necessaria: true,
    pts: [{ numero: 'PTS-1', hora_solicitacao: '07:00', hora_liberacao: '08:30', emitente: 'Fiscal Vale' }],
    desvios_observacao: 'Chuva forte no início da manhã',
    desvios: [{ motivo_id: motivo.id, horas: 1.5 }],
    ...extra,
  });
  const comFoto = async (r) => {
    for (const a of r.atividades) if (!a.fora_de_escopo) await prisma.rdoFoto.create({ data: { rdo_atividade_id: a.id, url: 'https://exemplo/foto.webp' } });
  };

  /* ----------------------------- apoio ao formulário ----------------------------- */
  await t.test('o encarregado só enxerga obras em andamento a que está vinculado', async () => {
    const obras = await rdo.listarObras(u(encA));
    assert.deepEqual(obras.map((o) => o.id), [obra.id]);
    assert.equal((await rdo.listarObras(u(encSemVinculo))).length, 0);
  });

  await t.test('atividades da obra trazem o % vigente e marcam as concluídas', async () => {
    const r = await rdo.listarAtividadesDaObra(obra.id, u(encA));
    const a11 = r.atividades.find((x) => x.codigo_atividade === '1.1');
    assert.deepEqual([a11.percentual_vigente, a11.origem_percentual, a11.concluida], [20, 'CRONOGRAMA', false]);
    assert.equal(r.atividades.find((x) => x.codigo_atividade === '1.3').concluida, true);
    assert.ok(!r.atividades.some((x) => x.codigo_atividade === '1'), 'resumo não recebe avanço');
  });

  await t.test('supervisores: só usuários Supervisor ativos', async () => {
    const lista = await rdo.listarSupervisores();
    assert.ok(lista.some((s) => s.id === sup.id));
    assert.ok(!lista.some((s) => s.id === plan.id));
  });

  /* ----------------------------- lançamento ----------------------------- */
  let r1;
  await t.test('encarregado cria o RDO da obra e os totais saem calculados', async () => {
    r1 = await rdo.criar(corpo(), u(encA));
    assert.equal(r1.status, 'RASCUNHO');
    assert.equal(r1.obra_id, obra.id);
    assert.equal(r1.contrato_id, contrato.id);
    assert.equal(r1.supervisor.id, sup.id);
    assert.equal(Number(r1.atividades[0].percentual_anterior), 20);
    assert.equal(r1.totais.hh, 24);
    assert.equal(r1.totais.pessoas, 5);
    assert.equal(r1.efetivo.length, 2);
    assert.equal(r1.pts[0].hora_solicitacao, '07:00');
    assert.equal(r1.pts[0].espera_minutos, 90);
    assert.equal(r1.pts[0].emitente, 'Fiscal Vale');
    assert.equal(r1.desvios_observacao, 'Chuva forte no início da manhã');
    assert.equal(r1.totais.desvios.total, 1.5);
  });

  await t.test('um RDO por obra, por dia e por encarregado', async () => {
    await assert.rejects(() => rdo.criar(corpo(), u(encA)), (e) => e.status === 409);
    const deB = await rdo.criar(corpo({ data: dia(10), atividades: [] , pts_necessaria: false, pts: [] }), u(encB));
    assert.equal(deB.encarregado.id, encB.id, 'outro encarregado, mesma obra e dia: permitido');
    await rdo.excluir(deB.id, u(encB));
  });

  await t.test('o supervisor do último RDO da obra é sugerido no próximo', async () => {
    const obras = await rdo.listarObras(u(encA));
    assert.equal(obras[0].supervisor_padrao.id, sup.id);
    const novo = await rdo.criar({ obra_id: obra.id, data: dia(9) }, u(encA));
    assert.equal(novo.supervisor.id, sup.id);
    await rdo.excluir(novo.id, u(encA));
  });

  await t.test('só lança em obra em andamento e a que está vinculado', async () => {
    await assert.rejects(() => rdo.criar({ obra_id: obraParada.id, data: dia(11) }, u(encA)), (e) => e.status === 409 && /em andamento/.test(e.message));
    await assert.rejects(() => rdo.criar({ obra_id: obra.id, data: dia(11) }, u(encSemVinculo)), (e) => e.status === 403);
    await assert.rejects(() => rdo.criar({ obra_id: obra.id, data: dia(11), supervisor_id: plan.id }, u(encA)), (e) => /Supervisor/.test(e.message));
  });

  await t.test('atividade inexistente, resumo e % inválido são recusados', async () => {
    const base = (extra) => ({ obra_id: obra.id, data: dia(12), efetivo: efetivoPadrao(), atividades: [{ codigo_atividade: '1.1', percentual_declarado: 50, ...extra }] });
    await assert.rejects(() => rdo.criar(base({ codigo_atividade: '9.9' }), u(encB)), (e) => e.status === 400);
    await assert.rejects(() => rdo.criar(base({ codigo_atividade: '1' }), u(encB)), (e) => /agrupamento/.test(e.message));
    await assert.rejects(() => rdo.criar(base({ percentual_declarado: 101 }), u(encB)), (e) => e.status === 400);
    await assert.rejects(() => rdo.criar(base({ percentual_declarado: 10 }), u(encB)), (e) => /regride/.test(e.message));
  });

  await t.test('atividade já em 100% aceita mão de obra e observação, mas o avanço fica travado', async () => {
    const r = await rdo.criar(corpo({
      data: dia(12),
      atividades: [{ codigo_atividade: '1.3', percentual_declarado: 40, observacao: 'Acompanhamento', mao_obra: [{ tipo: 'NOMINAL', colaborador_id: colab.id, horas: 2 }] }],
    }), u(encB));
    const a = r.atividades[0];
    assert.equal(Number(a.percentual_declarado), 100, 'o % digitado é ignorado: segue em 100');
    assert.equal(Number(a.percentual_anterior), 100);
    assert.equal(a.observacao, 'Acompanhamento');
    assert.equal(a.mao_obra.length, 1);
    await rdo.excluir(r.id, u(encB));
  });

  await t.test('atividade fora de escopo exige justificativa e entra como desvio', async () => {
    const fora = (extra) => corpo({ data: dia(12), atividades: [{ fora_de_escopo: true, descricao: 'Reparo de cerca', mao_obra: [{ tipo: 'NOMINAL', colaborador_id: colab.id, horas: 3 }], ...extra }] });
    await assert.rejects(() => rdo.criar(fora({}), u(encB)), (e) => /justificativa/.test(e.message));
    const r = await rdo.criar(fora({ justificativa: 'Pedido do cliente no local' }), u(encB));
    assert.equal(r.atividades[0].fora_de_escopo, true);
    assert.equal(r.desvios_automaticos.length, 1);
    assert.equal(r.desvios_automaticos[0].horas, 3);
    assert.equal(r.totais.desvios.total, 4.5, '1,5 h lançadas + 3 HH fora de escopo');
    await rdo.excluir(r.id, u(encB));
  });

  await t.test('a mão de obra só aceita gente do efetivo do dia', async () => {
    const com = (maoObra, efetivo) => corpo({ data: dia(12), efetivo, atividades: [{ codigo_atividade: '1.1', percentual_declarado: 50, mao_obra: maoObra }] });
    await assert.rejects(() => rdo.criar(com([{ tipo: 'NOMINAL', colaborador_id: colabFora.id, horas: 4 }], efetivoPadrao()), u(encB)), (e) => /efetivo do dia/.test(e.message));
    await assert.rejects(() => rdo.criar(com([{ tipo: 'FUNCAO', funcao_id: funcao2.id, quantidade: 1, horas: 4 }], efetivoPadrao()), u(encB)), (e) => /efetivo do dia/.test(e.message));
    await assert.rejects(() => rdo.criar(com([{ tipo: 'FUNCAO', funcao_id: funcao.id, quantidade: 5, horas: 4 }], efetivoPadrao()), u(encB)), (e) => /mais pessoas/.test(e.message));
    await assert.rejects(() => rdo.criar(com([{ tipo: 'NOMINAL', colaborador_id: colab.id, horas: 25 }], efetivoPadrao()), u(encB)), (e) => e.status === 400);
    await assert.rejects(() => rdo.criar(corpo({ data: dia(12), efetivo: [{ tipo: 'NOMINAL', colaborador_id: colab.id }, { tipo: 'NOMINAL', colaborador_id: colab.id }] }), u(encB)), (e) => /mais de uma vez/.test(e.message));
  });

  await t.test('PTS: "não necessária" limpa a lista; as horas valem no dia do RDO', async () => {
    const semPts = await rdo.criar(corpo({ data: dia(13), pts_necessaria: false }), u(encB));
    assert.equal(semPts.pts.length, 0);
    assert.equal(semPts.pts_necessaria, false);
    await assert.rejects(() => rdo.criar(corpo({ data: dia(14), pts: [{ hora_solicitacao: '09:00', hora_liberacao: '08:00' }] }), u(encB)), (e) => /anterior/.test(e.message));
    await assert.rejects(() => rdo.criar(corpo({ data: dia(14), pts: [{ hora_solicitacao: '9h' }] }), u(encB)), (e) => /HH:MM/.test(e.message));
    const mudou = await rdo.atualizar(semPts.id, { pts_necessaria: true, pts: [{ hora_solicitacao: '06:30' }] }, u(encB));
    assert.equal(mudou.pts[0].hora_solicitacao, '06:30');
    assert.equal(mudou.pts[0].hora_liberacao, null);
    const dataNova = await rdo.atualizar(semPts.id, { data: dia(16) }, u(encB));
    assert.equal(dataNova.pts[0].hora_solicitacao, '06:30', 'trocar o dia mantém a hora da PTS');
    await rdo.excluir(semPts.id, u(encB));
  });

  await t.test('PTS: uma única por RDO; para finalizar exige liberação e emitente', async () => {
    await assert.rejects(() => rdo.criar(corpo({ data: dia(19), pts: [{ hora_solicitacao: '07:00' }, { hora_solicitacao: '08:00' }] }), u(encB)), (e) => /única PTS/.test(e.message));
    const r = await rdo.criar(corpo({ data: dia(19), pts: [{ hora_solicitacao: '07:00' }] }), u(encB));
    await comFoto(r);
    await assert.rejects(() => rdo.finalizar(r.id, u(encB)), (e) => /liberação/.test(e.message));
    await rdo.atualizar(r.id, { pts: [{ hora_solicitacao: '07:00', hora_liberacao: '09:00' }] }, u(encB));
    await assert.rejects(() => rdo.finalizar(r.id, u(encB)), (e) => /emitente/.test(e.message));
    const ok = await rdo.atualizar(r.id, { pts: [{ hora_solicitacao: '07:00', hora_liberacao: '09:00', emitente: 'Ana Souza' }] }, u(encB));
    assert.equal(ok.pts[0].emitente, 'Ana Souza');
    assert.equal(ok.totais.espera_pts_minutos, 120);
    await rdo.excluir(r.id, u(encB));
  });

  await t.test('desvios: lista fixa de motivos na ordem do modelo, um lançamento por motivo', async () => {
    const motivos = await cadastros.listar('motivos', { ativos: 'true' });
    assert.equal(motivos[0].descricao, 'Aguardando Materiais');
    assert.equal(motivos[17].descricao, 'Equipe à disposição');
    assert.ok(motivos.length >= 18);
    await assert.rejects(() => rdo.criar(corpo({ data: dia(19), desvios: [{ motivo_id: motivo.id, horas: 1 }, { motivo_id: motivo.id, horas: 2 }] }), u(encB)), (e) => /só pode aparecer uma vez/.test(e.message));
    const r = await rdo.criar(corpo({ data: dia(19), desvios: [{ motivo_id: motivos[0].id, horas: 1.5 }, { motivo_id: motivos[5].id, horas: 0.25 }], desvios_observacao: 'Sem material na frente' }), u(encB));
    assert.equal(r.totais.desvios.total, 1.75);
    assert.equal(r.desvios_observacao, 'Sem material na frente');
    await rdo.excluir(r.id, u(encB));
  });

  await t.test('atualizar mantém fotos das atividades que permanecem', async () => {
    await comFoto(r1);
    const atual = await rdo.obter(r1.id, u(encA));
    const atualizado = await rdo.atualizar(r1.id, {
      comentario_geral: 'ok',
      atividades: [{ id: atual.atividades[0].id, codigo_atividade: '1.1', percentual_declarado: 55, mao_obra: [{ tipo: 'FUNCAO', funcao_id: funcao.id, quantidade: 3, horas: 8 }] }],
    }, u(encA));
    assert.equal(atualizado.atividades[0].fotos.length, 1);
    assert.equal(Number(atualizado.atividades[0].percentual_declarado), 55);
    assert.equal(atualizado.pts.length, 1, 'seção ausente do corpo não é apagada');
    assert.equal(atualizado.efetivo.length, 2);
  });

  await t.test('tirar do efetivo quem já está numa atividade é recusado', async () => {
    await assert.rejects(() => rdo.atualizar(r1.id, { efetivo: [{ tipo: 'NOMINAL', colaborador_id: colab.id }] }, u(encA)), (e) => /efetivo do dia/.test(e.message));
  });

  /* ------------------------------ fluxo ------------------------------ */
  await t.test('finalizar exige supervisor, efetivo, resposta de PTS e foto das atividades que avançaram', async () => {
    const semFoto = await rdo.criar(corpo({ data: dia(13) }), u(encB));
    await assert.rejects(() => rdo.finalizar(semFoto.id, u(encB)), (e) => /foto/.test(e.message));
    await rdo.atualizar(semFoto.id, { supervisor_id: null }, u(encB));
    await assert.rejects(() => rdo.finalizar(semFoto.id, u(encB)), (e) => /supervisor/.test(e.message));
    await rdo.atualizar(semFoto.id, { supervisor_id: sup.id, efetivo: [] , atividades: [{ id: semFoto.atividades[0].id, codigo_atividade: '1.1', percentual_declarado: 50 }] }, u(encB));
    await assert.rejects(() => rdo.finalizar(semFoto.id, u(encB)), (e) => /efetivo/.test(e.message));
    await rdo.atualizar(semFoto.id, { efetivo: efetivoPadrao(), pts_necessaria: null }, u(encB));
    await assert.rejects(() => rdo.finalizar(semFoto.id, u(encB)), (e) => /PTS/.test(e.message));
    await rdo.atualizar(semFoto.id, { pts_necessaria: true, pts: [] }, u(encB));
    await assert.rejects(() => rdo.finalizar(semFoto.id, u(encB)), (e) => /solicitação/.test(e.message));
    await rdo.excluir(semFoto.id, u(encB));
  });

  await t.test('só finaliza com a obra ainda em andamento', async () => {
    const r = await rdo.criar(corpo({ data: dia(13) }), u(encB));
    await comFoto(r);
    await prisma.obra.update({ where: { id: obra.id }, data: { status: 'PARALISADA' } });
    await assert.rejects(() => rdo.finalizar(r.id, u(encB)), (e) => /em andamento/.test(e.message));
    await prisma.obra.update({ where: { id: obra.id }, data: { status: 'EM_ANDAMENTO' } });
    await rdo.excluir(r.id, u(encB)).catch(() => {});
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

  await t.test('RDO só com atividade concluída ou fora de escopo aprova sem criar avanço', async () => {
    const r = await rdo.criar(corpo({
      data: dia(15),
      atividades: [
        { codigo_atividade: '1.3', percentual_declarado: 100, mao_obra: [{ tipo: 'NOMINAL', colaborador_id: colab.id, horas: 2 }] },
        { fora_de_escopo: true, descricao: 'Limpeza extra', justificativa: 'Solicitação do cliente' },
      ],
    }), u(encB));
    await rdo.finalizar(r.id, u(encB));
    const antes = await prisma.avancoAtividadeAprovado.count({ where: { obra_id: obra.id } });
    const a = await rdo.aprovar(r.id, {}, u(plan));
    assert.equal(a.status, 'APROVADO');
    assert.equal(await prisma.avancoAtividadeAprovado.count({ where: { obra_id: obra.id } }), antes);
  });

  await t.test('dois RDOs na mesma atividade: o segundo a aprovar com % menor dá conflito', async () => {
    const dois = await rdo.criar(corpo({ data: dia(14), atividades: [{ codigo_atividade: '1.1', percentual_declarado: 80 }] }), u(encA));
    const tres = await rdo.criar(corpo({ data: dia(14), atividades: [{ codigo_atividade: '1.1', percentual_declarado: 60 }] }), u(encB));
    await comFoto(dois); await comFoto(tres);
    await rdo.finalizar(dois.id, u(encA)); await rdo.finalizar(tres.id, u(encB));

    await rdo.aprovar(dois.id, {}, u(plan));
    await assert.rejects(
      () => rdo.aprovar(tres.id, {}, u(plan)),
      (e) => e.status === 409 && e.details?.codigo === 'CONFLITO_AVANCO' && e.details.conflitos[0].percentual_anterior === 80
    );
    const pendente = await rdo.obter(tres.id, u(plan));
    assert.equal(pendente.status, 'FINALIZADO', 'a transação desfez tudo');

    const ok = await rdo.aprovar(tres.id, { atividades: [{ id: pendente.atividades[0].id, percentual_validado: 80 }] }, u(plan));
    assert.equal(ok.status, 'APROVADO');
  });

  await t.test('aprovações simultâneas na mesma obra se enfileiram sem corromper', async () => {
    const mk = async (n, enc, pct) => {
      const r = await rdo.criar(corpo({ data: dia(n), atividades: [{ codigo_atividade: '1.2', percentual_declarado: pct }] }), u(enc));
      await comFoto(r); await rdo.finalizar(r.id, u(enc));
      return r.id;
    };
    const a = await mk(17, encA, 30);
    const b = await mk(17, encB, 40);
    const res = await Promise.allSettled([rdo.aprovar(a, {}, u(plan)), rdo.aprovar(b, {}, u(plan))]);
    // A trava por obra enfileira as duas. Se o de 30% entra primeiro, o de 40% também passa; se o de 40%
    // entra primeiro, o de 30% é barrado com conflito. Nos dois casos o vigente final é 40% e nada corrompe.
    const aprovadas = res.filter((x) => x.status === 'fulfilled').length;
    const barradas = res.filter((x) => x.status === 'rejected');
    assert.ok(aprovadas >= 1 && aprovadas + barradas.length === 2);
    barradas.forEach((x) => assert.equal(x.reason.details?.codigo, 'CONFLITO_AVANCO'));
    assert.equal(await prisma.avancoAtividadeAprovado.count({ where: { obra_id: obra.id, codigo_atividade: '1.2' } }), aprovadas);
    const vigente = (await rdo.listarAtividadesDaObra(obra.id, u(plan))).atividades.find((x) => x.codigo_atividade === '1.2');
    assert.equal(vigente.percentual_vigente, 40);
  });

  /* ------------------------------ resumo e fotos ------------------------------ */
  await t.test('resumo da obra: indicadores e RDOs por dia com atividades e fotos', async () => {
    const r = await rdo.resumoDaObra(obra.id, {}, u(plan));
    assert.ok(r.indicadores.rdos >= 5);
    assert.ok(r.indicadores.aprovados >= 5);
    assert.ok(r.indicadores.fotos >= 3);
    assert.ok(r.indicadores.hh > 0);
    assert.ok(r.indicadores.pts_necessarias >= 1);
    const primeiro = r.itens.find((i) => i.id === r1.id);
    assert.equal(primeiro.supervisor.id, sup.id);
    assert.equal(primeiro.atividades[0].fotos.length, 1);
    const soAprovados = await rdo.resumoDaObra(obra.id, { status: 'APROVADO', data_de: dia(10), data_ate: dia(10) }, u(plan));
    assert.deepEqual(soAprovados.itens.map((i) => i.id), [r1.id]);
    await assert.rejects(() => rdo.resumoDaObra(obra.id, {}, u(planFora)), (e) => e.status === 403);
  });

  await t.test('controle de fotos: lista com obra, atividade e filtros', async () => {
    const f = await rdo.listarFotos({ obra_id: obra.id }, u(plan));
    assert.ok(f.total >= 3);
    assert.equal(f.itens[0].obra.id, obra.id);
    assert.ok(f.itens[0].atividade.codigo_atividade);
    const nenhuma = await rdo.listarFotos({ obra_id: obra.id, data_de: '2030-01-01' }, u(plan));
    assert.equal(nenhuma.total, 0);
    const doEnc = await rdo.listarFotos({}, u(encA));
    assert.ok(doEnc.itens.every((i) => i.encarregado.id === encA.id), 'o encarregado só vê as fotos dos seus RDOs');
  });

  await t.test('resumo do avanço da obra compara cronograma e RDO', async () => {
    const r = await rdo.resumoAvancoDaObra(obra.id);
    assert.equal(r.atividades_total, 3);
    assert.ok(r.percentual_com_rdo > r.percentual_cronograma);
  });

  await t.test('reimportação: o mais recente vale entre RDO e cronograma', async () => {
    await criarVersao(1, '2026-12-05T15:00:00Z', { '1.1': 10, '1.3': 100 });
    let l = await rdo.listarAtividadesDaObra(obra.id, u(plan));
    const x = () => l.atividades.find((y) => y.codigo_atividade === '1.1');
    assert.deepEqual([x().percentual_vigente, x().origem_percentual], [80, 'RDO']);
    await criarVersao(2, '2026-12-20T15:00:00Z', { '1.1': 90, '1.3': 100 });
    l = await rdo.listarAtividadesDaObra(obra.id, u(plan));
    assert.deepEqual([x().percentual_vigente, x().origem_percentual], [90, 'CRONOGRAMA']);
    const antigo = await rdo.obter(r1.id, u(plan));
    assert.equal(antigo.atividades[0].codigo_atividade, '1.1');
    assert.equal(antigo.atividades[0].descricao_snapshot, 'Montar tubulação');
  });

  await t.test('PDF do RDO é gerado (PDF válido, com as seções novas)', async () => {
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

  await t.test('cadastros: nome repetido dá erro do banco e desativar não apaga', async () => {
    await assert.rejects(() => cadastros.criar('funcoes', { nome: funcao.nome }, u(admin)), (e) => e.code === 'P2002');
    const off = await cadastros.atualizar('funcoes', funcao.id, { ativo: false }, u(plan));
    assert.equal(off.ativo, false);
    await assert.rejects(() => rdo.criar(corpo({ data: dia(18), atividades: [{ codigo_atividade: '1.2', percentual_declarado: 95 }] }), u(encA)), (e) => /inativo/.test(e.message));
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

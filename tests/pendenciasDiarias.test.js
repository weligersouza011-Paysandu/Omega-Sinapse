'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  montarPendenciasPorPlanejador,
  renderizarEmail,
  enviarPendenciasDiarias,
} = require('../src/services/pendenciasDiariasService');
const { proximaExecucao, iniciar } = require('../src/services/agendadorService');

/** Instante no fuso operacional (-03:00). */
const em = (texto) => new Date(`${texto}-03:00`);
const AGORA = em('2026-11-23T07:30:00');

const ana = { id: 1, nome: 'Ana Souza', email: 'ana@exemplo.com', perfil: 'PLANEJADOR' };
const bruno = { id: 2, nome: 'Bruno Lima', email: 'bruno@exemplo.com', perfil: 'PLANEJADOR' };

let proximoId = 1;
const tarefa = (usuario, vencimento, extra = {}) => ({
  id: proximoId++,
  titulo: `Atividade ${proximoId}`,
  tipo: 'AVULSA',
  dia_recorrencia: null,
  hora_recorrencia: null,
  data_vencimento: em(vencimento),
  status: 'A_FAZER',
  usuario,
  ...extra,
});

/* ----------------------------- Montagem da lista ----------------------------- */

test('separa vencidas e do dia por planejador, ordenadas por vencimento', () => {
  const grupos = montarPendenciasPorPlanejador(
    [
      tarefa(ana, '2026-11-23T17:00:00', { titulo: 'Hoje tarde' }),
      tarefa(ana, '2026-11-20T10:00:00', { titulo: 'Vencida antiga' }),
      tarefa(bruno, '2026-11-23T09:00:00', { titulo: 'Hoje cedo' }),
      tarefa(ana, '2026-11-23T06:00:00', { titulo: 'Venceu hoje cedo' }),
      tarefa(ana, '2026-11-23T10:00:00', { titulo: 'Hoje manhã' }),
    ],
    AGORA
  );

  assert.deepEqual(grupos.map((g) => g.usuario.nome), ['Ana Souza', 'Bruno Lima']);
  const [a, b] = grupos;
  assert.deepEqual(a.vencidas.map((t) => t.titulo), ['Vencida antiga', 'Venceu hoje cedo']);
  assert.deepEqual(a.hoje.map((t) => t.titulo), ['Hoje manhã', 'Hoje tarde']);
  assert.equal(b.vencidas.length, 0);
  assert.deepEqual(b.hoje.map((t) => t.titulo), ['Hoje cedo']);
});

test('ignora concluídas, canceladas e o que vence depois de hoje', () => {
  const grupos = montarPendenciasPorPlanejador(
    [
      tarefa(ana, '2026-11-23T12:00:00', { status: 'CONCLUIDO' }),
      tarefa(ana, '2026-11-23T12:00:00', { status: 'CANCELADO' }),
      tarefa(ana, '2026-11-24T00:00:00'),
      tarefa(ana, '2026-11-23T23:59:00', { titulo: 'Último minuto' }),
    ],
    AGORA
  );
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].hoje.map((t) => t.titulo), ['Último minuto']);
});

test('planejador sem pendências não gera e-mail', () => {
  assert.deepEqual(montarPendenciasPorPlanejador([], AGORA), []);
});

/* ------------------------------ Conteúdo do e-mail ------------------------------ */

test('e-mail traz título, tipo, vencimento com hora e status', () => {
  const [grupo] = montarPendenciasPorPlanejador(
    [
      tarefa(ana, '2026-11-23T18:00:00', {
        titulo: 'Programação semanal',
        tipo: 'FIXA_RECORRENTE',
        dia_recorrencia: 'SEGUNDA',
        hora_recorrencia: '18:00',
        status: 'EM_ANDAMENTO',
      }),
      tarefa(ana, '2026-11-20T09:15:00', { titulo: 'Relatório extra' }),
    ],
    AGORA
  );
  const { assunto, texto, html } = renderizarEmail(grupo, AGORA);

  assert.match(assunto, /23\/11\/2026/);
  assert.match(assunto, /1 vencida\(s\), 1 para hoje/);
  assert.match(texto, /Programação semanal \| Rotina semanal \(segunda às 18:00\) \| 23\/11\/2026,? 18:00 \| Em andamento/);
  assert.match(texto, /Relatório extra \| Avulsa \| 20\/11\/2026,? 09:15 \| A fazer/);
  assert.match(html, /Vencidas \(1\)/);
  assert.match(html, /Para hoje \(1\)/);
});

test('o HTML escapa títulos com marcação', () => {
  const [grupo] = montarPendenciasPorPlanejador(
    [tarefa(ana, '2026-11-23T12:00:00', { titulo: '<script>alert("x")</script> & cia' })],
    AGORA
  );
  const { html } = renderizarEmail(grupo, AGORA);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; cia/);
});

/* ---------------------------------- Envio ---------------------------------- */

function repositorioFalso(tarefas, usuarios = {}) {
  const chamadas = [];
  return {
    chamadas,
    listarPendentesParaEmail: async (filtros) => {
      chamadas.push(filtros);
      return tarefas;
    },
    buscarUsuario: async (id) => usuarios[id] || null,
  };
}

function emailFalso({ configurado = true } = {}) {
  const enviados = [];
  return {
    enviados,
    configurado: () => configurado,
    enviar: async (mensagem) => {
      enviados.push(mensagem);
      return configurado ? { enviado: true } : { enviado: false, motivo: 'SMTP_NAO_CONFIGURADO' };
    },
  };
}

test('envia um e-mail consolidado para cada planejador com pendências', async () => {
  const email = emailFalso();
  const resumo = await enviarPendenciasDiarias({
    agora: AGORA,
    repositorio: repositorioFalso([
      tarefa(ana, '2026-11-23T12:00:00'),
      tarefa(ana, '2026-11-22T12:00:00'),
      tarefa(bruno, '2026-11-23T15:00:00'),
    ]),
    email,
  });

  assert.equal(resumo.planejadores, 2);
  assert.equal(resumo.enviados, 2);
  assert.deepEqual(email.enviados.map((m) => m.para), ['ana@exemplo.com', 'bruno@exemplo.com']);
});

test('consulta apenas perfis de planejamento e vence até o fim do dia local', async () => {
  const repositorio = repositorioFalso([]);
  await enviarPendenciasDiarias({ agora: AGORA, repositorio, email: emailFalso() });
  const [filtros] = repositorio.chamadas;
  assert.deepEqual(filtros.perfis, ['PLANEJADOR', 'SUPERVISOR']);
  assert.deepEqual(filtros.statusAtivos, ['A_FAZER', 'EM_ANDAMENTO']);
  assert.equal(filtros.ate.toISOString(), em('2026-11-23T23:59:59.999').toISOString());
});

test('sem SMTP configurado nada quebra e o motivo é informado', async () => {
  const resumo = await enviarPendenciasDiarias({
    agora: AGORA,
    repositorio: repositorioFalso([tarefa(ana, '2026-11-23T12:00:00')]),
    email: emailFalso({ configurado: false }),
  });
  assert.equal(resumo.enviados, 0);
  assert.equal(resumo.smtp_configurado, false);
  assert.equal(resumo.resultados[0].motivo, 'SMTP_NAO_CONFIGURADO');
});

test('modo simulação monta tudo e não envia', async () => {
  const email = emailFalso();
  const resumo = await enviarPendenciasDiarias({
    agora: AGORA,
    simular: true,
    repositorio: repositorioFalso([tarefa(ana, '2026-11-23T12:00:00')]),
    email,
  });
  assert.equal(email.enviados.length, 0);
  assert.equal(resumo.resultados[0].motivo, 'SIMULADO');
});

test('usuário sem e-mail é ignorado com motivo', async () => {
  const email = emailFalso();
  const resumo = await enviarPendenciasDiarias({
    agora: AGORA,
    repositorio: repositorioFalso([tarefa({ ...ana, email: null }, '2026-11-23T12:00:00')]),
    email,
  });
  assert.equal(email.enviados.length, 0);
  assert.equal(resumo.resultados[0].motivo, 'SEM_EMAIL');
});

test('teste manual para um usuário sem pendências ainda envia o e-mail', async () => {
  const email = emailFalso();
  const resumo = await enviarPendenciasDiarias({
    agora: AGORA,
    apenasUsuarioId: 1,
    enviarVazio: true,
    repositorio: repositorioFalso([], { 1: ana }),
    email,
  });
  assert.equal(resumo.enviados, 1);
  assert.equal(email.enviados[0].para, 'ana@exemplo.com');
});

/* -------------------------------- Agendador -------------------------------- */

test('próxima execução é 07:30 de hoje (Brasília) se ainda não passou', () => {
  const proxima = proximaExecucao(em('2026-11-23T06:00:00'), '07:30');
  assert.equal(proxima.toISOString(), em('2026-11-23T07:30:00').toISOString());
  // 07:30 BRT = 10:30 UTC, independentemente do fuso do servidor.
  assert.equal(proxima.toISOString(), '2026-11-23T10:30:00.000Z');
});

test('depois das 07:30 (ou exatamente às 07:30) agenda para o dia seguinte', () => {
  const esperado = em('2026-11-24T07:30:00').toISOString();
  assert.equal(proximaExecucao(em('2026-11-23T07:30:00'), '07:30').toISOString(), esperado);
  assert.equal(proximaExecucao(em('2026-11-23T20:00:00'), '07:30').toISOString(), esperado);
});

test('trata a virada de dia pelo fuso de Brasília, não pelo UTC', () => {
  // 22:00 BRT de 23/11 já é 01:00 UTC de 24/11: o próximo disparo é 24/11 07:30 BRT.
  const proxima = proximaExecucao(new Date('2026-11-24T01:00:00Z'), '07:30');
  assert.equal(proxima.toISOString(), '2026-11-24T10:30:00.000Z');
});

test('horário inválido é recusado', () => {
  assert.throws(() => proximaExecucao(AGORA, '7:30'), /inválido/);
  assert.throws(() => proximaExecucao(AGORA, '25:00'), /inválido/);
});

test('o agendador respeita EMAIL_DIARIO_ATIVO=false e pode ser parado', () => {
  process.env.EMAIL_DIARIO_ATIVO = 'false';
  const desligado = iniciar();
  assert.equal(desligado.proxima(), null);
  delete process.env.EMAIL_DIARIO_ATIVO;

  const ativo = iniciar({ relogio: () => AGORA, executar: async () => ({}), smtpConfigurado: () => true });
  assert.equal(ativo.proxima().toISOString(), em('2026-11-24T07:30:00').toISOString());
  ativo.parar();
});

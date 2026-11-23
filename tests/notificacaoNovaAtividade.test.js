'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  montarEmailNovaAtividade,
  notificarNovaAtividade,
} = require('../src/services/notificacaoTarefaService');
const tarefaRepository = require('../src/repositories/tarefaRepository');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const emailService = require('../src/services/emailService');
const tarefaService = require('../src/services/tarefaService');

const em = (texto) => new Date(`${texto}-03:00`);

const ana = { id: 10, nome: 'Ana Souza', email: 'ana@exemplo.com', perfil: 'PLANEJADOR' };
const gestora = { id: 1, nome: 'Marta Gestora', perfil: 'SUPERVISOR' };

const tarefa = (extra = {}) => ({
  id: 50,
  titulo: 'Atualizar programação semanal',
  descricao: 'Incluir as paradas de manutenção.',
  tipo: 'AVULSA',
  dia_recorrencia: null,
  hora_recorrencia: null,
  data_vencimento: em('2026-11-26T14:30:00'),
  prioridade: 'ALTA',
  usuario_id: 10,
  ...extra,
});

/* ------------------------------ Conteúdo do e-mail ------------------------------ */

test('o e-mail traz título, tipo, vencimento com hora, prioridade e quem criou', () => {
  const { assunto, texto, html } = montarEmailNovaAtividade({ tarefa: tarefa(), responsavel: ana, criador: gestora });

  assert.equal(assunto, 'Omega Sinapse · Nova atividade: Atualizar programação semanal');
  assert.match(texto, /Olá, Ana!/);
  assert.match(texto, /Tipo: Avulsa/);
  assert.match(texto, /Vencimento: 26\/11\/2026,? 14:30/);
  assert.match(texto, /Prioridade: Alta/);
  assert.match(texto, /Criada por: Marta Gestora/);
  assert.match(texto, /Incluir as paradas de manutenção\./);
  assert.match(html, /Nova atividade para você/);
});

test('rotina semanal mostra dia e horário', () => {
  const { texto } = montarEmailNovaAtividade({
    tarefa: tarefa({ tipo: 'FIXA_RECORRENTE', dia_recorrencia: 'SEXTA', hora_recorrencia: '16:00' }),
    responsavel: ana,
    criador: gestora,
  });
  assert.match(texto, /Tipo: Rotina semanal \(sexta às 16:00\)/);
});

test('quando a pessoa cria para si mesma, não aparece "Criada por"', () => {
  const { texto } = montarEmailNovaAtividade({ tarefa: tarefa(), responsavel: ana, criador: ana });
  assert.ok(!texto.includes('Criada por'));
});

test('o HTML escapa título e descrição', () => {
  const { html } = montarEmailNovaAtividade({
    tarefa: tarefa({ titulo: '<b>x</b>', descricao: '<img src=x onerror=alert(1)>' }),
    responsavel: ana,
    criador: gestora,
  });
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
});

/* ---------------------------------- Envio ---------------------------------- */

const repositorioCom = (usuario) => ({ buscarUsuario: async () => usuario });

test('envia para o e-mail cadastrado do responsável', async () => {
  const enviados = [];
  const resultado = await notificarNovaAtividade({
    tarefa: tarefa(),
    criador: gestora,
    repositorio: repositorioCom(ana),
    email: { enviar: async (msg) => (enviados.push(msg), { enviado: true }) },
  });
  assert.equal(resultado.enviado, true);
  assert.equal(enviados[0].para, 'ana@exemplo.com');
  assert.match(enviados[0].assunto, /Nova atividade/);
});

test('sem e-mail cadastrado não envia e informa o motivo', async () => {
  const resultado = await notificarNovaAtividade({
    tarefa: tarefa(),
    criador: gestora,
    repositorio: repositorioCom({ ...ana, email: null }),
    email: { enviar: async () => assert.fail('não deveria enviar') },
  });
  assert.deepEqual(resultado, { enviado: false, motivo: 'SEM_EMAIL' });
});

test('falha no envio nunca lança', async () => {
  const resultado = await notificarNovaAtividade({
    tarefa: tarefa(),
    criador: gestora,
    repositorio: repositorioCom(ana),
    email: {
      enviar: async () => {
        throw new Error('SMTP caiu');
      },
    },
  });
  assert.equal(resultado.enviado, false);
  assert.equal(resultado.motivo, 'FALHA_NOTIFICACAO');
});

/* ---------------- Integração: criar a atividade dispara o aviso ---------------- */

/** Troca métodos de um módulo durante o teste. */
function trocar(modulo, metodos) {
  const originais = {};
  for (const [nome, impl] of Object.entries(metodos)) {
    originais[nome] = modulo[nome];
    modulo[nome] = impl;
  }
  return () => Object.assign(modulo, originais);
}

test('criar a atividade avisa o responsável e não depende do envio', async () => {
  const enviados = [];
  const restaurar = [
    trocar(usuarioRepository, { findById: async () => ({ ...ana, ativo: true }) }),
    trocar(tarefaRepository, {
      create: async (dados) => ({ id: 77, ...dados }),
      buscarUsuario: async () => ana,
    }),
    trocar(emailService, {
      enviar: async (msg) => {
        enviados.push(msg);
        return { enviado: true };
      },
    }),
  ];
  try {
    const resposta = await tarefaService.criarTarefa(
      { titulo: 'Nova atividade X', data_vencimento: '2026-12-01T10:00:00-03:00', usuario_id: 10 },
      gestora
    );
    assert.equal(resposta.id, 77);

    await new Promise((resolver) => setTimeout(resolver, 25)); // envio em segundo plano
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].para, 'ana@exemplo.com');
    assert.match(enviados[0].assunto, /Nova atividade X/);
  } finally {
    restaurar.forEach((fn) => fn());
  }
});

test('se o e-mail falhar, a atividade é criada do mesmo jeito', async () => {
  const restaurar = [
    trocar(usuarioRepository, { findById: async () => ({ ...ana, ativo: true }) }),
    trocar(tarefaRepository, {
      create: async (dados) => ({ id: 78, ...dados }),
      buscarUsuario: async () => ana,
    }),
    trocar(emailService, {
      enviar: async () => {
        throw new Error('SMTP caiu');
      },
    }),
  ];
  try {
    const resposta = await tarefaService.criarTarefa(
      { titulo: 'Outra atividade', data_vencimento: '2026-12-01T10:00:00-03:00', usuario_id: 10 },
      gestora
    );
    assert.equal(resposta.id, 78);
    await new Promise((resolver) => setTimeout(resolver, 25));
  } finally {
    restaurar.forEach((fn) => fn());
  }
});

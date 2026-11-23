'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const emailService = require('../src/services/emailService');

const VARIAVEIS = ['BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];

/** Isola variáveis de ambiente e o fetch global durante um teste. */
async function isolado(ambiente, corpo) {
  const salvas = Object.fromEntries(VARIAVEIS.map((nome) => [nome, process.env[nome]]));
  const fetchOriginal = globalThis.fetch;
  const log = console.log;
  const erro = console.error;
  const aviso = console.warn;
  for (const nome of VARIAVEIS) delete process.env[nome];
  Object.assign(process.env, ambiente);
  console.log = console.error = console.warn = () => {};
  try {
    return await corpo();
  } finally {
    for (const nome of VARIAVEIS) {
      if (salvas[nome] === undefined) delete process.env[nome];
      else process.env[nome] = salvas[nome];
    }
    globalThis.fetch = fetchOriginal;
    console.log = log;
    console.error = erro;
    console.warn = aviso;
  }
}

const mensagem = { para: 'ana@exemplo.com', assunto: 'Assunto', texto: 'Texto', html: '<p>Oi</p>' };

test('sem nenhum provedor, não envia nem lança', () =>
  isolado({}, async () => {
    assert.equal(emailService.provedor(), null);
    assert.equal(emailService.configurado(), false);
    assert.deepEqual(await emailService.enviar(mensagem), { enviado: false, motivo: 'SMTP_NAO_CONFIGURADO' });
  }));

test('a chave do Brevo tem prioridade sobre o SMTP', () =>
  isolado({ BREVO_API_KEY: 'chave', SMTP_HOST: 'smtp.exemplo.com' }, async () => {
    assert.equal(emailService.provedor(), 'brevo');
  }));

test('só SMTP_HOST seleciona o SMTP', () =>
  isolado({ SMTP_HOST: 'smtp.exemplo.com' }, async () => {
    assert.equal(emailService.provedor(), 'smtp');
  }));

test('Brevo: chama a API HTTPS com chave, remetente, destinatário e conteúdo', () =>
  isolado({ BREVO_API_KEY: 'chave-secreta', EMAIL_FROM: 'Omega Sinapse <remetente@exemplo.com>' }, async () => {
    let chamada;
    globalThis.fetch = async (url, opcoes) => {
      chamada = { url, opcoes, corpo: JSON.parse(opcoes.body) };
      return { ok: true, status: 201 };
    };

    const resultado = await emailService.enviar(mensagem);

    assert.equal(resultado.enviado, true);
    assert.equal(chamada.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(chamada.opcoes.method, 'POST');
    assert.equal(chamada.opcoes.headers['api-key'], 'chave-secreta');
    assert.deepEqual(chamada.corpo.sender, { name: 'Omega Sinapse', email: 'remetente@exemplo.com' });
    assert.deepEqual(chamada.corpo.to, [{ email: 'ana@exemplo.com' }]);
    assert.equal(chamada.corpo.subject, 'Assunto');
    assert.equal(chamada.corpo.textContent, 'Texto');
    assert.equal(chamada.corpo.htmlContent, '<p>Oi</p>');
  }));

test('Brevo: erro da API vira falha com o motivo, sem lançar', () =>
  isolado({ BREVO_API_KEY: 'errada', EMAIL_FROM: 'a@exemplo.com' }, async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Key not found' }),
    });
    const resultado = await emailService.enviar(mensagem);
    assert.equal(resultado.enviado, false);
    assert.equal(resultado.motivo, 'FALHA_ENVIO');
    assert.match(resultado.erro, /HTTP 401/);
    assert.match(resultado.erro, /chave de API inválida/);
    assert.match(resultado.erro, /Key not found/);
    assert.ok(!resultado.erro.includes('errada'), 'a chave nunca aparece na mensagem');
  }));

test('Brevo: falha de rede não lança', () =>
  isolado({ BREVO_API_KEY: 'chave', EMAIL_FROM: 'a@exemplo.com' }, async () => {
    globalThis.fetch = async () => {
      throw new Error('fetch failed');
    };
    const resultado = await emailService.enviar(mensagem);
    assert.deepEqual(resultado, { enviado: false, motivo: 'FALHA_ENVIO', erro: 'fetch failed' });
  }));

test('Brevo: sem remetente válido avisa em vez de enviar', () =>
  isolado({ BREVO_API_KEY: 'chave' }, async () => {
    globalThis.fetch = async () => assert.fail('não deveria chamar a API');
    const resultado = await emailService.enviar(mensagem);
    assert.equal(resultado.enviado, false);
    assert.equal(resultado.motivo, 'REMETENTE_INVALIDO');
  }));

test('lerRemetente aceita "Nome <email>" e só o endereço', () => {
  assert.deepEqual(emailService.lerRemetente('Omega Sinapse <a@b.com>'), { name: 'Omega Sinapse', email: 'a@b.com' });
  assert.deepEqual(emailService.lerRemetente('"Omega, Sinapse" <a@b.com>'), { name: 'Omega, Sinapse', email: 'a@b.com' });
  assert.deepEqual(emailService.lerRemetente('a@b.com'), { email: 'a@b.com' });
});

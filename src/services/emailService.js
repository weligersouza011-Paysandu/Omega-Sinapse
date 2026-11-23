'use strict';

/**
 * Envio de e-mail. Nunca lança: sem provedor configurado ou com falha de
 * envio, registra no log e devolve o motivo, para que um e-mail não derrube o
 * servidor nem o agendador.
 *
 * Provedores (escolhidos pelo ambiente, nesta ordem):
 *  1. Brevo por API HTTPS (porta 443) — BREVO_API_KEY + EMAIL_FROM (remetente
 *     verificado no Brevo). Funciona em hospedagens que bloqueiam SMTP, como o
 *     plano gratuito do Render.
 *  2. SMTP (nodemailer) — SMTP_HOST, SMTP_PORT (587), SMTP_SECURE, SMTP_USER,
 *     SMTP_PASS, EMAIL_FROM (padrão: SMTP_USER). Bom para uso local.
 */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TEMPO_LIMITE_MS = 15000;

let transporte = null;

function temTexto(valor) {
  return Boolean(valor && String(valor).trim());
}

/** Provedor ativo: "brevo", "smtp" ou null (não configurado). */
function provedor() {
  if (temTexto(process.env.BREVO_API_KEY)) return 'brevo';
  if (temTexto(process.env.SMTP_HOST)) return 'smtp';
  return null;
}

function configurado() {
  return provedor() !== null;
}

function remetente() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || 'Omega Sinapse <nao-responder@localhost>';
}

/** "Nome <email@x.com>" → { name, email }; aceita também só o endereço. */
function lerRemetente(texto) {
  const valor = String(texto || '').trim();
  const casado = /^(.*?)\s*<([^>]+)>$/.exec(valor);
  if (casado) {
    const nome = casado[1].replace(/^"|"$/g, '').trim();
    return { ...(nome ? { name: nome } : {}), email: casado[2].trim() };
  }
  return { email: valor };
}

/* --------------------------------- Brevo --------------------------------- */

async function enviarPorBrevo({ para, assunto, texto, html }) {
  // Sem o remetente padrão de desenvolvimento: o Brevo só aceita remetente verificado.
  const de = lerRemetente(process.env.EMAIL_FROM || process.env.SMTP_USER || '');
  if (!de.email || !de.email.includes('@')) {
    return { enviado: false, motivo: 'REMETENTE_INVALIDO', erro: 'Defina EMAIL_FROM com um remetente verificado no Brevo.' };
  }

  const resposta = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: de,
      to: [{ email: para }],
      subject: assunto,
      textContent: texto,
      ...(html ? { htmlContent: html } : {}),
    }),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });

  if (resposta.ok) return { enviado: true };

  let detalhe = '';
  try {
    const corpo = await resposta.json();
    detalhe = corpo.message || corpo.code || '';
  } catch {
    // Corpo sem JSON: usa só o status.
  }
  const dica = resposta.status === 401 ? ' (chave de API inválida ou desativada)' : '';
  return { enviado: false, motivo: 'FALHA_ENVIO', erro: `Brevo HTTP ${resposta.status}${dica}${detalhe ? `: ${detalhe}` : ''}` };
}

/* ---------------------------------- SMTP ---------------------------------- */

function obterTransporte() {
  if (transporte) return transporte;
  // Carregado sob demanda: ambientes sem SMTP nem tocam na biblioteca.
  const nodemailer = require('nodemailer');
  const porta = Number(process.env.SMTP_PORT || 587);
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : porta === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: TEMPO_LIMITE_MS,
    greetingTimeout: TEMPO_LIMITE_MS,
    socketTimeout: TEMPO_LIMITE_MS,
  });
  return transporte;
}

async function enviarPorSmtp({ para, assunto, texto, html }) {
  await obterTransporte().sendMail({ from: remetente(), to: para, subject: assunto, text: texto, html });
  return { enviado: true };
}

/* --------------------------------- Público --------------------------------- */

/**
 * @param {{para:string, assunto:string, texto:string, html?:string}} mensagem
 * @returns {Promise<{enviado:boolean, motivo?:string, erro?:string}>}
 */
async function enviar(mensagem) {
  const via = provedor();
  if (!via) {
    console.warn(
      `[email] Nenhum provedor configurado (BREVO_API_KEY ou SMTP_HOST): e-mail "${mensagem.assunto}" para ${mensagem.para} não enviado.`
    );
    return { enviado: false, motivo: 'SMTP_NAO_CONFIGURADO' };
  }

  try {
    const resultado = via === 'brevo' ? await enviarPorBrevo(mensagem) : await enviarPorSmtp(mensagem);
    if (resultado.enviado) {
      console.log(`[email] Enviado via ${via} para ${mensagem.para}: "${mensagem.assunto}".`);
    } else {
      console.error(`[email] Não enviado via ${via} para ${mensagem.para}: ${resultado.motivo} ${resultado.erro || ''}`.trim());
    }
    return resultado;
  } catch (erro) {
    console.error(`[email] Falha ao enviar via ${via} para ${mensagem.para}:`, erro.message);
    return { enviado: false, motivo: 'FALHA_ENVIO', erro: erro.message };
  }
}

module.exports = { enviar, configurado, provedor, lerRemetente };

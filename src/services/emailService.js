'use strict';

/**
 * Envio de e-mail por SMTP (nodemailer). Nunca lança: sem SMTP configurado
 * (ambiente local) ou com falha de envio, registra no log e devolve o motivo,
 * para que um e-mail não derrube o servidor nem o agendador.
 *
 * Variáveis: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ("true" para 465),
 * SMTP_USER, SMTP_PASS, EMAIL_FROM (padrão: SMTP_USER).
 */

let transporte = null;

function configurado() {
  return Boolean(process.env.SMTP_HOST && String(process.env.SMTP_HOST).trim());
}

function remetente() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || 'Omega Sinapse <nao-responder@localhost>';
}

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
  });
  return transporte;
}

/**
 * @param {{para:string, assunto:string, texto:string, html?:string}} mensagem
 * @returns {Promise<{enviado:boolean, motivo?:string, erro?:string}>}
 */
async function enviar({ para, assunto, texto, html }) {
  if (!configurado()) {
    console.warn(`[email] SMTP não configurado (SMTP_HOST): e-mail "${assunto}" para ${para} não enviado.`);
    return { enviado: false, motivo: 'SMTP_NAO_CONFIGURADO' };
  }
  try {
    await obterTransporte().sendMail({ from: remetente(), to: para, subject: assunto, text: texto, html });
    return { enviado: true };
  } catch (erro) {
    console.error(`[email] Falha ao enviar para ${para}:`, erro.message);
    return { enviado: false, motivo: 'FALHA_ENVIO', erro: erro.message };
  }
}

module.exports = { enviar, configurado };

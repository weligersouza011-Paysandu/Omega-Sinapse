'use strict';

/**
 * Teste simples do envio de e-mail: manda uma mensagem de teste usando o SMTP
 * do .env. Não usa banco de dados.
 *
 *   npm run email:teste                 envia para o próprio SMTP_USER
 *   npm run email:teste -- fulano@x.com envia para outro endereço
 */

require('dotenv').config();

const { enviar, configurado } = require('../src/services/emailService');

async function main() {
  if (!configurado()) {
    console.error('SMTP não configurado: preencha SMTP_HOST, SMTP_USER e SMTP_PASS no arquivo .env.');
    process.exitCode = 1;
    return;
  }
  if (!process.env.SMTP_PASS) {
    console.error('Falta a senha: preencha SMTP_PASS no arquivo .env (senha de app do Gmail).');
    process.exitCode = 1;
    return;
  }

  const para = process.argv[2] || process.env.SMTP_USER;
  console.log(`Enviando e-mail de teste para ${para}...`);

  const resultado = await enviar({
    para,
    assunto: 'Omega Sinapse · e-mail de teste',
    texto: 'Se você recebeu esta mensagem, o envio de e-mails do Omega Sinapse está funcionando.',
    html: '<p>Se você recebeu esta mensagem, o envio de e-mails do <strong>Omega Sinapse</strong> está funcionando.</p>',
  });

  if (resultado.enviado) {
    console.log('Enviado! Confira a caixa de entrada (e o spam).');
  } else {
    console.error(`Não foi enviado: ${resultado.motivo}${resultado.erro ? ` — ${resultado.erro}` : ''}`);
    process.exitCode = 1;
  }
}

main();

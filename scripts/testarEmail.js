'use strict';

/**
 * Teste simples do envio de e-mail: manda uma mensagem de teste usando o SMTP
 * do .env. Não usa banco de dados.
 *
 *   npm run email:teste                 envia para o próprio SMTP_USER
 *   npm run email:teste -- fulano@x.com envia para outro endereço
 */

require('dotenv').config();

const { enviar, configurado, provedor, lerRemetente } = require('../src/services/emailService');

async function main() {
  if (!configurado()) {
    console.error('Nenhum provedor de e-mail configurado: defina BREVO_API_KEY (Brevo) ou SMTP_HOST/SMTP_USER/SMTP_PASS no .env.');
    process.exitCode = 1;
    return;
  }
  if (provedor() === 'smtp' && !process.env.SMTP_PASS) {
    console.error('Falta a senha: preencha SMTP_PASS no arquivo .env (senha de app do Gmail).');
    process.exitCode = 1;
    return;
  }

  const padrao = lerRemetente(process.env.EMAIL_FROM || process.env.SMTP_USER).email;
  const para = process.argv[2] || padrao;
  console.log(`Enviando e-mail de teste via ${provedor()} para ${para}...`);

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

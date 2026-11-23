'use strict';

/**
 * Dispara manualmente o e-mail diário de pendências (fora do agendador das 07:30).
 *
 *   npm run email:diario -- --simular    só monta e lista, sem enviar
 *   npm run email:diario                 envia para todos os planejadores com pendências
 *
 * Exige DATABASE_URL e, para enviar de verdade, SMTP_HOST/SMTP_USER/SMTP_PASS.
 */

require('dotenv').config();

const prisma = require('../src/config/prisma');
const { enviarPendenciasDiarias } = require('../src/services/pendenciasDiariasService');

const simular = process.argv.includes('--simular');

enviarPendenciasDiarias({ simular })
  .then((resumo) => {
    console.log(JSON.stringify(resumo, null, 2));
  })
  .catch((erro) => {
    console.error('[email-diario] Falha:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

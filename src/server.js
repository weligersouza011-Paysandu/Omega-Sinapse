'use strict';

require('dotenv').config();

const app = require('./app');
const prisma = require('./config/prisma');

const PORT = Number(process.env.PORT || 3000);

if (!process.env.JWT_SECRET) {
  console.warn(
    '[synapse] AVISO: JWT_SECRET não configurado. O login retornará erro até que essa variável seja definida no ambiente.'
  );
}

const server = app.listen(PORT, () => {
  console.log(`[synapse] API de Orçamentos ouvindo em http://localhost:${PORT}`);
});

// Encerramento gracioso: desconecta o Prisma antes de sair.
async function encerrar(sinal) {
  console.log(`[synapse] Recebido ${sinal}, encerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));

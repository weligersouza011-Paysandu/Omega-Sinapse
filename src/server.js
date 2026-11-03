'use strict';

require('dotenv').config();

const app = require('./app');
const prisma = require('./config/prisma');

const PORT = Number(process.env.PORT || 3000);

if (!process.env.JWT_SECRET) {
  console.warn(
    '[synapse] JWT_SECRET não configurado no ambiente. Um segredo será gerado e persistido na tabela "configuracoes_sistema" no primeiro login.'
  );
}

const server = app.listen(PORT, () => {
  console.log(`[synapse] API de Orçamentos ouvindo em http://localhost:${PORT}`);
});

// Prazo máximo para concluir as requisições em andamento antes de forçar a saída.
const PRAZO_ENCERRAMENTO_MS = 10000;
let encerrando = false;

// Encerramento gracioso: desconecta o Prisma antes de sair.
function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`[synapse] Recebido ${sinal}, encerrando...`);

  setTimeout(() => {
    console.error('[synapse] Encerramento excedeu o prazo; forçando saída.');
    process.exit(1);
  }, PRAZO_ENCERRAMENTO_MS).unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('[synapse] Falha ao desconectar o Prisma:', err.message);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));

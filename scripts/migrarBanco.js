'use strict';

/**
 * Aplica as migrações na inicialização do deploy (`prisma migrate deploy`).
 *
 * A trava consultiva do Prisma não funciona de forma confiável pelo pooler do
 * Neon e já derrubou deploy com P1002 ("Timed out trying to acquire a postgres
 * advisory lock"). Ela é desligada porque só a instância que está subindo migra.
 * As novas tentativas cobrem o banco ainda acordando (Neon suspenso).
 */

const { spawnSync } = require('child_process');

const TENTATIVAS = 3;
const ESPERA_MS = 10000;

function aguardar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
  const { status } = spawnSync('npx prisma migrate deploy', {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' },
  });

  if (status === 0) process.exit(0);

  console.error(`[migracao] Falha na tentativa ${tentativa} de ${TENTATIVAS}.`);
  if (tentativa < TENTATIVAS) aguardar(ESPERA_MS);
}

process.exit(1);

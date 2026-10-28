'use strict';

/**
 * CLI para criar usuários.
 * Uso:
 *   npm run criar-usuario -- --nome="Ana Souza" --matricula=23574 --email=ana@omega.com --senha=1234 --perfil=ADMIN
 */

require('dotenv').config();

const authService = require('../services/authService');
const prisma = require('../config/prisma');

function lerArgumentos(argv) {
  const args = {};
  for (const bruto of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(bruto);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

async function main() {
  const args = lerArgumentos(process.argv.slice(2));

  try {
    const usuario = await authService.criarUsuario({
      nome: args.nome,
      matricula: args.matricula,
      email: args.email,
      senha: args.senha,
      perfil: (args.perfil || 'ORCAMENTISTA').toUpperCase(),
    });
    console.log('Usuário criado com sucesso:');
    console.log(JSON.stringify(usuario, null, 2));
  } catch (err) {
    console.error(`Erro ao criar usuário: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

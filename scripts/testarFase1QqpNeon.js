'use strict';

// =============================================================================
// Synapse — Teste da migração da Fase 1 do QQP (20261122120000_qqp_hierarquia_tac)
// em uma BRANCH do Neon, nunca no banco principal.
//
// Uso:
//   1. No Neon, crie uma branch a partir do banco principal e copie a connection string.
//   2. Crie o arquivo `.env.neon-teste` na raiz do projeto com:
//        DATABASE_URL="postgresql://...branch...?sslmode=require"
//   3. node scripts/testarFase1QqpNeon.js
//
// O script:
//   - recusa rodar se o host da branch for o mesmo do `.env` principal;
//   - conta os itens do QQP antes, aplica as migrações pendentes (`prisma migrate deploy`)
//     e confere colunas, índices, CHECK e a contagem depois;
//   - testa as regras novas dentro de uma transação desfeita no final (nada é gravado).
// =============================================================================

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const RAIZ = path.resolve(__dirname, '..');
const ARQUIVO_TESTE = path.join(RAIZ, '.env.neon-teste');
const ARQUIVO_PRINCIPAL = path.join(RAIZ, '.env');

function hostDe(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Host sem o sufixo "-pooler" (o Neon expõe o mesmo endpoint com e sem pooler). */
function endpointDe(url) {
  const host = hostDe(url);
  return host ? host.replace('-pooler.', '.') : null;
}

function carregarUrls() {
  if (!fs.existsSync(ARQUIVO_TESTE)) {
    throw new Error('Crie o arquivo .env.neon-teste com DATABASE_URL da branch do Neon.');
  }
  const teste = dotenv.parse(fs.readFileSync(ARQUIVO_TESTE)).DATABASE_URL;
  if (!teste || !hostDe(teste)) throw new Error('DATABASE_URL ausente ou inválida em .env.neon-teste.');
  const principal = fs.existsSync(ARQUIVO_PRINCIPAL)
    ? dotenv.parse(fs.readFileSync(ARQUIVO_PRINCIPAL)).DATABASE_URL
    : null;
  if (principal && endpointDe(principal) === endpointDe(teste)) {
    throw new Error('A URL de .env.neon-teste aponta para o mesmo banco do .env principal. Use a URL da branch.');
  }
  return teste;
}

const resultados = [];
function conferir(descricao, ok, detalhe = '') {
  resultados.push({ descricao, ok });
  console.log(`${ok ? '  OK ' : '  FALHOU'}  ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
}

async function contarItens(prisma) {
  const [linha] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS total FROM "itens_qqp"');
  return linha.total;
}

/** Executa `sql` e devolve o código de erro do PostgreSQL (ou null se passou), sem abortar a transação. */
async function erroDe(tx, sql, parametros = []) {
  await tx.$executeRawUnsafe('SAVEPOINT teste');
  try {
    await tx.$executeRawUnsafe(sql, ...parametros);
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT teste');
    return null;
  } catch (err) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT teste');
    const mensagem = String(err?.meta?.message || err?.message || '');
    const codigo = mensagem.match(/\b(23505|23514|23503)\b/)?.[1];
    if (codigo) return codigo;
    if (/unique|duplicate/i.test(mensagem)) return '23505';
    if (/check constraint/i.test(mensagem)) return '23514';
    if (/foreign key/i.test(mensagem)) return '23503';
    return mensagem.slice(0, 200) || 'erro';
  }
}

async function main() {
  const url = carregarUrls();
  process.env.DATABASE_URL = url;
  console.log(`Branch de teste: ${hostDe(url)}`);

  // Carregado só depois de definir DATABASE_URL (dotenv não sobrescreve variáveis já definidas).
  const prisma = require('../src/config/prisma');

  const [{ existe }] = await prisma.$queryRawUnsafe(
    "SELECT to_regclass('public.itens_qqp') IS NOT NULL AS existe"
  );
  const antes = existe ? await contarItens(prisma) : 0;
  console.log(`Itens do QQP antes: ${antes}`);
  await prisma.$disconnect();

  console.log('\nAplicando migrações pendentes na branch...');
  const deploy = spawnSync('npx prisma migrate deploy', {
    cwd: RAIZ,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' },
  });
  if (deploy.status !== 0) throw new Error('prisma migrate deploy falhou na branch.');

  console.log('\nConferindo a estrutura:');
  const colunas = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('contratos', 'termos_aditivos', 'itens_qqp')
  `);
  const tem = (tabela, coluna) => colunas.some((c) => c.table_name === tabela && c.column_name === coluna);
  const esperadas = {
    contratos: ['numero_sap', 'numero_omega', 'descricao_omega', 'numero_cliente', 'qqp_revisao'],
    termos_aditivos: ['numero_sap', 'data_inicio', 'data_fim'],
    itens_qqp: ['termo_aditivo_id', 'escopo_tac', 'categoria_planilha', 'grupo', 'subgrupo', 'unidade_planilha', 'quantidade', 'posicao'],
  };
  Object.entries(esperadas).forEach(([tabela, lista]) => {
    const faltando = lista.filter((coluna) => !tem(tabela, coluna));
    conferir(`Colunas novas em ${tabela}`, faltando.length === 0, faltando.length ? `faltando: ${faltando.join(', ')}` : '');
  });

  const tabelas = await prisma.$queryRawUnsafe(`
    SELECT to_regclass('public.qqp_ordem_visualizacao') IS NOT NULL AS ordem,
           to_regclass('public.feriados_personalizados') IS NOT NULL AS feriados
  `);
  conferir('Tabela qqp_ordem_visualizacao criada', tabelas[0].ordem);
  conferir('Tabela feriados_personalizados criada', tabelas[0].feriados);

  const indices = await prisma.$queryRawUnsafe(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'itens_qqp'"
  );
  const nomes = indices.map((i) => i.indexname);
  conferir('Nova unicidade (contrato, escopo_tac, codigo)', nomes.includes('itens_qqp_contrato_id_escopo_tac_codigo_key'));
  conferir('Unicidade antiga (contrato, codigo) removida', !nomes.includes('itens_qqp_contrato_id_codigo_key'));

  const checks = await prisma.$queryRawUnsafe(
    "SELECT 1 FROM pg_constraint WHERE conname = 'itens_qqp_escopo_tac_check'"
  );
  conferir('CHECK escopo_tac = COALESCE(termo_aditivo_id, 0)', checks.length === 1);

  const tipos = await prisma.$queryRawUnsafe(`
    SELECT column_name, character_maximum_length AS tamanho, numeric_precision AS precisao, numeric_scale AS escala
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itens_qqp' AND column_name IN ('codigo', 'preco_unitario')
  `);
  const codigo = tipos.find((t) => t.column_name === 'codigo');
  const preco = tipos.find((t) => t.column_name === 'preco_unitario');
  conferir('codigo VARCHAR(120)', Number(codigo?.tamanho) === 120);
  conferir('preco_unitario DECIMAL(18,8)', Number(preco?.precisao) === 18 && Number(preco?.escala) === 8);

  console.log('\nConferindo os dados existentes:');
  const depois = await contarItens(prisma);
  conferir('Mesma quantidade de itens do QQP', depois === antes, `antes ${antes}, depois ${depois}`);
  const [fora] = await prisma.$queryRawUnsafe(
    'SELECT count(*)::int AS total FROM "itens_qqp" WHERE "escopo_tac" <> 0 OR "termo_aditivo_id" IS NOT NULL'
  );
  conferir('Itens existentes ficaram no TAC0', fora.total === 0, `${fora.total} fora do TAC0`);
  const lidos = await prisma.itemQqp.findMany({ take: 3, select: { id: true, codigo: true, escopo_tac: true, posicao: true } });
  conferir('Prisma Client lê os campos novos', Array.isArray(lidos));

  console.log('\nTestando as regras novas (transação desfeita no final):');
  const contrato = await prisma.contrato.findFirst({ select: { id: true } });
  if (!contrato) {
    console.log('  (sem contratos na branch — testes de regra ignorados)');
  } else {
    const DESFAZER = new Error('desfazer');
    try {
      await prisma.$transaction(async (tx) => {
        const inserir = `
          INSERT INTO "itens_qqp" ("contrato_id", "termo_aditivo_id", "escopo_tac", "codigo", "descricao",
                                   "categoria", "unidade", "preco_unitario", "updated_at")
          VALUES ($1, $2, $3, '__TESTE_FASE1__', 'teste', 'OUTROS'::"CategoriaQqp", 'UNIDADE'::"UnidadeQqp", 1, now())`;

        conferir('Inserir item no TAC0', (await erroDe(tx, inserir, [contrato.id, null, 0])) === null);
        conferir('Código repetido no mesmo escopo é recusado', (await erroDe(tx, inserir, [contrato.id, null, 0])) === '23505');
        conferir('escopo_tac sem TAC correspondente é recusado (CHECK)', (await erroDe(tx, inserir, [contrato.id, null, 7])) === '23514');

        const tac = await tx.termoAditivo.create({
          data: {
            contrato_id: contrato.id,
            numero_tac: '__TESTE_FASE1__',
            valor_aditivo: 0,
            novo_valor_total: 0,
            data_assinatura: new Date(),
            motivo: 'teste da migração',
          },
          select: { id: true },
        });
        conferir('Mesmo código em outro TAC é aceito', (await erroDe(tx, inserir, [contrato.id, tac.id, tac.id])) === null);
        conferir(
          'TAC com itens não pode ser excluído',
          (await erroDe(tx, 'DELETE FROM "termos_aditivos" WHERE "id" = $1', [tac.id])) === '23503'
        );
        throw DESFAZER;
      });
    } catch (err) {
      if (err !== DESFAZER) throw err;
    }
    const [resto] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS total FROM "itens_qqp" WHERE "codigo" = '__TESTE_FASE1__'`
    );
    conferir('Nada dos testes ficou gravado', resto.total === 0);
  }

  await prisma.$disconnect();
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nERRO: ${err.message}`);
  process.exit(1);
});

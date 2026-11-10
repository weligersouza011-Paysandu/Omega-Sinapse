'use strict';

/**
 * Importa o histórico de medição da pasta 13 (CT-251) para o banco.
 *
 *   node scripts/importarMedicaoPasta13.js              # simulação: valida e mostra o que seria gravado
 *   node scripts/importarMedicaoPasta13.js --aplicar    # grava no banco
 *
 * Opções:
 *   --pasta=13                       pasta com "medição bmm.csv" e "Curva tendencia.csv"
 *   --contrato=CT-251                identificador do contrato na Vale
 *   --descricao="Eletromecânica"     descrição (só ao criar o contrato)
 *   --valor-inicial=157087293.70     valor vigente do contrato (padrão: R$ 157.087.293,70, do dashboard de acompanhamento)
 *   --inicio=2024-09-16 --fim=2026-09-15   vigência (padrão: primeiro e último ciclo da curva)
 *   --substituir                     recria os boletins que já existem no contrato
 *
 * É seguro rodar de novo: contrato e boletins já existentes são mantidos (sem
 * --substituir), a curva é regravada e os vínculos de obra são reaplicados.
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../src/config/prisma');
const { simularImportacao, executarImportacao } = require('../src/services/importacaoMedicaoDb');

const NOME_MEDICAO = 'medição bmm.csv';
const NOME_CURVA = 'Curva tendencia.csv';

function opcoes(argv) {
  const resultado = { aplicar: false, substituir: false, pasta: '13' };
  argv.forEach((arg) => {
    if (arg === '--aplicar') resultado.aplicar = true;
    else if (arg === '--substituir') resultado.substituir = true;
    else if (arg.startsWith('--')) {
      const [chave, ...resto] = arg.slice(2).split('=');
      resultado[chave] = resto.join('=');
    }
  });
  return resultado;
}

const moeda = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function lerArquivo(pasta, nome) {
  const caminho = path.join(pasta, nome);
  if (!fs.existsSync(caminho)) {
    throw new Error(`Arquivo não encontrado: ${caminho}`);
  }
  return fs.readFileSync(caminho, 'utf8');
}

function imprimirRelatorio(plano) {
  const { contrato, totais, codigos } = plano;
  console.log('\n=== Contrato ===');
  console.log(`  ${contrato.id_vale} — ${contrato.descricao}`);
  console.log(`  valor inicial: ${moeda(contrato.valor_inicial)}${contrato.derivado.valor_inicial ? '  (valor vigente do CT-251 informado no dashboard de acompanhamento)' : ''}`);
  console.log(`  vigência: ${contrato.data_inicio} a ${contrato.data_fim}${contrato.derivado.vigencia ? '  (derivada dos ciclos da curva)' : ''}`);

  console.log('\n=== Boletins ===');
  console.log('  BMM     ciclo                     total (R$)    SS  realizado curva   diferença');
  plano.boletins.forEach((b) => {
    console.log(
      `  ${b.numero_bmm.padEnd(6)}  ${b.ciclo_inicio} a ${b.ciclo_fim}  ${b.valor_medido.toFixed(2).padStart(14)}  ${String(b.itens.length).padStart(3)}  ${(b.real_curva ?? 0).toFixed(2).padStart(14)}  ${b.diferenca_curva.toFixed(2).padStart(10)}`
    );
  });
  console.log(`\n  ${totais.boletins} boletins, ${totais.itens} itens, total medido ${moeda(totais.total_medido)}`);
  console.log(`  itens com obra do Synapse: ${moeda(totais.valor_itens_com_obra)} | só com código da SS: ${moeda(totais.valor_itens_sem_obra)}`);

  console.log('\n=== Curva financeira ===');
  console.log(`  ${plano.curva.length} ciclos (${plano.curva[0]?.numero_bmm} a ${plano.curva[plano.curva.length - 1]?.numero_bmm}); previsto final ${moeda(plano.curva[plano.curva.length - 1]?.previsto_acumulado)}`);

  console.log('\n=== Obras ===');
  console.log(`  ${codigos.com_obra} de ${codigos.total} códigos casam com obras do Synapse (serão vinculadas ao contrato: ids ${plano.vinculos.join(', ')})`);
  console.log(`  ${codigos.sem_obra.length} ficam só como código de SS no histórico`);

  if (plano.obras_acima_do_orcamento.length) {
    console.log('\n=== Obras com medido acima do valor do orçamento (confira os aditivos/revisões do orçamento) ===');
    plano.obras_acima_do_orcamento.forEach((obra) =>
      console.log(`  ${String(obra.ss).padEnd(10)} (obra ${obra.obra_id}): medido ${moeda(obra.medido)} = ${obra.percentual}% do orçamento de ${moeda(obra.valor_orcamento)}`)
    );
  }

  if (plano.avisos.length) {
    console.log('\n=== Avisos ===');
    plano.avisos.forEach((aviso) => console.log(`  - ${aviso}`));
  }
  if (plano.erros.length) {
    console.log('\n=== ERROS (nada será gravado) ===');
    plano.erros.forEach((erro) => console.log(`  - ${erro}`));
  }
}

async function principal() {
  const args = opcoes(process.argv.slice(2));
  const pasta = path.resolve(args.pasta);

  const simulacao = await simularImportacao({
    medicaoTexto: lerArquivo(pasta, NOME_MEDICAO),
    curvaTexto: lerArquivo(pasta, NOME_CURVA),
    contrato: {
      id_vale: args.contrato,
      descricao: args.descricao,
      valor_inicial: args['valor-inicial'] !== undefined ? Number(args['valor-inicial']) : undefined,
      data_inicio: args.inicio,
      data_fim: args.fim,
    },
  });

  if (!simulacao.plano) {
    console.log('ERROS ao ler as planilhas (nada foi gravado):');
    simulacao.erros.slice(0, 40).forEach((erro) => console.log(`  - ${erro}`));
    if (simulacao.erros.length > 40) console.log(`  ... e mais ${simulacao.erros.length - 40}`);
    process.exitCode = 1;
    return;
  }

  const { plano } = simulacao;
  console.log(`Pasta: ${pasta}`);
  console.log(`Planilhas: ${simulacao.linhas} linhas de medição, ${simulacao.ciclos} ciclos na curva; ${simulacao.obras_no_banco} obras no banco.`);
  imprimirRelatorio(plano);

  if (plano.erros.length) {
    process.exitCode = 1;
    return;
  }

  if (!args.aplicar) {
    console.log('\nSimulação concluída: nada foi gravado. Rode com --aplicar para importar.');
    return;
  }

  console.log('\nGravando no banco...');
  const resumo = await executarImportacao(plano, { substituir: args.substituir });
  console.log('\n=== Importação concluída ===');
  console.log(`  contrato: ${resumo.contrato}`);
  console.log(`  boletins criados: ${resumo.boletins_criados} | mantidos (já existiam): ${resumo.boletins_mantidos} | substituídos: ${resumo.boletins_substituidos}`);
  console.log(`  itens gravados: ${resumo.itens} | ciclos da curva: ${resumo.curva} | obras vinculadas ao contrato: ${resumo.obras_vinculadas}`);
}

principal()
  .catch((erro) => {
    console.error('Falha na importação:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

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
 *   --valor-inicial=124387357.14     valor inicial (padrão: previsto acumulado final da curva)
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
const {
  lerPlanilhaMedicao,
  lerPlanilhaCurva,
  planejarImportacao,
} = require('../src/services/importacaoMedicaoService');

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
  console.log(`  valor inicial: ${moeda(contrato.valor_inicial)}${contrato.derivado.valor_inicial ? '  (derivado do previsto acumulado da curva)' : ''}`);
  console.log(`  vigência: ${contrato.data_inicio} a ${contrato.data_fim}${contrato.derivado.vigencia ? '  (derivada dos ciclos da curva)' : ''}`);

  console.log('\n=== Boletins ===');
  console.log('  BMM     ciclo                     total (R$)    SS  soma planilha   ajuste   sem detalhe');
  plano.boletins.forEach((b) => {
    console.log(
      `  ${b.numero_bmm.padEnd(6)}  ${b.ciclo_inicio} a ${b.ciclo_fim}  ${b.valor_medido.toFixed(2).padStart(14)}  ${String(b.itens.length).padStart(3)}  ${b.soma_planilha.toFixed(2).padStart(13)}  ${b.ajuste_arredondamento.toFixed(2).padStart(7)}  ${b.sem_detalhamento.toFixed(2).padStart(11)}`
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

async function aplicar(plano, { substituir }) {
  const resumo = { contrato: '', boletinsCriados: 0, boletinsMantidos: 0, boletinsSubstituidos: 0, itens: 0, curva: 0, obrasVinculadas: 0 };

  await prisma.$transaction(
    async (tx) => {
      // Contrato
      let contrato = await tx.contrato.findUnique({ where: { id_vale: plano.contrato.id_vale } });
      if (contrato) {
        resumo.contrato = `existente (id ${contrato.id})`;
        if (Number(contrato.valor_inicial) !== plano.contrato.valor_inicial) {
          console.log(`  aviso: o contrato já existe com valor inicial ${moeda(contrato.valor_inicial)} (mantido).`);
        }
      } else {
        contrato = await tx.contrato.create({
          data: {
            id_vale: plano.contrato.id_vale,
            descricao: plano.contrato.descricao,
            valor_inicial: plano.contrato.valor_inicial,
            data_inicio: new Date(`${plano.contrato.data_inicio}T00:00:00Z`),
            data_fim: new Date(`${plano.contrato.data_fim}T00:00:00Z`),
          },
        });
        resumo.contrato = `criado (id ${contrato.id})`;
      }

      // Obras -> contrato
      if (plano.vinculos.length) {
        const resultado = await tx.obra.updateMany({
          where: { id: { in: plano.vinculos } },
          data: { contrato_id: contrato.id },
        });
        resumo.obrasVinculadas = resultado.count;
      }

      // Boletins
      for (const boletim of plano.boletins) {
        const existente = await tx.boletimMedicao.findUnique({
          where: { uq_bmm_por_contrato: { contrato_id: contrato.id, numero_bmm: boletim.numero_bmm } },
          select: { id: true },
        });
        if (existente && !substituir) {
          resumo.boletinsMantidos += 1;
          continue;
        }
        if (existente) {
          await tx.boletimMedicao.delete({ where: { id: existente.id } });
          resumo.boletinsSubstituidos += 1;
        }

        await tx.boletimMedicao.create({
          data: {
            contrato_id: contrato.id,
            numero_bmm: boletim.numero_bmm,
            valor_medido: boletim.valor_medido,
            ciclo_inicio: new Date(`${boletim.ciclo_inicio}T00:00:00Z`),
            ciclo_fim: new Date(`${boletim.ciclo_fim}T00:00:00Z`),
            status: boletim.status,
            observacao: boletim.observacao,
            itens: {
              create: boletim.itens.map((item) => ({
                obra_id: item.obra_id,
                ss_codigo: item.ss_codigo,
                descricao: item.descricao,
                valor: item.valor,
              })),
            },
          },
        });
        if (!existente) resumo.boletinsCriados += 1;
        resumo.itens += boletim.itens.length;
      }

      // Curva financeira: regravada por inteiro (é dado derivado da planilha).
      await tx.curvaFinanceiraContrato.deleteMany({ where: { contrato_id: contrato.id } });
      const curva = await tx.curvaFinanceiraContrato.createMany({
        data: plano.curva.map((linha) => ({
          contrato_id: contrato.id,
          numero_bmm: linha.numero_bmm,
          ciclo_inicio: new Date(`${linha.ciclo_inicio}T00:00:00Z`),
          ciclo_fim: new Date(`${linha.ciclo_fim}T00:00:00Z`),
          previsto_mensal: linha.previsto_mensal,
          previsto_acumulado: linha.previsto_acumulado,
          previsto_replanejado: linha.previsto_replanejado,
          tendencia_acumulada: linha.tendencia_acumulada,
        })),
      });
      resumo.curva = curva.count;
    },
    { timeout: 120000, maxWait: 30000 }
  );

  return resumo;
}

async function principal() {
  const args = opcoes(process.argv.slice(2));
  const pasta = path.resolve(args.pasta);

  const medicao = lerPlanilhaMedicao(lerArquivo(pasta, NOME_MEDICAO));
  const curva = lerPlanilhaCurva(lerArquivo(pasta, NOME_CURVA));
  const errosLeitura = [...medicao.erros, ...curva.erros];
  if (errosLeitura.length) {
    console.log('ERROS ao ler as planilhas (nada foi gravado):');
    errosLeitura.slice(0, 40).forEach((erro) => console.log(`  - ${erro}`));
    if (errosLeitura.length > 40) console.log(`  ... e mais ${errosLeitura.length - 40}`);
    process.exitCode = 1;
    return;
  }

  const obrasBanco = await prisma.obra.findMany({
    select: { id: true, orcamento: { select: { ss: true, pep: true, valor: true } } },
  });

  const plano = planejarImportacao({
    medicao: medicao.linhas,
    curva: curva.ciclos,
    obras: obrasBanco.map((obra) => ({
      id: obra.id,
      ss: obra.orcamento?.ss,
      pep: obra.orcamento?.pep,
      valor: obra.orcamento ? Number(obra.orcamento.valor) : undefined,
    })),
    contrato: {
      id_vale: args.contrato,
      descricao: args.descricao,
      valor_inicial: args['valor-inicial'] !== undefined ? Number(args['valor-inicial']) : undefined,
      data_inicio: args.inicio,
      data_fim: args.fim,
    },
  });

  console.log(`Pasta: ${pasta}`);
  console.log(`Planilhas: ${medicao.linhas.length} linhas de medição, ${curva.ciclos.length} ciclos na curva; ${obrasBanco.length} obras no banco.`);
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
  const resumo = await aplicar(plano, { substituir: args.substituir });
  console.log('\n=== Importação concluída ===');
  console.log(`  contrato: ${resumo.contrato}`);
  console.log(`  boletins criados: ${resumo.boletinsCriados} | mantidos (já existiam): ${resumo.boletinsMantidos} | substituídos: ${resumo.boletinsSubstituidos}`);
  console.log(`  itens gravados: ${resumo.itens} | ciclos da curva: ${resumo.curva} | obras vinculadas ao contrato: ${resumo.obrasVinculadas}`);
}

principal()
  .catch((erro) => {
    console.error('Falha na importação:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

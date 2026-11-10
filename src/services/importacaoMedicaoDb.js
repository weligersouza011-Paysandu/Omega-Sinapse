'use strict';

const AppError = require('../errors/AppError');
const prisma = require('../config/prisma');
const {
  lerPlanilhaMedicao,
  lerPlanilhaCurva,
  planejarImportacao,
} = require('./importacaoMedicaoService');

/**
 * Importação do histórico de medição (pasta 13) com acesso ao banco.
 * Usada pelo script `scripts/importarMedicaoPasta13.js` e pela tela de Medição
 * (envio das duas planilhas CSV): a regra de leitura/validação é a mesma.
 */

/** Lê as duas planilhas e monta o plano de importação (nada é gravado). */
async function simularImportacao({ medicaoTexto, curvaTexto, contrato = {} }) {
  const medicao = lerPlanilhaMedicao(medicaoTexto);
  const curva = lerPlanilhaCurva(curvaTexto);
  const errosLeitura = [...medicao.erros, ...curva.erros];
  if (errosLeitura.length) {
    return { plano: null, erros: errosLeitura, linhas: medicao.linhas.length, ciclos: curva.ciclos.length };
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
    contrato,
  });

  return {
    plano,
    erros: plano.erros,
    linhas: medicao.linhas.length,
    ciclos: curva.ciclos.length,
    obras_no_banco: obrasBanco.length,
  };
}

/**
 * Grava o plano no banco, tudo na mesma transação. Contrato e boletins já
 * existentes são mantidos (a menos de `substituir`); a curva é regravada e as
 * obras casadas são vinculadas ao contrato.
 */
async function executarImportacao(plano, { substituir = false } = {}) {
  if (!plano || plano.erros.length) {
    throw new AppError(400, 'O plano de importação tem erros; nada foi gravado.');
  }

  const resumo = {
    contrato: '',
    contrato_id: null,
    boletins_criados: 0,
    boletins_mantidos: 0,
    boletins_substituidos: 0,
    itens: 0,
    curva: 0,
    obras_vinculadas: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      let contrato = await tx.contrato.findUnique({ where: { id_vale: plano.contrato.id_vale } });
      if (contrato) {
        resumo.contrato = `existente (id ${contrato.id})`;
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
      resumo.contrato_id = contrato.id;

      if (plano.vinculos.length) {
        const vinculadas = await tx.obra.updateMany({
          where: { id: { in: plano.vinculos } },
          data: { contrato_id: contrato.id },
        });
        resumo.obras_vinculadas = vinculadas.count;
      }

      for (const boletim of plano.boletins) {
        const existente = await tx.boletimMedicao.findUnique({
          where: { uq_bmm_por_contrato: { contrato_id: contrato.id, numero_bmm: boletim.numero_bmm } },
          select: { id: true },
        });
        if (existente && !substituir) {
          resumo.boletins_mantidos += 1;
          continue;
        }
        if (existente) {
          await tx.boletimMedicao.delete({ where: { id: existente.id } });
          resumo.boletins_substituidos += 1;
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
        if (!existente) resumo.boletins_criados += 1;
        resumo.itens += boletim.itens.length;
      }

      // Curva financeira: dado derivado da planilha, regravado por inteiro.
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

/** Versão do plano para a API: sem a lista completa de itens (só a contagem por boletim). */
function resumirPlano(plano) {
  return {
    contrato: plano.contrato,
    boletins: plano.boletins.map((boletim) => ({
      numero_bmm: boletim.numero_bmm,
      ciclo_inicio: boletim.ciclo_inicio,
      ciclo_fim: boletim.ciclo_fim,
      valor_medido: boletim.valor_medido,
      itens: boletim.itens.length,
      itens_sem_obra: boletim.itens.filter((item) => item.obra_id === null).length,
      real_curva: boletim.real_curva,
      diferenca_curva: boletim.diferenca_curva,
    })),
    curva_ciclos: plano.curva.length,
    vinculos: plano.vinculos,
    codigos: plano.codigos,
    totais: plano.totais,
    obras_acima_do_orcamento: plano.obras_acima_do_orcamento,
    avisos: plano.avisos,
    erros: plano.erros,
  };
}

/**
 * POST /api/contratos/importar-medicao (somente ADMIN).
 * Com `aplicar` falso só simula e devolve o resumo; com `aplicar` verdadeiro grava.
 */
async function importarPlanilhas({ arquivos, campos = {}, usuario }) {
  if (!usuario || usuario.perfil !== 'ADMIN') {
    throw new AppError(403, 'Apenas administradores podem importar planilhas de medição.');
  }
  const medicao = arquivos?.medicao?.[0];
  const curva = arquivos?.curva?.[0];
  if (!medicao || !curva) {
    throw new AppError(400, 'Envie as duas planilhas: "medicao" (medição bmm.csv) e "curva" (Curva tendencia.csv).');
  }

  const numero = (valor) => (valor === undefined || valor === null || String(valor).trim() === '' ? undefined : Number(valor));
  const texto = (valor) => (valor === undefined || valor === null || String(valor).trim() === '' ? undefined : String(valor).trim());
  const valorInicial = numero(campos.valor_inicial);
  if (valorInicial !== undefined && !(valorInicial > 0)) {
    throw new AppError(400, 'O valor inicial do contrato deve ser maior que zero.');
  }

  const simulacao = await simularImportacao({
    medicaoTexto: medicao.buffer.toString('utf8'),
    curvaTexto: curva.buffer.toString('utf8'),
    contrato: {
      id_vale: texto(campos.id_vale)?.toUpperCase(),
      descricao: texto(campos.descricao),
      valor_inicial: valorInicial,
      data_inicio: texto(campos.data_inicio),
      data_fim: texto(campos.data_fim),
    },
  });

  if (!simulacao.plano) {
    return { aplicado: false, erros: simulacao.erros, plano: null };
  }

  const resposta = { aplicado: false, erros: simulacao.erros, plano: resumirPlano(simulacao.plano) };
  const aplicar = ['true', '1', 'sim'].includes(String(campos.aplicar ?? '').toLowerCase());
  if (!aplicar || simulacao.erros.length) return resposta;

  const resultado = await executarImportacao(simulacao.plano, {
    substituir: ['true', '1', 'sim'].includes(String(campos.substituir ?? '').toLowerCase()),
  });
  return { ...resposta, aplicado: true, resultado };
}

module.exports = { simularImportacao, executarImportacao, resumirPlano, importarPlanilhas };

'use strict';

// =============================================================================
// Synapse — Migração das projeções antigas do sistema Projeção Financeira
// (projections.data_json) para ProjecaoBmm / ProjecaoBmmItem / ProjecaoBmmSemana.
//
// Pré-requisito: o QQP do contrato/TAC já copiado para o Synapse (Fase 2), pois cada
// item da projeção é ligado ao ItemQqp de mesmo código no mesmo contrato/TAC.
//
// Correspondências:
//   contrato  contracts.number (Nº CT SAP) -> Contrato.numero_sap
//             (ou scripts/mapa-contratos.json: { "<number do Projeção>": "<id_vale no Synapse>" })
//   TAC       contract_tacs.number         -> TermoAditivo.numero_tac do contrato (sem TAC = TAC0)
//   obra      works.ss                     -> SS do orçamento da obra vinculada ao contrato
//   item      code                         -> ItemQqp.codigo (maiúsculas) no contrato/TAC
//
// Preço e fórmula ficam como no Projeção (preço gravado na projeção, unidade MES): é o
// histórico. O total recalculado pelo motor do Synapse precisa bater centavo a centavo com
// o total gravado no Projeção; se não bater, a projeção não é importada.
//
// Uso:
//   PROJECAO_DATABASE_URL="postgresql://..." node scripts/importarProjecoesProjecao.js            (simula)
//   PROJECAO_DATABASE_URL="postgresql://..." node scripts/importarProjecoesProjecao.js --aplicar  (grava)
//   --atualizar-curva  também grava a soma no "Projetado" da curva dos meses importados
//                       (por padrão a curva não é tocada: os meses antigos podem ter valor manual).
// Relatório: scripts/saida/importacao-projecoes.csv
// =============================================================================

const fs = require('fs');
const path = require('path');
const { calcularGrade } = require('../src/services/projecaoBmmService');
const { cicloDaReferencia, semanasDoIntervalo } = require('../src/utils/diasUteis');
const dinheiro = require('../src/utils/dinheiro');
const { referenciaDe } = require('./conferirProjecoesProjecao');

const normalizar = (texto) => String(texto ?? '').trim().toUpperCase().replace(/\s+/g, '');

/**
 * Monta (sem gravar) a projeção do Synapse a partir de uma projeção do Projeção. Função pura.
 * @param {object} origem { id, code, data_json, contract_number, tac_number, work_ss }
 * @param {object} contexto { contratos, obras, itens, mapaContratos, existentes, feriadosExtras }
 * @returns {{ ok: true, cabecalho, itens } | { ok: false, motivo }}
 */
function planejarImportacao(origem, contexto) {
  const dados = origem.data_json || {};
  const referencia = referenciaDe(dados);
  const numeroBmm = String(dados.bmmNumber || dados.code || origem.code || '').trim();
  if (!numeroBmm) return { ok: false, motivo: 'Projeção sem BMM Nº.' };

  const idValeMapeado = contexto.mapaContratos?.[origem.contract_number];
  const contrato = contexto.contratos.find((c) =>
    idValeMapeado ? c.id_vale === idValeMapeado : normalizar(c.numero_sap) && normalizar(c.numero_sap) === normalizar(origem.contract_number)
  );
  if (!contrato) return { ok: false, motivo: `Contrato "${origem.contract_number || '?'}" sem correspondente no Synapse (numero_sap ou mapa-contratos.json).` };

  let tac = null;
  if (origem.tac_number) {
    tac = contrato.aditivos.find((a) => normalizar(a.numero_tac) === normalizar(origem.tac_number));
    if (!tac) return { ok: false, motivo: `TAC "${origem.tac_number}" não existe no contrato ${contrato.id_vale} do Synapse.` };
  }
  const escopo = tac ? tac.id : 0;

  const obra = contexto.obras.find((o) => o.contrato_id === contrato.id && normalizar(o.ss) === normalizar(origem.work_ss));
  if (!obra) return { ok: false, motivo: `Obra SS "${origem.work_ss || '?'}" não está vinculada ao contrato ${contrato.id_vale} no Synapse.` };

  if (contexto.existentes.has(`${obra.id}|${numeroBmm}|${referencia}`)) {
    return { ok: false, motivo: `Já existe a projeção do BMM ${numeroBmm} em ${referencia} para a obra ${obra.ss}.` };
  }

  const doEscopo = contexto.itens.get(`${contrato.id}|${escopo}`) || new Map();
  const faltando = [];
  const itensQqp = new Map();
  const linhas = [];
  for (const item of dados.items || []) {
    const qqp = doEscopo.get(normalizar(item.code));
    if (!qqp) {
      faltando.push(item.code);
      continue;
    }
    if (itensQqp.has(qqp.id)) return { ok: false, motivo: `Item ${item.code} repetido na projeção.` };
    // Histórico: preço gravado na projeção e fórmula do Projeção (MES).
    itensQqp.set(qqp.id, { id: qqp.id, codigo: qqp.codigo, unidade: 'MES', preco_unitario: String(item.unitValue), ativo: true });
    linhas.push({
      item_qqp_id: qqp.id,
      semanas: Object.entries(item.weeklyQuantities || {})
        .filter(([, q]) => Number(q.days) || Number(q.people))
        .map(([chave, q]) => ({ semana_inicio: chave.split(':').pop(), dias: Number(q.days), pessoas: String(q.people) })),
    });
  }
  if (faltando.length) {
    return { ok: false, motivo: `Itens sem correspondente no QQP do Synapse (${tac ? tac.numero_tac : 'TAC0'}): ${faltando.join(', ')}.` };
  }

  const ciclo = cicloDaReferencia(referencia);
  const semanas = semanasDoIntervalo(ciclo.inicio, ciclo.fim, { feriadosExtras: contexto.feriadosExtras || new Set() });
  let resultado;
  try {
    resultado = calcularGrade({ semanas, itensQqp, linhas });
  } catch (err) {
    return { ok: false, motivo: `O motor do Synapse recusou a projeção: ${err.message}` };
  }
  const totalProjecao = dinheiro.arredondarEmCentavos(Number(dados.total || 0).toFixed(2));
  if (resultado.totalCentavos !== totalProjecao) {
    return {
      ok: false,
      motivo: `Total diferente: Projeção ${dinheiro.centavosParaTexto(totalProjecao)}, Synapse ${dinheiro.centavosParaTexto(resultado.totalCentavos)}.`,
    };
  }

  return {
    ok: true,
    cabecalho: {
      contrato_id: contrato.id,
      termo_aditivo_id: tac ? tac.id : null,
      obra_id: obra.id,
      numero_bmm: numeroBmm,
      referencia,
      ciclo_inicio: ciclo.inicio,
      ciclo_fim: ciclo.fim,
      dias_uteis: resultado.diasUteis,
      total: dinheiro.centavosParaTexto(resultado.totalCentavos),
      observacao: `Importada do sistema Projeção Financeira (projeção ${origem.id}${origem.created_by ? `, por ${origem.created_by}` : ''}).`,
    },
    itens: resultado.itens.map((linha, posicao) => ({
      item_qqp_id: linha.item.id,
      preco_unitario: linha.preco,
      unidade: 'MES',
      horas_dia: null,
      total: dinheiro.centavosParaTexto(linha.totalCentavos),
      posicao,
      semanas: linha.semanas
        .filter((s) => s.dias > 0 || s.pessoas !== '0')
        .map((s) => ({ semana_inicio: new Date(`${s.semana_inicio}T00:00:00Z`), dias: s.dias, pessoas: s.pessoas, valor: dinheiro.centavosParaTexto(s.centavos) })),
    })),
  };
}

/* ------------------------------- Execução ------------------------------- */

async function lerProjecao(url) {
  const { PrismaClient } = require('@prisma/client');
  const origem = new PrismaClient({ datasources: { db: { url } } });
  try {
    const projecoes = await origem.$queryRawUnsafe(`
      SELECT p.id, p.code, p.data_json, p.created_by, c.number AS contract_number, t.number AS tac_number, w.ss AS work_ss
      FROM projections p
      LEFT JOIN contracts c ON c.id = p.contract_id
      LEFT JOIN contract_tacs t ON t.id = p.tac_id
      LEFT JOIN works w ON w.id = p.work_id
      ORDER BY p.created_at`);
    let feriados = [];
    try {
      feriados = await origem.$queryRawUnsafe('SELECT holiday_date::text AS data FROM custom_holidays');
    } catch {
      console.warn('Aviso: custom_holidays não encontrada; seguindo sem feriados personalizados do Projeção.');
    }
    return {
      projecoes: projecoes.map((p) => ({ ...p, data_json: typeof p.data_json === 'string' ? JSON.parse(p.data_json) : p.data_json })),
      feriados: new Set(feriados.map((f) => f.data)),
    };
  } finally {
    await origem.$disconnect();
  }
}

async function lerSynapse(prisma) {
  const [contratos, obras, itens, existentes] = await Promise.all([
    prisma.contrato.findMany({ select: { id: true, id_vale: true, numero_sap: true, aditivos: { select: { id: true, numero_tac: true } } } }),
    prisma.obra.findMany({ where: { contrato_id: { not: null } }, select: { id: true, contrato_id: true, orcamento: { select: { ss: true } } } }),
    prisma.itemQqp.findMany({ select: { id: true, contrato_id: true, escopo_tac: true, codigo: true } }),
    prisma.projecaoBmm.findMany({ select: { obra_id: true, numero_bmm: true, referencia: true } }),
  ]);
  const porEscopo = new Map();
  for (const item of itens) {
    const chave = `${item.contrato_id}|${item.escopo_tac}`;
    if (!porEscopo.has(chave)) porEscopo.set(chave, new Map());
    porEscopo.get(chave).set(normalizar(item.codigo), item);
  }
  return {
    contratos,
    obras: obras.map((o) => ({ id: o.id, contrato_id: o.contrato_id, ss: o.orcamento?.ss || '' })),
    itens: porEscopo,
    existentes: new Set(existentes.map((p) => `${p.obra_id}|${p.numero_bmm}|${p.referencia}`)),
  };
}

function lerMapaContratos() {
  const arquivo = path.join(__dirname, 'mapa-contratos.json');
  return fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : {};
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const atualizarCurva = process.argv.includes('--atualizar-curva');
  const url = process.env.PROJECAO_DATABASE_URL;
  if (!url) throw new Error('Defina PROJECAO_DATABASE_URL (banco do Projeção, somente leitura).');

  const prisma = require('../src/config/prisma');
  const origem = await lerProjecao(url);
  const contexto = { ...(await lerSynapse(prisma)), mapaContratos: lerMapaContratos(), feriadosExtras: origem.feriados };

  const planos = origem.projecoes.map((p) => {
    try {
      return { origem: p, plano: planejarImportacao(p, contexto) };
    } catch (err) {
      return { origem: p, plano: { ok: false, motivo: err.message } };
    }
  });
  // Duas projeções do Projeção que caem no mesmo BMM/mês/obra: só a primeira entra.
  const vistos = new Set();
  for (const item of planos) {
    if (!item.plano.ok) continue;
    const c = item.plano.cabecalho;
    const chave = `${c.obra_id}|${c.numero_bmm}|${c.referencia}`;
    if (vistos.has(chave)) item.plano = { ok: false, motivo: `Repetida no Projeção (BMM ${c.numero_bmm} em ${c.referencia} para a mesma obra).` };
    vistos.add(chave);
  }

  const aptas = planos.filter((p) => p.plano.ok);
  console.log(`${aptas.length}/${planos.length} projeções aptas para importar.`);
  planos.filter((p) => !p.plano.ok).forEach((p) => console.log(`  NÃO   ${p.origem.id} (BMM ${p.origem.code}): ${p.plano.motivo}`));

  const linhasCsv = [['id_projecao', 'bmm', 'obra_ss', 'contrato', 'tac', 'referencia', 'total', 'situacao', 'motivo'].join(';')];
  planos.forEach(({ origem: o, plano }) => {
    const ref = plano.ok ? plano.cabecalho.referencia : (() => {
      try {
        return referenciaDe(o.data_json || {});
      } catch {
        return '';
      }
    })();
    linhasCsv.push([o.id, o.code, o.work_ss, o.contract_number, o.tac_number || 'TAC0', ref, o.data_json?.total, plano.ok ? (aplicar ? 'importada' : 'apta') : 'nao_importada', `"${(plano.motivo || '').replace(/"/g, "'")}"`].join(';'));
  });
  const saida = path.join(__dirname, 'saida', 'importacao-projecoes.csv');
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, `﻿${linhasCsv.join('\n')}\n`, 'utf8');

  if (!aplicar) {
    console.log(`\nSimulação: nada foi gravado. Relatório: ${saida}\nUse --aplicar para gravar as ${aptas.length} projeções aptas.`);
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const { plano } of aptas) {
        const criada = await tx.projecaoBmm.create({ data: plano.cabecalho, select: { id: true } });
        for (const { semanas, ...item } of plano.itens) {
          await tx.projecaoBmmItem.create({ data: { ...item, projecao_id: criada.id, semanas: { create: semanas } } });
        }
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 30000 }
  );
  console.log(`\n${aptas.length} projeções gravadas numa única transação. Relatório: ${saida}`);

  if (atualizarCurva) {
    const medicaoService = require('../src/services/medicaoService');
    const repo = require('../src/repositories/projecaoBmmRepository');
    const meses = [...new Set(aptas.map((p) => `${p.plano.cabecalho.contrato_id}|${p.plano.cabecalho.referencia}`))];
    for (const chave of meses) {
      const [contratoId, referencia] = chave.split('|');
      const contrato = await repo.buscarContrato(Number(contratoId));
      const soma = await repo.somarDoContratoNaReferencia(Number(contratoId), referencia);
      try {
        await medicaoService.aplicarAlteracaoNaCurva({
          id: Number(contratoId),
          contrato,
          referencia,
          campo: 'PROJETADO',
          novoCent: Number(dinheiro.arredondarEmCentavos(soma)),
          usuario: { id: null, nome: 'Importação do Projeção' },
        });
        console.log(`  curva ${contrato.id_vale} ${referencia}: Projetado = ${soma}`);
      } catch (err) {
        console.log(`  curva ${contrato.id_vale} ${referencia}: não atualizada (${err.message})`);
      }
    }
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`ERRO: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { planejarImportacao };

'use strict';

// =============================================================================
// Synapse — Conferência do motor da Projeção de BMM com o sistema Projeção Financeira.
//
// Recalcula no Synapse (projecaoBmmService.calcularGrade, mesmas semanas e dias úteis)
// projeções gravadas no Projeção (projections.data_json) e compara, centavo a centavo,
// o valor de cada item × semana, os dias úteis de cada semana e o total.
// No Projeção todo item segue a fórmula MES (preço × dias × pessoas ÷ dias úteis do ciclo);
// aqui os itens entram como MES com o preço gravado na projeção.
//
// Uso (somente leitura no banco do Projeção):
//   PROJECAO_DATABASE_URL="postgresql://..." node scripts/conferirProjecoesProjecao.js [--limite 50] [--id <id>]
//   node scripts/conferirProjecoesProjecao.js --arquivo projecoes.json   (lista de data_json exportada)
// Saída: resumo no terminal e scripts/saida/conferencia-projecoes.csv.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { calcularGrade } = require('../src/services/projecaoBmmService');
const { cicloDaReferencia, semanasDoIntervalo, iso } = require('../src/utils/diasUteis');
const dinheiro = require('../src/utils/dinheiro');

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "AAAA-MM" da projeção do Projeção (startMonth, ou mês/ano por extenso). */
function referenciaDe(dataJson) {
  if (/^\d{4}-\d{2}$/.test(dataJson.startMonth || '')) return dataJson.startMonth;
  const mes = MESES.indexOf(dataJson.referenceMonth) + 1;
  if (!mes || !dataJson.referenceYear) throw new Error('Projeção sem mês/ano de referência.');
  return `${dataJson.referenceYear}-${String(mes).padStart(2, '0')}`;
}

/** Valor em reais gravado pelo Projeção -> centavos (o Projeção grava com 2 casas). */
const centavosDe = (valor) => dinheiro.arredondarEmCentavos(String(Number(valor || 0).toFixed(2)));

/**
 * Compara uma projeção do Projeção com o cálculo do Synapse. Função pura.
 * @param {object} dataJson   projections.data_json
 * @param {Set<string>} feriadosExtras  feriados personalizados (AAAA-MM-DD)
 */
function conferirProjecao(dataJson, feriadosExtras = new Set()) {
  const referencia = referenciaDe(dataJson);
  const ciclo = cicloDaReferencia(referencia);
  const semanas = semanasDoIntervalo(ciclo.inicio, ciclo.fim, { feriadosExtras });
  const divergencias = [];

  // Semanas e dias úteis (o Projeção grava os dias úteis de cada semana em weeklyTotals).
  const semanasProjecao = dataJson.weeklyTotals || [];
  if (semanasProjecao.length && semanasProjecao.length !== semanas.length) {
    divergencias.push(`Quantidade de semanas: Projeção ${semanasProjecao.length}, Synapse ${semanas.length}.`);
  }
  semanasProjecao.forEach((semana, i) => {
    if (semanas[i] && Number(semana.businessDays) !== semanas[i].dias_uteis) {
      divergencias.push(`Dias úteis da semana ${semana.week}: Projeção ${semana.businessDays}, Synapse ${semanas[i].dias_uteis}.`);
    }
  });

  const itensQqp = new Map();
  const linhas = [];
  const esperado = new Map(); // `${id}|${semana}` -> centavos do Projeção
  (dataJson.items || []).forEach((item, indice) => {
    const id = indice + 1;
    itensQqp.set(id, { id, codigo: item.code, unidade: 'MES', preco_unitario: String(item.unitValue), ativo: true });
    const semanasItem = [];
    Object.entries(item.weeklyQuantities || {}).forEach(([chave, q]) => {
      const segunda = chave.split(':').pop();
      esperado.set(`${id}|${segunda}`, centavosDe(q.value));
      if (Number(q.days) || Number(q.people)) {
        semanasItem.push({ semana_inicio: segunda, dias: Number(q.days), pessoas: String(q.people) });
      }
    });
    linhas.push({ item_qqp_id: id, semanas: semanasItem });
  });

  let resultado;
  try {
    resultado = calcularGrade({ semanas, itensQqp, linhas });
  } catch (err) {
    return {
      referencia,
      total_projecao: Number(dataJson.total),
      total_synapse: null,
      diferenca: null,
      ok: false,
      divergencias: [...divergencias, `O Synapse recusou a projeção: ${err.message}`],
    };
  }

  for (const linha of resultado.itens) {
    for (const s of linha.semanas) {
      const chave = `${linha.item.id}|${s.semana_inicio}`;
      const projecao = esperado.get(chave) ?? 0n;
      if (projecao !== s.centavos) {
        divergencias.push(
          `${linha.item.codigo} na semana de ${s.semana_inicio}: Projeção ${dinheiro.centavosParaTexto(projecao)}, Synapse ${dinheiro.centavosParaTexto(s.centavos)}.`
        );
      }
    }
  }

  const totalProjecao = centavosDe(dataJson.total);
  const diferenca = resultado.totalCentavos - totalProjecao;
  if (diferenca !== 0n) divergencias.push(`Total: Projeção ${dinheiro.centavosParaTexto(totalProjecao)}, Synapse ${dinheiro.centavosParaTexto(resultado.totalCentavos)}.`);
  return {
    referencia,
    total_projecao: dinheiro.centavosParaReais(totalProjecao),
    total_synapse: dinheiro.centavosParaReais(resultado.totalCentavos),
    diferenca: Number(diferenca) / 100,
    ok: divergencias.length === 0,
    divergencias,
  };
}

/* ------------------------------- Execução ------------------------------- */

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function lerDoBanco(url, { limite, id }) {
  // Prisma só como cliente SQL (consultas de leitura no banco do Projeção).
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const projecoes = id
      ? await prisma.$queryRawUnsafe('SELECT id, code, data_json FROM projections WHERE id = $1', id)
      : await prisma.$queryRawUnsafe(`SELECT id, code, data_json FROM projections ORDER BY created_at DESC LIMIT ${Number(limite) || 1000}`);
    let feriados = [];
    try {
      feriados = await prisma.$queryRawUnsafe('SELECT holiday_date::text AS data FROM custom_holidays');
    } catch {
      console.warn('Aviso: tabela custom_holidays não encontrada; seguindo sem feriados personalizados.');
    }
    return { projecoes: projecoes.map((p) => ({ id: p.id, data_json: typeof p.data_json === 'string' ? JSON.parse(p.data_json) : p.data_json })), feriados: feriados.map((f) => f.data) };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const arquivo = argumento('--arquivo');
  let entrada;
  if (arquivo) {
    const lista = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    entrada = {
      projecoes: lista.map((p, i) => ({ id: p.id ?? i + 1, data_json: p.data_json || p, feriados: p.feriados_personalizados || [] })),
      feriados: [],
    };
  } else {
    const url = process.env.PROJECAO_DATABASE_URL;
    if (!url) throw new Error('Defina PROJECAO_DATABASE_URL (banco do Projeção, leitura) ou use --arquivo.');
    entrada = await lerDoBanco(url, { limite: argumento('--limite'), id: argumento('--id') });
  }

  const feriadosExtras = new Set(entrada.feriados);
  const linhasCsv = [['id', 'referencia', 'total_projecao', 'total_synapse', 'diferenca', 'ok', 'divergencias'].join(';')];
  let ok = 0;
  for (const projecao of entrada.projecoes) {
    let r;
    try {
      r = conferirProjecao(projecao.data_json, new Set([...feriadosExtras, ...(projecao.feriados || [])]));
    } catch (err) {
      r = { referencia: '?', total_projecao: null, total_synapse: null, diferenca: null, ok: false, divergencias: [err.message] };
    }
    if (r.ok) ok += 1;
    console.log(`${r.ok ? 'OK     ' : 'DIVERGE'} ${projecao.id} ${r.referencia} Projeção ${r.total_projecao} · Synapse ${r.total_synapse}`);
    r.divergencias.slice(0, 5).forEach((d) => console.log(`          ${d}`));
    linhasCsv.push([projecao.id, r.referencia, r.total_projecao, r.total_synapse, r.diferenca, r.ok, `"${r.divergencias.join(' | ').replace(/"/g, "'")}"`].join(';'));
  }
  const saida = path.join(__dirname, 'saida', 'conferencia-projecoes.csv');
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, `﻿${linhasCsv.join('\n')}\n`, 'utf8');
  console.log(`\n${ok}/${entrada.projecoes.length} projeções iguais centavo a centavo. Relatório: ${saida}`);
  process.exit(ok === entrada.projecoes.length ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`ERRO: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { conferirProjecao, referenciaDe, iso };

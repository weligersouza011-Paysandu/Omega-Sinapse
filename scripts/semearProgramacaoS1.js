'use strict';

/**
 * Carga inicial da Programação S+1 a partir da planilha da reunião
 * ("Programação_S+1_Sem_NN revNN.xlsx"), para a equipe não precisar importar nada pela tela:
 *
 *  1. Efetivo do contrato (aba "EFETIVO A DISTRIBUIR") → cadastro de colaboradores e funções
 *     (o mesmo cadastro que o RDO usa na mão de obra). Atualiza por matrícula; não apaga ninguém.
 *  2. Obra "SS998 — Canteiro Central" (categoria CANTEIRO_CENTRAL, em andamento, sem valor),
 *     se ainda não existir obra com SS 998.
 *  3. Programação da semana da planilha (aba "PRG S+1_"), ligando cada frente à obra pela SS.
 *     Se a semana já existir, não mexe (use --substituir para regravar).
 *
 * Os dados ficam só no banco: a planilha não é versionada (contém dados pessoais do efetivo).
 *
 * Uso:  npm run semear:programacao -- "C:\caminho\Programação_S+1_Sem_ 48 rev02.xlsx" [--substituir]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const prisma = require('../src/config/prisma');
const programacaoService = require('../src/services/programacaoService');
const { lerPlanilhaEfetivo, lerPlanilhaProgramacao, normalizarSs } = require('../src/utils/programacaoS1');

const SS_CANTEIRO = 'SS998';

function argumentos() {
  const args = process.argv.slice(2);
  const arquivo = args.find((a) => !a.startsWith('--'));
  if (!arquivo) {
    console.error('Informe o caminho da planilha: npm run semear:programacao -- "<arquivo.xlsx>" [--substituir]');
    process.exit(1);
  }
  return { arquivo: path.resolve(arquivo), substituir: args.includes('--substituir') };
}

/** Contrato do efetivo: o único cadastrado ou o que menciona o site "0251"/"CKS". */
async function contratoDoEfetivo() {
  const contratos = await prisma.contrato.findMany({ select: { id: true, id_vale: true, descricao: true, numero_omega: true, descricao_omega: true } });
  if (contratos.length === 1) return contratos[0];
  const candidatos = contratos.filter((c) => /0251|CKS/i.test(`${c.id_vale} ${c.descricao} ${c.numero_omega || ''} ${c.descricao_omega || ''}`));
  return candidatos.length === 1 ? candidatos[0] : null;
}

async function semearEfetivo(efetivo, programacao, contrato) {
  // Quem está na programação e não está na aba de efetivo também entra no cadastro.
  const porMatricula = new Map(efetivo.map((c) => [c.matricula, c]));
  programacao.frentes.forEach((f) => f.equipes.forEach((e) => e.alocacoes.forEach((a) => {
    if (a.matricula && !porMatricula.has(a.matricula)) {
      porMatricula.set(a.matricula, { matricula: a.matricula, nome: a.nome, funcao: a.funcao || null, situacao: f.tipo === 'AFASTAMENTO' ? 'INDISPONIVEL' : 'DISPONIVEL' });
    }
  })));

  const funcoes = new Map();
  for (const nome of new Set([...porMatricula.values()].map((c) => c.funcao).filter(Boolean))) {
    const funcao = await prisma.funcaoMaoObra.upsert({ where: { nome }, update: { ativo: true }, create: { nome } });
    funcoes.set(nome, funcao.id);
  }

  let criados = 0;
  let atualizados = 0;
  for (const c of porMatricula.values()) {
    const dados = {
      nome: c.nome,
      funcao_id: c.funcao ? funcoes.get(c.funcao) : null,
      ativo: true,
      cargo: c.cargo ?? null,
      disciplina: c.disciplina ?? null,
      supervisor: c.supervisor ?? null,
      encarregado: c.encarregado ?? null,
      situacao: c.situacao || 'DISPONIVEL',
      ferias_inicio: c.ferias_inicio ?? null,
      ferias_fim: c.ferias_fim ?? null,
      data_mobilizacao: c.data_mobilizacao ?? null,
      contrato_id: contrato?.id ?? null,
    };
    const existente = await prisma.colaborador.findUnique({ where: { matricula: c.matricula }, select: { id: true } });
    if (existente) {
      await prisma.colaborador.update({ where: { id: existente.id }, data: dados });
      atualizados += 1;
    } else {
      await prisma.colaborador.create({ data: { ...dados, matricula: c.matricula } });
      criados += 1;
    }
  }
  return { total: porMatricula.size, criados, atualizados, funcoes: funcoes.size };
}

/**
 * Canteiro central: obra permanente, sem valor. Toda obra do Sinapse nasce de um orçamento; aqui ele é
 * só um registro técnico (valor 0), que fica fora do módulo de Orçamentos e dos indicadores.
 */
async function garantirCanteiro(contrato) {
  const orcamentos = await prisma.orcamento.findMany({ where: { ss: { contains: '998' } }, select: { id: true, ss: true, obra: { select: { id: true } } } });
  const existente = orcamentos.find((o) => normalizarSs(o.ss) === '998' && o.obra);
  if (existente) {
    await prisma.obra.update({ where: { id: existente.obra.id }, data: { categoria: 'CANTEIRO_CENTRAL', status: 'EM_ANDAMENTO' } });
    return { id: existente.obra.id, criada: false };
  }
  const obra = await prisma.$transaction(async (tx) => {
    const orcamento = await tx.orcamento.create({
      data: {
        pep: 'CANTEIRO-998',
        ss: SS_CANTEIRO,
        descricao: 'Canteiro Central 998 — estrutura permanente do contrato (sem orçamento comercial)',
        status: 'OSI_EMITIDA',
        valor: 0,
        foto_1: '',
      },
    });
    return tx.obra.create({
      data: {
        orcamento_id: orcamento.id,
        status: 'EM_ANDAMENTO',
        categoria: 'CANTEIRO_CENTRAL',
        contrato_id: contrato?.id ?? null,
        observacoes: 'Canteiro central: recebe frentes da Programação S+1 e RDO; não tem valor nem orçamento.',
      },
    });
  });
  return { id: obra.id, criada: true };
}

async function semearProgramacao(lida, substituir) {
  const existente = await prisma.programacaoSemanal.findUnique({ where: { ano_semana: { ano: lida.ano, semana: lida.semana } } });
  if (existente && !substituir) return { id: existente.id, gravada: false };
  const id = await prisma.$transaction(async (tx) => {
    let programacaoId;
    if (existente) {
      await tx.programacaoFrente.deleteMany({ where: { programacao_id: existente.id } });
      await tx.programacaoSemanal.update({ where: { id: existente.id }, data: { revisao: lida.revisao, status: 'EM_ELABORACAO', emitida_em: null } });
      programacaoId = existente.id;
    } else {
      programacaoId = (await tx.programacaoSemanal.create({
        data: { ano: lida.ano, semana: lida.semana, data_inicio: lida.data_inicio, revisao: lida.revisao },
      })).id;
    }
    await programacaoService.gravarFrentes(tx, programacaoId, lida.frentes);
    return programacaoId;
  }, { timeout: 120000 });
  return { id, gravada: true };
}

async function main() {
  const { arquivo, substituir } = argumentos();
  const buffer = fs.readFileSync(arquivo);
  const efetivo = lerPlanilhaEfetivo(XLSX, buffer);
  const lida = lerPlanilhaProgramacao(XLSX, buffer, path.basename(arquivo));

  const contrato = await contratoDoEfetivo();
  console.log(`[semear] Contrato do efetivo: ${contrato ? `${contrato.id_vale} — ${contrato.descricao}` : 'não identificado (efetivo fica sem contrato)'}`);

  const resEfetivo = await semearEfetivo(efetivo, lida, contrato);
  console.log(`[semear] Efetivo: ${resEfetivo.total} colaboradores (${resEfetivo.criados} novos, ${resEfetivo.atualizados} atualizados), ${resEfetivo.funcoes} funções.`);

  const canteiro = await garantirCanteiro(contrato);
  console.log(`[semear] Obra SS998 (Canteiro Central): ${canteiro.criada ? 'criada' : 'já existia'} — obra ${canteiro.id}.`);

  const prog = await semearProgramacao(lida, substituir);
  const completa = await programacaoService.obter(prog.id);
  console.log(`[semear] Programação semana ${lida.semana}/${lida.ano} rev${String(lida.revisao).padStart(2, '0')}: ${prog.gravada ? 'gravada' : 'já existia (use --substituir para regravar)'}.`);
  const semObra = completa.frentes.filter((f) => f.tipo === 'OBRA' && !f.obra_id);
  console.log(`[semear] ${completa.frentes.length} frentes, ${completa.resumo.total_pessoas} pessoas; ${completa.frentes.filter((f) => f.obra_id).length} ligadas a obra.`);
  if (semObra.length) {
    console.log(`[semear] Frentes de obra sem obra EM ANDAMENTO com a mesma SS (vincule na tela): ${semObra.map((f) => f.codigo || f.titulo).join(', ')}`);
  }
}

main()
  .catch((err) => {
    console.error('[semear] Falhou:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

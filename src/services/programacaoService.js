'use strict';

const XLSX = require('xlsx');
const AppError = require('../errors/AppError');
const prisma = require('../config/prisma');
const {
  TIPOS_FRENTE,
  identificarSemana,
  normalizarDias,
  normalizarSs,
  lerPlanilhaProgramacao,
  calcularResumo,
} = require('../utils/programacaoS1');

/**
 * Programação S+1: programação semanal de mão de obra da semana seguinte, montada e emitida na
 * reunião semanal. Semana → frentes (obra/SS, apoio, disponível, afastamentos) → equipes → pessoas.
 * Programação emitida fica travada; para alterar, abre-se uma nova revisão (rev+1).
 */

const PERFIS_EXCLUSAO = ['SUPERVISOR', 'ADMIN'];

const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
const tem = (o, c) => Object.prototype.hasOwnProperty.call(o, c);

function idValido(valor, campo = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, `O campo "${campo}" deve ser um número inteiro positivo.`);
  return n;
}

function texto(valor, campo, max, obrigatorio = false) {
  if (vazio(valor)) {
    if (obrigatorio) throw new AppError(400, `O campo "${campo}" é obrigatório.`);
    return null;
  }
  const t = String(valor).trim();
  if (max && t.length > max) throw new AppError(400, `O campo "${campo}" aceita no máximo ${max} caracteres.`);
  return t;
}

/* ------------------------------ Validação ------------------------------ */

function camposFrente(p, parcial) {
  const d = {};
  if (!parcial || tem(p, 'titulo')) d.titulo = texto(p.titulo, 'titulo', 200, true);
  if (!parcial || tem(p, 'tipo')) {
    const tipo = vazio(p.tipo) ? 'OBRA' : String(p.tipo).toUpperCase();
    if (!TIPOS_FRENTE.includes(tipo)) throw new AppError(400, `Tipo de frente inválido. Valores aceitos: ${TIPOS_FRENTE.join(', ')}.`);
    d.tipo = tipo;
  }
  if (!parcial || tem(p, 'codigo')) d.codigo = texto(p.codigo, 'codigo', 60);
  if (!parcial || tem(p, 'responsavel')) d.responsavel = texto(p.responsavel, 'responsavel', 120);
  if (!parcial || tem(p, 'obra_id')) d.obra_id = vazio(p.obra_id) ? null : idValido(p.obra_id, 'obra_id');
  return d;
}

function camposEquipe(p, parcial) {
  const d = {};
  if (!parcial || tem(p, 'codigo')) d.codigo = texto(p.codigo, 'codigo', 30)?.toUpperCase() ?? null;
  if (!parcial || tem(p, 'disciplina')) d.disciplina = texto(p.disciplina, 'disciplina', 120);
  if (!parcial || tem(p, 'atividades')) d.atividades = texto(p.atividades, 'atividades', 10000);
  if (!parcial || tem(p, 'premissas')) d.premissas = texto(p.premissas, 'premissas', 10000);
  return d;
}

function camposAlocacao(p, parcial) {
  const d = {};
  if (!parcial || tem(p, 'matricula')) d.matricula = texto(p.matricula, 'matricula', 30);
  if (!parcial || tem(p, 'nome')) d.nome = texto(p.nome, 'nome', 255);
  if (!parcial || tem(p, 'funcao')) d.funcao = texto(p.funcao, 'funcao', 120)?.toUpperCase() ?? null;
  if (!parcial || tem(p, 'dias')) {
    if (tem(p, 'dias') && !Array.isArray(p.dias)) throw new AppError(400, 'O campo "dias" deve ser uma lista de 7 posições (segunda a domingo).');
    // Nova pessoa: segunda a sexta por padrão.
    d.dias = tem(p, 'dias') ? normalizarDias(p.dias) : [true, true, true, true, true, false, false];
  }
  return d;
}

/* ------------------------------ Consultas ------------------------------ */

const INCLUDE_COMPLETO = {
  criado_por: { select: { id: true, nome: true } },
  frentes: {
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    include: {
      obra: { select: { id: true, status: true, orcamento: { select: { ss: true, descricao: true } } } },
      equipes: {
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        include: { alocacoes: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] } },
      },
    },
  },
};

async function listar() {
  const itens = await prisma.programacaoSemanal.findMany({
    orderBy: [{ ano: 'desc' }, { semana: 'desc' }],
    include: { _count: { select: { frentes: true } }, criado_por: { select: { id: true, nome: true } } },
  });
  return itens;
}

async function obter(id) {
  const programacao = await prisma.programacaoSemanal.findUnique({ where: { id: idValido(id) }, include: INCLUDE_COMPLETO });
  if (!programacao) throw new AppError(404, 'Programação não encontrada.');
  return { ...programacao, resumo: calcularResumo(programacao) };
}

/** Obras (SS) que podem receber frente na programação: todas, menos as concluídas. */
async function listarObras() {
  const obras = await prisma.obra.findMany({
    where: { status: { not: 'CONCLUIDA' } },
    select: { id: true, status: true, orcamento: { select: { ss: true, descricao: true } } },
    orderBy: { id: 'desc' },
  });
  return obras.map((o) => ({ id: o.id, status: o.status, ss: o.orcamento?.ss || null, descricao: o.orcamento?.descricao || null }));
}

/** Mapa SS normalizada → obra_id, para vincular frentes pela SS. */
async function mapaObrasPorSs() {
  const obras = await listarObras();
  const mapa = new Map();
  obras.forEach((o) => { if (o.ss) mapa.set(normalizarSs(o.ss), o.id); });
  return mapa;
}

/** Mapa matrícula → colaborador (cadastro do RDO). */
async function mapaColaboradores(matriculas) {
  const lista = [...new Set(matriculas.filter(Boolean))];
  if (lista.length === 0) return new Map();
  const colaboradores = await prisma.colaborador.findMany({
    where: { matricula: { in: lista } },
    select: { id: true, nome: true, matricula: true, funcao: { select: { nome: true } } },
  });
  return new Map(colaboradores.map((c) => [c.matricula, c]));
}

/* ------------------------------ Travas ------------------------------ */

async function programacaoEditavel(programacaoId) {
  const p = await prisma.programacaoSemanal.findUnique({ where: { id: programacaoId }, select: { id: true, status: true } });
  if (!p) throw new AppError(404, 'Programação não encontrada.');
  if (p.status === 'EMITIDA') throw new AppError(409, 'Programação emitida. Abra uma nova revisão para alterar.');
  return p;
}

async function frenteEditavel(frenteId) {
  const f = await prisma.programacaoFrente.findUnique({ where: { id: idValido(frenteId) }, select: { id: true, programacao_id: true } });
  if (!f) throw new AppError(404, 'Frente não encontrada.');
  await programacaoEditavel(f.programacao_id);
  return f;
}

async function equipeEditavel(equipeId) {
  const e = await prisma.programacaoEquipe.findUnique({ where: { id: idValido(equipeId) }, select: { id: true, frente: { select: { programacao_id: true } } } });
  if (!e) throw new AppError(404, 'Equipe não encontrada.');
  await programacaoEditavel(e.frente.programacao_id);
  return e;
}

async function alocacaoEditavel(alocacaoId) {
  const a = await prisma.programacaoAlocacao.findUnique({
    where: { id: idValido(alocacaoId) },
    select: { id: true, equipe: { select: { frente: { select: { programacao_id: true } } } } },
  });
  if (!a) throw new AppError(404, 'Pessoa não encontrada na programação.');
  await programacaoEditavel(a.equipe.frente.programacao_id);
  return a;
}

/* ------------------------------ Gravação ------------------------------ */

/** Grava as frentes (com equipes e pessoas) numa programação, vinculando obra (SS) e colaborador (matrícula). */
async function gravarFrentes(tx, programacaoId, frentes) {
  const obrasPorSs = await mapaObrasPorSs();
  const colaboradores = await mapaColaboradores(
    frentes.flatMap((f) => f.equipes.flatMap((e) => e.alocacoes.map((a) => a.matricula))),
  );
  for (const [ordemFrente, f] of frentes.entries()) {
    const obraId = f.obra_id ?? (f.tipo === 'OBRA' && f.codigo ? obrasPorSs.get(normalizarSs(f.codigo)) ?? null : null);
    await tx.programacaoFrente.create({
      data: {
        programacao_id: programacaoId,
        tipo: f.tipo,
        titulo: String(f.titulo).slice(0, 200),
        codigo: f.codigo ? String(f.codigo).slice(0, 60) : null,
        responsavel: f.responsavel ? String(f.responsavel).slice(0, 120) : null,
        obra_id: obraId,
        ordem: ordemFrente,
        equipes: {
          create: f.equipes.map((e, ordemEquipe) => ({
            codigo: e.codigo ? String(e.codigo).slice(0, 30) : null,
            disciplina: e.disciplina ? String(e.disciplina).slice(0, 120) : null,
            atividades: e.atividades || null,
            premissas: e.premissas || null,
            ordem: ordemEquipe,
            alocacoes: {
              create: e.alocacoes.map((a, ordemPessoa) => ({
                matricula: a.matricula ? String(a.matricula).slice(0, 30) : null,
                nome: String(a.nome).slice(0, 255),
                funcao: a.funcao ? String(a.funcao).toUpperCase().slice(0, 120) : null,
                dias: normalizarDias(a.dias),
                colaborador_id: a.matricula ? colaboradores.get(String(a.matricula))?.id ?? null : null,
                ordem: ordemPessoa,
              })),
            },
          })),
        },
      },
    });
  }
}

/**
 * Cria a programação da semana que contém `data` (padrão: a próxima semana, S+1).
 * Com `copiar_de_id`, copia frentes, equipes, pessoas, presença, atividades e premissas daquela programação.
 */
async function criar(payload, usuario) {
  const base = vazio(payload.data) ? new Date(Date.now() + 7 * 86400000) : new Date(`${String(payload.data).slice(0, 10)}T12:00:00Z`);
  const semana = identificarSemana(base);
  if (!semana) throw new AppError(400, 'Data inválida.');
  const existente = await prisma.programacaoSemanal.findUnique({ where: { ano_semana: { ano: semana.ano, semana: semana.semana } } });
  if (existente) throw new AppError(409, `Já existe a programação da semana ${semana.semana}/${semana.ano}.`, { id: existente.id });

  let frentes = [];
  if (!vazio(payload.copiar_de_id)) {
    const origem = await obter(payload.copiar_de_id);
    frentes = origem.frentes.map((f) => ({
      tipo: f.tipo, titulo: f.titulo, codigo: f.codigo, responsavel: f.responsavel, obra_id: f.obra_id,
      equipes: f.equipes.map((e) => ({
        codigo: e.codigo, disciplina: e.disciplina, atividades: e.atividades, premissas: e.premissas,
        alocacoes: e.alocacoes.map((a) => ({ matricula: a.matricula, nome: a.nome, funcao: a.funcao, dias: a.dias })),
      })),
    }));
  }

  const criada = await prisma.$transaction(async (tx) => {
    const p = await tx.programacaoSemanal.create({
      data: { ...semana, observacoes: texto(payload.observacoes, 'observacoes', 5000), criado_por_id: usuario?.id ?? null },
    });
    await gravarFrentes(tx, p.id, frentes);
    return p;
  }, { timeout: 60000 });
  return obter(criada.id);
}

async function atualizar(id, payload) {
  const programacaoId = idValido(id);
  await programacaoEditavel(programacaoId);
  await prisma.programacaoSemanal.update({ where: { id: programacaoId }, data: { observacoes: texto(payload.observacoes, 'observacoes', 5000) } });
  return obter(programacaoId);
}

async function excluir(id, usuario) {
  if (!PERFIS_EXCLUSAO.includes(usuario?.perfil)) throw new AppError(403, 'Somente Supervisor ou Admin excluem uma programação.');
  const programacaoId = idValido(id);
  const p = await prisma.programacaoSemanal.findUnique({ where: { id: programacaoId }, select: { id: true } });
  if (!p) throw new AppError(404, 'Programação não encontrada.');
  await prisma.programacaoSemanal.delete({ where: { id: programacaoId } });
  return { ok: true };
}

/** Emite a revisão atual (trava a edição). */
async function emitir(id) {
  const programacaoId = idValido(id);
  await programacaoEditavel(programacaoId);
  await prisma.programacaoSemanal.update({ where: { id: programacaoId }, data: { status: 'EMITIDA', emitida_em: new Date() } });
  return obter(programacaoId);
}

/** Abre uma nova revisão (rev+1) de uma programação emitida. */
async function novaRevisao(id) {
  const programacaoId = idValido(id);
  const p = await prisma.programacaoSemanal.findUnique({ where: { id: programacaoId }, select: { status: true } });
  if (!p) throw new AppError(404, 'Programação não encontrada.');
  if (p.status !== 'EMITIDA') throw new AppError(409, 'A programação ainda está em elaboração: a revisão atual não foi emitida.');
  await prisma.programacaoSemanal.update({
    where: { id: programacaoId },
    data: { status: 'EM_ELABORACAO', revisao: { increment: 1 }, emitida_em: null },
  });
  return obter(programacaoId);
}

/* Frentes */

async function criarFrente(programacaoId, payload) {
  const pid = idValido(programacaoId, 'programacao_id');
  await programacaoEditavel(pid);
  const dados = camposFrente(payload, false);
  if (dados.obra_id && !dados.codigo) {
    const obra = await prisma.obra.findUnique({ where: { id: dados.obra_id }, select: { orcamento: { select: { ss: true } } } });
    dados.codigo = obra?.orcamento?.ss || null;
  } else if (!dados.obra_id && dados.tipo === 'OBRA' && dados.codigo) {
    dados.obra_id = (await mapaObrasPorSs()).get(normalizarSs(dados.codigo)) ?? null;
  }
  const ordem = await prisma.programacaoFrente.count({ where: { programacao_id: pid } });
  return prisma.programacaoFrente.create({ data: { ...dados, programacao_id: pid, ordem } });
}

async function atualizarFrente(id, payload) {
  const f = await frenteEditavel(id);
  return prisma.programacaoFrente.update({ where: { id: f.id }, data: camposFrente(payload, true) });
}

async function excluirFrente(id) {
  const f = await frenteEditavel(id);
  await prisma.programacaoFrente.delete({ where: { id: f.id } });
  return { ok: true };
}

/* Equipes */

async function criarEquipe(frenteId, payload) {
  const f = await frenteEditavel(frenteId);
  const ordem = await prisma.programacaoEquipe.count({ where: { frente_id: f.id } });
  return prisma.programacaoEquipe.create({ data: { ...camposEquipe(payload, false), frente_id: f.id, ordem } });
}

async function atualizarEquipe(id, payload) {
  const e = await equipeEditavel(id);
  return prisma.programacaoEquipe.update({ where: { id: e.id }, data: camposEquipe(payload, true) });
}

async function excluirEquipe(id) {
  const e = await equipeEditavel(id);
  await prisma.programacaoEquipe.delete({ where: { id: e.id } });
  return { ok: true };
}

/* Pessoas */

/** Completa nome/função pelo cadastro de colaboradores do RDO quando a matrícula existe lá. */
async function completarPeloCadastro(dados) {
  if (!dados.matricula) return { ...dados, colaborador_id: null };
  const c = (await mapaColaboradores([dados.matricula])).get(dados.matricula);
  return {
    ...dados,
    colaborador_id: c?.id ?? null,
    nome: dados.nome || c?.nome || null,
    funcao: dados.funcao || c?.funcao?.nome?.toUpperCase() || null,
  };
}

async function criarAlocacao(equipeId, payload) {
  const e = await equipeEditavel(equipeId);
  const dados = await completarPeloCadastro(camposAlocacao(payload, false));
  if (!dados.nome) throw new AppError(400, 'Informe o nome (ou uma matrícula do cadastro de colaboradores).');
  const ordem = await prisma.programacaoAlocacao.count({ where: { equipe_id: e.id } });
  return prisma.programacaoAlocacao.create({ data: { ...dados, equipe_id: e.id, ordem } });
}

async function atualizarAlocacao(id, payload) {
  const a = await alocacaoEditavel(id);
  let dados = camposAlocacao(payload, true);
  if (tem(dados, 'nome') && !dados.nome) throw new AppError(400, 'O campo "nome" é obrigatório.');
  if (tem(dados, 'matricula')) {
    const { colaborador_id: colaboradorId } = await completarPeloCadastro({ matricula: dados.matricula });
    dados = { ...dados, colaborador_id: colaboradorId };
  }
  return prisma.programacaoAlocacao.update({ where: { id: a.id }, data: dados });
}

async function excluirAlocacao(id) {
  const a = await alocacaoEditavel(id);
  await prisma.programacaoAlocacao.delete({ where: { id: a.id } });
  return { ok: true };
}

/* Importação da planilha */

/**
 * Importa a planilha da reunião ("Programação_S+1_Sem_NN revNN.xlsx"). Se a semana já existir,
 * responde 409 — com `substituir=true` o conteúdo é trocado pelo da planilha (mesmo id).
 */
async function importar(arquivo, opcoes, usuario) {
  if (!arquivo?.buffer) throw new AppError(400, 'Envie a planilha no campo "arquivo".');
  let lida;
  try {
    lida = lerPlanilhaProgramacao(XLSX, arquivo.buffer, arquivo.originalname);
  } catch (err) {
    throw new AppError(400, `Não foi possível ler a planilha: ${err.message}`);
  }
  if (lida.frentes.length === 0) throw new AppError(400, 'Nenhuma frente de serviço encontrada na planilha.');

  const substituir = [true, 'true', '1', 1].includes(opcoes?.substituir);
  const existente = await prisma.programacaoSemanal.findUnique({ where: { ano_semana: { ano: lida.ano, semana: lida.semana } } });
  if (existente && !substituir) {
    throw new AppError(409, `A programação da semana ${lida.semana}/${lida.ano} já existe. Confirme para substituir pelo conteúdo da planilha.`, { id: existente.id });
  }

  const id = await prisma.$transaction(async (tx) => {
    let programacaoId;
    if (existente) {
      await tx.programacaoFrente.deleteMany({ where: { programacao_id: existente.id } });
      await tx.programacaoSemanal.update({
        where: { id: existente.id },
        data: { revisao: lida.revisao, status: 'EM_ELABORACAO', emitida_em: null, data_inicio: lida.data_inicio },
      });
      programacaoId = existente.id;
    } else {
      const p = await tx.programacaoSemanal.create({
        data: { ano: lida.ano, semana: lida.semana, data_inicio: lida.data_inicio, revisao: lida.revisao, criado_por_id: usuario?.id ?? null },
      });
      programacaoId = p.id;
    }
    await gravarFrentes(tx, programacaoId, lida.frentes);
    return programacaoId;
  }, { timeout: 120000 });

  return obter(id);
}

module.exports = {
  listar,
  obter,
  listarObras,
  criar,
  atualizar,
  excluir,
  emitir,
  novaRevisao,
  criarFrente,
  atualizarFrente,
  excluirFrente,
  criarEquipe,
  atualizarEquipe,
  excluirEquipe,
  criarAlocacao,
  atualizarAlocacao,
  excluirAlocacao,
  importar,
  camposFrente,
  camposEquipe,
  camposAlocacao,
};

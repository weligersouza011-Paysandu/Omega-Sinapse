'use strict';

const AppError = require('../errors/AppError');
const prisma = require('../config/prisma');

/**
 * Cadastros manuais do RDO: funções de mão de obra, colaboradores, equipamentos e motivos de desvio,
 * mais o vínculo encarregado ↔ obras. Nada é apagado: o cadastro é desativado (`ativo: false`) para
 * preservar os RDOs já lançados.
 */

const PERFIS_GESTAO = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const PERFIS_VINCULO = ['SUPERVISOR', 'ADMIN'];

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
  if (t.length > max) throw new AppError(400, `O campo "${campo}" aceita no máximo ${max} caracteres.`);
  return t;
}

function idOpcional(valor, campo) {
  return vazio(valor) ? null : idValido(valor, campo);
}

/** Definição de cada cadastro: modelo Prisma, campos aceitos e ordenação. */
const CADASTROS = {
  funcoes: {
    modelo: 'funcaoMaoObra',
    rotulo: 'Função',
    ordem: { nome: 'asc' },
    campos: (p, parcial) => {
      const d = {};
      if (!parcial || tem(p, 'nome')) d.nome = texto(p.nome, 'nome', 120, true);
      if (!parcial || tem(p, 'item_qqp_id')) d.item_qqp_id = idOpcional(p.item_qqp_id, 'item_qqp_id');
      return d;
    },
  },
  colaboradores: {
    modelo: 'colaborador',
    rotulo: 'Colaborador',
    ordem: { nome: 'asc' },
    include: { funcao: { select: { id: true, nome: true } } },
    campos: (p, parcial) => {
      const d = {};
      if (!parcial || tem(p, 'nome')) d.nome = texto(p.nome, 'nome', 255, true);
      if (!parcial || tem(p, 'matricula')) d.matricula = texto(p.matricula, 'matricula', 30);
      if (!parcial || tem(p, 'funcao_id')) d.funcao_id = idOpcional(p.funcao_id, 'funcao_id');
      return d;
    },
  },
  equipamentos: {
    modelo: 'equipamentoCadastro',
    rotulo: 'Equipamento',
    ordem: { nome: 'asc' },
    campos: (p, parcial) => {
      const d = {};
      if (!parcial || tem(p, 'nome')) d.nome = texto(p.nome, 'nome', 160, true);
      if (!parcial || tem(p, 'codigo')) d.codigo = texto(p.codigo, 'codigo', 60);
      if (!parcial || tem(p, 'item_qqp_id')) d.item_qqp_id = idOpcional(p.item_qqp_id, 'item_qqp_id');
      return d;
    },
  },
  motivos: {
    modelo: 'motivoDesvio',
    rotulo: 'Motivo de desvio',
    ordem: [{ ordem: 'asc' }, { descricao: 'asc' }],
    campos: (p, parcial) => {
      const d = {};
      if (!parcial || tem(p, 'descricao')) d.descricao = texto(p.descricao, 'descricao', 160, true);
      return d;
    },
  },
};

function definicao(tipo) {
  const def = CADASTROS[tipo];
  if (!def) throw new AppError(404, `Cadastro "${tipo}" não existe. Use: ${Object.keys(CADASTROS).join(', ')}.`);
  return def;
}

function exigirGestao(usuario) {
  if (!usuario?.perfil) throw new AppError(401, 'Usuário não autenticado.');
  if (!PERFIS_GESTAO.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_GESTAO.join(', ')} podem alterar os cadastros do RDO.`);
  }
}

/** GET /api/rdo-cadastros/:tipo?ativos=true — todos os perfis com acesso ao RDO leem (preenchimento). */
async function listar(tipo, filtros = {}) {
  const def = definicao(tipo);
  const where = {};
  if (String(filtros.ativos ?? '').toLowerCase() === 'true') where.ativo = true;
  return prisma[def.modelo].findMany({ where, orderBy: def.ordem, ...(def.include ? { include: def.include } : {}) });
}

/** POST /api/rdo-cadastros/:tipo */
async function criar(tipo, payload = {}, usuario) {
  exigirGestao(usuario);
  const def = definicao(tipo);
  return prisma[def.modelo].create({ data: def.campos(payload, false), ...(def.include ? { include: def.include } : {}) });
}

/** PUT /api/rdo-cadastros/:tipo/:id — dados e `ativo` (desativar em vez de excluir). */
async function atualizar(tipo, idParam, payload = {}, usuario) {
  exigirGestao(usuario);
  const def = definicao(tipo);
  const id = idValido(idParam);
  const dados = def.campos(payload, true);
  if (tem(payload, 'ativo')) dados.ativo = payload.ativo === true || payload.ativo === 'true';
  if (Object.keys(dados).length === 0) throw new AppError(400, 'Nenhum campo para atualizar.');

  const existente = await prisma[def.modelo].findUnique({ where: { id }, select: { id: true } });
  if (!existente) throw new AppError(404, `${def.rotulo} ${id} não encontrado(a).`);
  return prisma[def.modelo].update({ where: { id }, data: dados, ...(def.include ? { include: def.include } : {}) });
}

/* --------------------------- Vínculo encarregado ↔ obras --------------------------- */

async function garantirEncarregado(usuarioId) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, perfil: true, excluido_em: true } });
  if (!usuario || usuario.excluido_em) throw new AppError(404, `Usuário ${usuarioId} não encontrado.`);
  if (usuario.perfil !== 'ENCARREGADO') throw new AppError(400, 'O usuário informado não tem o perfil ENCARREGADO.');
}

/** GET /api/rdo-cadastros/encarregados — encarregados ativos com as obras vinculadas. */
async function listarEncarregados(usuario) {
  if (!PERFIS_GESTAO.includes(usuario?.perfil)) throw new AppError(403, 'Sem permissão para listar encarregados.');
  const lista = await prisma.usuario.findMany({
    where: { perfil: 'ENCARREGADO', excluido_em: null },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, matricula: true, ativo: true, obras_encarregado: { select: { obra_id: true } } },
  });
  return lista.map((u) => ({ id: u.id, nome: u.nome, matricula: u.matricula, ativo: u.ativo, obra_ids: u.obras_encarregado.map((o) => o.obra_id) }));
}

/** PUT /api/rdo-cadastros/encarregados/:usuarioId/obras — { obra_ids: [] } substitui o vínculo. */
async function definirObrasDoEncarregado(usuarioIdParam, payload = {}, usuario) {
  if (!PERFIS_VINCULO.includes(usuario?.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_VINCULO.join(', ')} podem vincular encarregados a obras.`);
  }
  const usuarioId = idValido(usuarioIdParam, 'usuarioId');
  await garantirEncarregado(usuarioId);
  if (!Array.isArray(payload.obra_ids)) throw new AppError(400, 'Informe "obra_ids" como uma lista de ids de obra.');
  const obraIds = [...new Set(payload.obra_ids.map((id) => idValido(id, 'obra_ids[]')))];

  const existentes = await prisma.obra.findMany({ where: { id: { in: obraIds } }, select: { id: true } });
  const faltando = obraIds.filter((id) => !existentes.some((o) => o.id === id));
  if (faltando.length) throw new AppError(404, `Obra(s) não encontrada(s): ${faltando.join(', ')}.`);

  await prisma.$transaction([
    prisma.encarregadoObra.deleteMany({ where: { usuario_id: usuarioId } }),
    prisma.encarregadoObra.createMany({ data: obraIds.map((obra_id) => ({ usuario_id: usuarioId, obra_id })) }),
  ]);
  return { usuario_id: usuarioId, obra_ids: obraIds };
}

module.exports = { listar, criar, atualizar, listarEncarregados, definirObrasDoEncarregado, CADASTROS };

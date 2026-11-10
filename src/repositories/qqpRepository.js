'use strict';

const prisma = require('../config/prisma');

/** Itens do QQP de um contrato (ativos primeiro, depois por categoria e código). */
async function listarItens(contratoId) {
  return prisma.itemQqp.findMany({
    where: { contrato_id: contratoId },
    orderBy: [{ ativo: 'desc' }, { categoria: 'asc' }, { codigo: 'asc' }],
    include: { _count: { select: { recursos: true } } },
  });
}

async function buscarItem(contratoId, itemId) {
  return prisma.itemQqp.findFirst({
    where: { id: itemId, contrato_id: contratoId },
    include: { _count: { select: { recursos: true } } },
  });
}

async function buscarItemPorCodigo(contratoId, codigo) {
  return prisma.itemQqp.findUnique({
    where: { uq_qqp_codigo_por_contrato: { contrato_id: contratoId, codigo } },
    select: { id: true },
  });
}

async function criarItem(contratoId, dados) {
  const item = await prisma.itemQqp.create({ data: { contrato_id: contratoId, ...dados } });
  return buscarItem(contratoId, item.id);
}

async function atualizarItem(contratoId, itemId, dados) {
  await prisma.itemQqp.updateMany({ where: { id: itemId, contrato_id: contratoId }, data: dados });
  return buscarItem(contratoId, itemId);
}

async function excluirItem(contratoId, itemId) {
  const resultado = await prisma.itemQqp.deleteMany({ where: { id: itemId, contrato_id: contratoId } });
  return resultado.count > 0;
}

const INCLUDE_RECURSO = { item: true };

/** Recursos planejados da obra, com o item do QQP (preço, unidade, categoria). */
async function listarRecursosDaObra(obraId) {
  return prisma.recursoObraQqp.findMany({
    where: { obra_id: obraId },
    orderBy: [{ data_inicio: 'asc' }, { id: 'asc' }],
    include: INCLUDE_RECURSO,
  });
}

async function buscarRecurso(obraId, recursoId) {
  return prisma.recursoObraQqp.findFirst({
    where: { id: recursoId, obra_id: obraId },
    include: INCLUDE_RECURSO,
  });
}

async function criarRecurso(obraId, dados) {
  const recurso = await prisma.recursoObraQqp.create({ data: { obra_id: obraId, ...dados } });
  return buscarRecurso(obraId, recurso.id);
}

async function atualizarRecurso(obraId, recursoId, dados) {
  await prisma.recursoObraQqp.updateMany({ where: { id: recursoId, obra_id: obraId }, data: dados });
  return buscarRecurso(obraId, recursoId);
}

async function excluirRecurso(obraId, recursoId) {
  const resultado = await prisma.recursoObraQqp.deleteMany({ where: { id: recursoId, obra_id: obraId } });
  return resultado.count > 0;
}

/** Contrato da obra (os recursos só podem usar itens do QQP desse contrato). */
async function contratoDaObra(obraId) {
  const obra = await prisma.obra.findUnique({ where: { id: obraId }, select: { id: true, contrato_id: true } });
  return obra;
}

module.exports = {
  listarItens,
  buscarItem,
  buscarItemPorCodigo,
  criarItem,
  atualizarItem,
  excluirItem,
  listarRecursosDaObra,
  buscarRecurso,
  criarRecurso,
  atualizarRecurso,
  excluirRecurso,
  contratoDaObra,
};

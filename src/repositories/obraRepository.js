'use strict';

const prisma = require('../config/prisma');

/** Relações carregadas na listagem e no detalhe da obra. */
const INCLUDE_OBRA = {
  orcamento: {
    include: {
      orcamentista: { select: { nome: true } },
      planejador: { select: { nome: true } },
      fiscais: { orderBy: { id: 'asc' } },
    },
  },
  planejador: { select: { id: true, nome: true, email: true, matricula: true } },
  osi_emitida_usuario: { select: { nome: true } },
};

/**
 * Calcula a régua de pendências documentais obrigatórias (ISO 9001):
 * emissão da OSI e anexo da Ata de Reunião de Partida.
 */
function calcularPendencias(obra) {
  const osi = !obra.osi_emitida_em;
  const ata = !obra.ata_partida_url;
  return { osi, ata, total: (osi ? 1 : 0) + (ata ? 1 : 0), completa: !osi && !ata };
}

/**
 * Achata a obra e o orçamento relacionado em um único objeto — o front-end
 * consome os campos do projeto (pep, cliente, valor, foto_1) diretamente.
 *
 * `status` é SEMPRE o status operacional da obra (StatusObra); o status do
 * orçamento é exposto separadamente como `orcamento_status`.
 */
function mapearObra(registro) {
  if (!registro) {
    return null;
  }

  const { orcamento, planejador, osi_emitida_usuario, ...obra } = registro;

  const dadosOrcamento = orcamento
    ? {
        id: orcamento.id,
        pep: orcamento.pep,
        ss: orcamento.ss,
        cliente: orcamento.cliente,
        descricao: orcamento.descricao,
        endereco: orcamento.endereco,
        documentos_referencia: orcamento.documentos_referencia,
        status: orcamento.status,
        valor: orcamento.valor,
        art: orcamento.art,
        foto_1: orcamento.foto_1,
        foto_2: orcamento.foto_2,
        foto_3: orcamento.foto_3,
        created_at: orcamento.created_at,
        orcamentista_nome: orcamento.orcamentista ? orcamento.orcamentista.nome : null,
        planejador_nome: orcamento.planejador ? orcamento.planejador.nome : null,
        fiscais: (orcamento.fiscais || []).map(({ id, nome, contato }) => ({ id, nome, contato })),
      }
    : null;

  return {
    ...obra,
    planejador_nome: planejador ? planejador.nome : null,
    osi_emitida_por_nome: osi_emitida_usuario ? osi_emitida_usuario.nome : null,
    pendencias: calcularPendencias(obra),
    orcamento: dadosOrcamento,
    // Campos achatados do projeto (compatibilidade com os cards e o Kanban).
    pep: dadosOrcamento?.pep ?? null,
    ss: dadosOrcamento?.ss ?? null,
    cliente: dadosOrcamento?.cliente ?? null,
    descricao: dadosOrcamento?.descricao ?? null,
    endereco: dadosOrcamento?.endereco ?? null,
    documentos_referencia: dadosOrcamento?.documentos_referencia ?? null,
    valor: dadosOrcamento?.valor ?? 0,
    art: dadosOrcamento?.art ?? null,
    foto_1: dadosOrcamento?.foto_1 ?? null,
    foto_2: dadosOrcamento?.foto_2 ?? null,
    foto_3: dadosOrcamento?.foto_3 ?? null,
    orcamento_status: dadosOrcamento?.status ?? null,
    orcamentista_nome: dadosOrcamento?.orcamentista_nome ?? null,
    fiscais: dadosOrcamento?.fiscais ?? [],
  };
}

/**
 * Lista obras (projetos em execução) com paginação e filtros.
 * @param {{status?:string, pendencia?:string, busca?:string, pep?:string,
 *   page?:number, limit?:number}} filtros
 */
async function findAll(filtros = {}) {
  const { status, pendencia, busca, pep } = filtros;
  const page = filtros.page && filtros.page > 0 ? filtros.page : 1;
  const limit = filtros.limit && filtros.limit > 0 ? filtros.limit : 20;

  const where = {};

  if (status) {
    where.status = status;
  }

  // Régua de pendências documentais (OSI e Ata de Partida).
  if (pendencia === 'osi') {
    where.osi_emitida_em = null;
  } else if (pendencia === 'ata') {
    where.ata_partida_url = null;
  } else if (pendencia === 'pendentes') {
    where.OR = [{ osi_emitida_em: null }, { ata_partida_url: null }];
  } else if (pendencia === 'ok') {
    where.osi_emitida_em = { not: null };
    where.ata_partida_url = { not: null };
  }

  // Filtros sobre os dados do orçamento (relação 1:1).
  const filtroOrcamento = {};
  if (pep) {
    filtroOrcamento.pep = { contains: pep, mode: 'insensitive' };
  }
  if (busca) {
    filtroOrcamento.OR = [
      { pep: { contains: busca, mode: 'insensitive' } },
      { ss: { contains: busca, mode: 'insensitive' } },
      { cliente: { contains: busca, mode: 'insensitive' } },
      { descricao: { contains: busca, mode: 'insensitive' } },
    ];
  }
  if (Object.keys(filtroOrcamento).length > 0) {
    where.orcamento = { is: filtroOrcamento };
  }

  const [total, data] = await prisma.$transaction([
    prisma.obra.count({ where }),
    prisma.obra.findMany({
      where,
      include: INCLUDE_OBRA,
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: data.map((registro) => mapearObra(registro)),
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/** Busca uma obra pelo ID (com projeto, fiscais e revisões). */
async function findById(id) {
  const registro = await prisma.obra.findUnique({
    where: { id },
    include: {
      ...INCLUDE_OBRA,
      orcamento: {
        include: {
          orcamentista: { select: { nome: true } },
          planejador: { select: { nome: true } },
          fiscais: { orderBy: { id: 'asc' } },
          revisoes: {
            orderBy: { numero_revisao: 'asc' },
            include: { usuario: { select: { nome: true } } },
          },
        },
      },
    },
  });

  return mapearObra(registro);
}

/** Busca a obra de um orçamento. */
async function findByOrcamentoId(orcamentoId) {
  const registro = await prisma.obra.findUnique({
    where: { orcamento_id: orcamentoId },
    include: INCLUDE_OBRA,
  });
  return mapearObra(registro);
}

/**
 * Garante a existência da obra de um orçamento (idempotente).
 * Chamada quando um orçamento passa a integrar o ciclo de execução.
 */
async function garantirParaOrcamento(orcamentoId, dados = {}) {
  return prisma.obra.upsert({
    where: { orcamento_id: orcamentoId },
    update: {},
    create: {
      orcamento_id: orcamentoId,
      status: dados.status || 'PARA_INICIAR',
      planejador_id: dados.planejador_id ?? null,
    },
  });
}

/** Atualiza os campos operacionais da obra. */
async function update(id, dados) {
  return prisma.obra.update({ where: { id }, data: dados });
}

/**
 * Registra a emissão da OSI (número, data e responsável).
 */
async function registrarOsi(id, { numero, usuarioId }) {
  return prisma.obra.update({
    where: { id },
    data: {
      osi_numero: numero,
      osi_emitida_em: new Date(),
      osi_emitida_por: usuarioId ?? null,
    },
  });
}

module.exports = {
  findAll,
  findById,
  findByOrcamentoId,
  garantirParaOrcamento,
  update,
  registrarOsi,
  mapearObra,
  calcularPendencias,
};

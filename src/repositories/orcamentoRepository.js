'use strict';

const prisma = require('../config/prisma');

/**
 * Tempo máximo de uma transação interativa. O padrão do Prisma é 5 s, mas o
 * Neon (plano gratuito) pode levar alguns segundos para "acordar" após
 * inatividade, estourando o limite já na primeira escrita (erro P2028).
 */
const TRANSACAO_TIMEOUT_MS = 15000;

/**
 * Colunas do orçamento que podem ser atualizadas diretamente.
 * `valor` NÃO está aqui de propósito: toda alteração de valor passa
 * obrigatoriamente por addRevisao() (fluxo ISO 9001).
 * Os fiscais também não estão aqui: são uma relação 1:N tratada à parte.
 */
const CAMPOS_ATUALIZAVEIS = [
  'pep',
  'cliente',
  'ss',
  'descricao',
  'endereco',
  'documentos_referencia',
  'status',
  'art',
  'planejador_id',
  'foto_1',
  'foto_2',
  'foto_3',
];

/**
 * Relações carregadas no detalhe do orçamento. Os nomes são achatados em
 * `orcamentista_nome`, `planejador_nome` e `usuario_nome` pelo mapeador abaixo,
 * preservando o contrato consumido pelo front-end.
 */
const INCLUDE_DETALHE = {
  orcamentista: { select: { nome: true } },
  planejador: { select: { nome: true } },
  fiscais: { orderBy: { id: 'asc' } },
  revisoes: {
    orderBy: { numero_revisao: 'asc' },
    include: { usuario: { select: { nome: true } } },
  },
};

/**
 * Prefixo dos PEPs que, na importação do legado, receberam o código da
 * Solicitação de Serviço (SS/SSXX) por ausência de PEP real na planilha.
 * Eles nunca devem aparecer no seletor de PEP do formulário.
 */
const PREFIXO_PEP_FALLBACK = 'SS';

/** Quantidade de orçamentos retornados no ranking do Dashboard BI. */
const TOP_ORCAMENTOS = 10;

/** Normaliza uma lista de fiscais vinda do service ({nome, contato}). */
function normalizarFiscais(fiscais) {
  if (!Array.isArray(fiscais)) {
    return [];
  }

  return fiscais.map((fiscal) => ({
    nome: fiscal.nome,
    contato: fiscal.contato ?? null,
  }));
}

/** Achata as relações do Prisma no formato plano esperado pela API. */
function mapearOrcamento(registro) {
  if (!registro) {
    return null;
  }

  const { orcamentista, planejador, revisoes, fiscais, ...orcamento } = registro;

  return {
    ...orcamento,
    orcamentista_nome: orcamentista ? orcamentista.nome : null,
    planejador_nome: planejador ? planejador.nome : null,
    fiscais: (fiscais || []).map(({ id, nome, contato }) => ({ id, nome, contato })),
    revisoes: (revisoes || []).map(({ usuario, ...revisao }) => ({
      ...revisao,
      usuario_nome: usuario ? usuario.nome : null,
    })),
  };
}

/**
 * Busca um orçamento já mapeado. Aceita tanto o PrismaClient quanto o
 * client transacional (`tx`), permitindo reuso dentro de `$transaction`.
 */
async function buscarDetalhe(cliente, id) {
  const registro = await cliente.orcamento.findUnique({
    where: { id },
    include: INCLUDE_DETALHE,
  });
  return mapearOrcamento(registro);
}

/**
 * Cria um orçamento e sua revisão inicial (Rev 00) dentro de uma única transação.
 * @param {object} data
 * @returns {Promise<object>} orçamento criado + revisões
 */
async function create(data) {
  const fiscais = normalizarFiscais(data.fiscais);

  // Apenas as duas escritas ficam na transação. A leitura de detalhe (com
  // joins) é feita FORA dela: mantê-la dentro consumia a maior parte do tempo
  // e estourava o timeout padrão do Prisma no Neon "frio" (P2028).
  const orcamentoId = await prisma.$transaction(
    async (tx) => {
      const orcamento = await tx.orcamento.create({
        data: {
          pep: data.pep,
          cliente: data.cliente ?? null,
          ss: data.ss ?? null,
          descricao: data.descricao ?? null,
          endereco: data.endereco ?? null,
          documentos_referencia: data.documentos_referencia ?? null,
          status: data.status ?? 'VISITA_TECNICA',
          valor: data.valor ?? 0,
          art: data.art ?? null,
          orcamentista_id: data.orcamentista_id ?? null,
          planejador_id: data.planejador_id ?? null,
          foto_1: data.foto_1,
          foto_2: data.foto_2 ?? null,
          foto_3: data.foto_3 ?? null,
          fiscais: { create: fiscais },
        },
      });

      await tx.orcamentoRevisao.create({
        data: {
          orcamento_id: orcamento.id,
          numero_revisao: 0,
          valor: orcamento.valor,
          observacao: data.observacao_inicial || 'Revisão inicial (Rev 00)',
          usuario_id: data.orcamentista_id ?? null,
        },
      });

      return orcamento.id;
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );

  return buscarDetalhe(prisma, orcamentoId);
}

/**
 * Busca um orçamento pelo ID com seu histórico de revisões.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  return buscarDetalhe(prisma, id);
}

/**
 * Lista orçamentos com paginação e filtros opcionais.
 * @param {{status?:string, statuses?:string[], pep?:string, busca?:string,
 *   page?:number, limit?:number}} filtros
 *   `status` (único) tem precedência sobre `statuses` (lista do escopo).
 * @returns {Promise<{data:object[], total:number, page:number, limit:number, totalPages:number}>}
 */
async function findAll(filtros = {}) {
  const { status, statuses, pep, busca } = filtros;
  const page = filtros.page && filtros.page > 0 ? filtros.page : 1;
  const limit = filtros.limit && filtros.limit > 0 ? filtros.limit : 20;

  const where = {};

  if (status) {
    where.status = status;
  } else if (Array.isArray(statuses) && statuses.length > 0) {
    where.status = { in: statuses };
  }

  if (pep) {
    where.pep = { contains: pep, mode: 'insensitive' };
  }

  // Busca livre: PEP, descrição, SS ou cliente.
  if (busca) {
    where.OR = [
      { pep: { contains: busca, mode: 'insensitive' } },
      { descricao: { contains: busca, mode: 'insensitive' } },
      { ss: { contains: busca, mode: 'insensitive' } },
      { cliente: { contains: busca, mode: 'insensitive' } },
    ];
  }

  // count + página em uma única transação para leitura consistente.
  const [total, data] = await prisma.$transaction([
    prisma.orcamento.count({ where }),
    prisma.orcamento.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/**
 * Lista os valores distintos já usados no histórico, para popular os
 * dropdowns/autocompletes do formulário de novo orçamento.
 *
 * - PEPs: apenas códigos reais. Os registros do legado sem PEP na planilha
 *   receberam o código da SS (ex.: "SS013/25", "SSXX1/26") e são excluídos —
 *   a SS tem campo próprio no formulário.
 * - Fiscais: no PostgreSQL o `distinct` devolve uma linha por nome; o segundo
 *   critério de ordenação (`created_at desc`) garante que o contato retornado
 *   seja o do registro mais recente daquele fiscal.
 *
 * @returns {Promise<{peps:string[], fiscais:{nome:string, contato:string|null}[]}>}
 */
async function listarOpcoes() {
  const [peps, fiscais] = await prisma.$transaction([
    prisma.orcamento.findMany({
      where: { NOT: { pep: { startsWith: PREFIXO_PEP_FALLBACK, mode: 'insensitive' } } },
      distinct: ['pep'],
      select: { pep: true },
      orderBy: { pep: 'asc' },
    }),
    prisma.orcamentoFiscal.findMany({
      distinct: ['nome'],
      select: { nome: true, contato: true },
      orderBy: [{ nome: 'asc' }, { created_at: 'desc' }],
    }),
  ]);

  return {
    peps: peps.map((linha) => linha.pep),
    fiscais: fiscais.map((linha) => ({
      nome: linha.nome,
      contato: linha.contato ?? null,
    })),
  };
}

/**
 * Estatísticas gerenciais do módulo (Dashboard BI).
 *
 * As agregações são feitas no banco (COUNT/SUM/AVG + GROUP BY status), de modo
 * que os indicadores reflitam TODO o histórico, e não apenas a página corrente
 * da listagem paginada.
 *
 * @param {{de?:Date, ate?:Date, busca?:string}} filtros
 * @returns {Promise<{total:number, valorTotal:number, ticketMedio:number,
 *   porStatus:{status:string, quantidade:number, valor:number}[], top:object[]}>}
 */
async function obterEstatisticas(filtros = {}) {
  const { de, ate, busca } = filtros;
  const where = {};

  if (de || ate) {
    where.created_at = {};
    if (de) where.created_at.gte = de;
    if (ate) where.created_at.lte = ate;
  }

  if (busca) {
    where.OR = [
      { pep: { contains: busca, mode: 'insensitive' } },
      { descricao: { contains: busca, mode: 'insensitive' } },
      { ss: { contains: busca, mode: 'insensitive' } },
      { cliente: { contains: busca, mode: 'insensitive' } },
    ];
  }

  // Leitura consistente: resumo + distribuição + ranking no mesmo instante.
  const [resumo, porStatus, top] = await prisma.$transaction([
    prisma.orcamento.aggregate({
      where,
      _count: { _all: true },
      _sum: { valor: true },
      _avg: { valor: true },
    }),
    prisma.orcamento.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { valor: true },
    }),
    prisma.orcamento.findMany({
      where,
      orderBy: [{ valor: 'desc' }, { id: 'asc' }],
      take: TOP_ORCAMENTOS,
      select: {
        id: true,
        pep: true,
        ss: true,
        cliente: true,
        descricao: true,
        status: true,
        valor: true,
        foto_1: true,
      },
    }),
  ]);

  return {
    total: resumo._count._all,
    valorTotal: Number(resumo._sum.valor ?? 0),
    ticketMedio: Number(resumo._avg.valor ?? 0),
    porStatus: porStatus.map((linha) => ({
      status: linha.status,
      quantidade: linha._count._all,
      valor: Number(linha._sum.valor ?? 0),
    })),
    top: top.map((item) => ({ ...item, valor: Number(item.valor) })),
  };
}

/**
 * Atualiza apenas os campos permitidos do orçamento. Os fiscais são
 * substituídos integralmente quando `fiscais` é informado.
 * @param {number} id
 * @param {object} data
 * @returns {Promise<object|null>}
 */
async function update(id, data) {
  const { fiscais, ...campos } = data;
  const dados = {};

  for (const campo of CAMPOS_ATUALIZAVEIS) {
    if (Object.prototype.hasOwnProperty.call(campos, campo)) {
      dados[campo] = campos[campo];
    }
  }

  // Nada a atualizar: devolve o registro atual sem executar UPDATE vazio.
  if (fiscais === undefined && Object.keys(dados).length === 0) {
    return findById(id);
  }

  const temFiscais = fiscais !== undefined;

  // Escritas na transação; a leitura de detalhe fica fora (ver create()).
  await prisma.$transaction(
    async (tx) => {
      if (Object.keys(dados).length > 0) {
        await tx.orcamento.update({ where: { id }, data: dados });
      }

      if (temFiscais) {
        await tx.orcamentoFiscal.deleteMany({ where: { orcamento_id: id } });

        const lista = normalizarFiscais(fiscais);
        if (lista.length > 0) {
          await tx.orcamentoFiscal.createMany({
            data: lista.map((fiscal) => ({ ...fiscal, orcamento_id: id })),
          });
        }
      }
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );

  return findById(id);
}

/**
 * Adiciona uma nova revisão de valor calculando o próximo número sequencial
 * dentro de uma transação com lock na linha do orçamento.
 * @param {number} orcamentoId
 * @param {number|string} valor
 * @param {string} observacao
 * @param {number|null} usuarioId
 * @returns {Promise<object|null>} revisão criada (ou null se o orçamento não existir)
 */
async function addRevisao(orcamentoId, valor, observacao, usuarioId) {
  return prisma.$transaction(
    async (tx) => {
      // O Prisma não expõe lock de linha na API de queries; o lock pessimista
      // precisa de SQL parametrizado. Sem ele, dois pedidos concorrentes
      // calculariam o mesmo `numero_revisao` (violando a sequência ISO 9001).
      const linhas = await tx.$queryRaw`
        SELECT id FROM orcamentos WHERE id = ${orcamentoId} FOR UPDATE
      `;

      if (linhas.length === 0) {
        return null;
      }

      const agregado = await tx.orcamentoRevisao.aggregate({
        where: { orcamento_id: orcamentoId },
        _max: { numero_revisao: true },
      });
      const numeroRevisao = (agregado._max.numero_revisao ?? -1) + 1;

      const revisao = await tx.orcamentoRevisao.create({
        data: {
          orcamento_id: orcamentoId,
          numero_revisao: numeroRevisao,
          valor,
          observacao,
          usuario_id: usuarioId ?? null,
        },
      });

      await tx.orcamento.update({
        where: { id: orcamentoId },
        data: { valor },
      });

      return revisao;
    },
    { timeout: TRANSACAO_TIMEOUT_MS }
  );
}

module.exports = {
  create,
  findById,
  findAll,
  listarOpcoes,
  obterEstatisticas,
  update,
  addRevisao,
  CAMPOS_ATUALIZAVEIS,
};

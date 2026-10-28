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
 * Relações carregadas exclusivamente no detalhe da obra (GET /api/obras/:id).
 * A listagem permanece leve; os painéis analíticos, as localizações e os RDOs
 * só são carregados quando o usuário abre a página de detalhamento.
 */
const INCLUDE_DETALHE = {
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
  localizacoes: { orderBy: [{ created_at: 'asc' }, { id: 'asc' }] },
  avanco_fisico: { orderBy: [{ semana: 'asc' }, { id: 'asc' }] },
  relatorios: {
    orderBy: [{ data: 'desc' }, { id: 'desc' }],
    include: {
      autor: { select: { nome: true } },
      _count: {
        select: { atividades: true, ocorrencias: true, comentarios: true, midias: true },
      },
    },
  },
  atividades: {
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    include: { relatorio: { select: { id: true, titulo: true } } },
  },
  ocorrencias: {
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    include: { relatorio: { select: { id: true, titulo: true } } },
  },
  comentarios: {
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    include: {
      autor: { select: { nome: true } },
      relatorio: { select: { id: true, titulo: true } },
    },
  },
  midias: {
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    include: { relatorio: { select: { id: true, titulo: true } } },
  },
  _count: {
    select: {
      relatorios: true,
      atividades: true,
      ocorrencias: true,
      comentarios: true,
      midias: true,
    },
  },
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

/** Converte Decimal/null em número (ou null), preservando o contrato JSON. */
function numeroOuNulo(valor) {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function numero(valor) {
  return numeroOuNulo(valor) ?? 0;
}

function mapearLocalizacao(localizacao) {
  return {
    ...localizacao,
    latitude: numeroOuNulo(localizacao.latitude),
    longitude: numeroOuNulo(localizacao.longitude),
    km_inicial: numeroOuNulo(localizacao.km_inicial),
    km_final: numeroOuNulo(localizacao.km_final),
  };
}

function mapearAvanco(linha) {
  return {
    ...linha,
    fisico_prev: numero(linha.fisico_prev),
    fisico_lb_prev: numero(linha.fisico_lb_prev),
    fisico_real: numero(linha.fisico_real),
    fisico_tend_acum: numero(linha.fisico_tend_acum),
    fisico_prev_acum: numero(linha.fisico_prev_acum),
    fisico_real_acum: numero(linha.fisico_real_acum),
  };
}

function mapearRelatorio(relatorio) {
  const { autor, _count, ...dados } = relatorio;
  return {
    ...dados,
    autor_nome: autor?.nome ?? null,
    totais: {
      atividades: _count?.atividades ?? 0,
      ocorrencias: _count?.ocorrencias ?? 0,
      comentarios: _count?.comentarios ?? 0,
      midias: _count?.midias ?? 0,
    },
  };
}

/**
 * Resumo acumulado da Curva S: a última semana é o retrato atual da obra.
 */
function resumirAvanco(linhas = []) {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return {
      semanas: 0,
      semana_atual: null,
      data_atual: null,
      previsto_acum: 0,
      real_acum: 0,
      tendencia_acum: 0,
      lb_prev_acum: 0,
      desvio: 0,
    };
  }

  const ordenadas = [...linhas].sort((a, b) => a.semana - b.semana);
  const ultima = ordenadas[ordenadas.length - 1];
  const previstoAcum = numero(ultima.fisico_prev_acum);
  const realAcum = numero(ultima.fisico_real_acum);

  return {
    semanas: ordenadas.length,
    semana_atual: ultima.semana,
    data_atual: ultima.data,
    previsto_acum: previstoAcum,
    real_acum: realAcum,
    tendencia_acum: numero(ultima.fisico_tend_acum),
    lb_prev_acum: numero(ultima.fisico_lb_prev),
    desvio: Number((realAcum - previstoAcum).toFixed(2)),
  };
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

  const {
    orcamento,
    planejador,
    osi_emitida_usuario,
    _count,
    localizacoes,
    avanco_fisico,
    relatorios,
    atividades,
    ocorrencias,
    comentarios,
    midias,
    ...obra
  } = registro;

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
        revisoes: (orcamento.revisoes || []).map(({ usuario, ...revisao }) => ({
          ...revisao,
          usuario_nome: usuario ? usuario.nome : null,
        })),
      }
    : null;

  const localizacoesMapeadas = (localizacoes || []).map(mapearLocalizacao);
  const avancoMapeado = (avanco_fisico || []).map(mapearAvanco);
  const midiasMapeadas = midias || [];

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
    revisoes: dadosOrcamento?.revisoes ?? [],
    // Detalhamento (arrays vazios na listagem).
    localizacoes: localizacoesMapeadas,
    avanco_fisico: avancoMapeado,
    avanco_resumo: resumirAvanco(avancoMapeado),
    relatorios: (relatorios || []).map(mapearRelatorio),
    atividades: atividades || [],
    ocorrencias: ocorrencias || [],
    comentarios: comentarios || [],
    midias: midiasMapeadas,
    resumo: {
      relatorios: _count?.relatorios ?? relatorios?.length ?? 0,
      atividades: _count?.atividades ?? atividades?.length ?? 0,
      ocorrencias: _count?.ocorrencias ?? ocorrencias?.length ?? 0,
      comentarios: _count?.comentarios ?? comentarios?.length ?? 0,
      fotos: midiasMapeadas.filter((midia) => midia.tipo === 'FOTO').length,
      videos: midiasMapeadas.filter((midia) => midia.tipo === 'VIDEO').length,
    },
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

/** Busca uma obra pelo ID (com projeto, fiscais, revisões e detalhamento). */
async function findById(id) {
  const registro = await prisma.obra.findUnique({
    where: { id },
    include: INCLUDE_DETALHE,
  });

  return mapearObra(registro);
}

/** Verifica a existência da obra sem carregar o detalhamento completo. */
async function existsById(id) {
  const registro = await prisma.obra.findUnique({ where: { id }, select: { id: true } });
  return Boolean(registro);
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
async function registrarOsi(id, { numero: numeroOsi, usuarioId }) {
  return prisma.obra.update({
    where: { id },
    data: {
      osi_numero: numeroOsi,
      osi_emitida_em: new Date(),
      osi_emitida_por: usuarioId ?? null,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Localizações                                                               */
/* -------------------------------------------------------------------------- */

async function criarLocalizacao(obraId, dados) {
  return prisma.obraLocalizacao.create({ data: { obra_id: obraId, ...dados } });
}

async function atualizarLocalizacao(obraId, id, dados) {
  const resultado = await prisma.obraLocalizacao.updateMany({
    where: { id, obra_id: obraId },
    data: dados,
  });
  if (resultado.count === 0) return null;
  return prisma.obraLocalizacao.findUnique({ where: { id } });
}

async function removerLocalizacao(obraId, id) {
  const resultado = await prisma.obraLocalizacao.deleteMany({ where: { id, obra_id: obraId } });
  return resultado.count > 0;
}

async function buscarLocalizacao(obraId, id) {
  return prisma.obraLocalizacao.findFirst({ where: { id, obra_id: obraId } });
}

/* -------------------------------------------------------------------------- */
/* Avanço físico                                                              */
/* -------------------------------------------------------------------------- */

async function criarAvanco(obraId, dados) {
  return prisma.obraAvancoFisico.create({ data: { obra_id: obraId, ...dados } });
}

async function atualizarAvanco(obraId, id, dados) {
  const resultado = await prisma.obraAvancoFisico.updateMany({
    where: { id, obra_id: obraId },
    data: dados,
  });
  if (resultado.count === 0) return null;
  return prisma.obraAvancoFisico.findUnique({ where: { id } });
}

async function removerAvanco(obraId, id) {
  const resultado = await prisma.obraAvancoFisico.deleteMany({ where: { id, obra_id: obraId } });
  return resultado.count > 0;
}

async function buscarAvancoPorSemana(obraId, semana) {
  return prisma.obraAvancoFisico.findUnique({
    where: { uq_avanco_semana_por_obra: { obra_id: obraId, semana } },
  });
}

async function buscarUltimoAvanco(obraId, ignorarId = null) {
  return prisma.obraAvancoFisico.findFirst({
    where: { obra_id: obraId, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    orderBy: [{ semana: 'desc' }, { id: 'desc' }],
  });
}

async function buscarAvanco(obraId, id) {
  return prisma.obraAvancoFisico.findFirst({ where: { id, obra_id: obraId } });
}

async function buscarAvancoAnterior(obraId, semana, ignorarId = null) {
  return prisma.obraAvancoFisico.findFirst({
    where: {
      obra_id: obraId,
      semana: { lt: semana },
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
    orderBy: [{ semana: 'desc' }, { id: 'desc' }],
  });
}

async function listarAvanco(obraId) {
  return prisma.obraAvancoFisico.findMany({
    where: { obra_id: obraId },
    orderBy: [{ semana: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Recalcula os acumulados de todas as semanas da obra a partir dos valores
 * semanais. Mantém a Curva S consistente quando uma semana é criada, editada
 * ou removida no meio do histórico.
 */
async function recalcularAcumulados(obraId) {
  const linhas = await listarAvanco(obraId);

  let previsto = 0;
  let realizado = 0;
  const operacoes = [];

  for (const linha of linhas) {
    previsto = Number((previsto + Number(linha.fisico_prev || 0)).toFixed(2));
    realizado = Number((realizado + Number(linha.fisico_real || 0)).toFixed(2));

    if (
      Number(linha.fisico_prev_acum) !== previsto ||
      Number(linha.fisico_real_acum) !== realizado
    ) {
      operacoes.push(
        prisma.obraAvancoFisico.update({
          where: { id: linha.id },
          data: { fisico_prev_acum: previsto, fisico_real_acum: realizado },
        })
      );
    }
  }

  if (operacoes.length > 0) {
    await prisma.$transaction(operacoes);
  }

  return operacoes.length;
}

/* -------------------------------------------------------------------------- */
/* Relatórios (RDO)                                                           */
/* -------------------------------------------------------------------------- */

async function criarRelatorio(obraId, dados) {
  return prisma.obraRelatorio.create({ data: { obra_id: obraId, ...dados } });
}

async function atualizarRelatorio(obraId, id, dados) {
  const resultado = await prisma.obraRelatorio.updateMany({
    where: { id, obra_id: obraId },
    data: dados,
  });
  if (resultado.count === 0) return null;
  return prisma.obraRelatorio.findUnique({ where: { id } });
}

async function removerRelatorio(obraId, id) {
  const resultado = await prisma.obraRelatorio.deleteMany({ where: { id, obra_id: obraId } });
  return resultado.count > 0;
}

async function buscarRelatorio(obraId, id) {
  return prisma.obraRelatorio.findFirst({ where: { id, obra_id: obraId } });
}

/* -------------------------------------------------------------------------- */
/* Atividades                                                                 */
/* -------------------------------------------------------------------------- */

async function criarAtividade(obraId, dados) {
  return prisma.obraAtividade.create({ data: { obra_id: obraId, ...dados } });
}

async function atualizarAtividade(obraId, id, dados) {
  const resultado = await prisma.obraAtividade.updateMany({
    where: { id, obra_id: obraId },
    data: dados,
  });
  if (resultado.count === 0) return null;
  return prisma.obraAtividade.findUnique({ where: { id } });
}

async function removerAtividade(obraId, id) {
  const resultado = await prisma.obraAtividade.deleteMany({ where: { id, obra_id: obraId } });
  return resultado.count > 0;
}

/* -------------------------------------------------------------------------- */
/* Ocorrências                                                                */
/* -------------------------------------------------------------------------- */

async function criarOcorrencia(obraId, dados) {
  return prisma.obraOcorrencia.create({ data: { obra_id: obraId, ...dados } });
}

async function removerOcorrencia(obraId, id) {
  const resultado = await prisma.obraOcorrencia.deleteMany({ where: { id, obra_id: obraId } });
  return resultado.count > 0;
}

/* -------------------------------------------------------------------------- */
/* Comentários                                                                */
/* -------------------------------------------------------------------------- */

async function criarComentario(obraId, dados) {
  return prisma.obraComentario.create({ data: { obra_id: obraId, ...dados } });
}

async function removerComentario(obraId, id) {
  const resultado = await prisma.obraComentario.deleteMany({ where: { id, obra_id: obraId } });
  return resultado.count > 0;
}

/* -------------------------------------------------------------------------- */
/* Mídias                                                                     */
/* -------------------------------------------------------------------------- */

async function criarMidia(obraId, dados) {
  return prisma.obraMidia.create({ data: { obra_id: obraId, ...dados } });
}

async function removerMidia(obraId, id) {
  const resultado = await prisma.obraMidia.deleteMany({ where: { id, obra_id: obraId } });
  return resultado.count > 0;
}

module.exports = {
  findAll,
  findById,
  existsById,
  findByOrcamentoId,
  garantirParaOrcamento,
  update,
  registrarOsi,
  mapearObra,
  calcularPendencias,
  resumirAvanco,
  // Localizações
  criarLocalizacao,
  atualizarLocalizacao,
  removerLocalizacao,
  buscarLocalizacao,
  // Avanço físico
  criarAvanco,
  atualizarAvanco,
  removerAvanco,
  buscarAvancoPorSemana,
  buscarUltimoAvanco,
  buscarAvanco,
  buscarAvancoAnterior,
  listarAvanco,
  recalcularAcumulados,
  // Relatórios
  criarRelatorio,
  atualizarRelatorio,
  removerRelatorio,
  buscarRelatorio,
  // Atividades
  criarAtividade,
  atualizarAtividade,
  removerAtividade,
  // Ocorrências
  criarOcorrencia,
  removerOcorrencia,
  // Comentários
  criarComentario,
  removerComentario,
  // Mídias
  criarMidia,
  removerMidia,
};

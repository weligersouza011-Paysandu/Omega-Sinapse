'use strict';

const dashboardRepository = require('../repositories/dashboardRepository');
const obraRepository = require('../repositories/obraRepository');
const AppError = require('../errors/AppError');
const { obterOsiImportada } = require('../config/osiImportadas');

/**
 * Regras do Dashboard Executivo de Planejamento (Omega Sinapse CT251).
 *
 * O dashboard consolida o ciclo de execução em uma única resposta:
 *  - obras + localizações georreferenciadas (mapa geral);
 *  - avanço físico acumulado (indicadores e Curva S);
 *  - restrições 6WLA cadastradas + pendências documentais derivadas.
 */

const STATUS_OBRA = [
  { value: 'PARA_INICIAR', label: 'Para Iniciar', cor: 'slate' },
  { value: 'EM_ANDAMENTO', label: 'Em Andamento', cor: 'blue' },
  { value: 'PARALISADA', label: 'Paralisada', cor: 'amber' },
  { value: 'CONCLUIDA', label: 'Concluída', cor: 'emerald' },
];

const CATEGORIAS = [
  {
    value: 'CADEIA_DE_AJUDA',
    label: 'Cadeia de Ajuda',
    descricao: 'Serviços de apoio e frentes de ajuda operacional.',
    cor: 'violet',
  },
  {
    value: 'CARTEIRA_DA_COORDENACAO',
    label: 'Carteira da Coordenação',
    descricao: 'Obras conduzidas diretamente pela coordenação de planejamento.',
    cor: 'cyan',
  },
];

const STATUS_RESTRICAO = {
  PENDENTE: { label: 'Pendente', cor: 'red' },
  EM_ANDAMENTO: { label: 'Em Andamento', cor: 'amber' },
  RESOLVIDA: { label: 'Resolvida', cor: 'emerald' },
  CANCELADA: { label: 'Cancelada', cor: 'slate' },
};

const STATUS_RESTRICAO_VALIDOS = Object.keys(STATUS_RESTRICAO);

/** Tolerância (pontos percentuais) para considerar uma obra desviada. */
const TOLERANCIA_DESVIO = 2;

/** Limite para desvio crítico (pontos percentuais). */
const LIMITE_DESVIO_CRITICO = 10;

/* -------------------------------------------------------------------------- */
/* Helpers numéricos / datas                                                  */
/* -------------------------------------------------------------------------- */

function numero(valor, fallback = 0) {
  if (valor === null || valor === undefined || valor === '') return fallback;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : fallback;
}

function numeroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function arredondar(valor, casas = 2) {
  const convertido = Number(valor);
  if (!Number.isFinite(convertido)) return 0;
  return Number(convertido.toFixed(casas));
}

function media(valores = []) {
  const validos = valores.filter((valor) => Number.isFinite(valor));
  if (validos.length === 0) return 0;
  return arredondar(validos.reduce((soma, valor) => soma + valor, 0) / validos.length);
}

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function dataISO(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString().slice(0, 10);
}

function anoDaData(valor) {
  const iso = dataISO(valor);
  return iso ? Number(iso.slice(0, 4)) : null;
}

function rotuloSemana(semana, data) {
  const numeroSemana = Number(semana);
  if (!Number.isFinite(numeroSemana) || numeroSemana <= 0) return '—';
  const ano = anoDaData(data);
  return ano ? `S${numeroSemana}/${ano}` : `S${numeroSemana}`;
}

/** Calcula a semana ISO 8601 (1..53) de uma data sem deslocamento de fuso. */
function semanaDaData(valor) {
  const texto = dataISO(valor);
  if (!texto) return 0;

  const data = new Date(`${texto}T12:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return 0;

  const alvo = new Date(data.valueOf());
  const diaDaSemana = (data.getUTCDay() + 6) % 7;
  alvo.setUTCDate(alvo.getUTCDate() - diaDaSemana + 3);

  const primeiraQuinta = new Date(Date.UTC(alvo.getUTCFullYear(), 0, 4));
  return 1 + Math.round((alvo - primeiraQuinta) / 604800000);
}

function dataHojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizarBusca(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Mapeamento das obras                                                       */
/* -------------------------------------------------------------------------- */

function statusInfo(valor) {
  return STATUS_OBRA.find((item) => item.value === valor) || {
    value: valor || 'DESCONHECIDO',
    label: valor || '—',
    cor: 'slate',
  };
}

function categoriaDaObra(obra) {
  if (obra.categoria) {
    return {
      ...CATEGORIAS.find((item) => item.value === obra.categoria),
      derivada: false,
    };
  }

  // Fallback determinístico enquanto a classificação não é cadastrada:
  // obras com OSI/medições integram a carteira da coordenação; as demais
  // ficam na cadeia de ajuda. O campo pode ser sobrescrito em `obras.categoria`.
  const temOsi = Boolean(obra.osi_numero || obterOsiImportada(obra.id));
  const temMedicao = Array.isArray(obra.avanco_fisico) && obra.avanco_fisico.length > 0;
  const categoria = temOsi || temMedicao ? 'CARTEIRA_DA_COORDENACAO' : 'CADEIA_DE_AJUDA';

  return {
    ...CATEGORIAS.find((item) => item.value === categoria),
    derivada: true,
  };
}

function mapearLocalizacao(localizacao) {
  return {
    id: localizacao.id,
    descricao: localizacao.descricao,
    tipo: localizacao.tipo,
    latitude: numeroOuNulo(localizacao.latitude),
    longitude: numeroOuNulo(localizacao.longitude),
    km_inicial: numeroOuNulo(localizacao.km_inicial),
    km_final: numeroOuNulo(localizacao.km_final),
    referencia: localizacao.referencia || null,
  };
}

function mapearPontoCurva(linha) {
  const data = dataISO(linha.data);
  return {
    id: linha.id,
    data,
    semana: Number(linha.semana) || null,
    ano: anoDaData(linha.data),
    rotulo: rotuloSemana(linha.semana, linha.data),
    previsto: numero(linha.fisico_prev_acum),
    real: numero(linha.fisico_real_acum),
    tendencia: numero(linha.fisico_tend_acum),
    lb_previsto: numero(linha.fisico_lb_prev),
  };
}

function mapearRestricaoCadastrada(restricao, obra) {
  const status = STATUS_RESTRICAO[restricao.status] || STATUS_RESTRICAO.PENDENTE;
  const prazo = dataISO(restricao.prazo);
  const aberta = restricao.status === 'PENDENTE' || restricao.status === 'EM_ANDAMENTO';

  return {
    id: `restricao-${restricao.id}`,
    restricao_id: restricao.id,
    tipo: 'CADASTRADA',
    origem: '6WLA',
    origem_label: 'Restrição 6WLA',
    obra_id: obra.id,
    osi: obra.osi,
    ss: obra.ss,
    obra_descricao: obra.descricao,
    etapa: restricao.etapa || '—',
    atividade: restricao.atividade,
    descricao: restricao.descricao,
    plano_acao: restricao.plano_acao || '—',
    responsavel: restricao.responsavel || '—',
    empresa_responsavel: restricao.empresa_responsavel || '—',
    status: restricao.status,
    status_label: status.label,
    status_cor: status.cor,
    prazo,
    atrasada: Boolean(aberta && prazo && prazo < dataHojeISO()),
    created_at: restricao.created_at,
    updated_at: restricao.updated_at,
  };
}

/** Pendências documentais derivadas (OSI/Ata) exibidas junto às restrições. */
function restricoesDerivadas(obra) {
  const itens = [];
  const responsavel = obra.planejador || 'Coordenação de Planejamento';

  if (!obra.osi_emitida_em) {
    itens.push({
      id: `pendencia-${obra.id}-osi`,
      restricao_id: null,
      tipo: 'DERIVADA',
      origem: 'PENDENCIA_DOCUMENTAL',
      origem_label: 'Pendência documental',
      obra_id: obra.id,
      osi: obra.osi,
      ss: obra.ss,
      obra_descricao: obra.descricao,
      etapa: 'Mobilização e Partida',
      atividade: 'Emissão da OSI',
      descricao: `OSI não emitida para a obra ${obra.ss || obra.osi || `#${obra.id}`}.`,
      plano_acao: 'Emitir a OSI no sistema e anexar o comprovante à obra.',
      responsavel,
      empresa_responsavel: 'Omega Service',
      status: 'PENDENTE',
      status_label: 'Pendente',
      status_cor: 'red',
      prazo: null,
      atrasada: false,
      created_at: null,
      updated_at: null,
    });
  }

  if (!obra.ata_partida_url) {
    itens.push({
      id: `pendencia-${obra.id}-ata`,
      restricao_id: null,
      tipo: 'DERIVADA',
      origem: 'PENDENCIA_DOCUMENTAL',
      origem_label: 'Pendência documental',
      obra_id: obra.id,
      osi: obra.osi,
      ss: obra.ss,
      obra_descricao: obra.descricao,
      etapa: 'Mobilização e Partida',
      atividade: 'Ata de Reunião de Partida',
      descricao: `Ata de Reunião de Partida não anexada à obra ${obra.ss || obra.osi || `#${obra.id}`}.`,
      plano_acao: 'Anexar a Ata de Reunião de Partida assinada e registrar a data de partida.',
      responsavel,
      empresa_responsavel: 'Omega Service',
      status: 'PENDENTE',
      status_label: 'Pendente',
      status_cor: 'red',
      prazo: null,
      atrasada: false,
      created_at: null,
      updated_at: null,
    });
  }

  return itens;
}

/** Converte atividades em aberto em restrições operacionais (quando existirem). */
function restricoesDeAtividades(obra) {
  return (obra.atividades || []).map((atividade) => {
    const status =
      atividade.status === 'EM_ANDAMENTO' ? STATUS_RESTRICAO.EM_ANDAMENTO : STATUS_RESTRICAO.PENDENTE;
    const prazo = dataISO(atividade.prazo);

    return {
      id: `atividade-${atividade.id}`,
      restricao_id: null,
      tipo: 'ATIVIDADE',
      origem: 'ATIVIDADE',
      origem_label: 'Atividade em aberto',
      obra_id: obra.id,
      osi: obra.osi,
      ss: obra.ss,
      obra_descricao: obra.descricao,
      etapa: 'Execução',
      atividade: atividade.titulo,
      descricao: atividade.descricao || `Atividade "${atividade.titulo}" ainda não concluída.`,
      plano_acao: 'Concluir a atividade e registrar a evidência no RDO.',
      responsavel: atividade.responsavel || obra.planejador || 'Coordenação de Planejamento',
      empresa_responsavel: 'Omega Service',
      status: atividade.status === 'EM_ANDAMENTO' ? 'EM_ANDAMENTO' : 'PENDENTE',
      status_label: status.label,
      status_cor: status.cor,
      prazo,
      atrasada: Boolean(prazo && prazo < dataHojeISO()),
      created_at: atividade.created_at,
      updated_at: null,
    };
  });
}

function mapearObra(registro) {
  const categoria = categoriaDaObra(registro);
  const status = statusInfo(registro.status);
  const avanco = (registro.avanco_fisico || []).map(mapearPontoCurva);
  const ultimo = avanco.length > 0 ? avanco[avanco.length - 1] : null;
  const previsto = ultimo?.previsto ?? null;
  const real = ultimo?.real ?? null;
  const tendencia = ultimo?.tendencia ?? null;
  const desvio =
    previsto !== null && real !== null ? arredondar(real - previsto) : null;
  const aderencia =
    previsto !== null && real !== null && previsto > 0
      ? arredondar(limitar((real / previsto) * 100, 0, 100))
      : previsto !== null && real !== null && real >= 100
        ? 100
        : null;

  const localizacoes = (registro.localizacoes || []).map(mapearLocalizacao);
  const coordenadas = localizacoes.filter(
    (localizacao) => localizacao.latitude !== null && localizacao.longitude !== null
  );
  const centro =
    coordenadas.length > 0
      ? [
          arredondar(
            coordenadas.reduce((soma, localizacao) => soma + localizacao.latitude, 0) /
              coordenadas.length,
            6
          ),
          arredondar(
            coordenadas.reduce((soma, localizacao) => soma + localizacao.longitude, 0) /
              coordenadas.length,
            6
          ),
        ]
      : null;

  const orcamento = registro.orcamento || {};
  const fiscais = (orcamento.fiscais || []).map((fiscal) => fiscal.nome);
  const osiSistema = registro.osi_numero || null;
  const osiImportada = obterOsiImportada(registro.id);

  return {
    id: registro.id,
    osi: osiSistema || osiImportada || null,
    osi_origem: osiSistema ? 'SISTEMA' : osiImportada ? 'IMPORTACAO' : null,
    ss: orcamento.ss || null,
    pep: orcamento.pep || null,
    descricao: orcamento.descricao || null,
    cliente: orcamento.cliente || null,
    endereco: orcamento.endereco || null,
    valor: numero(orcamento.valor),
    status: status.value,
    status_label: status.label,
    status_cor: status.cor,
    categoria: categoria.value,
    categoria_label: categoria.label,
    categoria_cor: categoria.cor,
    categoria_derivada: categoria.derivada,
    planejador: registro.planejador?.nome || null,
    planejador_id: registro.planejador?.id || null,
    fiscais,
    fiscal: fiscais[0] || null,
    osi_emitida_em: registro.osi_emitida_em,
    ata_partida_url: registro.ata_partida_url || null,
    tem_osi: Boolean(registro.osi_emitida_em || osiSistema || osiImportada),
    tem_ata: Boolean(registro.ata_partida_url),
    localizacoes,
    quantidade_localizacoes: localizacoes.length,
    centro,
    avanco_fisico: avanco,
    tem_medicao: Boolean(ultimo),
    ultima_medicao: ultimo,
    semanas_medidas: avanco.length,
    previsto,
    real,
    tendencia,
    desvio,
    aderencia,
    atividades_abertas: (registro.atividades || []).length,
    ocorrencias: (registro.ocorrencias || []).map((ocorrencia) => ({
      id: ocorrencia.id,
      descricao: ocorrencia.descricao,
      gravidade: ocorrencia.gravidade,
      created_at: ocorrencia.created_at,
    })),
    restricoes: (registro.restricoes || []).map((restricao) =>
      mapearRestricaoCadastrada(restricao, {
        id: registro.id,
        osi: osiSistema || osiImportada || null,
        ss: orcamento.ss || null,
        descricao: orcamento.descricao || null,
        planejador: registro.planejador?.nome || null,
      })
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Filtros e opções                                                           */
/* -------------------------------------------------------------------------- */

function filtrarObras(obras, filtros = {}) {
  const status = filtros.status ? String(filtros.status).toUpperCase() : '';
  const categoria = filtros.categoria ? String(filtros.categoria).toUpperCase() : '';
  const busca = normalizarBusca(filtros.busca);

  return obras.filter((obra) => {
    if (status && obra.status !== status) return false;
    if (categoria && obra.categoria !== categoria) return false;

    if (!busca) return true;

    const texto = normalizarBusca(
      [
        obra.osi,
        obra.ss,
        obra.pep,
        obra.descricao,
        obra.cliente,
        obra.planejador,
        obra.fiscal,
        obra.status_label,
        obra.categoria_label,
      ]
        .filter(Boolean)
        .join(' ')
    );

    return texto.includes(busca);
  });
}

function montarOpcoes(obras) {
  return {
    status: STATUS_OBRA.map((status) => ({
      ...status,
      total: obras.filter((obra) => obra.status === status.value).length,
    })),
    categorias: CATEGORIAS.map((categoria) => ({
      value: categoria.value,
      label: categoria.label,
      descricao: categoria.descricao,
      cor: categoria.cor,
      total: obras.filter((obra) => obra.categoria === categoria.value).length,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Indicadores                                                                */
/* -------------------------------------------------------------------------- */

function montarFaixasDesvio(obrasComMedicao) {
  const criticos = obrasComMedicao.filter(
    (obra) => obra.desvio !== null && obra.desvio <= -LIMITE_DESVIO_CRITICO
  ).length;
  const atencao = obrasComMedicao.filter(
    (obra) =>
      obra.desvio !== null &&
      obra.desvio < -TOLERANCIA_DESVIO &&
      obra.desvio > -LIMITE_DESVIO_CRITICO
  ).length;
  const dentro = obrasComMedicao.filter(
    (obra) => obra.desvio !== null && obra.desvio >= -TOLERANCIA_DESVIO
  ).length;

  return [
    {
      id: 'critico',
      label: `Desvio crítico (≤ -${LIMITE_DESVIO_CRITICO} p.p.)`,
      total: criticos,
      cor: 'red',
    },
    {
      id: 'atencao',
      label: `Atenção (-${LIMITE_DESVIO_CRITICO} a -${TOLERANCIA_DESVIO} p.p.)`,
      total: atencao,
      cor: 'amber',
    },
    {
      id: 'dentro',
      label: `Dentro da tolerância (> -${TOLERANCIA_DESVIO} p.p.)`,
      total: dentro,
      cor: 'emerald',
    },
  ];
}

function montarResumo(obras) {
  const comMedicao = obras.filter(
    (obra) => obra.tem_medicao && obra.aderencia !== null && obra.desvio !== null
  );
  const aderenciaGeral = media(comMedicao.map((obra) => obra.aderencia));
  const obrasComDesvio = comMedicao.filter((obra) => obra.desvio < -TOLERANCIA_DESVIO);
  const percentualDesvio =
    comMedicao.length > 0 ? arredondar((obrasComDesvio.length / comMedicao.length) * 100) : 0;
  const desvioTotal = arredondar(
    comMedicao.reduce((soma, obra) => soma + Math.abs(Math.min(0, obra.desvio)), 0)
  );

  const restricoesCadastradas = obras.reduce(
    (total, obra) => total + (obra.restricoes?.length || 0),
    0
  );
  const pendenciasDocumentais = obras.reduce(
    (total, obra) => total + (obra.tem_osi ? 0 : 1) + (obra.tem_ata ? 0 : 1),
    0
  );
  const retrabalhos = obras.reduce(
    (total, obra) =>
      total +
      (obra.ocorrencias || []).filter((ocorrencia) =>
        ['ALTA', 'CRITICA'].includes(ocorrencia.gravidade)
      ).length,
    0
  );

  const ultimaMedicao = comMedicao
    .map((obra) => obra.ultima_medicao?.data)
    .filter(Boolean)
    .sort()
    .pop();

  return {
    total_obras: obras.length,
    com_medicao: comMedicao.length,
    sem_medicao: obras.length - comMedicao.length,
    aderencia_geral: aderenciaGeral,
    aderencia_meta: 90,
    aderencia_limites: { inferior: 0, superior: 100 },
    previsto_medio: media(comMedicao.map((obra) => obra.previsto)),
    real_medio: media(comMedicao.map((obra) => obra.real)),
    tendencia_media: media(comMedicao.map((obra) => obra.tendencia)),
    desvio_medio: media(comMedicao.map((obra) => obra.desvio)),
    obras_com_desvio: obrasComDesvio.length,
    percentual_obras_com_desvio: percentualDesvio,
    desvio_total_pp: desvioTotal,
    limite_desvio_pp: TOLERANCIA_DESVIO,
    faixas_desvio: montarFaixasDesvio(comMedicao),
    restricoes_cadastradas: restricoesCadastradas,
    restricoes_abertas: restricoesCadastradas + pendenciasDocumentais,
    pendencias_documentais: pendenciasDocumentais,
    retrabalhos,
    ultima_medicao: ultimaMedicao || null,
    por_status: STATUS_OBRA.map((status) => ({
      status: status.value,
      label: status.label,
      cor: status.cor,
      total: obras.filter((obra) => obra.status === status.value).length,
    })),
    por_categoria: CATEGORIAS.map((categoria) => ({
      categoria: categoria.value,
      label: categoria.label,
      cor: categoria.cor,
      total: obras.filter((obra) => obra.categoria === categoria.value).length,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Curva S consolidada                                                        */
/* -------------------------------------------------------------------------- */

function montarCurvaS(obras) {
  const porObra = obras
    .filter((obra) => obra.avanco_fisico.length > 0)
    .map((obra) => ({
      obra_id: obra.id,
      osi: obra.osi,
      ss: obra.ss,
      descricao: obra.descricao,
      status: obra.status,
      status_label: obra.status_label,
      categoria: obra.categoria,
      pontos: obra.avanco_fisico,
    }));

  const datas = [...new Set(porObra.flatMap((serie) => serie.pontos.map((ponto) => ponto.data)))]
    .filter(Boolean)
    .sort();

  const ponteiros = porObra.map(() => 0);
  const consolidada = [];

  for (const data of datas) {
    const somas = { previsto: 0, real: 0, tendencia: 0, lb_previsto: 0 };
    let consideradas = 0;

    porObra.forEach((serie, indice) => {
      let ponteiro = ponteiros[indice];

      while (
        ponteiro + 1 < serie.pontos.length &&
        serie.pontos[ponteiro + 1].data <= data
      ) {
        ponteiro += 1;
      }

      ponteiros[indice] = ponteiro;
      const ponto = serie.pontos[ponteiro];
      if (!ponto || ponto.data > data) return;

      somas.previsto += numero(ponto.previsto);
      somas.real += numero(ponto.real);
      somas.tendencia += numero(ponto.tendencia);
      somas.lb_previsto += numero(ponto.lb_previsto);
      consideradas += 1;
    });

    if (consideradas === 0) continue;

    consolidada.push({
      id: `consolidado-${data}`,
      data,
      rotulo: rotuloSemana(semanaDaData(data), data),
      ano: anoDaData(data),
      previsto: arredondar(somas.previsto / consideradas),
      real: arredondar(somas.real / consideradas),
      tendencia: arredondar(somas.tendencia / consideradas),
      lb_previsto: arredondar(somas.lb_previsto / consideradas),
      obras: consideradas,
    });
  }

  return {
    consolidada,
    por_obra: porObra,
    total_obras: porObra.length,
    data_inicio: consolidada[0]?.data || null,
    data_fim: consolidada[consolidada.length - 1]?.data || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Restrições 6WLA                                                            */
/* -------------------------------------------------------------------------- */

const PESO_STATUS_RESTRICAO = {
  PENDENTE: 0,
  EM_ANDAMENTO: 1,
  RESOLVIDA: 2,
  CANCELADA: 3,
};

function montarRestricoes(obras) {
  const cadastradas = obras.flatMap((obra) => obra.restricoes || []);
  const derivadas = obras.flatMap((obra) => [
    ...restricoesDeAtividades(obra),
    ...restricoesDerivadas(obra),
  ]);
  const itens = [...cadastradas, ...derivadas].sort((a, b) => {
    const pesoA = PESO_STATUS_RESTRICAO[a.status] ?? 9;
    const pesoB = PESO_STATUS_RESTRICAO[b.status] ?? 9;
    if (pesoA !== pesoB) return pesoA - pesoB;

    if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
    if (a.prazo) return -1;
    if (b.prazo) return 1;

    return String(a.osi || '').localeCompare(String(b.osi || ''));
  });

  return {
    itens,
    cadastradas: cadastradas.length,
    derivadas: derivadas.length,
    abertas: itens.filter((item) => ['PENDENTE', 'EM_ANDAMENTO'].includes(item.status)).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Mapa geral                                                                 */
/* -------------------------------------------------------------------------- */

function montarMapa(obras) {
  const pontos = obras.flatMap((obra) =>
    obra.localizacoes.map((localizacao) => ({
      ...localizacao,
      obra_id: obra.id,
      osi: obra.osi,
      ss: obra.ss,
      descricao_obra: obra.descricao,
      status: obra.status,
      status_label: obra.status_label,
      categoria: obra.categoria,
      categoria_label: obra.categoria_label,
    }))
  );

  const coordenadas = pontos
    .filter((ponto) => ponto.latitude !== null && ponto.longitude !== null)
    .map((ponto) => [ponto.latitude, ponto.longitude]);

  if (coordenadas.length === 0) {
    return { total_obras: 0, total_pontos: 0, bounds: null, pontos: [] };
  }

  const latitudes = coordenadas.map(([latitude]) => latitude);
  const longitudes = coordenadas.map(([, longitude]) => longitude);

  return {
    total_obras: new Set(pontos.map((ponto) => ponto.obra_id)).size,
    total_pontos: pontos.length,
    bounds: [
      [Math.min(...latitudes), Math.min(...longitudes)],
      [Math.max(...latitudes), Math.max(...longitudes)],
    ],
    pontos,
  };
}

/* -------------------------------------------------------------------------- */
/* Caso de uso                                                                */
/* -------------------------------------------------------------------------- */

function validarFiltros(query = {}) {
  const status = query.status ? String(query.status).trim().toUpperCase() : '';
  if (status && !STATUS_OBRA.some((item) => item.value === status)) {
    throw new AppError(
      400,
      `Status inválido. Valores aceitos: ${STATUS_OBRA.map((item) => item.value).join(', ')}.`
    );
  }

  const categoria = query.categoria ? String(query.categoria).trim().toUpperCase() : '';
  if (categoria && !CATEGORIAS.some((item) => item.value === categoria)) {
    throw new AppError(
      400,
      `Categoria inválida. Valores aceitos: ${CATEGORIAS.map((item) => item.value).join(', ')}.`
    );
  }

  return {
    status,
    categoria,
    busca: query.busca ? String(query.busca).trim() : '',
  };
}

/** GET /api/dashboard — payload único do Dashboard de Planejamento. */
async function obterDashboard(query = {}) {
  const filtros = validarFiltros(query);
  const registros = await dashboardRepository.findAll();
  const todas = registros.map(mapearObra);
  const obras = filtrarObras(todas, filtros);
  const resumo = montarResumo(obras);
  const curva = montarCurvaS(obras);
  const restricoes = montarRestricoes(obras);
  const mapa = montarMapa(obras);

  resumo.restricoes_abertas = restricoes.abertas;
  resumo.restricoes_total = restricoes.itens.length;
  resumo.restricoes_derivadas = restricoes.derivadas;

  return {
    gerado_em: new Date().toISOString(),
    filtros,
    opcoes: montarOpcoes(todas),
    resumo,
    obras,
    mapa,
    curva_s: curva,
    restricoes: restricoes.itens,
    resumo_restricoes: {
      total: restricoes.itens.length,
      cadastradas: restricoes.cadastradas,
      derivadas: restricoes.derivadas,
      abertas: restricoes.abertas,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* CRUD de restrições 6WLA                                                    */
/* -------------------------------------------------------------------------- */

/** Perfis autorizados a manter restrições 6WLA. */
const PERFIS_ESCRITA_RESTRICAO = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

function validarId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser um número inteiro positivo.`);
  }
  return numero;
}

function exigirEscritaRestricao(usuario) {
  if (!usuario || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!PERFIS_ESCRITA_RESTRICAO.includes(usuario.perfil)) {
    throw new AppError(
      403,
      `Apenas perfis ${PERFIS_ESCRITA_RESTRICAO.join(', ')} podem manter restrições 6WLA.`
    );
  }
}

async function garantirObra(obraIdParam) {
  const obraId = validarId(obraIdParam, 'id');
  if (!(await obraRepository.existsById(obraId))) {
    throw new AppError(404, `Obra ${obraId} não encontrada.`);
  }
  return obraId;
}

function limparTexto(valor, limite) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  return limite ? texto.slice(0, limite) : texto;
}

function normalizarPayloadRestricao(payload = {}) {
  const dados = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'etapa')) {
    dados.etapa = limparTexto(payload.etapa, 120);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'atividade')) {
    dados.atividade = limparTexto(payload.atividade, 200);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'descricao')) {
    dados.descricao = limparTexto(payload.descricao);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'plano_acao')) {
    dados.plano_acao = limparTexto(payload.plano_acao);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'responsavel')) {
    dados.responsavel = limparTexto(payload.responsavel, 120);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'empresa_responsavel')) {
    dados.empresa_responsavel = limparTexto(payload.empresa_responsavel, 120);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    const status = String(payload.status || '').trim().toUpperCase();
    if (!STATUS_RESTRICAO_VALIDOS.includes(status)) {
      throw new AppError(
        400,
        `Status da restrição inválido. Valores aceitos: ${STATUS_RESTRICAO_VALIDOS.join(', ')}.`
      );
    }
    dados.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'prazo')) {
    if (!payload.prazo) {
      dados.prazo = null;
    } else {
      const data = new Date(payload.prazo);
      if (Number.isNaN(data.getTime())) {
        throw new AppError(400, 'Prazo inválido: informe uma data válida.');
      }
      dados.prazo = new Date(`${data.toISOString().slice(0, 10)}T00:00:00.000Z`);
    }
  }

  return dados;
}

function validarCriacaoRestricao(dados) {
  const faltando = ['atividade', 'descricao'].filter((campo) => !dados[campo]);
  if (faltando.length > 0) {
    throw new AppError(400, `Campos obrigatórios: ${faltando.join(', ')}.`);
  }
}

async function criarRestricao(obraIdParam, payload, usuario) {
  exigirEscritaRestricao(usuario);
  const obraId = await garantirObra(obraIdParam);
  const dados = normalizarPayloadRestricao(payload);
  validarCriacaoRestricao(dados);
  return dashboardRepository.criarRestricao(obraId, dados);
}

async function atualizarRestricao(obraIdParam, restricaoIdParam, payload, usuario) {
  exigirEscritaRestricao(usuario);
  const obraId = await garantirObra(obraIdParam);
  const restricaoId = validarId(restricaoIdParam, 'restricaoId');
  const dados = normalizarPayloadRestricao(payload);
  const atualizada = await dashboardRepository.atualizarRestricao(obraId, restricaoId, dados);
  if (!atualizada) {
    throw new AppError(404, `Restrição ${restricaoId} não encontrada nesta obra.`);
  }
  return atualizada;
}

async function removerRestricao(obraIdParam, restricaoIdParam, usuario) {
  exigirEscritaRestricao(usuario);
  const obraId = await garantirObra(obraIdParam);
  const restricaoId = validarId(restricaoIdParam, 'restricaoId');
  const removida = await dashboardRepository.removerRestricao(obraId, restricaoId);
  if (!removida) {
    throw new AppError(404, `Restrição ${restricaoId} não encontrada nesta obra.`);
  }
  return true;
}

module.exports = {
  obterDashboard,
  criarRestricao,
  atualizarRestricao,
  removerRestricao,
  STATUS_OBRA,
  CATEGORIAS,
  STATUS_RESTRICAO,
};

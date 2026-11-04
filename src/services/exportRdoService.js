'use strict';

const XLSX = require('xlsx');
const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');
const lookaheadService = require('./lookaheadService');
const workloadService = require('./workloadService');

/**
 * Exportação da programação do Lookahead (6WLA) para o RDO / diário de campo.
 *
 * Planilha .xlsx com abas "limpas" para importação (cabeçalho na linha 1, uma
 * linha por registro, sem células mescladas, datas como datas do Excel):
 *  - RDO_Programacao: atividade × semana do horizonte, com liberação,
 *    responsáveis, funções, restrições (pendentes e baixadas) e colunas em
 *    branco para o apontamento do encarregado;
 *  - Restricoes:      restrições das atividades exportadas;
 *  - Efetivo_Semanal: demanda prevista × efetivo atual por função e semana;
 *  - Info:            identificação da obra, versão, período e legenda.
 *
 * Os títulos das colunas da aba de importação estão centralizados em
 * COLUNAS_PROGRAMACAO — ajuste ali para casar com o modelo da plataforma de campo.
 */

const FUSO_OFFSET_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO_DATA = 'dd/mm/yyyy';
const FORMATO_DATA_HORA = 'dd/mm/yyyy hh:mm';

/* -------------------------------------------------------------------------- */
/* Helpers de planilha                                                        */
/* -------------------------------------------------------------------------- */

/** Instante → número serial do Excel no horário de Brasília (independe do fuso do servidor). */
function serialExcel(valor) {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(String(valor).length === 10 ? `${valor}T03:00:00Z` : valor);
  if (Number.isNaN(data.getTime())) return null;
  return (data.getTime() + FUSO_OFFSET_MS) / DIA_MS + 25569;
}

function formatarDataBr(valor) {
  if (!valor) return '';
  const texto = valor instanceof Date ? new Date(valor.getTime() + FUSO_OFFSET_MS).toISOString() : String(valor);
  const [ano, mes, dia] = texto.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Monta uma aba a partir de colunas tipadas.
 * @param {{titulo:string, largura?:number, tipo?:'texto'|'numero'|'data'|'datahora'}[]} colunas
 * @param {any[][]} linhas
 */
function montarAba(colunas, linhas, { filtro = true } = {}) {
  const valores = linhas.map((linha) =>
    linha.map((valor, i) => {
      const tipo = colunas[i].tipo || 'texto';
      if (valor === null || valor === undefined || valor === '') return null;
      if (tipo === 'data' || tipo === 'datahora') return serialExcel(valor);
      return valor;
    })
  );
  const aba = XLSX.utils.aoa_to_sheet([colunas.map((c) => c.titulo), ...valores]);

  colunas.forEach((coluna, c) => {
    const formato =
      coluna.tipo === 'data' ? FORMATO_DATA : coluna.tipo === 'datahora' ? FORMATO_DATA_HORA : coluna.formato || null;
    if (!formato) return;
    for (let l = 1; l <= valores.length; l += 1) {
      const celula = aba[XLSX.utils.encode_cell({ r: l, c })];
      if (celula && celula.t === 'n') celula.z = formato;
    }
  });

  aba['!cols'] = colunas.map((c) => ({ wch: c.largura || Math.max(12, c.titulo.length + 2) }));
  if (filtro && colunas.length) {
    aba['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(valores.length, 1), c: colunas.length - 1 } }) };
  }
  return aba;
}

function simNao(valor) {
  return valor ? 'Sim' : 'Não';
}

function unicos(lista) {
  return [...new Set(lista.filter(Boolean))];
}

/* -------------------------------------------------------------------------- */
/* Layout das abas                                                            */
/* -------------------------------------------------------------------------- */

const SITUACOES = { NAO_INICIADA: 'Não iniciada', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída' };
const TIPOS_RESTRICAO = {
  PROJETOS: 'Projetos',
  SUPRIMENTOS: 'Suprimentos',
  LIBERACAO_AREA: 'Liberação de área',
  SMS: 'SMS',
  EQUIPAMENTO: 'Equipamento',
};

const COLUNAS_PROGRAMACAO = [
  { titulo: 'Semana', largura: 8, tipo: 'numero' },
  { titulo: 'Semana ISO', largura: 10, tipo: 'numero' },
  { titulo: 'Início da semana', largura: 14, tipo: 'data' },
  { titulo: 'Fim da semana', largura: 14, tipo: 'data' },
  { titulo: 'EDT', largura: 14 },
  { titulo: 'Atividade', largura: 50 },
  { titulo: 'Frente de serviço', largura: 32 },
  { titulo: 'Início programado', largura: 17, tipo: 'datahora' },
  { titulo: 'Término programado', largura: 17, tipo: 'datahora' },
  { titulo: 'Início LB', largura: 17, tipo: 'datahora' },
  { titulo: 'Término LB', largura: 17, tipo: 'datahora' },
  { titulo: 'Inicia na semana', largura: 10 },
  { titulo: 'Termina na semana', largura: 10 },
  { titulo: '% Previsto', largura: 10, tipo: 'numero', formato: '0.00' },
  { titulo: '% Real atual', largura: 10, tipo: 'numero', formato: '0.00' },
  { titulo: 'Situação', largura: 14 },
  { titulo: 'Liberação', largura: 12 },
  { titulo: 'Caminho crítico', largura: 10 },
  { titulo: 'Folga (dias úteis)', largura: 10, tipo: 'numero', formato: '0.00' },
  { titulo: 'Responsáveis', largura: 30 },
  { titulo: 'Funções', largura: 30 },
  { titulo: 'Equipamentos', largura: 26 },
  { titulo: 'Restrições pendentes', largura: 40 },
  { titulo: 'Restrições baixadas', largura: 40 },
  // Colunas de apontamento preenchidas pelo encarregado no campo.
  { titulo: '% Real apontado', largura: 12, tipo: 'numero' },
  { titulo: 'Efetivo presente', largura: 12, tipo: 'numero' },
  { titulo: 'HH apontado', largura: 12, tipo: 'numero' },
  { titulo: 'Observações do encarregado', largura: 40 },
];

const COLUNAS_RESTRICOES = [
  { titulo: 'EDT', largura: 14 },
  { titulo: 'Atividade', largura: 50 },
  { titulo: 'Tipo', largura: 18 },
  { titulo: 'Descrição', largura: 50 },
  { titulo: 'Status', largura: 12 },
  { titulo: 'Responsável', largura: 24 },
  { titulo: 'Data limite', largura: 12, tipo: 'data' },
  { titulo: 'Data de baixa', largura: 16, tipo: 'datahora' },
  { titulo: 'Herdada do item', largura: 14 },
];

const COLUNAS_EFETIVO = [
  { titulo: 'Semana', largura: 8, tipo: 'numero' },
  { titulo: 'Semana ISO', largura: 10, tipo: 'numero' },
  { titulo: 'Início da semana', largura: 14, tipo: 'data' },
  { titulo: 'Categoria', largura: 12 },
  { titulo: 'Função / Equipamento', largura: 36 },
  { titulo: 'Previsto', largura: 10, tipo: 'numero' },
  { titulo: 'Efetivo atual', largura: 12, tipo: 'numero' },
  { titulo: 'Diferença', largura: 10, tipo: 'numero' },
  { titulo: 'Situação', largura: 18 },
];

const SITUACOES_EFETIVO = {
  MOBILIZAR: 'Mobilizar',
  OCIOSIDADE: 'Ociosidade',
  OK: 'OK',
  SEM_PLANEJAMENTO: 'Sem planejamento',
};

/* -------------------------------------------------------------------------- */
/* Filtros                                                                    */
/* -------------------------------------------------------------------------- */

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query: semana (1–6, aceita lista "1,2"), de/ate (AAAA-MM-DD, até 6 semanas),
 * data_referencia (início do horizonte, padrão hoje), versao_id.
 */
function interpretarFiltros(query) {
  const { de, ate } = query;
  if ((de && !DATA.test(de)) || (ate && !DATA.test(ate))) {
    throw new AppError(400, 'Os parâmetros "de" e "ate" devem estar no formato AAAA-MM-DD.');
  }
  if (de && ate && ate < de) throw new AppError(400, 'O parâmetro "ate" deve ser igual ou posterior a "de".');
  if (de && ate && (Date.parse(ate) - Date.parse(de)) / DIA_MS > 6 * 7) {
    throw new AppError(400, 'O período exportado deve caber nas 6 semanas do lookahead (máximo de 42 dias).');
  }

  let semanas = null;
  if (query.semana !== undefined && String(query.semana).trim() !== '') {
    semanas = String(query.semana)
      .split(',')
      .map((parte) => Number(parte.trim()));
    if (semanas.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) {
      throw new AppError(400, 'O parâmetro "semana" deve ser um número de 1 a 6 (ou uma lista, ex.: "1,2").');
    }
  }

  return {
    semanas,
    de: de || null,
    ate: ate || null,
    dataReferencia: de || query.data_referencia || undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Geração                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Gera a planilha de programação para o RDO.
 * @returns {Promise<{ buffer: Buffer, nomeArquivo: string, linhas: number }>}
 */
async function gerarPlanilhaRdo(obraIdParam, query = {}, usuario = null) {
  const filtros = interpretarFiltros(query);
  const consulta = { versao_id: query.versao_id, data_referencia: filtros.dataReferencia };

  const lookahead = await lookaheadService.obterLookahead(obraIdParam, consulta);
  const obra = await obraRepository.findById(lookahead.obra_id);
  if (!obra) throw new AppError(404, `Obra ${lookahead.obra_id} não encontrada.`);

  // ------------------------------------------------ Semanas do recorte
  const dentroDoPeriodo = (inicio, fim) => (!filtros.de || fim >= filtros.de) && (!filtros.ate || inicio <= filtros.ate);
  const semanas = lookahead.semanas.filter(
    (s) => (!filtros.semanas || filtros.semanas.includes(s.numero)) && dentroDoPeriodo(s.inicio, s.fim)
  );
  if (!semanas.length) throw new AppError(400, 'Nenhuma semana do lookahead corresponde ao filtro informado.');

  const inicioRecorte = filtros.de || semanas[0].inicio;
  const fimRecorte = filtros.ate || semanas[semanas.length - 1].fim;
  const limiteInicio = new Date(`${inicioRecorte}T03:00:00Z`);
  const limiteFim = new Date(Date.parse(`${fimRecorte}T03:00:00Z`) + DIA_MS);

  const planejadores = (obra.planejadores || []).map((p) => p.nome);

  // ------------------------------------------- Aba RDO_Programacao
  const linhasProgramacao = [];
  const exportadas = new Map();
  semanas.forEach((semana) => {
    semana.atividades
      .filter((a) => new Date(a.inicio) < limiteFim && new Date(a.termino) >= limiteInicio)
      .forEach((a) => {
        exportadas.set(a.codigo_atividade, a);
        const pendentes = a.restricoes.filter((r) => r.status === 'PENDENTE');
        const baixadas = a.restricoes.filter((r) => r.status === 'BAIXADA');
        const descreverRestricao = (r) =>
          `${TIPOS_RESTRICAO[r.tipo] || r.tipo}: ${r.descricao}` +
          (r.status === 'BAIXADA' && r.data_baixa ? ` (baixada em ${formatarDataBr(new Date(r.data_baixa))})` : '') +
          (r.status === 'PENDENTE' && r.data_limite ? ` (limite ${formatarDataBr(r.data_limite)})` : '');
        const funcoes = a.recursos_mao_de_obra.map((r) => (r.quantidade ? `${r.funcao} (${r.quantidade})` : r.funcao));
        const equipamentos = a.recursos_equipamentos.map((r) => (r.quantidade ? `${r.equipamento} (${r.quantidade})` : r.equipamento));
        const responsaveis = unicos([...a.restricoes.map((r) => r.responsavel), ...planejadores]);
        const situacao = Number(a.avanco_fisico_real) > 0 ? 'EM_ANDAMENTO' : 'NAO_INICIADA';

        linhasProgramacao.push([
          semana.numero,
          semana.semana_iso,
          semana.inicio,
          semana.fim,
          a.codigo_atividade,
          a.descricao,
          a.frente,
          a.inicio,
          a.termino,
          a.inicio_lb,
          a.termino_lb,
          simNao(a.inicia_na_semana),
          simNao(a.termina_na_semana),
          a.avanco_fisico_previsto,
          a.avanco_fisico_real,
          SITUACOES[situacao],
          a.status_liberacao === 'LIBERADA' ? 'Liberada' : 'Bloqueada',
          simNao(a.caminho_critico),
          a.folga_total_dias,
          responsaveis.join('; '),
          funcoes.join('; '),
          equipamentos.join('; '),
          pendentes.map(descreverRestricao).join(' | '),
          baixadas.map(descreverRestricao).join(' | '),
          null,
          null,
          null,
          null,
        ]);
      });
  });

  // ------------------------------------------------- Aba Restricoes
  const linhasRestricoes = [];
  exportadas.forEach((a) => {
    a.restricoes.forEach((r) => {
      linhasRestricoes.push([
        a.codigo_atividade,
        a.descricao,
        TIPOS_RESTRICAO[r.tipo] || r.tipo,
        r.descricao,
        r.status === 'BAIXADA' ? 'Baixada' : 'Pendente',
        r.responsavel,
        r.data_limite,
        r.data_baixa,
        r.herdada_de,
      ]);
    });
  });

  // --------------------------------------------- Aba Efetivo_Semanal
  const carga = await workloadService.obterCargaTrabalho(lookahead.obra_id, consulta);
  const numeroDaSemana = new Map(lookahead.semanas.map((s) => [s.inicio, s.numero]));
  const iniciosRecorte = new Set(semanas.map((s) => s.inicio));
  const linhasEfetivo = [];
  [...carga.funcoes, ...carga.equipamentos].forEach((recurso) => {
    recurso.lookahead
      // Sem demanda e sem efetivo mobilizado, a linha não informa nada ao campo.
      .filter((s) => iniciosRecorte.has(s.inicio) && (s.previsto > 0 || s.efetivo_atual > 0))
      .forEach((s) => {
        linhasEfetivo.push([
          numeroDaSemana.get(s.inicio),
          lookahead.semanas.find((x) => x.inicio === s.inicio)?.semana_iso ?? null,
          s.inicio,
          recurso.categoria === 'EQUIPAMENTO' ? 'Equipamento' : recurso.categoria,
          recurso.nome,
          s.previsto,
          s.efetivo_atual,
          s.gap,
          SITUACOES_EFETIVO[s.situacao] || s.situacao,
        ]);
      });
  });
  linhasEfetivo.sort((a, b) => a[0] - b[0] || String(a[3]).localeCompare(String(b[3])) || String(a[4]).localeCompare(String(b[4])));

  // ------------------------------------------------------- Aba Info
  const recorte = filtros.semanas
    ? `Semana(s) ${filtros.semanas.join(', ')} do lookahead`
    : filtros.de || filtros.ate
      ? `Período de ${formatarDataBr(inicioRecorte)} a ${formatarDataBr(fimRecorte)}`
      : 'Lookahead completo (6 semanas)';
  const info = [
    ['Obra (SS)', obra.ss || ''],
    ['PEP (CC)', obra.pep || ''],
    ['Cliente', obra.cliente || ''],
    ['Descrição', obra.descricao || ''],
    ['Planejadores', planejadores.join('; ')],
    ['Versão do cronograma', lookahead.versao.versao],
    ['Recorte exportado', recorte],
    ['Semanas', semanas.map((s) => `${s.numero} (S${s.semana_iso}: ${formatarDataBr(s.inicio)} a ${formatarDataBr(s.fim)})`).join('; ')],
    ['Atividades exportadas', exportadas.size],
    ['Linhas de programação', linhasProgramacao.length],
    ['Liberadas / Bloqueadas', `${[...exportadas.values()].filter((a) => a.status_liberacao === 'LIBERADA').length} / ${[...exportadas.values()].filter((a) => a.status_liberacao === 'BLOQUEADA').length}`],
    ['PPC da última semana', lookahead.resumo.ppc_ultima_semana === null ? '—' : `${lookahead.resumo.ppc_ultima_semana}%`],
    ['Gerado em', formatarDataBr(new Date()) + ' ' + new Date(Date.now() + FUSO_OFFSET_MS).toISOString().slice(11, 16)],
    ['Gerado por', usuario?.nome || ''],
    [],
    ['Legenda'],
    ['Liberada', 'Sem restrições pendentes (inclui restrições herdadas dos itens de resumo).'],
    ['Bloqueada', 'Possui ao menos uma restrição pendente.'],
    ['Folga (dias úteis)', 'Folga total do caminho crítico (CPM); ≤ 0 = atividade crítica.'],
    ['Colunas de apontamento', '"% Real apontado", "Efetivo presente", "HH apontado" e "Observações" ficam em branco para o encarregado.'],
    ...(carga.avisos || []).map((aviso) => ['Aviso', aviso]),
  ];

  // ------------------------------------------------------ Arquivo
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, montarAba(COLUNAS_PROGRAMACAO, linhasProgramacao), 'RDO_Programacao');
  XLSX.utils.book_append_sheet(livro, montarAba(COLUNAS_RESTRICOES, linhasRestricoes), 'Restricoes');
  XLSX.utils.book_append_sheet(livro, montarAba(COLUNAS_EFETIVO, linhasEfetivo), 'Efetivo_Semanal');
  const abaInfo = XLSX.utils.aoa_to_sheet(info);
  abaInfo['!cols'] = [{ wch: 26 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(livro, abaInfo, 'Info');
  livro.Props = { Title: `Programação RDO ${obra.ss || ''}`.trim(), Author: 'Synapse', CreatedDate: new Date() };

  const buffer = XLSX.write(livro, { type: 'buffer', bookType: 'xlsx', compression: true });

  const identificador = String(obra.ss || obra.pep || `obra-${obra.id}`).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  const sufixo = filtros.semanas
    ? `semana-${filtros.semanas.join('-')}`
    : `${inicioRecorte}_a_${fimRecorte}`;
  return {
    buffer,
    nomeArquivo: `RDO_${identificador}_${lookahead.versao.versao.replace(/\s+/g, '')}_${sufixo}.xlsx`,
    linhas: linhasProgramacao.length,
  };
}

module.exports = { gerarPlanilhaRdo, COLUNAS_PROGRAMACAO };

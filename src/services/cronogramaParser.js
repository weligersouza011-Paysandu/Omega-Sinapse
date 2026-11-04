'use strict';

const XLSX = require('xlsx');
const AppError = require('../errors/AppError');

/**
 * Parser do MODELO PADRÃO de cronograma (relatório semanal exportado do
 * MS Project + planilhas de acompanhamento). Abas reconhecidas:
 *
 *  - "Cronograma"               (obrigatória) EAP com EDT, nome, % previsto,
 *                               % real, início/término (tendência) e LB.
 *                               Colunas opcionais: Predecessoras, Crítica,
 *                               Recursos / Mão de obra / Equipamentos.
 *  - "Avanço_Físico&Financeiro" Curva S semanal física (%) e financeira (R$),
 *                               efetivo e equipamentos totais por semana.
 *  - "MOD_MOI"                  Histograma de mão de obra direta e indireta.
 *  - "EQP"                      Histograma de equipamentos.
 *  - "Dashboard"                Período de referência e supervisão.
 *
 * As abas são localizadas pelo nome e, na falta dele, pelo conteúdo do
 * cabeçalho — o parser tolera colunas reordenadas e linhas extras.
 */

/** Fuso das datas do cronograma (America/Sao_Paulo, sem horário de verão). */
const FUSO_OFFSET_HORAS = -3;

/* -------------------------------------------------------------------------- */
/* Helpers de normalização                                                    */
/* -------------------------------------------------------------------------- */

/** "Início L.B." → "inicio l b"; "% Prev." → "prev". */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function vazio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

function linhasDaAba(aba) {
  return XLSX.utils.sheet_to_json(aba, { header: 1, defval: null, raw: true, blankrows: true });
}

function arredondar(valor, casas = 4) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function numeroOuNulo(valor) {
  if (vazio(valor)) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor).trim().replace(/[R$\s%]/g, '');
  // Aceita "1.234,56" e "1234.56".
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/** Instante UTC de uma data/hora local no fuso do cronograma. */
function dataNoFuso(ano, mes, dia, hora = 0, minuto = 0) {
  if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia, hora - FUSO_OFFSET_HORAS, minuto));
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Converte datas do modelo: número serial do Excel, "Seg 25/05/26 11:00"
 * (formato do MS Project), "25/05/2026" ou ISO "2026-05-25".
 */
function dataOuNula(valor) {
  if (vazio(valor)) return null;

  if (typeof valor === 'number') {
    const partes = XLSX.SSF.parse_date_code(valor);
    if (!partes || partes.y < 1950) return null;
    return dataNoFuso(partes.y, partes.m, partes.d, partes.H, partes.M);
  }

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  const texto = String(valor).trim();
  const br = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) {
    let ano = Number(br[3]);
    if (ano < 100) ano += 2000;
    return dataNoFuso(ano, Number(br[2]), Number(br[1]), Number(br[4] || 0), Number(br[5] || 0));
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (iso) {
    return dataNoFuso(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0));
  }

  return null; // "NA", "ND" etc.
}

/** Data (sem hora) no formato AAAA-MM-DD, no fuso do cronograma. */
function dataIso(data) {
  if (!data) return null;
  const local = new Date(data.getTime() + FUSO_OFFSET_HORAS * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function booleano(valor) {
  if (typeof valor === 'boolean') return valor;
  return ['sim', 's', 'yes', 'y', 'true', 'verdadeiro', 'x', '1'].includes(normalizar(valor));
}

/**
 * "Mecânico Montador[2];Soldador;Munck[50%]" →
 * [{ nome: 'Mecânico Montador', quantidade: 2 }, { nome: 'Soldador', quantidade: 1 }, ...]
 */
function listaDeRecursos(valor) {
  if (vazio(valor)) return [];
  return String(valor)
    .split(/[;\n]+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const match = parte.match(/^(.*?)\s*\[\s*([\d.,]+)\s*(%?)\s*\]\s*$/);
      if (!match) return { nome: parte, quantidade: 1 };
      const quantidade = numeroOuNulo(match[2]) ?? 1;
      return { nome: match[1].trim(), quantidade: match[3] ? arredondar(quantidade / 100, 4) : quantidade };
    });
}

function localizarAba(workbook, padraoNome, validarConteudo) {
  const porNome = workbook.SheetNames.find((nome) => padraoNome.test(normalizar(nome)));
  if (porNome) return { nome: porNome, aba: workbook.Sheets[porNome] };
  if (!validarConteudo) return null;
  const porConteudo = workbook.SheetNames.find((nome) => validarConteudo(workbook.Sheets[nome]));
  return porConteudo ? { nome: porConteudo, aba: workbook.Sheets[porConteudo] } : null;
}

/* -------------------------------------------------------------------------- */
/* Aba "Cronograma" — EAP / atividades                                        */
/* -------------------------------------------------------------------------- */

/** Aliases normalizados de cada coluna (comparação exata após normalizar). */
const COLUNAS_CRONOGRAMA = {
  codigo: ['edt', 'wbs', 'eap', 'codigo', 'codigo edt', 'codigo da atividade', 'item'],
  id_origem: ['id', 'identificador', 'n', 'no', 'numero', 'id da tarefa'],
  descricao: ['nome da tarefa', 'nome', 'tarefa', 'atividade', 'atividades', 'descricao'],
  previsto: ['prev', 'previsto', 'prev', 'avanco previsto', 'concluida prevista', 'fisico previsto'],
  real: ['real', 'realizado', 'concluida', 'concluido', 'avanco real', 'fisico real'],
  inicio: ['inicio', 'inicio tendencia', 'data inicio'],
  fim: ['termino', 'fim', 'termino tendencia', 'data termino', 'data fim'],
  inicio_lb: ['inicio l b', 'inicio lb', 'inicio bl', 'inicio da linha de base', 'inicio previsto lb', 'inicio previsto'],
  fim_lb: ['termino l b', 'termino lb', 'termino bl', 'termino da linha de base', 'termino previsto lb', 'termino previsto'],
  predecessoras: ['predecessoras', 'predecessores', 'predecessora'],
  critica: ['critica', 'critico', 'caminho critico', 'tarefa critica'],
  recursos: ['recursos', 'nomes dos recursos', 'nome dos recursos'],
  mao_de_obra: ['mao de obra', 'recursos mao de obra', 'mod'],
  equipamentos: ['equipamentos', 'recursos equipamentos', 'eqp'],
};

const COLUNAS_OBRIGATORIAS = { codigo: 'EDT', descricao: 'Nome da Tarefa', inicio: 'Início', fim: 'Término' };

/** Mapeia índice de coluna → campo. A 1ª ocorrência de cada campo vence. */
function mapearColunas(cabecalho) {
  const mapa = {};
  cabecalho.forEach((titulo, indice) => {
    const chave = normalizar(titulo);
    if (!chave) return;
    Object.entries(COLUNAS_CRONOGRAMA).forEach(([campo, aliases]) => {
      if (mapa[campo] === undefined && aliases.includes(chave)) mapa[campo] = indice;
    });
  });
  return mapa;
}

function encontrarCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 15); i += 1) {
    const mapa = mapearColunas(linhas[i] || []);
    if (mapa.codigo !== undefined && mapa.descricao !== undefined) return { indice: i, mapa };
  }
  return null;
}

/** Fator de escala dos percentuais: frações (0–1) viram 0–100. */
function escalaPercentual(linhas, indice) {
  if (indice === undefined) return 1;
  const valores = linhas.map((linha) => numeroOuNulo(linha[indice])).filter((v) => v !== null);
  return valores.some((v) => v > 1.0001) ? 1 : 100;
}

function percentualDe(valor, escala) {
  if (typeof valor === 'string' && valor.includes('%')) {
    return arredondar(Math.min(Math.max(numeroOuNulo(valor) ?? 0, 0), 100), 4);
  }
  const numero = numeroOuNulo(valor);
  if (numero === null) return 0;
  return arredondar(Math.min(Math.max(numero * escala, 0), 100), 4);
}

function lerAtividades(workbook, avisos) {
  const encontrada = localizarAba(workbook, /^cronograma/, (aba) => Boolean(encontrarCabecalho(linhasDaAba(aba))));
  if (!encontrada) {
    throw new AppError(
      422,
      'Aba "Cronograma" não encontrada. O arquivo deve seguir o modelo padrão (colunas EDT, Nome da Tarefa, Início e Término).'
    );
  }

  const linhas = linhasDaAba(encontrada.aba);
  const cabecalho = encontrarCabecalho(linhas);
  const faltantes = Object.entries(COLUNAS_OBRIGATORIAS)
    .filter(([campo]) => !cabecalho || cabecalho.mapa[campo] === undefined)
    .map(([, rotulo]) => rotulo);
  if (faltantes.length) {
    throw new AppError(422, `Colunas obrigatórias ausentes na aba "${encontrada.nome}": ${faltantes.join(', ')}.`, {
      colunas_faltantes: faltantes,
    });
  }

  const { mapa } = cabecalho;
  const corpo = linhas.slice(cabecalho.indice + 1);
  const escalaPrev = escalaPercentual(corpo, mapa.previsto);
  const escalaReal = escalaPercentual(corpo, mapa.real);
  const celula = (linha, campo) => (mapa[campo] === undefined ? null : linha[mapa[campo]]);

  const atividades = [];
  const vistos = new Set();
  const duplicados = new Set();
  let semCodigo = 0;

  corpo.forEach((linha) => {
    const codigoBruto = celula(linha, 'codigo');
    const descricaoBruta = celula(linha, 'descricao');
    if (vazio(codigoBruto) && vazio(descricaoBruta)) return;
    if (vazio(codigoBruto)) {
      semCodigo += 1;
      return;
    }

    const codigo = String(codigoBruto).trim().replace(/\.$/, '');
    if (vistos.has(codigo)) duplicados.add(codigo);
    vistos.add(codigo);

    const recursosGerais = listaDeRecursos(celula(linha, 'recursos'));

    atividades.push({
      ordem: atividades.length + 1,
      codigo_atividade: codigo.slice(0, 60),
      descricao: vazio(descricaoBruta) ? codigo : String(descricaoBruta).trim(),
      nivel: codigo.split('.').filter(Boolean).length,
      data_inicio: dataOuNula(celula(linha, 'inicio')),
      data_fim: dataOuNula(celula(linha, 'fim')),
      data_inicio_lb: dataOuNula(celula(linha, 'inicio_lb')),
      data_fim_lb: dataOuNula(celula(linha, 'fim_lb')),
      avanco_fisico_previsto: percentualDe(celula(linha, 'previsto'), escalaPrev),
      avanco_fisico_real: percentualDe(celula(linha, 'real'), escalaReal),
      predecessoras: vazio(celula(linha, 'predecessoras')) ? null : String(celula(linha, 'predecessoras')).trim(),
      id_origem: Number.isInteger(numeroOuNulo(celula(linha, 'id_origem'))) ? numeroOuNulo(celula(linha, 'id_origem')) : null,
      caminho_critico: mapa.critica === undefined ? false : booleano(celula(linha, 'critica')),
      // Classificados depois, com base nos nomes dos histogramas.
      _recursos: recursosGerais,
      _mao_de_obra: listaDeRecursos(celula(linha, 'mao_de_obra')),
      _equipamentos: listaDeRecursos(celula(linha, 'equipamentos')),
    });
  });

  if (atividades.length === 0) {
    throw new AppError(422, `Nenhuma atividade encontrada na aba "${encontrada.nome}".`);
  }

  // Hierarquia da EAP: pai = EDT sem o último segmento; resumo = possui filhos.
  const codigos = new Set(atividades.map((a) => a.codigo_atividade));
  const pais = new Set();
  atividades.forEach((atividade) => {
    const segmentos = atividade.codigo_atividade.split('.');
    const pai = segmentos.length > 1 ? segmentos.slice(0, -1).join('.') : null;
    atividade.codigo_pai = pai && codigos.has(pai) ? pai : null;
    if (atividade.codigo_pai) pais.add(atividade.codigo_pai);
  });
  atividades.forEach((atividade) => {
    atividade.resumo = pais.has(atividade.codigo_atividade);
  });

  if (semCodigo) avisos.push(`${semCodigo} linha(s) sem código EDT foram ignoradas.`);
  if (duplicados.size) {
    avisos.push(`Códigos EDT repetidos: ${[...duplicados].slice(0, 10).join(', ')}${duplicados.size > 10 ? '…' : ''}.`);
  }
  const semDatas = atividades.filter((a) => !a.data_inicio || !a.data_fim).length;
  if (semDatas) avisos.push(`${semDatas} atividade(s) sem data de início/término reconhecida.`);
  if (mapa.predecessoras === undefined) {
    avisos.push('Coluna "Predecessoras" ausente: as amarrações lógicas não foram importadas.');
  }

  const colunas = Object.keys(mapa);
  return { aba: encontrada.nome, atividades, colunas };
}

/* -------------------------------------------------------------------------- */
/* Abas MOD_MOI / EQP — histogramas semanais de recursos                       */
/* -------------------------------------------------------------------------- */

/**
 * Lê um histograma no formato do modelo: linha de cabeçalho "DESCRIÇÃO | UND |
 * Previsto x Realizado | PICO | S23 | seg..sáb | S24 | ...", linha de datas e,
 * para cada recurso, uma linha "Previsto" seguida de uma linha "Realizado".
 */
function lerHistograma(aba, categoriaPadrao) {
  const linhas = linhasDaAba(aba);
  const indiceCabecalho = linhas.findIndex((linha) => normalizar(linha?.[0]) === 'descricao');
  if (indiceCabecalho < 0) return null;

  const cabecalho = linhas[indiceCabecalho];
  const datas = linhas[indiceCabecalho + 1] || [];
  const semanas = [];
  cabecalho.forEach((titulo, coluna) => {
    const match = String(titulo ?? '').trim().match(/^S\s*(\d{1,2})$/i);
    if (match) {
      semanas.push({ coluna, semana: Number(match[1]), inicio: dataIso(dataOuNula(datas[coluna + 1])) });
    }
  });

  const recursos = [];
  const totais = [];
  let categoria = categoriaPadrao;
  let atual = null;

  const serie = (linha) =>
    semanas.map(({ coluna }) => {
      const valor = numeroOuNulo(linha[coluna]);
      return valor === null ? 0 : valor;
    });

  // Soma das colunas diárias (seg..sáb) após cada semana = homens-dia / equipamento-dia.
  const serieDias = (linha) =>
    semanas.map(({ coluna }, indice) => {
      const limite = indice + 1 < semanas.length ? semanas[indice + 1].coluna : coluna + 8;
      let soma = 0;
      for (let c = coluna + 1; c < limite; c += 1) soma += numeroOuNulo(linha[c]) ?? 0;
      return arredondar(soma, 2);
    });

  linhas.slice(indiceCabecalho + 2).forEach((linha) => {
    if (!linha) return;
    const nome = vazio(linha[0]) ? null : String(linha[0]).trim();
    const tipo = normalizar(linha[2]);

    if (nome && /^histograma/i.test(normalizar(nome))) {
      if (categoriaPadrao !== 'EQUIPAMENTO') categoria = /indireta/.test(normalizar(nome)) ? 'MOI' : 'MOD';
      return;
    }

    if (nome && tipo === 'previsto') {
      atual = {
        nome,
        unidade: vazio(linha[1]) ? null : String(linha[1]).trim(),
        categoria,
        pico_previsto: numeroOuNulo(linha[3]) ?? 0,
        pico_realizado: 0,
        previsto: serie(linha),
        realizado: semanas.map(() => 0),
        previsto_dias: serieDias(linha),
        realizado_dias: semanas.map(() => 0),
      };
      (/^total/.test(normalizar(nome)) ? totais : recursos).push(atual);
      return;
    }

    if (atual && tipo === 'realizado') {
      atual.pico_realizado = numeroOuNulo(linha[3]) ?? 0;
      atual.realizado = serie(linha);
      atual.realizado_dias = serieDias(linha);
      atual = null;
    }
  });

  // Semanas sem nenhum valor em todo o histograma são descartadas.
  const ativas = semanas
    .map((semana, indice) => ({ ...semana, indice }))
    .filter(({ indice }) =>
      [...recursos, ...totais].some((r) => r.previsto[indice] !== 0 || r.realizado[indice] !== 0)
    );

  const compactar = (recurso) => ({
    nome: recurso.nome,
    unidade: recurso.unidade,
    categoria: recurso.categoria,
    pico_previsto: recurso.pico_previsto,
    pico_realizado: recurso.pico_realizado,
    semanas: ativas.map(({ semana, inicio, indice }) => ({
      semana,
      inicio,
      previsto: recurso.previsto[indice],
      realizado: recurso.realizado[indice],
      previsto_dias: recurso.previsto_dias[indice],
      realizado_dias: recurso.realizado_dias[indice],
    })),
  });

  return { recursos: recursos.map(compactar), totais: totais.map(compactar) };
}

/* -------------------------------------------------------------------------- */
/* Aba Avanço_Físico&Financeiro — Curva S semanal                             */
/* -------------------------------------------------------------------------- */

const SECOES_CURVA = [
  { chave: 'fisico', padrao: /^avanco fisico/, percentual: true },
  { chave: 'financeiro', padrao: /^avanco financeiro/, percentual: false },
  { chave: 'efetivo', padrao: /^histograma/, percentual: false },
  { chave: 'equipamentos', padrao: /^equipamentos/, percentual: false },
];

/** "% Previsto Acumulado" / "R$ Acum Previsto" → "previsto_acum". */
function campoDaSerie(rotulo) {
  const chave = normalizar(rotulo).replace(/^r /, '');
  const acumulado = /\bacum/.test(chave);
  const base = chave.replace(/\bacumulado\b|\bacum\b/g, '').trim();
  const nome = { previsto: 'previsto', real: 'real', realizado: 'real', tendencia: 'tendencia' }[base];
  if (!nome) return null;
  return acumulado ? `${nome}_acum` : nome;
}

function ehLinhaDeSemanas(linha) {
  const a = linha?.[1];
  const b = linha?.[2];
  return Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= 53 && (b === a + 1 || (a >= 52 && b === 1));
}

function lerCurvaS(aba) {
  const linhas = linhasDaAba(aba);
  const semanas = new Map(); // coluna → registro
  let secao = null;
  let aguardandoDatas = false;

  for (const linha of linhas) {
    if (!linha) continue;
    const rotulo = normalizar(linha[0]);
    if (/^matriz/.test(rotulo)) break;

    if (ehLinhaDeSemanas(linha)) {
      secao = SECOES_CURVA.find((item) => item.padrao.test(rotulo)) || null;
      if (secao) {
        linha.forEach((valor, coluna) => {
          if (coluna === 0 || !Number.isInteger(valor)) return;
          if (!semanas.has(coluna)) semanas.set(coluna, { semana: valor, data: null });
        });
        aguardandoDatas = true;
      }
      continue;
    }

    if (!secao) continue;

    if (aguardandoDatas) {
      aguardandoDatas = false;
      if (typeof linha[1] === 'number' && linha[1] > 30000) {
        semanas.forEach((registro, coluna) => {
          if (!registro.data) registro.data = dataIso(dataOuNula(linha[coluna]));
        });
        continue;
      }
    }

    const campo = campoDaSerie(linha[0]);
    if (!campo) continue;
    semanas.forEach((registro, coluna) => {
      const valor = numeroOuNulo(linha[coluna]);
      if (valor === null) return;
      registro[secao.chave] = registro[secao.chave] || {};
      registro[secao.chave][campo] = secao.percentual ? arredondar(valor * 100, 4) : arredondar(valor, 2);
    });
  }

  const lista = [...semanas.values()].filter((registro) => registro.fisico || registro.financeiro);
  return lista.length ? lista : null;
}

/* -------------------------------------------------------------------------- */
/* Aba Dashboard — período e identificação                                    */
/* -------------------------------------------------------------------------- */

function lerDashboard(aba) {
  const linhas = linhasDaAba(aba);
  const resultado = { periodo_inicio: null, periodo_fim: null, titulo: null, ss: null, supervisor: null };

  const proximoValor = (linha, apos) => linha.slice(apos + 1).find((valor) => !vazio(valor));

  linhas.slice(0, 12).forEach((linha) => {
    (linha || []).forEach((valor, coluna) => {
      const chave = normalizar(valor);
      if (!resultado.titulo && /relatorio semanal/.test(chave)) {
        resultado.titulo = String(valor).replace(/\s+/g, ' ').trim();
        const ss = String(valor).match(/SS\s*\d+\s*\/\s*\d+/i);
        if (ss) resultado.ss = ss[0].replace(/\s+/g, '').toUpperCase();
      }
      if (chave === 'inicio' && !resultado.periodo_inicio) {
        resultado.periodo_inicio = dataIso(dataOuNula(proximoValor(linha, coluna)));
      }
      if (chave === 'fim' && !resultado.periodo_fim) {
        resultado.periodo_fim = dataIso(dataOuNula(proximoValor(linha, coluna)));
      }
      if (chave === 'supervisao') resultado._colunaSupervisao = coluna;
    });
  });

  if (resultado._colunaSupervisao !== undefined) {
    const coluna = resultado._colunaSupervisao;
    const indice = linhas.findIndex((linha) => normalizar(linha?.[coluna]) === 'supervisao');
    const valor = linhas
      .slice(indice + 1, indice + 4)
      .map((linha) => linha?.[coluna])
      .find((item) => !vazio(item) && typeof item === 'string');
    resultado.supervisor = valor ? String(valor).trim() : null;
  }
  delete resultado._colunaSupervisao;
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Recursos por atividade                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Separa a coluna genérica "Recursos" em mão de obra × equipamentos usando os
 * nomes cadastrados nos histogramas. Sem correspondência, vale mão de obra.
 */
function classificarRecursos(atividades, histogramaMaoDeObra, histogramaEquipamentos) {
  const equipamentos = new Set((histogramaEquipamentos?.recursos || []).map((r) => normalizar(r.nome)));
  const categoriaMo = new Map((histogramaMaoDeObra?.recursos || []).map((r) => [normalizar(r.nome), r.categoria]));

  atividades.forEach((atividade) => {
    const maoDeObra = [...atividade._mao_de_obra];
    const eqp = [...atividade._equipamentos];
    atividade._recursos.forEach((recurso) => {
      (equipamentos.has(normalizar(recurso.nome)) ? eqp : maoDeObra).push(recurso);
    });

    atividade.recursos_mao_de_obra = maoDeObra.length
      ? maoDeObra.map((r) => ({ funcao: r.nome, quantidade: r.quantidade, categoria: categoriaMo.get(normalizar(r.nome)) || null }))
      : null;
    atividade.recursos_equipamentos = eqp.length
      ? eqp.map((r) => ({ equipamento: r.nome, quantidade: r.quantidade }))
      : null;

    delete atividade._recursos;
    delete atividade._mao_de_obra;
    delete atividade._equipamentos;
  });
}

/* -------------------------------------------------------------------------- */
/* Resumo                                                                     */
/* -------------------------------------------------------------------------- */

const DIA_MS = 24 * 60 * 60 * 1000;

function extremo(datas, maior) {
  const validas = datas.filter(Boolean).map((d) => d.getTime());
  if (!validas.length) return null;
  return new Date(maior ? Math.max(...validas) : Math.min(...validas));
}

function montarResumo(atividades, dashboard, colunas) {
  const raiz = atividades.find((a) => a.nivel === Math.min(...atividades.map((x) => x.nivel)));
  const folhas = atividades.filter((a) => !a.resumo);

  const inicioLb = extremo(atividades.map((a) => a.data_inicio_lb), false);
  const terminoLb = extremo(atividades.map((a) => a.data_fim_lb), true);
  const inicio = extremo(atividades.map((a) => a.data_inicio), false);
  const termino = extremo(atividades.map((a) => a.data_fim), true);

  const previsto = raiz?.avanco_fisico_previsto ?? 0;
  const real = raiz?.avanco_fisico_real ?? 0;

  return {
    titulo: dashboard?.titulo || raiz?.descricao || null,
    ss_arquivo: dashboard?.ss || null,
    supervisor: dashboard?.supervisor || null,
    atividade_raiz: raiz?.descricao || null,
    total_atividades: atividades.length,
    total_resumos: atividades.length - folhas.length,
    total_folhas: folhas.length,
    niveis_eap: Math.max(...atividades.map((a) => a.nivel)),
    concluidas: folhas.filter((a) => a.avanco_fisico_real >= 100).length,
    em_andamento: folhas.filter((a) => a.avanco_fisico_real > 0 && a.avanco_fisico_real < 100).length,
    nao_iniciadas: folhas.filter((a) => a.avanco_fisico_real === 0).length,
    avanco_previsto: previsto,
    avanco_real: real,
    aderencia: previsto > 0 ? arredondar((real / previsto) * 100, 2) : null,
    inicio_lb: inicioLb ? inicioLb.toISOString() : null,
    termino_lb: terminoLb ? terminoLb.toISOString() : null,
    inicio_tendencia: inicio ? inicio.toISOString() : null,
    termino_tendencia: termino ? termino.toISOString() : null,
    desvio_termino_dias:
      termino && terminoLb ? Math.round((Date.parse(dataIso(termino)) - Date.parse(dataIso(terminoLb))) / DIA_MS) : null,
    atividades_criticas: atividades.filter((a) => a.caminho_critico).length,
    possui_predecessoras: atividades.some((a) => a.predecessoras),
    colunas_detectadas: colunas,
  };
}

/* -------------------------------------------------------------------------- */
/* API pública                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Lê o arquivo do modelo padrão e devolve os dados prontos para persistência.
 * @param {Buffer} buffer conteúdo do .xlsx/.xlsm/.xls
 * @returns {{
 *   atividades: object[], resumo: object, curva_s: object[]|null,
 *   histograma_mao_de_obra: object|null, histograma_equipamentos: object|null,
 *   periodo_inicio: string|null, periodo_fim: string|null, abas: object, avisos: string[]
 * }}
 */
function analisarCronograma(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellFormula: false, cellHTML: false });
  } catch (err) {
    throw new AppError(422, 'Não foi possível ler a planilha. Envie um arquivo Excel (.xlsx) no modelo padrão.');
  }

  const avisos = [];
  const { aba: abaCronograma, atividades, colunas } = lerAtividades(workbook, avisos);

  const abaMo = localizarAba(workbook, /^mod|mao de obra/);
  const abaEqp = localizarAba(workbook, /^eqp|^equipamento/);
  const abaCurva = localizarAba(workbook, /^avanco/);
  const abaDashboard = localizarAba(workbook, /^dashboard/);

  const histogramaMaoDeObra = abaMo ? lerHistograma(abaMo.aba, 'MOD') : null;
  const histogramaEquipamentos = abaEqp ? lerHistograma(abaEqp.aba, 'EQUIPAMENTO') : null;
  const curvaS = abaCurva ? lerCurvaS(abaCurva.aba) : null;
  const dashboard = abaDashboard ? lerDashboard(abaDashboard.aba) : null;

  if (!histogramaMaoDeObra) avisos.push('Histograma de mão de obra (aba MOD_MOI) não encontrado.');
  if (!histogramaEquipamentos) avisos.push('Histograma de equipamentos (aba EQP) não encontrado.');
  if (!curvaS) avisos.push('Curva S semanal (aba Avanço_Físico&Financeiro) não encontrada.');

  classificarRecursos(atividades, histogramaMaoDeObra, histogramaEquipamentos);

  return {
    atividades,
    resumo: montarResumo(atividades, dashboard, colunas),
    curva_s: curvaS,
    histograma_mao_de_obra: histogramaMaoDeObra,
    histograma_equipamentos: histogramaEquipamentos,
    periodo_inicio: dashboard?.periodo_inicio || null,
    periodo_fim: dashboard?.periodo_fim || null,
    abas: {
      cronograma: abaCronograma,
      mao_de_obra: abaMo?.nome || null,
      equipamentos: abaEqp?.nome || null,
      curva_s: abaCurva?.nome || null,
      dashboard: abaDashboard?.nome || null,
    },
    avisos,
  };
}

module.exports = {
  analisarCronograma,
  // Exportados para testes.
  normalizar,
  dataOuNula,
  listaDeRecursos,
  campoDaSerie,
};

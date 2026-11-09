'use strict';

const PDFDocument = require('pdfkit');
const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');
const lookaheadService = require('./lookaheadService');

/**
 * Relatório executivo de restrições do Lookahead (6WLA) em PDF (A4 paisagem).
 *
 * Conteúdo: resumo do horizonte (atividades bloqueadas, restrições pendentes e
 * vencidas, por tipo) e, semana a semana e por frente de serviço, cada atividade
 * bloqueada com suas restrições (tipo, descrição, responsável, data limite,
 * situação do prazo e plano de ação) — pronto para imprimir ou projetar em
 * reuniões de alinhamento com a diretoria e os empreiteiros.
 *
 * Uma atividade longa aparece só na primeira semana do horizonte em que ocorre
 * (nas demais fica apenas a indicação), para o relatório não repetir travas.
 */

const MARGEM = 36;
const COR = {
  texto: '#1e293b',
  suave: '#64748b',
  linha: '#e2e8f0',
  fundoSuave: '#f8fafc',
  marca: '#164b7d',
  vermelho: '#dc2626',
  vermelhoSuave: '#fee2e2',
  ambar: '#b45309',
  ambarSuave: '#fef3c7',
  verde: '#059669',
};
const COR_TIPO = {
  PROJETOS: '#2563eb',
  SUPRIMENTOS: '#ea580c',
  LIBERACAO_AREA: '#7c3aed',
  SMS: '#dc2626',
  EQUIPAMENTO: '#0891b2',
};
const ROTULO_TIPO = {
  PROJETOS: 'Projetos',
  SUPRIMENTOS: 'Suprimentos',
  LIBERACAO_AREA: 'Liberação de área',
  SMS: 'SMS',
  EQUIPAMENTO: 'Equipamento',
};

const FUSO_MS = -3 * 60 * 60 * 1000;

function dataBr(valor) {
  if (!valor) return '—';
  const texto = valor instanceof Date ? new Date(valor.getTime() + FUSO_MS).toISOString() : String(valor);
  const [ano, mes, dia] = texto.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function dataHoraBr(data = new Date()) {
  const local = new Date(data.getTime() + FUSO_MS).toISOString();
  return `${dataBr(local)} ${local.slice(11, 16)}`;
}

/** Texto e cor da situação de prazo de uma restrição. */
function situacao(restricao) {
  if (restricao.status === 'BAIXADA') {
    return { texto: `Baixada${restricao.data_baixa ? ` em ${dataBr(restricao.data_baixa)}` : ''}`, cor: COR.verde, fundo: null };
  }
  if (restricao.vencida) {
    return { texto: `VENCIDA há ${restricao.dias_atraso} dia(s)`, cor: COR.vermelho, fundo: COR.vermelhoSuave };
  }
  if (restricao.sem_prazo) return { texto: 'Sem prazo definido', cor: COR.suave, fundo: null };
  if (restricao.dias_para_vencer === 0) return { texto: 'Vence hoje', cor: COR.ambar, fundo: COR.ambarSuave };
  if (restricao.dias_para_vencer <= 3) {
    return { texto: `Vence em ${restricao.dias_para_vencer} dia(s)`, cor: COR.ambar, fundo: COR.ambarSuave };
  }
  return { texto: `No prazo (${restricao.dias_para_vencer} dias)`, cor: COR.suave, fundo: null };
}

/* -------------------------------------------------------------------------- */
/* Desenho                                                                    */
/* -------------------------------------------------------------------------- */

function criarDocumento(titulo) {
  return new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGEM,
    bufferPages: true,
    info: { Title: titulo, Author: 'Synapse · Omega Service', Subject: 'Restrições do Lookahead (6WLA)' },
  });
}

function larguraUtil(doc) {
  return doc.page.width - MARGEM * 2;
}

function limiteInferior(doc) {
  return doc.page.height - MARGEM - 14;
}

function selo(doc, texto, x, y, cor, { largura = null, altura = 13, tamanho = 7.5 } = {}) {
  const cursor = doc.y;
  doc.font('Helvetica-Bold').fontSize(tamanho);
  const w = largura ?? doc.widthOfString(texto) + 10;
  doc.roundedRect(x, y, w, altura, 3).fill(cor);
  doc.fillColor('#ffffff').text(texto, x, y + (altura - tamanho) / 2 + 0.5, { width: w, align: 'center', lineBreak: false });
  doc.y = cursor; // o selo é só decoração: não move o cursor de texto
  return w;
}

function cartaoResumo(doc, x, y, w, rotulo, valor, cor = COR.texto) {
  doc.roundedRect(x, y, w, 46, 6).lineWidth(0.7).strokeColor(COR.linha).fillAndStroke(COR.fundoSuave, COR.linha);
  doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(7).text(rotulo.toUpperCase(), x + 10, y + 8, { width: w - 20, lineBreak: false });
  doc.fillColor(cor).font('Helvetica-Bold').fontSize(20).text(String(valor), x + 10, y + 20, { width: w - 20, lineBreak: false });
}

function cabecalhoPagina(doc, obra, lookahead) {
  const w = larguraUtil(doc);
  doc.rect(0, 0, doc.page.width, 58).fill(COR.marca);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text('Relatório Executivo de Restrições', MARGEM, 14, { width: w * 0.62, lineBreak: false });
  doc.font('Helvetica').fontSize(9).text('Lookahead de 6 semanas (6WLA) · mapa de restrições e planos de ação', MARGEM, 34, { width: w * 0.62, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(11).text(`${obra.ss || '—'}${obra.pep ? ` / ${obra.pep}` : ''}`, MARGEM, 14, { width: w, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).text(
    `Cronograma ${lookahead.versao.versao} · horizonte ${dataBr(lookahead.horizonte.inicio)} a ${dataBr(lookahead.horizonte.fim)}`,
    MARGEM,
    34,
    { width: w, align: 'right', lineBreak: false }
  );
  doc.y = 72;
}

function resumo(doc, obra, lookahead, pendentesPorTipo) {
  const w = larguraUtil(doc);
  const r = lookahead.resumo;

  doc.fillColor(COR.texto).font('Helvetica-Bold').fontSize(11).text(obra.descricao || obra.cliente || 'Obra', MARGEM, doc.y, { width: w });
  doc.fillColor(COR.suave).font('Helvetica').fontSize(8.5).text(
    [obra.cliente, (obra.planejadores || []).map((p) => p.nome).join(' / ')].filter(Boolean).join(' · ') || ' ',
    MARGEM,
    doc.y + 1,
    { width: w }
  );
  doc.moveDown(0.7);

  const y = doc.y;
  const gap = 10;
  const n = 5;
  const largura = (w - gap * (n - 1)) / n;
  cartaoResumo(doc, MARGEM + 0 * (largura + gap), y, largura, 'Atividades no horizonte', r.atividades_no_horizonte);
  cartaoResumo(doc, MARGEM + 1 * (largura + gap), y, largura, 'Bloqueadas', r.bloqueadas, r.bloqueadas ? COR.vermelho : COR.verde);
  cartaoResumo(doc, MARGEM + 2 * (largura + gap), y, largura, 'Restrições pendentes', r.restricoes_pendentes, COR.texto);
  cartaoResumo(doc, MARGEM + 3 * (largura + gap), y, largura, 'Restrições vencidas', r.restricoes_vencidas, r.restricoes_vencidas ? COR.vermelho : COR.verde);
  cartaoResumo(doc, MARGEM + 4 * (largura + gap), y, largura, 'Críticas bloqueadas', r.criticas_bloqueadas, r.criticas_bloqueadas ? COR.vermelho : COR.verde);
  doc.y = y + 56;

  // Pendentes por tipo
  let x = MARGEM;
  const yTipos = doc.y;
  doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(7.5).text('PENDENTES POR TIPO', x, yTipos + 3, { lineBreak: false });
  x += 100;
  Object.entries(ROTULO_TIPO).forEach(([tipo, rotulo]) => {
    const total = pendentesPorTipo[tipo] || 0;
    x += selo(doc, `${rotulo}: ${total}`, x, yTipos - 0.5, total ? COR_TIPO[tipo] : '#94a3b8', { altura: 14, tamanho: 8 }) + 6;
  });
  doc.y = yTipos + 24;
}

function cabecalhoSemana(doc, semana, continuacao = false) {
  const w = larguraUtil(doc);
  const y = doc.y;
  doc.rect(MARGEM, y, w, 22).fill('#e8eef5');
  doc.rect(MARGEM, y, 4, 22).fill(COR.marca);
  const titulo = `${semana.rotulo} · S${semana.semana_iso}${continuacao ? ' (continuação)' : ''}`;
  doc.fillColor(COR.marca).font('Helvetica-Bold').fontSize(11);
  const larguraTitulo = doc.widthOfString(titulo);
  doc.text(titulo, MARGEM + 12, y + 5.5, { lineBreak: false });
  doc.fillColor(COR.suave).font('Helvetica').fontSize(8.5).text(`${dataBr(semana.inicio)} a ${dataBr(semana.fim)}`, MARGEM + 12 + larguraTitulo + 14, y + 7, { lineBreak: false });
  doc.fillColor(COR.texto).font('Helvetica-Bold').fontSize(8.5).text(
    `${semana.bloqueadas} bloqueada(s) de ${semana.total} · ${semana.restricoes_pendentes} restrição(ões) pendente(s)${
      semana.bloqueadas_vencidas ? ` · ${semana.bloqueadas_vencidas} com prazo vencido` : ''
    }`,
    MARGEM,
    y + 7,
    { width: w - 10, align: 'right', lineBreak: false }
  );
  doc.y = y + 28;
}

function cabecalhoFrente(doc, frente) {
  doc.fillColor(COR.marca).font('Helvetica-Bold').fontSize(8.5).text((frente || 'Sem frente definida').toUpperCase(), MARGEM + 4, doc.y, { width: larguraUtil(doc) - 8 });
  doc.moveTo(MARGEM, doc.y + 1).lineTo(MARGEM + larguraUtil(doc), doc.y + 1).lineWidth(0.6).strokeColor(COR.marca).stroke();
  doc.y += 5;
}

// Colunas da tabela de restrições (fração da largura útil).
function colunas(doc) {
  const w = larguraUtil(doc);
  const fracoes = [0.12, 0.3, 0.24, 0.14, 0.2];
  let x = MARGEM;
  return fracoes.map((f) => {
    const col = { x, w: w * f };
    x += w * f;
    return col;
  });
}

function medirRestricao(doc, restricao, cols) {
  doc.font('Helvetica').fontSize(8.5);
  const hDesc = doc.heightOfString(restricao.descricao || '', { width: cols[1].w - 12 });
  doc.font('Helvetica').fontSize(8);
  const hPlano = restricao.plano_acao ? doc.heightOfString(`Plano de ação: ${restricao.plano_acao}`, { width: cols[2].w - 12 }) : 11;
  doc.fontSize(8.5);
  const hResp = doc.heightOfString(restricao.responsavel || '—', { width: cols[3].w - 12 });
  return Math.max(26, hDesc + 8, hPlano + 8, hResp + 8);
}

function desenharRestricao(doc, restricao, cols, altura, indice) {
  const y = doc.y;
  if (indice % 2 === 0) doc.rect(MARGEM, y, larguraUtil(doc), altura).fill(COR.fundoSuave);
  const sit = situacao(restricao);

  selo(doc, ROTULO_TIPO[restricao.tipo] || restricao.tipo, cols[0].x + 6, y + 6, COR_TIPO[restricao.tipo] || COR.suave, { largura: cols[0].w - 12 });
  if (restricao.herdada) {
    doc.fillColor(COR.suave).font('Helvetica').fontSize(6.5).text(`herdada de ${restricao.herdada_de}`, cols[0].x + 6, y + 21, { width: cols[0].w - 12, lineBreak: false });
  }

  doc.fillColor(COR.texto).font('Helvetica').fontSize(8.5).text(restricao.descricao || '', cols[1].x + 6, y + 5, { width: cols[1].w - 12 });
  if (restricao.plano_acao) {
    doc.fillColor(COR.texto).font('Helvetica').fontSize(8).text(`Plano de ação: ${restricao.plano_acao}`, cols[2].x + 6, y + 5, { width: cols[2].w - 12 });
  } else {
    doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(8).text('Plano de ação não informado', cols[2].x + 6, y + 5, { width: cols[2].w - 12, lineBreak: false });
  }
  doc.fillColor(COR.texto).font('Helvetica').fontSize(8.5).text(restricao.responsavel || '—', cols[3].x + 6, y + 5, { width: cols[3].w - 12 });

  doc.fillColor(COR.texto).font('Helvetica-Bold').fontSize(8.5).text(restricao.data_limite ? dataBr(restricao.data_limite) : 'Sem data', cols[4].x + 6, y + 5, { width: cols[4].w - 12, lineBreak: false });
  doc.fillColor(sit.cor).font('Helvetica-Bold').fontSize(7.5).text(sit.texto, cols[4].x + 6, y + 16, { width: cols[4].w - 12, lineBreak: false });

  doc.y = y + altura;
}

function medirAtividade(doc, atividade, larguraTexto) {
  doc.font('Helvetica-Bold').fontSize(9);
  return doc.heightOfString(atividade.descricao || '', { width: larguraTexto });
}

/** Garante espaço na página; abre nova página (e repete o cabeçalho da semana) se faltar. */
function garantir(doc, altura, contexto) {
  if (doc.y + altura <= limiteInferior(doc)) return false;
  doc.addPage();
  doc.y = MARGEM;
  if (contexto?.semana) cabecalhoSemana(doc, contexto.semana, true);
  if (contexto?.frente) cabecalhoFrente(doc, `${contexto.frente} (continuação)`);
  return true;
}

function desenharAtividade(doc, atividade, restricoes, contexto, cols, { primeiraVez }) {
  const w = larguraUtil(doc);
  const larguraTexto = w - 250;
  const hTitulo = medirAtividade(doc, atividade, larguraTexto);
  const alturaTitulo = Math.max(20, hTitulo + 10);

  // Mantém o título da atividade junto da primeira restrição.
  const primeira = restricoes[0] ? medirRestricao(doc, restricoes[0], cols) : 0;
  garantir(doc, alturaTitulo + primeira + 6, contexto);

  const y = doc.y;
  doc.rect(MARGEM, y, w, alturaTitulo).fill(atividade.bloqueio_vencido ? COR.vermelhoSuave : '#eef2f7');
  doc.rect(MARGEM, y, 3, alturaTitulo).fill(atividade.bloqueio_vencido ? COR.vermelho : '#ef4444');
  doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(8).text(atividade.codigo_atividade, MARGEM + 9, y + 6, { width: 70, lineBreak: false });
  doc.fillColor(COR.texto).font('Helvetica-Bold').fontSize(9).text(atividade.descricao || '', MARGEM + 82, y + 5.5, { width: larguraTexto });

  let xDireita = MARGEM + w - 6;
  const mensagem = `${dataBr(atividade.inicio)} a ${dataBr(atividade.termino)} · ${Math.round(Number(atividade.avanco_fisico_real) || 0)}%`;
  doc.font('Helvetica').fontSize(8);
  const larguraMsg = doc.widthOfString(mensagem);
  xDireita -= larguraMsg;
  doc.fillColor(COR.suave).text(mensagem, xDireita, y + 7, { lineBreak: false });
  if (atividade.caminho_critico) {
    xDireita -= 56;
    selo(doc, 'CRÍTICA', xDireita, y + 4.5, COR.vermelho, { largura: 50, altura: 12, tamanho: 7 });
  }
  if (!primeiraVez) {
    xDireita -= 4;
  }
  doc.y = y + alturaTitulo;

  restricoes.forEach((restricao, i) => {
    const altura = medirRestricao(doc, restricao, cols);
    if (garantir(doc, altura + 2, contexto)) {
      // Repete a atividade na nova página para o leitor não perder o contexto.
      cabecalhoColunas(doc, cols);
      doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(8).text(`${atividade.codigo_atividade} · ${atividade.descricao} (continuação)`, MARGEM + 4, doc.y, { width: w - 8, lineBreak: false });
      doc.y += 12;
    }
    desenharRestricao(doc, restricao, cols, altura, i);
  });
  doc.y += 6;
}

/** Cabeçalho de colunas (uma vez por semana/frente). */
function cabecalhoColunas(doc, cols) {
  const y = doc.y;
  doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(7);
  ['TIPO', 'RESTRIÇÃO', 'PLANO DE AÇÃO', 'RESPONSÁVEL', 'PRAZO / SITUAÇÃO'].forEach((titulo, i) => {
    doc.text(titulo, cols[i].x + 6, y, { width: cols[i].w - 12, lineBreak: false });
  });
  doc.y = y + 11;
}

function rodapes(doc, obra, usuario) {
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(i);
    const ySalva = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // permite escrever na faixa do rodapé sem abrir página
    const y = doc.page.height - 26;
    doc.moveTo(MARGEM, y - 4).lineTo(doc.page.width - MARGEM, y - 4).lineWidth(0.5).strokeColor(COR.linha).stroke();
    doc.fillColor(COR.suave).font('Helvetica').fontSize(7.5);
    doc.text(
      `Synapse · Omega Service  |  ${obra.ss || 'Obra'}  |  Gerado em ${dataHoraBr()}${usuario?.nome ? ` por ${usuario.nome}` : ''}`,
      MARGEM,
      y,
      { width: doc.page.width - MARGEM * 2 - 80, lineBreak: false }
    );
    doc.text(`Página ${i + 1} de ${total}`, doc.page.width - MARGEM - 80, y, { width: 80, align: 'right', lineBreak: false });
    doc.page.margins.bottom = ySalva;
  }
}

/* -------------------------------------------------------------------------- */
/* Geração                                                                    */
/* -------------------------------------------------------------------------- */

function filtrarSemanas(query) {
  if (query.semana === undefined || String(query.semana).trim() === '') return null;
  const lista = String(query.semana).split(',').map((p) => Number(p.trim()));
  if (lista.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) {
    throw new AppError(400, 'O parâmetro "semana" deve ser um número de 1 a 6 (ou uma lista, ex.: "1,2").');
  }
  return lista;
}

/**
 * @returns {Promise<{ buffer: Buffer, nomeArquivo: string, atividades: number, restricoes: number }>}
 * Query: semana (1–6 ou lista), data_referencia (AAAA-MM-DD), versao_id, baixadas (true = inclui as baixadas).
 */
async function gerarPdfRestricoes(obraIdParam, query = {}, usuario = null) {
  const semanasFiltro = filtrarSemanas(query);
  const incluirBaixadas = ['true', '1', 'sim'].includes(String(query.baixadas || '').toLowerCase());

  const lookahead = await lookaheadService.obterLookahead(obraIdParam, {
    versao_id: query.versao_id,
    data_referencia: query.data_referencia,
  });
  const obra = await obraRepository.findById(lookahead.obra_id);
  if (!obra) throw new AppError(404, `Obra ${lookahead.obra_id} não encontrada.`);

  // Restrições pendentes por tipo (todas do horizonte, sem repetir a mesma restrição).
  const vistas = new Set();
  const pendentesPorTipo = {};
  const atividadesPorSemana = [];
  const jaListadas = new Set();
  lookahead.semanas.forEach((semana) => {
    const listadas = [];
    semana.atividades.forEach((a) => {
      a.restricoes.forEach((r) => {
        if (r.status === 'PENDENTE' && !vistas.has(r.id)) {
          vistas.add(r.id);
          pendentesPorTipo[r.tipo] = (pendentesPorTipo[r.tipo] || 0) + 1;
        }
      });
      // Atividade longa: só na primeira semana em que aparece.
      if (jaListadas.has(a.codigo_atividade)) return;
      const restricoes = a.restricoes.filter((r) => (incluirBaixadas ? true : r.status === 'PENDENTE'));
      if (!restricoes.length) return;
      jaListadas.add(a.codigo_atividade);
      listadas.push({ atividade: a, restricoes });
    });
    atividadesPorSemana.push({ semana, itens: listadas });
  });

  const semanasUsadas = atividadesPorSemana.filter(({ semana }) => !semanasFiltro || semanasFiltro.includes(semana.numero));
  if (!semanasUsadas.length) throw new AppError(400, 'Nenhuma semana do lookahead corresponde ao filtro informado.');

  const doc = criarDocumento(`Restrições do Lookahead — ${obra.ss || `Obra ${obra.id}`}`);
  const pedacos = [];
  doc.on('data', (p) => pedacos.push(p));
  const finalizado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);
  });

  cabecalhoPagina(doc, obra, lookahead);
  resumo(doc, obra, lookahead, pendentesPorTipo);

  const cols = colunas(doc);
  let totalAtividades = 0;
  let totalRestricoes = 0;

  semanasUsadas.forEach(({ semana, itens }) => {
    garantir(doc, 80, null);
    cabecalhoSemana(doc, semana);

    if (!itens.length) {
      doc.fillColor(COR.verde).font('Helvetica-Oblique').fontSize(9).text(
        semana.total
          ? `Nenhuma restrição pendente: as ${semana.total} atividade(s) da semana estão liberadas.`
          : 'Sem atividades programadas na semana.',
        MARGEM + 8,
        doc.y,
        { width: larguraUtil(doc) - 16 }
      );
      doc.y += 14;
      return;
    }

    // Por frente de serviço; críticas e mais antigas primeiro.
    const porFrente = new Map();
    itens.forEach((item) => {
      const frente = item.atividade.frente || 'Sem frente definida';
      if (!porFrente.has(frente)) porFrente.set(frente, []);
      porFrente.get(frente).push(item);
    });

    [...porFrente.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .forEach(([frente, lista]) => {
        lista.sort(
          (x, y) =>
            Number(y.atividade.bloqueio_vencido) - Number(x.atividade.bloqueio_vencido) ||
            Number(y.atividade.caminho_critico) - Number(x.atividade.caminho_critico) ||
            String(x.atividade.inicio).localeCompare(String(y.atividade.inicio))
        );
        garantir(doc, 70, { semana });
        cabecalhoFrente(doc, frente);
        cabecalhoColunas(doc, cols);
        lista.forEach(({ atividade, restricoes }) => {
          desenharAtividade(doc, atividade, restricoes, { semana, frente }, cols, { primeiraVez: true });
          totalAtividades += 1;
          totalRestricoes += restricoes.length;
        });
      });
    doc.y += 6;
  });

  if (!totalAtividades && semanasUsadas.every(({ itens }) => !itens.length) && lookahead.resumo.atividades_no_horizonte) {
    // Tudo liberado: resposta já indicada em cada semana.
  }

  rodapes(doc, obra, usuario);
  doc.end();
  const buffer = await finalizado;

  const identificador = String(obra.ss || obra.pep || `obra-${obra.id}`).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  return {
    buffer,
    nomeArquivo: `Restricoes_${identificador}_${lookahead.versao.versao.replace(/\s+/g, '')}_${lookahead.data_referencia}${
      semanasFiltro ? `_semana-${semanasFiltro.join('-')}` : ''
    }.pdf`,
    atividades: totalAtividades,
    restricoes: totalRestricoes,
  };
}

module.exports = { gerarPdfRestricoes };

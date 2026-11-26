'use strict';

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { DIAS_SEMANA, datasDaSemana, normalizarDias } = require('../utils/programacaoS1');

/**
 * PDF da reunião S+1 (A4 paisagem): cabeçalho com a logo, indicadores da semana, programados por dia,
 * resumo por frente, detalhamento de cada frente → equipe (pessoas e dias, atividades programadas,
 * principais atividades e premissas), saldo por função, quem ficou sem programação e conflitos.
 * Recebe a programação já completa de programacaoService.obter (com `resumo`) e o efetivo do contrato.
 */

const MARGEM = 30;
const COR = {
  texto: '#1e293b', suave: '#64748b', linha: '#e2e8f0', fundo: '#f1f5f9', marca: '#9f132e', marcaClara: '#fbe9ec',
  ambar: '#b45309', ambarClaro: '#fef3c7', verde: '#047857',
};
const LOGO = path.join(__dirname, '..', '..', 'frontend', 'public', 'brand', 'logo-colorido.png');
const ROTULO_TIPO = { OBRA: 'Obra', APOIO: 'Itinerante', DISPONIVEL: 'Disponível', AFASTAMENTO: 'Férias / INSS' };
const ROTULO_STATUS = { EM_ELABORACAO: 'Em elaboração', EMITIDA: 'Emitida' };

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const horaBr = (v) => (v
  ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');
const rev = (n) => `rev${String(n ?? 0).padStart(2, '0')}`;

/** Dias trabalhados por posição (SEG..DOM) somando as pessoas de uma lista de alocações. */
const somaDias = (alocacoes) => DIAS_SEMANA.map((_, i) => alocacoes.filter((a) => normalizarDias(a.dias)[i]).length);

function gerarPdfProgramacao(programacao, { efetivo = [], geradoPor = null } = {}) {
  return new Promise((resolve, reject) => {
    const nomeSemana = `Semana ${programacao.semana}/${programacao.ano} · ${rev(programacao.revisao)}`;
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margin: MARGEM, bufferPages: true,
      info: { Title: `Reunião S+1 · ${nomeSemana}`, Author: 'Sinapse - Omega Service' },
    });
    const pedacos = [];
    doc.on('data', (p) => pedacos.push(p));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    const resumo = programacao.resumo || {};
    const iso = datasDaSemana(programacao.data_inicio);
    const largura = doc.page.width - MARGEM * 2;
    const limite = () => doc.page.height - MARGEM - 22;
    const garantir = (altura) => {
      if (doc.y + altura > limite()) {
        doc.addPage();
        doc.y = MARGEM;
      }
    };

    /* --------------------------------------------------------------- blocos */
    const secao = (texto) => {
      garantir(60);
      doc.moveDown(0.5);
      const y0 = doc.y;
      doc.rect(MARGEM, y0, 4, 16).fill(COR.marca);
      doc.fillColor(COR.texto).font('Helvetica-Bold').fontSize(11).text(texto.toUpperCase(), MARGEM + 10, y0 + 3, { width: largura - 10, lineBreak: false });
      doc.x = MARGEM;
      doc.y = y0 + 22;
    };

    /**
     * Tabela simples: colunas { titulo, largura, alinhar?, fonte? }; linhas de células (texto ou
     * { texto, cor, fundo, negrito }). Quebra página repetindo o cabeçalho.
     */
    const tabela = (colunas, linhas, { tamanho = 8, destaqueUltima = false } = {}) => {
      const alturaCab = 16;
      const larguras = colunas.map((c) => c.largura);
      const cabecalho = () => {
        const y0 = doc.y;
        doc.rect(MARGEM, y0, largura, alturaCab).fill(COR.fundo);
        let x = MARGEM;
        colunas.forEach((c, i) => {
          doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(7)
            .text(c.titulo.toUpperCase(), x + 4, y0 + 5, { width: larguras[i] - 8, align: c.alinhar || 'left', lineBreak: false });
          x += larguras[i];
        });
        doc.y = y0 + alturaCab;
      };
      garantir(alturaCab + 16);
      cabecalho();
      linhas.forEach((linha, n) => {
        const celulas = linha.map((v) => (v && typeof v === 'object' ? v : { texto: v }));
        doc.font('Helvetica').fontSize(tamanho);
        const altura = Math.max(14, ...celulas.map((c, i) => doc.heightOfString(String(c.texto ?? '—'), { width: larguras[i] - 8 }) + 6));
        if (doc.y + altura > limite()) {
          doc.addPage();
          doc.y = MARGEM;
          cabecalho();
        }
        const y0 = doc.y;
        const ultima = destaqueUltima && n === linhas.length - 1;
        if (ultima) doc.rect(MARGEM, y0, largura, altura).fill(COR.fundo);
        let x = MARGEM;
        celulas.forEach((c, i) => {
          if (c.fundo) doc.rect(x + 1, y0 + 1, larguras[i] - 2, altura - 2).fill(c.fundo);
          doc.fillColor(c.cor || COR.texto).font(c.negrito || ultima ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamanho)
            .text(String(c.texto ?? '—'), x + 4, y0 + 3, { width: larguras[i] - 8, align: colunas[i].alinhar || 'left' });
          x += larguras[i];
        });
        doc.moveTo(MARGEM, y0 + altura).lineTo(MARGEM + largura, y0 + altura).lineWidth(0.5).strokeColor(COR.linha).stroke();
        doc.x = MARGEM;
        doc.y = y0 + altura;
      });
      doc.moveDown(0.4);
    };

    /** Colunas SEG..DOM (data embaixo) com a largura dada. */
    const colunasDias = (w) => DIAS_SEMANA.map((d, i) => ({ titulo: `${d} ${ddmm(iso[i])}`, largura: w, alinhar: 'center' }));
    const marcaDia = (v) => (v ? { texto: '1', cor: '#ffffff', fundo: COR.marca, negrito: true } : '');

    const paragrafo = (rotulo, texto) => {
      if (!texto || !String(texto).trim()) return;
      doc.font('Helvetica').fontSize(8.5);
      garantir(doc.heightOfString(String(texto), { width: largura - 10 }) + 18);
      doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(8).text(rotulo.toUpperCase(), MARGEM, doc.y);
      doc.fillColor(COR.texto).font('Helvetica').fontSize(8.5).text(String(texto).trim(), MARGEM + 6, doc.y + 1, { width: largura - 10 });
      doc.x = MARGEM;
      doc.moveDown(0.4);
    };

    /* ------------------------------------------------------------ cabeçalho */
    try {
      if (fs.existsSync(LOGO)) doc.image(LOGO, MARGEM, MARGEM - 8, { height: 46 });
    } catch {
      /* a logo é opcional */
    }
    doc.fillColor(COR.texto).font('Helvetica-Bold').fontSize(17).text('REUNIÃO S+1 — PROGRAMAÇÃO DE MÃO DE OBRA', MARGEM, MARGEM - 2, { width: largura, align: 'right' });
    doc.fillColor(COR.suave).font('Helvetica').fontSize(9.5).text(
      `${nomeSemana} · ${dataBr(iso[0])} a ${dataBr(iso[6])} · ${ROTULO_STATUS[programacao.status] || programacao.status}`
        + `${programacao.emitida_em ? ` em ${horaBr(programacao.emitida_em)}` : ''}`,
      { width: largura, align: 'right' },
    );
    doc.y = MARGEM + 44;
    doc.rect(MARGEM, doc.y, largura, 2).fill(COR.marca);
    doc.y += 10;

    /* ---------------------------------------------------------- indicadores */
    const frentes = programacao.frentes || [];
    const obras = frentes.filter((f) => f.tipo === 'OBRA');
    const pessoasProgramadas = new Set();
    frentes.forEach((f) => f.equipes.forEach((e) => e.alocacoes.forEach((a) => pessoasProgramadas.add(a.matricula || a.nome))));
    const indisponiveis = efetivo.filter((c) => c.situacao === 'INDISPONIVEL').length;
    const cartoes = [
      ['Efetivo mobilizado', efetivo.length || '—', `${efetivo.length - indisponiveis} disponíveis`],
      ['Pessoas programadas', pessoasProgramadas.size, 'na semana'],
      ['Frentes de obra', obras.length, `${frentes.length - obras.length} itinerantes/outras`],
      ['Equipes', frentes.reduce((s, f) => s + f.equipes.length, 0), 'em todas as frentes'],
      ['Sem programação', (resumo.nao_programados || []).length, 'mobilizados fora da semana', (resumo.nao_programados || []).length > 0],
      ['Férias / INSS', indisponiveis, 'indisponíveis'],
      ['Conflitos', (resumo.conflitos || []).length, 'mesma pessoa, mesmo dia', (resumo.conflitos || []).length > 0],
    ];
    const lc = (largura - 6 * 6) / cartoes.length;
    const yc = doc.y;
    cartoes.forEach(([titulo, valor, detalhe, alerta], i) => {
      const x = MARGEM + i * (lc + 6);
      doc.roundedRect(x, yc, lc, 46, 4).fillAndStroke(alerta ? COR.ambarClaro : '#ffffff', COR.linha);
      doc.fillColor(COR.suave).font('Helvetica-Bold').fontSize(6.5).text(titulo.toUpperCase(), x + 7, yc + 6, { width: lc - 14, lineBreak: false });
      doc.fillColor(alerta ? COR.ambar : COR.texto).font('Helvetica-Bold').fontSize(16).text(String(valor), x + 7, yc + 15, { width: lc - 14, lineBreak: false });
      doc.fillColor(COR.suave).font('Helvetica').fontSize(6.5).text(detalhe, x + 7, yc + 34, { width: lc - 14, lineBreak: false });
    });
    doc.x = MARGEM;
    doc.y = yc + 54;

    /* ---------------------------------------------------- programados / dia */
    secao('Programados por dia');
    const porDia = resumo.programados_por_dia || DIAS_SEMANA.map(() => 0);
    tabela(
      [{ titulo: 'Pessoas distintas em obra / apoio', largura: largura - 7 * 70 }, ...colunasDias(70)],
      [['Programados', ...porDia.map((n) => ({ texto: n, negrito: true }))]],
      { tamanho: 9 },
    );

    /* ---------------------------------------------------- resumo por frente */
    secao(`Resumo por frente (${frentes.length})`);
    const wDia = 34;
    tabela(
      [
        { titulo: 'SS / código', largura: 62 },
        { titulo: 'Frente', largura: 200 },
        { titulo: 'Tipo', largura: 62 },
        { titulo: 'Responsável', largura: largura - 62 - 200 - 62 - 48 - 46 - 7 * wDia },
        { titulo: 'Equipes', largura: 48, alinhar: 'center' },
        { titulo: 'Pessoas', largura: 46, alinhar: 'center' },
        ...DIAS_SEMANA.map((d) => ({ titulo: d, largura: wDia, alinhar: 'center' })),
      ],
      [
        ...frentes.map((f) => {
          const alocacoes = f.equipes.flatMap((e) => e.alocacoes);
          return [
            f.obra?.orcamento?.ss || f.codigo || '—', f.titulo, ROTULO_TIPO[f.tipo] || f.tipo, f.responsavel || '—',
            f.equipes.length, alocacoes.length, ...somaDias(alocacoes).map((n) => n || '—'),
          ];
        }),
        (() => {
          const todas = frentes.flatMap((f) => f.equipes.flatMap((e) => e.alocacoes));
          return ['', 'TOTAL', '', '', frentes.reduce((s, f) => s + f.equipes.length, 0), todas.length, ...somaDias(todas)];
        })(),
      ],
      { destaqueUltima: true },
    );

    /* --------------------------------------------------------- detalhamento */
    secao('Detalhamento por frente e equipe');
    frentes.forEach((f) => {
      // Cada frente começa em página nova só quando não cabe a faixa + uma equipe.
      garantir(150);
      doc.moveDown(0.6);
      const ss = f.obra?.orcamento?.ss || f.codigo;
      const y0 = doc.y;
      doc.rect(MARGEM, y0, largura, 24).fill(COR.marca);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
        .text(`${ss ? `${ss} · ` : ''}${f.titulo}`, MARGEM + 8, y0 + 7, { width: largura - 150, lineBreak: false, ellipsis: true });
      doc.font('Helvetica-Bold').fontSize(9).text(ROTULO_TIPO[f.tipo] || f.tipo, MARGEM + largura - 140, y0 + 8, { width: 132, align: 'right' });
      doc.y = y0 + 30;
      doc.x = MARGEM;

      const o = f.obra;
      const info = [
        o?.orcamento?.descricao ? ['Obra', o.orcamento.descricao] : null,
        o?.orcamento?.pep ? ['PEP/CC', o.orcamento.pep] : null,
        o?.osi_numero ? ['OSI', o.osi_numero] : null,
        f.responsavel ? ['Responsável', f.responsavel] : null,
        o?.orcamento?.endereco ? ['Local', o.orcamento.endereco] : null,
        o?.categoria === 'CANTEIRO_CENTRAL' ? ['Categoria', 'Canteiro Central'] : null,
      ].filter(Boolean);
      if (info.length) {
        doc.fontSize(8.5);
        info.forEach(([r, v], i) => {
          doc.fillColor(COR.suave).font('Helvetica-Bold').text(`${r}: `, { continued: true });
          doc.fillColor(COR.texto).font('Helvetica').text(`${v}${i < info.length - 1 ? '    ' : ''}`, { continued: i < info.length - 1 });
        });
        doc.moveDown(0.5);
      }
      if (!f.equipes.length) {
        doc.fillColor(COR.suave).font('Helvetica-Oblique').fontSize(9).text('Nenhuma equipe nesta frente.');
        return;
      }

      f.equipes.forEach((e) => {
        garantir(90);
        doc.moveDown(0.3);
        const ye = doc.y;
        doc.rect(MARGEM, ye, largura, 18).fill(COR.marcaClara);
        doc.fillColor(COR.marca).font('Helvetica-Bold').fontSize(10)
          .text(`${e.codigo || 'EQUIPE'}${e.disciplina ? ` · ${e.disciplina}` : ''}`, MARGEM + 6, ye + 5, { width: largura - 120, lineBreak: false });
        doc.fillColor(COR.suave).font('Helvetica').fontSize(8.5).text(`${e.alocacoes.length} pessoa(s)`, MARGEM + largura - 112, ye + 5, { width: 106, align: 'right' });
        doc.x = MARGEM;
        doc.y = ye + 22;

        const wd = 46;
        const totais = somaDias(e.alocacoes);
        tabela(
          [
            { titulo: '#', largura: 24, alinhar: 'center' },
            { titulo: 'Matrícula', largura: 62 },
            { titulo: 'Nome', largura: 250 },
            { titulo: 'Função', largura: largura - 24 - 62 - 250 - 7 * wd },
            ...colunasDias(wd),
          ],
          [
            ...e.alocacoes.map((a, n) => [n + 1, a.matricula || '—', a.nome, a.funcao || '—', ...normalizarDias(a.dias).map(marcaDia)]),
            ['', '', 'TOTAL', '', ...totais.map((t) => t || '—')],
          ],
          { destaqueUltima: true },
        );

        const itens = (e.itens_atividade || []).map((i) => `• ${i.codigo_atividade ? `[${i.codigo_atividade}] ` : ''}${i.descricao}${i.observacao ? ` — ${i.observacao}` : ''}`);
        paragrafo('Atividades programadas', itens.join('\n'));
        paragrafo('Principais atividades', e.atividades);
        paragrafo('Premissas / pendências', e.premissas);
      });
    });

    /* --------------------------------------------------- saldo por função */
    const saldo = resumo.saldo_por_funcao || [];
    if (saldo.length) {
      doc.addPage();
      doc.y = MARGEM;
      secao('Saldo por função (efetivo disponível × programados)');
      const wd = 52;
      tabela(
        [
          { titulo: 'Função', largura: largura - 60 - 7 * wd },
          { titulo: 'Efetivo', largura: 60, alinhar: 'center' },
          ...DIAS_SEMANA.map((d, i) => ({ titulo: `${d} ${ddmm(iso[i])}`, largura: wd, alinhar: 'center' })),
        ],
        saldo.map((s) => [
          s.funcao, s.efetivo,
          ...s.programados.map((n, i) => {
            const falta = s.sem_programacao?.[i] ?? 0;
            return { texto: `${n}${falta ? ` (${falta > 0 ? '+' : ''}${falta})` : ''}`, cor: falta < 0 ? COR.marca : falta > 0 ? COR.ambar : COR.texto };
          }),
        ]),
      );
      doc.fillColor(COR.suave).font('Helvetica').fontSize(7.5)
        .text('Programados no dia; entre parênteses, o saldo: (+) disponível sem programação, (-) programado acima do efetivo da função.', MARGEM, doc.y, { width: largura });
    }

    /* ------------------------------------------------- pendências da semana */
    const semProgramacao = resumo.nao_programados || [];
    const conflitos = resumo.conflitos || [];
    const fora = resumo.fora_do_efetivo || [];
    if (semProgramacao.length || conflitos.length || fora.length) {
      garantir(120);
      if (semProgramacao.length) {
        secao(`Mobilizados sem programação (${semProgramacao.length})`);
        tabela([{ titulo: 'Matrícula', largura: 80 }, { titulo: 'Nome', largura: 320 }, { titulo: 'Função', largura: largura - 400 }],
          semProgramacao.map((p) => [p.matricula || '—', p.nome, p.funcao || '—']));
      }
      if (conflitos.length) {
        secao(`Conflitos — mesma pessoa em dois lugares no mesmo dia (${conflitos.length})`);
        tabela([{ titulo: 'Dia', largura: 70 }, { titulo: 'Matrícula', largura: 70 }, { titulo: 'Nome', largura: 220 }, { titulo: 'Onde está', largura: largura - 360 }],
          conflitos.map((c) => [`${DIAS_SEMANA[c.dia]} ${ddmm(iso[c.dia])}`, c.matricula || '—', c.nome, c.locais.map((l) => `${l.frente}${l.equipe ? ` (${l.equipe})` : ''}`).join(' · ')]));
      }
      if (fora.length) {
        secao(`Programados fora do efetivo do contrato (${fora.length})`);
        tabela([{ titulo: 'Matrícula', largura: 80 }, { titulo: 'Nome', largura: 320 }, { titulo: 'Função', largura: largura - 400 }],
          fora.map((p) => [p.matricula || '—', p.nome, p.funcao || '—']));
      }
    }

    /* ---------------------------------------------------------------- rodapé */
    const paginas = doc.bufferedPageRange();
    const rodape = `Sinapse · Omega Service — Reunião S+1 · ${nomeSemana} · gerado em ${horaBr(new Date())}${geradoPor ? ` por ${geradoPor}` : ''}`;
    for (let i = 0; i < paginas.count; i += 1) {
      doc.switchToPage(paginas.start + i);
      doc.page.margins.bottom = 0; // o rodapé fica abaixo da margem: sem isso o pdfkit abriria página nova
      const y = doc.page.height - MARGEM - 8;
      doc.moveTo(MARGEM, y - 4).lineTo(MARGEM + largura, y - 4).lineWidth(0.5).strokeColor(COR.linha).stroke();
      doc.fillColor(COR.suave).font('Helvetica').fontSize(7)
        .text(rodape, MARGEM, y, { width: largura - 80, lineBreak: false })
        .text(`Página ${i + 1} de ${paginas.count}`, MARGEM + largura - 80, y, { width: 80, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { gerarPdfProgramacao };

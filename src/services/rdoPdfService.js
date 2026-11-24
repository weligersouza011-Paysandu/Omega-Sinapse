'use strict';

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

/**
 * PDF do RDO (A4 retrato): cabeçalho, clima, atividades (% anterior → declarado → validado, mão de obra
 * e fotos de evidência), equipamentos, PTS, desvios, DSS, comentário e histórico de assinaturas.
 * Recebe o RDO já apresentado por rdoService (com totais calculados).
 */

const MARGEM = 36;
const COR = { texto: '#1e293b', suave: '#64748b', linha: '#e2e8f0', fundo: '#f8fafc', marca: '#9f132e', verde: '#059669', ambar: '#b45309' };
const LOGO = path.join(__dirname, '..', '..', 'frontend', 'public', 'brand', 'logo-colorido.png');
const MAX_FOTOS_NO_PDF = 12;
const TEMPO_FOTO_MS = 8000;

const ROTULO_STATUS = { RASCUNHO: 'Rascunho', FINALIZADO: 'Finalizado (aguardando validação)', APROVADO: 'Aprovado', DEVOLVIDO: 'Devolvido' };

const dataBr = (v) => {
  if (!v) return '—';
  const t = v instanceof Date ? v.toISOString() : String(v);
  const [a, m, d] = t.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
const horaBr = (v) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const num = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const minutosParaTexto = (m) => (m === null || m === undefined ? 'aguardando' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);

/** Baixa a foto (best effort): sem rede ou erro, o PDF segue só com o link. */
async function baixarImagem(url) {
  try {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), TEMPO_FOTO_MS);
    const resposta = await fetch(url, { signal: controlador.signal });
    clearTimeout(timer);
    if (!resposta.ok) return null;
    const tipo = resposta.headers.get('content-type') || '';
    // pdfkit só lê JPEG e PNG; o Cloudinary entrega WebP, então pede a conversão na URL.
    if (!/jpeg|png/.test(tipo)) return null;
    return Buffer.from(await resposta.arrayBuffer());
  } catch {
    return null;
  }
}

/** Para fotos .webp do Cloudinary, pede a versão JPEG (pdfkit não lê WebP). */
function urlParaPdf(url) {
  return /res\.cloudinary\.com/.test(url) ? url.replace('/upload/', '/upload/f_jpg,w_700/').replace(/\.webp$/i, '.jpg') : url;
}

function gerarPdfRdo(rdo, { fotosBaixadas = new Map() } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGEM, bufferPages: true, info: { Title: `RDO ${rdo.id}`, Author: 'Sinapse - Omega Service' } });
    const pedacos = [];
    doc.on('data', (p) => pedacos.push(p));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    const largura = doc.page.width - MARGEM * 2;
    const limite = () => doc.page.height - MARGEM - 24;
    const garantir = (altura) => {
      if (doc.y + altura > limite()) doc.addPage();
    };
    const titulo = (texto) => {
      garantir(40);
      doc.moveDown(0.6);
      const y0 = doc.y;
      doc.rect(MARGEM, y0, largura, 18).fill(COR.fundo);
      doc.fillColor(COR.marca).font('Helvetica-Bold').fontSize(10).text(texto.toUpperCase(), MARGEM + 6, y0 + 4, { width: largura - 12, lineBreak: false });
      doc.fillColor(COR.texto);
      doc.x = MARGEM;
      doc.y = y0 + 24;
    };
    const linha = (rotulo, valor) => {
      garantir(14);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.suave).text(`${rotulo}: `, { continued: true });
      doc.font('Helvetica').fillColor(COR.texto).text(String(valor ?? '—'));
    };
    const texto = (t, opcoes = {}) => {
      garantir(14);
      doc.font('Helvetica').fontSize(9).fillColor(COR.texto).text(t, opcoes);
    };

    // ------------------------------------------------------------ cabeçalho
    try {
      if (fs.existsSync(LOGO)) doc.image(LOGO, MARGEM, MARGEM - 6, { height: 30 });
    } catch {
      /* logo é opcional */
    }
    doc.font('Helvetica-Bold').fontSize(15).fillColor(COR.texto).text('RELATÓRIO DIÁRIO DE OBRA (RDO)', MARGEM, MARGEM, { width: largura, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(COR.suave).text(`RDO nº ${rdo.id} · ${ROTULO_STATUS[rdo.status] || rdo.status}`, { width: largura, align: 'right' });
    doc.moveDown(2);

    titulo('Identificação');
    linha('Data', dataBr(rdo.data));
    linha('Encarregado', `${rdo.encarregado?.nome || '—'}${rdo.encarregado?.matricula ? ` (mat. ${rdo.encarregado.matricula})` : ''}`);
    linha('Contrato', rdo.contrato?.id_vale || '—');
    const obras = [...new Map(rdo.atividades.map((a) => [a.obra_id, a.obra])).values()].filter(Boolean);
    obras.forEach((o) => linha('Obra / SS', `${o.orcamento?.ss || `Obra ${o.id}`} · PEP ${o.orcamento?.pep || '—'} · ${o.orcamento?.descricao || ''}`));
    linha('Clima', `manhã: ${rdo.clima_manha || '—'} · tarde: ${rdo.clima_tarde || '—'} · noite: ${rdo.clima_noite || '—'}`);

    // ------------------------------------------------------------ atividades
    titulo(`Atividades (${rdo.atividades.length})`);
    rdo.atividades.forEach((a, i) => {
      garantir(70);
      const obra = a.obra?.orcamento?.ss ? `${a.obra.orcamento.ss} · ` : '';
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COR.texto).text(`${i + 1}. ${a.fora_de_escopo ? '[FORA DE ESCOPO] ' : `${a.codigo_atividade} - `}${a.descricao_snapshot}`, { width: largura });
      doc.font('Helvetica').fontSize(8.5).fillColor(COR.suave).text(obra + (a.fora_de_escopo ? 'Sem avanço no cronograma' : `Anterior ${pct(a.percentual_anterior)} → declarado ${pct(a.percentual_declarado)} → validado ${pct(a.percentual_validado)}`));
      if (a.observacao) texto(`Obs.: ${a.observacao}`);
      if (a.mao_obra.length) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COR.suave).text(`Mão de obra (${num(a.hh)} HH):`);
        a.mao_obra.forEach((m) =>
          texto(`  • ${m.tipo === 'FUNCAO' ? `${m.funcao?.nome || 'Função'} × ${num(m.quantidade)}` : m.colaborador?.nome || 'Colaborador'} — ${num(m.horas)} h (${num(m.hh)} HH)`)
        );
      }
      const fotos = a.fotos.map((f) => ({ f, buffer: fotosBaixadas.get(f.id) })).filter((x) => x.buffer);
      if (fotos.length) {
        let x = MARGEM;
        const tam = 120;
        fotos.forEach(({ buffer }) => {
          if (x + tam > MARGEM + largura) {
            x = MARGEM;
            doc.y += tam + 6;
          }
          garantir(tam + 8);
          try {
            doc.image(buffer, x, doc.y, { fit: [tam, tam] });
          } catch {
            /* imagem ilegível: ignora */
          }
          x += tam + 8;
        });
        doc.y += tam + 6;
        doc.x = MARGEM;
      }
      const semImagem = a.fotos.filter((f) => !fotosBaixadas.get(f.id));
      if (semImagem.length) texto(`Fotos (link): ${semImagem.map((f) => f.url).join('  ')}`, { width: largura });
      doc.moveDown(0.5);
    });

    // ------------------------------------------------------------ demais seções
    if (rdo.equipamentos.length) {
      titulo('Equipamentos');
      rdo.equipamentos.forEach((e) => texto(`• ${e.equipamento?.nome || 'Equipamento'}${e.equipamento?.codigo ? ` (${e.equipamento.codigo})` : ''} — trabalhadas ${num(e.horas_trabalhadas)} h · paradas ${num(e.horas_paradas)} h${e.observacao ? ` · ${e.observacao}` : ''}`));
    }
    if (rdo.pts.length) {
      titulo('PTS — Permissão de Trabalho');
      rdo.pts.forEach((p) => texto(`• ${p.numero || 's/ nº'} — solicitada ${horaBr(p.solicitado_em)} · liberada ${horaBr(p.liberado_em)} · espera ${minutosParaTexto(p.espera_minutos)}`));
      linha('Espera total', minutosParaTexto(rdo.totais.espera_pts_minutos));
    }
    if (rdo.desvios.length) {
      titulo('Desvios / improdutividades');
      rdo.desvios.forEach((d) => texto(`• ${d.motivo?.descricao || 'Motivo'} — ${num(d.horas)} h${d.observacao ? ` · ${d.observacao}` : ''}`));
      linha('Total', `${num(rdo.totais.desvios.total)} h`);
    }
    if (rdo.dss_tema || rdo.dss_participantes !== null) {
      titulo('DSS — Diálogo de Segurança');
      linha('Tema', rdo.dss_tema);
      linha('Participantes', rdo.dss_participantes);
    }
    if (rdo.comentario_geral) {
      titulo('Comentário geral');
      texto(rdo.comentario_geral, { width: largura });
    }

    titulo('Totais');
    linha('Homens-hora (HH)', num(rdo.totais.hh));

    titulo('Assinaturas e histórico');
    linha('Assinado pelo encarregado em', horaBr(rdo.assinado_em));
    if (rdo.decidido_em) linha(rdo.status === 'APROVADO' ? 'Aprovado por' : 'Devolvido por', `${rdo.decidido_por?.nome || '—'} em ${horaBr(rdo.decidido_em)}`);
    if (rdo.motivo_devolucao) linha('Motivo da devolução', rdo.motivo_devolucao);
    rdo.historico.forEach((h) => texto(`• ${horaBr(h.created_at)} — ${ROTULO_STATUS[h.para] || h.para}${h.usuario?.nome ? ` por ${h.usuario.nome}` : ''}${h.motivo ? ` (${h.motivo})` : ''}`));

    // rodapé com paginação
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor(COR.suave).text(`Sinapse · Omega Service — RDO ${rdo.id} — página ${i + 1} de ${paginas.count}`, MARGEM, doc.page.height - MARGEM + 4, { width: largura, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

/** Gera o PDF do RDO, embutindo (best effort) as primeiras fotos de evidência. */
async function gerarPdfDoRdo(rdo) {
  const fotos = rdo.atividades.flatMap((a) => a.fotos).slice(0, MAX_FOTOS_NO_PDF);
  const baixadas = new Map();
  await Promise.all(
    fotos.map(async (f) => {
      const buffer = await baixarImagem(urlParaPdf(f.url));
      if (buffer) baixadas.set(f.id, buffer);
    })
  );
  return gerarPdfRdo(rdo, { fotosBaixadas: baixadas });
}

module.exports = { gerarPdfDoRdo, gerarPdfRdo, urlParaPdf };

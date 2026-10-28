import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import DocumentoOsi from './DocumentoOsi.jsx';

/**
 * Pré-visualização da OSI em folha A4.
 *
 * O documento é montado em um portal que fica como filho direto do `<body>`
 * (#osi-impressao-root): assim, o CSS de impressão em `index.css` consegue
 * ocultar todo o restante da aplicação e imprimir apenas a OSI — o mesmo
 * caminho usado pelo "Salvar como PDF" do navegador (Ctrl + P).
 */
export default function ModalOsi({ aberto, obra, onFechar }) {
  useEffect(() => {
    if (!aberto) return undefined;

    function aoTeclar(evento) {
      if (evento.key === 'Escape') onFechar();
    }

    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  if (!aberto || !obra) return null;

  return createPortal(
    <div
      id="osi-impressao-root"
      role="dialog"
      aria-modal="true"
      aria-label="Pré-visualização da Ordem de Serviço Interna"
      className="fixed inset-0 z-[80] flex flex-col bg-slate-900/70 backdrop-blur-sm"
    >
      <div className="nao-imprimir flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Ordem de Serviço Interna
          </p>
          <p className="truncate text-sm font-bold text-white">
            {obra.osi_numero ? `OSI ${obra.osi_numero} · ` : ''}PEP {obra.pep || '—'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[11px] font-medium text-slate-400 sm:block">
            Use <strong className="text-slate-200">Ctrl + P</strong> para salvar em PDF
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn bg-white text-slate-800 shadow-sm hover:bg-slate-100 focus:ring-white/40"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir / Salvar PDF
          </button>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar pré-visualização"
            className="btn border border-white/20 bg-white/10 text-white hover:bg-white/20 focus:ring-white/40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Fechar
          </button>
        </div>
      </div>

      <div id="osi-impressao-rolagem" className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div
          id="osi-impressao"
          className="mx-auto w-full max-w-[210mm] rounded-sm bg-white shadow-2xl"
        >
          <DocumentoOsi obra={obra} geradoEm={new Date().toISOString()} />
        </div>
      </div>
    </div>,
    document.body
  );
}

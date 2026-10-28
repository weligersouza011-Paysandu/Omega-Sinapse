const ESTILOS = {
  sucesso: {
    casca: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    barra: 'bg-emerald-500',
    icone: 'M5 13l4 4L19 7',
  },
  erro: {
    casca: 'border-red-200 bg-red-50 text-red-800',
    barra: 'bg-red-500',
    icone: 'M6 6l12 12M18 6L6 18',
  },
  aviso: {
    casca: 'border-amber-200 bg-amber-50 text-amber-900',
    barra: 'bg-amber-500',
    icone: 'M12 8v5m0 3.5v.5',
  },
  info: {
    casca: 'border-sky-200 bg-sky-50 text-sky-800',
    barra: 'bg-sky-500',
    icone: 'M12 8h.01M11 12h1v5h1',
  },
};

/** Pilha de toasts no canto superior direito. */
export default function ToastContainer({ toasts, onFechar }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const estilo = ESTILOS[toast.tipo] || ESTILOS.info;

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 overflow-hidden rounded-lg border px-3 py-2.5 shadow-lg ${estilo.casca}`}
          >
            <span className={`mt-0.5 h-full w-1 shrink-0 self-stretch rounded-full ${estilo.barra}`} />

            <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
              <path d={estilo.icone} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            <p className="flex-1 text-sm font-medium leading-snug">{toast.mensagem}</p>

            <button
              type="button"
              onClick={() => onFechar(toast.id)}
              aria-label="Fechar aviso"
              className="rounded p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

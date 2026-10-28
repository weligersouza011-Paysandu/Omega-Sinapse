/** Casca visual para módulos ainda não implementados (Plug-and-Play). */
export default function PlaceholderModulo({ titulo, descricao, recursos = [] }) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">{titulo}</h2>
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
              Em breve
            </span>
          </div>
          {descricao ? <p className="mt-1 text-sm text-slate-500">{descricao}</p> : null}
        </div>

        <div className="px-6 py-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Estrutura preparada para receber
          </p>

          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recursos.map((recurso) => (
              <li
                key={recurso}
                className="flex items-start gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              >
                <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
                  <path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                {recurso}
              </li>
            ))}
          </ul>

          <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400">
            Módulo ainda não conectado à API. A rota, o menu e o layout já estão prontos — basta
            implementar a página e substituir este placeholder.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useTema } from '../context/TemaContext.jsx';

/** Alternador claro/escuro. `sobreEscuro` ajusta o contraste quando fica sobre fundo escuro fixo (login). */
export default function BotaoTema({ sobreEscuro = false, className = '' }) {
  const { escuro, alternar } = useTema();
  const rotulo = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
  const aparencia = sobreEscuro
    ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:ring-white/50'
    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 focus-visible:ring-omega-500/40';

  return (
    <button
      type="button"
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={escuro}
      className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition focus:outline-none focus-visible:ring-2 ${aparencia} ${className}`}
    >
      {escuro ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

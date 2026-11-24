import { Eye, EyeOff } from 'lucide-react';
import { useValoresOcultos } from '../context/ValoresOcultosContext.jsx';

/** Olho do cabeçalho (estilo app de banco): oculta/mostra todos os valores financeiros (R$) da página. */
export default function BotaoValoresOcultos({ className = '' }) {
  const { ocultos, alternar } = useValoresOcultos();
  const rotulo = ocultos ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros';
  const Icone = ocultos ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ocultos}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40 ${className}`}
    >
      <Icone className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}

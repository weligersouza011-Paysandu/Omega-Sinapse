import { obterStatus } from '../utils/status.js';

/** Badge colorida de status do orçamento. */
export default function StatusBadge({ status, className = '' }) {
  const info = obterStatus(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${info.cor} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {info.label}
    </span>
  );
}

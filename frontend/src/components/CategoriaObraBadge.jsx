import { CategoriaBadge } from './dashboard/DashboardBadges.jsx';

/**
 * Selo da categoria da obra (Carteira da Coordenação / Cadeia de Ajuda), com as
 * mesmas cores do Dashboard de Planejamento. Sem categoria definida mostra um
 * selo discreto "Sem categoria" (`mostrarVazio`), para o coordenador perceber
 * as obras ainda não classificadas.
 */
export default function CategoriaObraBadge({ categoria, mostrarVazio = true, className = '' }) {
  if (categoria) return <CategoriaBadge categoria={categoria} className={className} />;
  if (!mostrarVazio) return null;

  return (
    <span
      title="Categoria ainda não definida: o supervisor define na Edição / Configuração da obra."
      className={`inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400 ${className}`}
    >
      Sem categoria
    </span>
  );
}

import { NavLink } from 'react-router-dom';
import { ChartPie, LayoutGrid } from 'lucide-react';

/**
 * Navegação entre as visões do módulo de Orçamentos.
 *
 * As abas trocam de rota (e não de estado interno), então o item ativo é
 * resolvido pelo próprio router — o `end` na aba de listagem impede que
 * `/orcamentos/dashboard` a marque como ativa.
 *
 * A seção de Obras não entra aqui: ela é um módulo próprio, acessado pelo
 * menu lateral.
 */
const ABAS = [
  { rota: '/orcamentos', label: 'Orçamentos', Icone: LayoutGrid, exata: true },
  { rota: '/orcamentos/dashboard', label: 'Dashboard BI', Icone: ChartPie, exata: false },
];

export default function AbasOrcamentos() {
  return (
    <nav
      className="mb-5 inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
      aria-label="Visões do módulo de orçamentos"
    >
      {ABAS.map(({ rota, label, Icone, exata }) => (
        <NavLink
          key={rota}
          to={rota}
          end={exata}
          className={({ isActive }) =>
            [
              'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40',
              isActive
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            ].join(' ')
          }
        >
          <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

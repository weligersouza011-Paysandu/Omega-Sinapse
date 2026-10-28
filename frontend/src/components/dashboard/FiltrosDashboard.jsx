import { Filter, RotateCcw } from 'lucide-react';
import Dropdown from '../Dropdown.jsx';
import Spinner from '../Spinner.jsx';

/**
 * Filtros globais do dashboard: status e categoria da obra.
 * A limpeza devolve o recorte completo da carteira.
 */
export default function FiltrosDashboard({
  status = '',
  categoria = '',
  onStatus,
  onCategoria,
  onLimpar,
  opcoes = {},
  totalFiltrado = 0,
  totalGeral = 0,
  carregando = false,
}) {
  const statusOpcoes = [
    { value: '', label: 'Todos os status' },
    ...(opcoes.status || []).map((item) => ({
      value: item.value,
      label: `${item.label} (${item.total})`,
    })),
  ];

  const categoriaOpcoes = [
    { value: '', label: 'Todas as categorias' },
    ...(opcoes.categorias || []).map((item) => ({
      value: item.value,
      label: `${item.label} (${item.total})`,
    })),
  ];

  const temFiltro = Boolean(status || categoria);

  return (
    <section
      aria-label="Filtros globais do dashboard"
      className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-end"
    >
      <div className="flex items-center gap-2 text-slate-500 lg:mr-1 lg:pb-2">
        <Filter className="h-4 w-4" aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-wide">Filtros</span>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div>
          <label htmlFor="filtro-status-obra" className="rotulo">
            Status da obra
          </label>
          <Dropdown
            id="filtro-status-obra"
            value={status}
            onChange={onStatus}
            opcoes={statusOpcoes}
            placeholder="Todos os status"
          />
        </div>

        <div>
          <label htmlFor="filtro-categoria-obra" className="rotulo">
            Categoria da obra
          </label>
          <Dropdown
            id="filtro-categoria-obra"
            value={categoria}
            onChange={onCategoria}
            opcoes={categoriaOpcoes}
            placeholder="Todas as categorias"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onLimpar}
        disabled={!temFiltro}
        className="btn-neutro shrink-0 lg:ml-1"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Limpar Filtros
      </button>

      <div className="flex items-center gap-2 text-xs text-slate-500 lg:ml-auto lg:pb-2">
        {carregando ? <Spinner tamanho="sm" className="text-omega-600" /> : null}
        <span>
          Exibindo <strong className="font-bold text-slate-700">{totalFiltrado}</strong> de{' '}
          <strong className="font-bold text-slate-700">{totalGeral}</strong> obras
        </span>
      </div>
    </section>
  );
}

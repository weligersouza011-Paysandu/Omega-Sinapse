import { CheckCircle2, Loader2 } from 'lucide-react';
import CategoriaObraBadge from '../CategoriaObraBadge.jsx';
import { estiloCategoria } from '../dashboard/dashboardUtils.js';
import { CATEGORIAS_OBRA } from '../../utils/categoriaObra.js';

/**
 * Seletor da categoria da obra (grupo de opções com descrição). A escolha é
 * gravada na hora, no mesmo fluxo da atribuição do planejador principal.
 * Sem permissão de classificar, exibe apenas o selo da categoria atual.
 */
export default function SeletorCategoriaObra({ categoria, podeAlterar, salvando = false, onSelecionar }) {
  if (!podeAlterar) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <CategoriaObraBadge categoria={categoria} />
        {!categoria ? <span className="text-xs text-slate-500">Somente supervisor ou administrador define a categoria.</span> : null}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label="Categoria da obra" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {CATEGORIAS_OBRA.map((opcao) => {
        const ativa = categoria === opcao.value;
        const estilo = estiloCategoria(opcao.value);
        return (
          <button
            key={opcao.value}
            type="button"
            role="radio"
            aria-checked={ativa}
            disabled={salvando}
            onClick={() => onSelecionar(opcao.value)}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40 disabled:opacity-60 ${
              ativa ? 'border-omega-500 bg-omega-50/60 ring-1 ring-omega-500/30' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${estilo.ponto}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">{opcao.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{opcao.descricao}</span>
            </span>
            {ativa ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-omega-600" aria-label="Categoria atual" />
            ) : salvando ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-300" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

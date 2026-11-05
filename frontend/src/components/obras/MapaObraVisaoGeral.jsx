import { lazy, Suspense, useState } from 'react';
import { ChevronDown, ExternalLink, Loader2, MapPin } from 'lucide-react';
import { coordenadasDe } from '../../utils/coordenadas.js';
import { urlAbrirGoogle } from '../../utils/googleMaps.js';

const MapaLocalizacoes = lazy(() => import('./MapaLocalizacoes.jsx'));

/**
 * Mapa da Visão Geral: todas as localizações da obra juntas, em satélite. A lista
 * ponto a ponto fica recolhida. O Google Maps incorporado por iframe não serve
 * aqui porque só mostra um pino por vez.
 */
export default function MapaObraVisaoGeral({ localizacoes = [], altura = 'h-80' }) {
  const [listaAberta, setListaAberta] = useState(false);
  const pontos = localizacoes
    .map((localizacao) => ({ localizacao, posicao: coordenadasDe(localizacao) }))
    .filter((item) => item.posicao);

  if (!pontos.length) return null;

  return (
    <div>
      <Suspense
        fallback={
          <div className={`flex ${altura} items-center justify-center bg-slate-100 text-slate-400`}>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        }
      >
        <MapaLocalizacoes localizacoes={localizacoes} altura={altura} satelite />
      </Suspense>

      <button
        type="button"
        onClick={() => setListaAberta((aberta) => !aberta)}
        aria-expanded={listaAberta}
        className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        {listaAberta ? 'Ocultar lista de localizações' : `Ver lista de localizações (${pontos.length})`}
        <ChevronDown className={`h-4 w-4 transition-transform ${listaAberta ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {listaAberta ? (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 text-xs">
          {pontos.map(({ localizacao, posicao }, indice) => (
            <li key={localizacao.id ?? indice} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="truncate">{localizacao.descricao || 'Ponto'}</span>
              </span>
              <a
                href={urlAbrirGoogle(posicao)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 font-semibold text-omega-700 hover:underline"
              >
                Abrir no Google Maps
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

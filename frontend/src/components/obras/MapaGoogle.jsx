import { useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { coordenadasDe } from '../../utils/coordenadas.js';
import { urlAbrirGoogle, urlGoogleComPino } from '../../utils/googleMaps.js';

/**
 * Localização da obra no Google Maps (imagem de satélite), incorporado por iframe.
 *
 * - Com a chave `VITE_GOOGLE_MAPS_KEY` usa a Maps Embed API oficial (gratuita);
 *   sem ela, usa a incorporação pública do Google Maps (sem chave).
 * - O modo incorporado mostra um ponto: o mapa centraliza na primeira
 *   localização com coordenadas; as demais aparecem listadas com link.
 * - "Ver obra" (bairro) e "Ver cidade" alternam o enquadramento.
 */

const ZOOM = { obra: 16, cidade: 13 };

export default function MapaGoogle({ localizacoes = [], altura = 'h-80' }) {
  const [enquadramento, setEnquadramento] = useState('obra');
  const pontos = localizacoes
    .map((localizacao) => ({ localizacao, posicao: coordenadasDe(localizacao) }))
    .filter((item) => item.posicao);

  if (!pontos.length) return null;
  const [principal, ...outros] = pontos;

  return (
    <div>
      <div className={`relative w-full ${altura} bg-slate-200`}>
        <iframe
          key={`${principal.posicao.join(',')}-${enquadramento}`}
          title={`Localização da obra: ${principal.localizacao.descricao || 'ponto principal'}`}
          src={urlGoogleComPino(principal.posicao, ZOOM[enquadramento])}
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <div className="absolute left-3 top-3 inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs font-semibold shadow-sm">
          {[
            ['obra', 'Ver obra'],
            ['cidade', 'Ver cidade'],
          ].map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => setEnquadramento(id)}
              className={`rounded px-2.5 py-1 ${enquadramento === id ? 'bg-omega-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-slate-100 border-t border-slate-100 text-xs">
        {[principal, ...outros].map(({ localizacao, posicao }, indice) => (
          <li key={localizacao.id ?? indice} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
              <MapPin className={`h-3.5 w-3.5 shrink-0 ${indice === 0 ? 'text-red-500' : 'text-slate-400'}`} aria-hidden="true" />
              <span className="truncate">
                {localizacao.descricao || 'Ponto'}
                {indice === 0 && outros.length ? <span className="text-slate-400"> · no mapa</span> : null}
              </span>
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
    </div>
  );
}

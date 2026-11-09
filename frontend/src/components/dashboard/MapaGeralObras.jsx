import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, Globe2, Map as MapIcon, MapPin } from 'lucide-react';
import { estiloCategoria } from './dashboardUtils.js';
import { urlAbrirGoogle } from '../../utils/googleMaps.js';

/** Região padrão (Carajás/PA) usada quando o filtro não retorna coordenadas. */
const CENTRO_PADRAO = [-6.05, -50.13];

/** Enquadra todos os pontos e, ao escolher um ponto da lista, aproxima nele. */
function Enquadrar({ pontos, foco }) {
  const mapa = useMap();

  useEffect(() => {
    // O contêiner pode ter sido dimensionado depois da montagem (layout em grade).
    const id = setTimeout(() => mapa.invalidateSize(), 150);
    return () => clearTimeout(id);
  }, [mapa]);

  useEffect(() => {
    if (foco) {
      mapa.flyTo([Number(foco.latitude), Number(foco.longitude)], 17, { duration: 0.8 });
      return;
    }
    const coordenadas = pontos.map((p) => [Number(p.latitude), Number(p.longitude)]);
    if (!coordenadas.length) return;
    if (coordenadas.length === 1) mapa.setView(coordenadas[0], 15);
    else mapa.fitBounds(L.latLngBounds(coordenadas), { padding: [36, 36], maxZoom: 16 });
  }, [mapa, pontos, foco]);

  return null;
}

/**
 * Mapa geral do dashboard: imagem de satélite com TODAS as localizações das
 * obras do recorte ao mesmo tempo (um marcador por ponto, na cor da carteira).
 * A lista lateral aproxima o mapa no ponto escolhido.
 */
export default function MapaGeralObras({ mapa = {}, obras = [] }) {
  const pontos = useMemo(
    () =>
      (mapa.pontos || []).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))),
    [mapa.pontos]
  );
  const [selecionadoId, setSelecionadoId] = useState(null);
  const chave = (p) => `${p.obra_id}-${p.id}`;
  const selecionado = pontos.find((p) => chave(p) === selecionadoId) || null;

  const obrasComLocalizacao = useMemo(
    () => (obras || []).filter((obra) => Number(obra.quantidade_localizacoes) > 0).length,
    [obras]
  );
  const totalObras = (obras || []).length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
            <MapIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Mapa Geral de Obras e Localizações</h3>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-slate-500">
              Satélite com todas as localizações do ambiente de uma vez. Clique em um ponto para ver a obra ou escolha
              na lista para aproximar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
            <MapPin className="h-3.5 w-3.5 text-omega-600" aria-hidden="true" />
            {pontos.length} ponto(s)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
            {obrasComLocalizacao} de {totalObras} obra(s) no mapa
          </span>
        </div>
      </header>

      {pontos.length === 0 ? (
        <div className="flex h-[420px] flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center sm:h-[460px]">
          <MapPin className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhuma localização georreferenciada neste recorte</p>
          <p className="max-w-md text-xs text-slate-500">
            Cadastre coordenadas nas obras ou ajuste os filtros globais para visualizar os pontos no mapa.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem]">
          <div className="relative h-[420px] bg-slate-200 sm:h-[460px] xl:h-[520px]">
            <MapContainer center={CENTRO_PADRAO} zoom={8} scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution="Imagens &copy; Esri, Maxar, Earthstar Geographics"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
              <Enquadrar pontos={pontos} foco={selecionado} />
              {pontos.map((ponto) => {
                const categoria = estiloCategoria(ponto.categoria);
                const referencia = ponto.osi || ponto.ss || `Obra #${ponto.obra_id}`;
                const ativo = chave(ponto) === selecionadoId;
                return (
                  <CircleMarker
                    key={chave(ponto)}
                    center={[Number(ponto.latitude), Number(ponto.longitude)]}
                    radius={ativo ? 11 : 8}
                    pathOptions={{ color: '#ffffff', weight: 2, fillColor: categoria.hex, fillOpacity: 0.95 }}
                    eventHandlers={{ click: () => setSelecionadoId(chave(ponto)) }}
                  >
                    <Tooltip direction="top" offset={[0, -6]}>
                      {referencia} · {ponto.descricao || 'Ponto'}
                    </Tooltip>
                    <Popup>
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">
                          {referencia}
                          {ponto.ss && ponto.osi ? ` · SS ${ponto.ss}` : ''}
                        </p>
                        <p className="mt-0.5 text-slate-600">{ponto.descricao_obra}</p>
                        <p className="text-slate-400">{ponto.descricao}</p>
                        <p className="mt-1 flex gap-3 font-bold">
                          <Link to={`/obras/${ponto.obra_id}`} className="text-omega-700 hover:underline">
                            Abrir obra
                          </Link>
                          <a
                            href={urlAbrirGoogle([Number(ponto.latitude), Number(ponto.longitude)])}
                            target="_blank"
                            rel="noreferrer"
                            className="text-omega-700 hover:underline"
                          >
                            Google Maps
                          </a>
                        </p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
            {selecionado ? (
              <button
                type="button"
                onClick={() => setSelecionadoId(null)}
                className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                Ver todas as obras
              </button>
            ) : null}
          </div>

          <aside className="flex max-h-[520px] flex-col border-t border-slate-100 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pontos do recorte</p>
              <div className="flex gap-2 text-[10px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-cyan-600" /> Coordenação
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Cadeia de Ajuda
                </span>
              </div>
            </div>
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {pontos.map((ponto) => {
                const categoria = estiloCategoria(ponto.categoria);
                const ativo = chave(ponto) === selecionadoId;
                const referencia = ponto.osi || ponto.ss || `Obra #${ponto.obra_id}`;
                return (
                  <li key={chave(ponto)} className={ativo ? 'bg-omega-50' : ''}>
                    <button
                      type="button"
                      onClick={() => setSelecionadoId(ativo ? null : chave(ponto))}
                      className="flex w-full items-start gap-2 px-4 py-2 text-left hover:bg-slate-50"
                    >
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: categoria.hex }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-800">
                          {referencia}
                          {ponto.ss && ponto.osi ? <span className="font-normal text-slate-400"> · SS {ponto.ss}</span> : null}
                        </span>
                        <span className="block truncate text-[11px] text-slate-600" title={ponto.descricao_obra}>
                          {ponto.descricao_obra}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400">{ponto.descricao}</span>
                      </span>
                    </button>
                    {ativo ? (
                      <div className="flex gap-3 px-4 pb-2 pl-8 text-[11px] font-bold">
                        <Link to={`/obras/${ponto.obra_id}`} className="inline-flex items-center gap-1 text-omega-700 hover:underline">
                          Abrir obra
                        </Link>
                        <a
                          href={urlAbrirGoogle([Number(ponto.latitude), Number(ponto.longitude)])}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-omega-700 hover:underline"
                        >
                          Abrir no Google Maps
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-500">
        <span>
          {totalObras - obrasComLocalizacao > 0
            ? `${totalObras - obrasComLocalizacao} obra(s) ainda sem coordenadas no recorte.`
            : 'Todas as obras do recorte possuem localização geográfica.'}
        </span>
        <span className="font-medium text-slate-400">Imagem de satélite · pontos na cor da carteira</span>
      </footer>
    </section>
  );
}

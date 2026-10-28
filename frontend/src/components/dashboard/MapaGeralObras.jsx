import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, Map as MapIcon, MapPin } from 'lucide-react';
import { estiloCategoria } from './dashboardUtils.js';

/** Região padrão (Carajás/PA) usada quando o filtro não retorna coordenadas. */
const CENTRO_PADRAO = [-6.05, -50.13];

function AjustarLimites({ bounds }) {
  const mapa = useMap();

  useEffect(() => {
    if (!bounds || bounds.length !== 2) {
      mapa.setView(CENTRO_PADRAO, 10);
      return;
    }

    const [inicio, fim] = bounds;
    const mesmoPonto = inicio[0] === fim[0] && inicio[1] === fim[1];

    if (mesmoPonto) {
      mapa.setView(inicio, 14);
      return;
    }

    mapa.fitBounds(L.latLngBounds(inicio, fim), {
      padding: [36, 36],
      maxZoom: 14,
    });
  }, [mapa, bounds]);

  return null;
}

function formatarCoordenada(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 5,
    maximumFractionDigits: 7,
  });
}

function PopupPonto({ ponto }) {
  const categoria = estiloCategoria(ponto.categoria);
  const referencia = ponto.osi || ponto.ss || `Obra #${ponto.obra_id}`;

  return (
    <Popup maxWidth={310} minWidth={240}>
      <div className="space-y-1.5 text-xs">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
          {ponto.categoria_label || categoria.label}
        </p>
        <p className="text-sm font-bold text-slate-800">{referencia}</p>
        {ponto.ss ? <p className="text-slate-500">SS {ponto.ss}</p> : null}
        <p className="font-semibold leading-snug text-slate-700">{ponto.descricao_obra}</p>
        <p className="leading-snug text-slate-500">{ponto.descricao}</p>
        <p className="text-[10px] text-slate-400">
          {formatarCoordenada(ponto.latitude)}, {formatarCoordenada(ponto.longitude)}
        </p>
        <Link
          to={`/obras/${ponto.obra_id}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-omega-700 hover:underline"
        >
          Abrir obra
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </Popup>
  );
}

/**
 * Mapa geral do dashboard (Leaflet + OpenStreetMap).
 *
 * Exibe todos os pontos georreferenciados do recorte atual, coloridos pela
 * carteira da obra. O ajuste de limites acompanha a troca dos filtros globais.
 */
export default function MapaGeralObras({ mapa = {}, obras = [] }) {
  const pontos = mapa.pontos || [];
  const bounds = mapa.bounds || null;

  const centroInicial = useMemo(() => {
    if (!bounds || bounds.length !== 2) return CENTRO_PADRAO;
    return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
  }, [bounds]);

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
              Todos os pontos georreferenciados da carteira no recorte atual. Clique em um ponto
              para consultar a obra, a OSI e a localização.
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

      <div className="relative">
        {pontos.length === 0 ? (
          <div className="flex h-[420px] flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center sm:h-[460px]">
            <MapPin className="h-9 w-9 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">
              Nenhuma localização georreferenciada neste recorte
            </p>
            <p className="max-w-md text-xs text-slate-500">
              Cadastre coordenadas nas obras ou ajuste os filtros globais para visualizar os pontos
              no mapa.
            </p>
          </div>
        ) : (
          <>
            <MapContainer
              center={centroInicial}
              zoom={11}
              scrollWheelZoom={false}
              zoomControl={false}
              className="mapa-leaflet h-[420px] w-full sm:h-[460px] xl:h-[520px]"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />

              <AjustarLimites bounds={bounds} />
              <ZoomControl position="bottomright" />

              {pontos.map((ponto) => {
                const categoria = estiloCategoria(ponto.categoria);

                return (
                  <CircleMarker
                    key={`${ponto.obra_id}-${ponto.id}`}
                    center={[ponto.latitude, ponto.longitude]}
                    radius={6}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 1.5,
                      fillColor: categoria.hex,
                      fillOpacity: 0.82,
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -7]} opacity={0.95}>
                      <span className="text-[11px] font-semibold">
                        {ponto.osi || ponto.ss || `Obra #${ponto.obra_id}`} · {ponto.descricao}
                      </span>
                    </Tooltip>
                    <PopupPonto ponto={ponto} />
                  </CircleMarker>
                );
              })}
            </MapContainer>

            <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Legenda</p>
              <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 ring-2 ring-white" />
                Carteira da Coordenação
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-white" />
                Cadeia de Ajuda
              </p>
            </div>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-500">
        <span>
          {totalObras - obrasComLocalizacao > 0
            ? `${totalObras - obrasComLocalizacao} obra(s) ainda sem coordenadas no recorte.`
            : 'Todas as obras do recorte possuem localização geográfica.'}
        </span>
        <span className="font-medium text-slate-400">OpenStreetMap · Leaflet</span>
      </footer>
    </section>
  );
}

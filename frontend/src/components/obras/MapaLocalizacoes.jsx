import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { coordenadasDe, paraNumero } from '../../utils/coordenadas.js';

/**
 * Mapa interativo da obra no estilo Google Maps (camadas Satélite, Mapa e
 * Terreno; abre em satélite com nomes de ruas).
 *
 * - Exibe todos os pontos/trechos já cadastrados que possuem coordenadas.
 * - Com `onSelecionar`, permite escolher um ponto clicando no mapa ou
 *   arrastando o marcador; as coordenadas voltam para o formulário.
 * - Sem `onSelecionar`, funciona apenas como visualização.
 * - Com `referencias`, mostra também os pontos de OUTRAS obras (em laranja),
 *   para conferir o que já existe ao lado; o balão deles permite copiar as
 *   coordenadas para o ponto em edição.
 * - `focoReferencia` ({ latitude, longitude, chave }) leva o mapa até uma obra.
 */

/** Camadas no estilo Google Maps. */
const GOOGLE_TILES = (tipo) => `https://mt{s}.google.com/vt/lyrs=${tipo}&x={x}&y={y}&z={z}`;
const SUBDOMINIOS = ['0', '1', '2', '3'];

/** Região padrão (Pará) usada quando a obra ainda não tem coordenadas. */
const CENTRO_PADRAO = [-6.05, -50.13];
const ZOOM_PADRAO = 13;

/** Pin personalizado na cor da marca (evita os assets padrão do Leaflet). */
const ICONE_SELECIONADO = L.divIcon({
  className: 'mapa-pin',
  html: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45" aria-hidden="true">
      <path fill="#164b7d" stroke="#ffffff" stroke-width="1.4" d="M12 0C5.37 0 0 5.37 0 12c0 9.1 12 24 12 24s12-14.9 12-24C24 5.37 18.63 0 12 0z"/>
      <circle cx="12" cy="12" r="4.6" fill="#ffffff"/>
    </svg>
  `,
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -40],
  tooltipAnchor: [0, -40],
});

function formatarCoordenada(valor) {
  const numero = paraNumero(valor);
  if (numero === null) return '—';
  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 5,
    maximumFractionDigits: 7,
  });
}

function formatarKm(valor) {
  const numero = paraNumero(valor);
  if (numero === null) return '—';
  return numero.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/** Centraliza o mapa na média dos pontos existentes, na primeira montagem. */
function AjustarLimites({ pontos, ativo }) {
  const mapa = useMap();
  const executado = useRef(false);

  useEffect(() => {
    if (!ativo || executado.current || pontos.length === 0) return;
    executado.current = true;

    if (pontos.length === 1) {
      mapa.setView(pontos[0], 15);
      return;
    }

    mapa.fitBounds(L.latLngBounds(pontos), { padding: [28, 28], maxZoom: 16 });
  }, [mapa, pontos, ativo]);

  return null;
}

/**
 * Foca o ponto selecionado quando o alvo da edição muda (ex.: usuário abre a
 * edição de outra localização sem fechar o formulário). Cliques no mapa não
 * reposicionam a visão, pois o ponto clicado já está sob o cursor.
 */
function FocarSelecionada({ posicao, chave }) {
  const mapa = useMap();
  const chaveAnterior = useRef(chave);

  useEffect(() => {
    if (!posicao || chaveAnterior.current === chave) return;
    chaveAnterior.current = chave;
    mapa.setView(posicao, Math.max(mapa.getZoom(), 15));
  }, [mapa, posicao, chave]);

  return null;
}

/** Leva o mapa até um ponto quando a chave muda (ex.: "Ir para a obra"). */
function IrPara({ foco }) {
  const mapa = useMap();
  const anterior = useRef(null);

  useEffect(() => {
    if (!foco || anterior.current === foco.chave) return;
    anterior.current = foco.chave;
    mapa.flyTo([Number(foco.latitude), Number(foco.longitude)], Math.max(mapa.getZoom(), 17), { duration: 0.8 });
  }, [mapa, foco]);

  return null;
}

/** Captura cliques no mapa quando a seleção está habilitada. */
function CapturarClique({ onSelecionar }) {
  useMapEvents({
    click(evento) {
      if (!onSelecionar) return;
      onSelecionar({
        latitude: evento.latlng.lat,
        longitude: evento.latlng.lng,
      });
    },
  });

  return null;
}

function PopupLocalizacao({ localizacao }) {
  const ehTrecho = localizacao.tipo === 'TRECHO';
  const temKm =
    localizacao.km_inicial !== null && localizacao.km_inicial !== undefined;

  return (
    <Popup maxWidth={280}>
      <div className="space-y-1 text-xs">
        <p className="text-sm font-bold text-slate-800">{localizacao.descricao}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {ehTrecho ? 'Trecho linear' : 'Ponto geográfico'}
        </p>
        <p className="text-slate-600">
          {formatarCoordenada(localizacao.latitude)}, {formatarCoordenada(localizacao.longitude)}
        </p>
        {temKm ? (
          <p className="text-slate-600">
            KM {formatarKm(localizacao.km_inicial)}
            {localizacao.km_final !== null && localizacao.km_final !== undefined
              ? ` ao ${formatarKm(localizacao.km_final)}`
              : ''}
          </p>
        ) : null}
        {localizacao.referencia ? (
          <p className="text-slate-500">Ref.: {localizacao.referencia}</p>
        ) : null}
      </div>
    </Popup>
  );
}

export default function MapaLocalizacoes({
  localizacoes = [],
  selecionada = null,
  onSelecionar = null,
  chaveFoco = 'selecao',
  altura = 'h-72',
  className = '',
  referencias = [],
  focoReferencia = null,
}) {
  const interativo = typeof onSelecionar === 'function';

  const pontosExistentes = useMemo(
    () =>
      localizacoes
        .map((localizacao) => ({
          localizacao,
          posicao: coordenadasDe(localizacao),
        }))
        .filter((item) => item.posicao),
    [localizacoes]
  );

  const posicaoSelecionada = useMemo(() => coordenadasDe(selecionada), [selecionada]);

  const centroInicial = useMemo(() => {
    if (posicaoSelecionada) return posicaoSelecionada;
    if (pontosExistentes.length === 0) return CENTRO_PADRAO;

    const soma = pontosExistentes.reduce(
      (total, item) => [total[0] + item.posicao[0], total[1] + item.posicao[1]],
      [0, 0]
    );
    return [soma[0] / pontosExistentes.length, soma[1] / pontosExistentes.length];
  }, [posicaoSelecionada, pontosExistentes]);

  const pontos = useMemo(
    () => pontosExistentes.map((item) => item.posicao),
    [pontosExistentes]
  );

  return (
    <MapContainer
      center={centroInicial}
      zoom={posicaoSelecionada ? 16 : ZOOM_PADRAO}
      scrollWheelZoom={false}
      className={`mapa-leaflet ${altura} w-full ${className}`}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satélite">
          <TileLayer attribution="&copy; Google" url={GOOGLE_TILES('y')} subdomains={SUBDOMINIOS} maxZoom={20} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Mapa">
          <TileLayer attribution="&copy; Google" url={GOOGLE_TILES('m')} subdomains={SUBDOMINIOS} maxZoom={20} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terreno">
          <TileLayer attribution="&copy; Google" url={GOOGLE_TILES('p')} subdomains={SUBDOMINIOS} maxZoom={20} />
        </LayersControl.BaseLayer>
      </LayersControl>

      <IrPara foco={focoReferencia} />

      <AjustarLimites pontos={pontos} ativo={!posicaoSelecionada} />
      <FocarSelecionada posicao={posicaoSelecionada} chave={chaveFoco} />
      <CapturarClique onSelecionar={interativo ? onSelecionar : null} />

      {pontosExistentes.map(({ localizacao, posicao }) => {
        const ehTrecho = localizacao.tipo === 'TRECHO';

        return (
          <CircleMarker
            key={localizacao.id}
            center={posicao}
            radius={6.5}
            pathOptions={{
              // Contorno branco para o ponto se destacar sobre a imagem de satélite.
              color: '#ffffff',
              fillColor: ehTrecho ? '#8b5cf6' : '#1c5d99',
              fillOpacity: 0.78,
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
              {localizacao.descricao}
            </Tooltip>
            <PopupLocalizacao localizacao={localizacao} />
          </CircleMarker>
        );
      })}

      {referencias.map((ref) => (
        <CircleMarker
          key={`ref-${ref.id}`}
          center={[Number(ref.latitude), Number(ref.longitude)]}
          radius={6}
          pathOptions={{ color: '#ffffff', fillColor: '#f59e0b', fillOpacity: 0.95, weight: 2 }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            {ref.osi || ref.ss || `Obra #${ref.obra_id}`} · {ref.descricao}
          </Tooltip>
          <Popup maxWidth={300}>
            <div className="space-y-1 text-xs">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Outra obra</p>
              <p className="text-sm font-bold text-slate-800">
                {ref.osi || ref.ss || `Obra #${ref.obra_id}`}
                {ref.osi && ref.ss ? <span className="font-normal text-slate-400"> · SS {ref.ss}</span> : null}
              </p>
              {ref.obra_descricao ? <p className="text-slate-600">{ref.obra_descricao}</p> : null}
              <p className="text-slate-500">
                {ref.descricao} · {formatarCoordenada(ref.latitude)}, {formatarCoordenada(ref.longitude)}
              </p>
              <p className="flex flex-wrap gap-3 pt-1 font-bold">
                {interativo ? (
                  <button
                    type="button"
                    className="text-omega-700 hover:underline"
                    onClick={() => onSelecionar({ latitude: Number(ref.latitude), longitude: Number(ref.longitude) })}
                  >
                    Usar estas coordenadas
                  </button>
                ) : null}
                <a href={`/obras/${ref.obra_id}`} target="_blank" rel="noreferrer" className="text-omega-700 hover:underline">
                  Abrir obra
                </a>
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {posicaoSelecionada ? (
        <Marker
          position={posicaoSelecionada}
          icon={ICONE_SELECIONADO}
          draggable={interativo}
          zIndexOffset={1000}
          eventHandlers={{
            dragend(evento) {
              if (!interativo) return;
              const { lat, lng } = evento.target.getLatLng();
              onSelecionar({ latitude: lat, longitude: lng });
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -42]} opacity={1}>
            {interativo ? 'Arraste para ajustar o ponto' : 'Localização selecionada'}
          </Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
}

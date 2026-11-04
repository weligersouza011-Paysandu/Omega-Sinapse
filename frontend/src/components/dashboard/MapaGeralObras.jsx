import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Globe2, Map as MapIcon, MapPin } from 'lucide-react';
import { estiloCategoria } from './dashboardUtils.js';
import { urlAbrirGoogle, urlGoogleComPino, urlGoogleRegiao, zoomParaLimites } from '../../utils/googleMaps.js';

/** Região padrão (Carajás/PA) usada quando o filtro não retorna coordenadas. */
const CENTRO_PADRAO = [-6.05, -50.13];

/**
 * Mapa geral do dashboard no Google Maps (satélite).
 *
 * O Google Maps incorporado mostra um ponto por vez: a visão inicial enquadra
 * a região de todos os pontos do recorte; a lista ao lado traz cada ponto
 * (cor da carteira) e, ao clicar, o mapa aproxima no ponto com o pino.
 */
export default function MapaGeralObras({ mapa = {}, obras = [] }) {
  const pontos = useMemo(() => mapa.pontos || [], [mapa.pontos]);
  const limites = mapa.bounds || null;
  const [selecionadoId, setSelecionadoId] = useState(null);

  const centro = useMemo(() => {
    if (!limites || limites.length !== 2) return CENTRO_PADRAO;
    return [(limites[0][0] + limites[1][0]) / 2, (limites[0][1] + limites[1][1]) / 2];
  }, [limites]);
  const zoomRegiao = useMemo(() => zoomParaLimites(limites, 900, 480, { minimo: 4, maximo: 15 }), [limites]);

  const chave = (p) => `${p.obra_id}-${p.id}`;
  const selecionado = pontos.find((p) => chave(p) === selecionadoId) || null;
  const url = selecionado
    ? urlGoogleComPino([selecionado.latitude, selecionado.longitude], 16)
    : urlGoogleRegiao(centro, zoomRegiao);

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
              Imagem de satélite do Google Maps com a região das obras do recorte. Clique em um ponto da lista para
              aproximar o mapa na obra.
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
            <iframe
              key={url}
              title={selecionado ? `Localização: ${selecionado.descricao}` : 'Região das obras'}
              src={url}
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            {selecionado ? (
              <button
                type="button"
                onClick={() => setSelecionadoId(null)}
                className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
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
                          href={urlAbrirGoogle([ponto.latitude, ponto.longitude])}
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
        <span className="font-medium text-slate-400">Google Maps · satélite</span>
      </footer>
    </section>
  );
}

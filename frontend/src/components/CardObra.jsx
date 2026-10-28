import { useState } from 'react';
import { Pencil, UserRound } from 'lucide-react';
import EtiquetasPendencia from './EtiquetasPendencia.jsx';
import SeletorPlanejador from './SeletorPlanejador.jsx';
import StatusBadge from './StatusBadge.jsx';
import { formatarData, formatarMoeda } from '../utils/formatters.js';

/** Ícone exibido quando a foto da obra não carrega (fallback local, sem rede). */
function FotoIndisponivel() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400">
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
        <path
          d="M3 20h18M6 20V9l6-4 6 4v11M10 20v-5h4v5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[11px] font-semibold uppercase tracking-wide">Sem imagem</span>
    </div>
  );
}

/** Card de obra/orçamento exibido no grid do dashboard. */
export default function CardObra({
  orcamento,
  onClick,
  onEditar,
  planejadores = [],
  carregandoPlanejadores = false,
  onAtribuirPlanejador,
}) {
  const [erroFoto, setErroFoto] = useState(false);

  const foto = orcamento.foto_1;
  const mostrarFallback = !foto || erroFoto;
  const podeAtribuirPlanejador = typeof onAtribuirPlanejador === 'function';

  return (
    <article className="card group relative flex w-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-omega-500/50 hover:shadow-md">
      {/* Área clicável: usa `div` (e não `button`) para permitir o botão de edição
          no topo sem aninhar controles interativos. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            onClick?.();
          }
        }}
        className="flex flex-1 cursor-pointer flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-omega-500/40"
      >
        <div className="relative h-40 w-full overflow-hidden bg-slate-100">
          {mostrarFallback ? (
            <FotoIndisponivel />
          ) : (
            <img
              src={foto}
              alt={`Foto da obra ${orcamento.pep}`}
              loading="lazy"
              onError={() => setErroFoto(true)}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          )}

          <div className="absolute left-2 top-2">
            <StatusBadge status={orcamento.status} className="shadow-sm" />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">PEP (CC)</p>
              <p className="truncate text-base font-bold text-slate-800">{orcamento.pep || '—'}</p>
            </div>
            {orcamento.ss ? (
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">SS</p>
                <p className="text-sm font-semibold text-slate-700">{orcamento.ss}</p>
              </div>
            ) : null}
          </div>

          <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-slate-500">
            {orcamento.descricao || orcamento.cliente || 'Sem descrição informada.'}
          </p>

          {/* Governança ISO 9001: pendências documentais e planejador
              responsável (leitura para todos os perfis). */}
          {orcamento.pendencias || (!podeAtribuirPlanejador && orcamento.planejador_nome) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <EtiquetasPendencia pendencias={orcamento.pendencias} />
              {!podeAtribuirPlanejador && orcamento.planejador_nome ? (
                <span
                  title={`Planejador responsável: ${orcamento.planejador_nome}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                >
                  <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{orcamento.planejador_nome}</span>
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Valor atual</p>
              <p className="text-lg font-bold text-omega-700">{formatarMoeda(orcamento.valor)}</p>
            </div>
            <p className="text-[11px] font-medium text-slate-400">
              {formatarData(orcamento.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Atribuição rápida do planejador: fora da área clicável do card para
          não aninhar controles interativos no `role="button"`. */}
      {podeAtribuirPlanejador ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <SeletorPlanejador
            obra={orcamento}
            planejadores={planejadores}
            carregando={carregandoPlanejadores}
            onAtribuir={onAtribuirPlanejador}
          />
        </div>
      ) : null}

      {onEditar ? (
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation();
            onEditar(orcamento);
          }}
          title="Editar Orçamento"
          aria-label={`Editar orçamento ${orcamento.pep || ''}`.trim()}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:border-omega-500/50 hover:bg-white hover:text-omega-700 focus:outline-none focus:ring-2 focus:ring-omega-500/40"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

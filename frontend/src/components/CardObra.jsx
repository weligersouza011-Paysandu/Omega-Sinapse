import { useState } from 'react';
import { Check, Eye, EyeOff, Pencil, UserRound } from 'lucide-react';
import CategoriaObraBadge from './CategoriaObraBadge.jsx';
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

/**
 * Card de obra/orçamento exibido no grid do dashboard.
 *
 * - `ocultarValor`: não exibe o valor financeiro diretamente; um botão "olho"
 *   revela o valor só neste card (o detalhe completo fica no modal).
 * - `semValor`: não exibe o valor de forma alguma (o detalhe da obra mostra).
 * - `destacarSs`: a SS (cliente) e a OSI (controle interno) viram os identificadores principais e o PEP fica secundário.
 * - `exibirCategoria`: selo da categoria da obra (Carteira da Coordenação /
 *   Cadeia de Ajuda); só no módulo de Obras (orçamentos não têm categoria).
 * - `onAlternarSelecao`/`selecionado`: habilitam a seleção em lote.
 * - `acoesRapidas` + `onAcaoRapida`: botões de troca rápida de status
 *   (`[{ status, label, Icone, estilo }]`, já filtrados para o card).
 */
export default function CardObra({
  orcamento,
  onClick,
  onEditar,
  planejadores = [],
  carregandoPlanejadores = false,
  onAtribuirPlanejador,
  ocultarValor = false,
  semValor = false,
  destacarSs = false,
  exibirCategoria = false,
  selecionado = false,
  onAlternarSelecao,
  acoesRapidas = [],
  onAcaoRapida,
}) {
  const [erroFoto, setErroFoto] = useState(false);
  const [valorVisivel, setValorVisivel] = useState(false);

  const foto = orcamento.foto_1;
  const mostrarFallback = !foto || erroFoto;
  const podeAtribuirPlanejador = typeof onAtribuirPlanejador === 'function';
  const selecionavel = typeof onAlternarSelecao === 'function';
  const exibirRodapeAcoes = ocultarValor || acoesRapidas.length > 0;
  // Obras trazem a equipe completa; orçamentos, só o planejador único.
  const nomePlanejadores =
    orcamento.planejadores?.map((membro) => membro.nome).join(', ') || orcamento.planejador_nome;

  return (
    <article
      className={[
        'card group relative flex w-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md',
        selecionado ? 'border-omega-500 ring-2 ring-omega-500/40' : 'hover:border-omega-500/50',
      ].join(' ')}
    >
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

          {/* Com seleção em lote o canto superior esquerdo fica com o checkbox
              e a badge desce para a base da foto. */}
          <div className={`absolute left-2 ${selecionavel ? 'bottom-2' : 'top-2'}`}>
            <StatusBadge status={orcamento.status} className="shadow-sm" />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {destacarSs ? (
            <div className="min-w-0">
              {/* SS é do cliente; OSI (Ordem de Serviço Interna) é o controle interno — ambas em destaque. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">SS</p>
                  <p className="truncate text-lg font-bold leading-tight text-slate-800">{orcamento.ss || '—'}</p>
                </div>
                <div className="min-w-0" title="OSI — Ordem de Serviço Interna (controle interno)">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">OSI</p>
                  <p className="truncate text-lg font-bold leading-tight text-slate-800">{orcamento.osi_numero || '—'}</p>
                </div>
              </div>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                <span className="font-semibold uppercase tracking-wide text-slate-400">PEP (CC)</span>{' '}
                {orcamento.pep || '—'}
              </p>
            </div>
          ) : (
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
              {orcamento.osi_numero ? (
                <div className="shrink-0 text-right" title="OSI — Ordem de Serviço Interna">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">OSI</p>
                  <p className="text-sm font-semibold text-slate-700">{orcamento.osi_numero}</p>
                </div>
              ) : null}
            </div>
          )}

          <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-slate-500">
            {orcamento.descricao || orcamento.cliente || 'Sem descrição informada.'}
          </p>

          {/* Governança ISO 9001: pendências documentais e planejador
              responsável (leitura para todos os perfis). */}
          {exibirCategoria || orcamento.pendencias || (!podeAtribuirPlanejador && nomePlanejadores) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {exibirCategoria ? <CategoriaObraBadge categoria={orcamento.categoria} /> : null}
              <EtiquetasPendencia pendencias={orcamento.pendencias} />
              {!podeAtribuirPlanejador && nomePlanejadores ? (
                <span
                  title={`Planejador(es) responsável(is): ${nomePlanejadores}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                >
                  <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{nomePlanejadores}</span>
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
            {ocultarValor || semValor ? (
              <p className="text-[11px] font-medium text-slate-400">Criado em</p>
            ) : (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Valor atual</p>
                <p className="text-lg font-bold text-omega-700">{formatarMoeda(orcamento.valor)}</p>
              </div>
            )}
            <p className="text-[11px] font-medium text-slate-400">
              {formatarData(orcamento.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Valor sob demanda e ações rápidas de status: fora da área clicável
          para não aninhar controles interativos no `role="button"`. */}
      {exibirRodapeAcoes ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
          {ocultarValor ? (
            <button
              type="button"
              onClick={() => setValorVisivel((atual) => !atual)}
              aria-pressed={valorVisivel}
              title={valorVisivel ? 'Ocultar valor' : 'Mostrar valor'}
              className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-sm font-bold text-slate-500 transition hover:text-omega-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40"
            >
              {valorVisivel ? (
                <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {valorVisivel ? (
                <span className="text-omega-700">{formatarMoeda(orcamento.valor)}</span>
              ) : (
                <span className="tracking-widest" aria-label="Valor oculto">R$ •••••</span>
              )}
            </button>
          ) : (
            <span />
          )}

          {acoesRapidas.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {acoesRapidas.map(({ status, label, Icone, estilo }) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onAcaoRapida?.(orcamento, status)}
                  title={label}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40 ${estilo}`}
                >
                  {Icone ? <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {selecionavel ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selecionado}
          aria-label={`Selecionar orçamento ${orcamento.pep || ''}`.trim()}
          onClick={(evento) => {
            evento.stopPropagation();
            onAlternarSelecao(orcamento);
          }}
          className={[
            'absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-sm backdrop-blur transition',
            'focus:outline-none focus:ring-2 focus:ring-omega-500/40',
            selecionado
              ? 'border-omega-600 bg-omega-600 text-white'
              : 'border-white bg-white/80 text-transparent hover:border-omega-500 hover:text-omega-300',
          ].join(' ')}
        >
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
        </button>
      ) : null}

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

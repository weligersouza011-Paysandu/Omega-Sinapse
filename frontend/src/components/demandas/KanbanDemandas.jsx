import { useState } from 'react';
import { GripVertical, Lock } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { FarolBadge, ObraTag, PrioridadeBadge, Responsavel, TipoBadge } from './BadgesDemanda.jsx';
import { STATUS_KANBAN, podeEditar } from '../../utils/demandas.js';

/** Ordem dos cards: concluídas mais recentes no topo; ativas pelo vencimento. */
function ordenar(itens, status) {
  const lista = [...itens];
  if (status === 'CONCLUIDO') {
    return lista.sort((a, b) => new Date(b.concluido_em || 0) - new Date(a.concluido_em || 0));
  }
  return lista.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
}

/**
 * Quadro Kanban da Gestão de Demandas (A Fazer → Em Andamento → Concluído).
 *
 * O arraste apenas sinaliza a intenção: `onMudarStatus` (na página) decide se
 * pede a justificativa de atraso, aplica a atualização otimista e chama a API.
 * Cards de outros colaboradores ficam travados para quem não é gestor.
 */
export default function KanbanDemandas({ itens, carregando, usuario, movendoId, onMudarStatus, onAbrir }) {
  const [arrastandoId, setArrastandoId] = useState(null);
  const [colunaSobre, setColunaSobre] = useState(null);

  const canceladas = itens.filter((tarefa) => tarefa.status === 'CANCELADO').length;

  function aoSoltar(evento, status) {
    evento.preventDefault();
    setColunaSobre(null);
    const id = Number(evento.dataTransfer.getData('text/plain')) || arrastandoId;
    setArrastandoId(null);
    const tarefa = itens.find((item) => item.id === id);
    if (tarefa && tarefa.status !== status) onMudarStatus(tarefa, status);
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3">
        {STATUS_KANBAN.map((coluna) => {
          const itensColuna = ordenar(
            itens.filter((tarefa) => tarefa.status === coluna.value),
            coluna.value
          );
          const vencidas =
            coluna.value === 'CONCLUIDO'
              ? 0
              : itensColuna.filter((tarefa) => new Date(tarefa.data_vencimento) < new Date()).length;

          return (
            <section
              key={coluna.value}
              className={[
                'flex min-w-[272px] flex-1 basis-0 flex-col overflow-hidden rounded-lg border bg-slate-50/70 transition-colors duration-200',
                colunaSobre === coluna.value ? 'border-omega-500 ring-2 ring-omega-500/25' : 'border-slate-200',
              ].join(' ')}
            >
              <div className="h-1 shrink-0" style={{ backgroundColor: coluna.hex }} />

              <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-600">{coluna.label}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                    {itensColuna.length}
                  </span>
                </div>
                {vencidas > 0 ? (
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
                    {vencidas} vencida{vencidas === 1 ? '' : 's'}
                  </span>
                ) : null}
              </header>

              <div
                className="min-h-[16rem] max-h-[calc(100vh_-_21rem)] flex-1 space-y-2 overflow-y-auto p-2"
                onDragOver={(evento) => {
                  evento.preventDefault();
                  if (colunaSobre !== coluna.value) setColunaSobre(coluna.value);
                }}
                onDragLeave={(evento) => {
                  if (!evento.currentTarget.contains(evento.relatedTarget)) setColunaSobre(null);
                }}
                onDrop={(evento) => aoSoltar(evento, coluna.value)}
              >
                {carregando && itens.length === 0 ? (
                  Array.from({ length: 3 }).map((_, indice) => (
                    <div key={indice} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
                  ))
                ) : itensColuna.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-[11px] font-medium text-slate-400">
                    Arraste uma demanda para cá
                  </p>
                ) : (
                  itensColuna.map((tarefa) => {
                    const editavel = podeEditar(tarefa, usuario);
                    const movendo = movendoId === tarefa.id;

                    return (
                      <article
                        key={tarefa.id}
                        draggable={editavel && !movendo}
                        onDragStart={(evento) => {
                          evento.dataTransfer.setData('text/plain', String(tarefa.id));
                          evento.dataTransfer.effectAllowed = 'move';
                          setArrastandoId(tarefa.id);
                        }}
                        onDragEnd={() => {
                          setArrastandoId(null);
                          setColunaSobre(null);
                        }}
                        className={[
                          'animar-kanban rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow',
                          arrastandoId === tarefa.id ? 'opacity-50' : 'hover:border-omega-500/50 hover:shadow-md',
                        ].join(' ')}
                      >
                        {/* `div` em vez de `button`: um controle interativo bloquearia o arraste no Chromium. */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onAbrir(tarefa)}
                          onKeyDown={(evento) => {
                            if (evento.key === 'Enter' || evento.key === ' ') {
                              evento.preventDefault();
                              onAbrir(tarefa);
                            }
                          }}
                          className="block w-full cursor-pointer space-y-2 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-800">{tarefa.titulo}</p>
                            {movendo ? (
                              <Spinner tamanho="sm" className="mt-0.5 shrink-0 text-omega-600" />
                            ) : editavel ? (
                              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-slate-300" aria-hidden="true" />
                            ) : (
                              <Lock
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300"
                                aria-label="Somente o responsável ou um gestor pode mover"
                              />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <TipoBadge tarefa={tarefa} />
                            <PrioridadeBadge valor={tarefa.prioridade} />
                            <ObraTag obra={tarefa.obra} />
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                            <Responsavel usuario={tarefa.usuario} />
                            <FarolBadge tarefa={tarefa} />
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {canceladas > 0 ? (
        <p className="mt-1 text-xs font-medium text-slate-400">
          {canceladas} demanda{canceladas === 1 ? ' cancelada não aparece' : 's canceladas não aparecem'} no quadro — veja na
          visão em Lista.
        </p>
      ) : null}
    </>
  );
}

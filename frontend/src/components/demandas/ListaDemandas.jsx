import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { FarolBadge, ObraTag, PrioridadeBadge, Responsavel, TipoBadge } from './BadgesDemanda.jsx';
import {
  STATUS_DEMANDA,
  obterStatusDemanda,
  podeEditar,
  rotuloTipo,
} from '../../utils/demandas.js';
import { formatarData } from '../../utils/formatters.js';

const AGRUPAMENTOS = [
  { id: 'status', label: 'Status' },
  { id: 'responsavel', label: 'Responsável' },
];

/** Paleta das faixas de grupo por responsável (cicla quando há mais pessoas). */
const CORES_GRUPO = ['#164b7d', '#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#ca8a04'];

const ORDEM_STATUS = Object.fromEntries(STATUS_DEMANDA.map((status, indice) => [status.value, indice]));

function montarGrupos(itens, agrupamento) {
  const porVencimento = (a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento);

  if (agrupamento === 'status') {
    return STATUS_DEMANDA.map((status) => ({
      chave: status.value,
      titulo: status.label,
      cor: status.hex,
      itens: itens.filter((tarefa) => tarefa.status === status.value).sort(porVencimento),
    })).filter((grupo) => grupo.itens.length > 0);
  }

  const mapa = new Map();
  for (const tarefa of itens) {
    const chave = tarefa.usuario_id;
    if (!mapa.has(chave)) {
      mapa.set(chave, { chave, titulo: tarefa.usuario?.nome || 'Sem responsável', itens: [] });
    }
    mapa.get(chave).itens.push(tarefa);
  }
  return [...mapa.values()]
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
    .map((grupo, indice) => ({
      ...grupo,
      cor: CORES_GRUPO[indice % CORES_GRUPO.length],
      itens: grupo.itens.sort(
        (a, b) => ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status] || porVencimento(a, b)
      ),
    }));
}

/** Frequência (rotina) ou data de vencimento (avulsa). */
function FrequenciaPrazo({ tarefa }) {
  if (tarefa.tipo === 'FIXA_RECORRENTE') {
    return (
      <div className="leading-tight">
        <p className="text-xs font-semibold text-slate-700">{rotuloTipo(tarefa).replace('Fixa · ', '')}</p>
        <p className="text-[11px] text-slate-400">Próx.: {formatarData(tarefa.data_vencimento)}</p>
      </div>
    );
  }
  return <p className="text-xs font-semibold text-slate-700">{formatarData(tarefa.data_vencimento)}</p>;
}

/** Seletor de status inline, colorido pelo status atual. */
function SeletorStatus({ tarefa, desabilitado, onMudar }) {
  const atual = obterStatusDemanda(tarefa.status);
  return (
    <select
      value={tarefa.status}
      disabled={desabilitado}
      onChange={(evento) => onMudar(tarefa, evento.target.value)}
      aria-label={`Status da demanda ${tarefa.titulo}`}
      className={[
        'w-full cursor-pointer rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wide',
        'focus:outline-none focus:ring-2 focus:ring-omega-500/30 disabled:cursor-not-allowed disabled:opacity-60',
        atual.cor,
      ].join(' ')}
    >
      {STATUS_DEMANDA.map((status) => (
        <option key={status.value} value={status.value}>
          {status.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Lista tabular da Gestão de Demandas, agrupada por status ou responsável.
 * A troca de status inline segue o mesmo fluxo do Kanban (`onMudarStatus`).
 */
export default function ListaDemandas({
  itens,
  carregando,
  usuario,
  movendoId,
  onMudarStatus,
  onEditar,
  onRemover,
}) {
  const [agrupamento, setAgrupamento] = useState('status');
  const [recolhidos, setRecolhidos] = useState({});

  const grupos = useMemo(() => montarGrupos(itens, agrupamento), [itens, agrupamento]);

  function alternarGrupo(chave) {
    setRecolhidos((atual) => ({ ...atual, [chave]: !atual[chave] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agrupar por</span>
        <div className="inline-flex gap-1 rounded-md border border-slate-300 bg-white p-0.5" role="group">
          {AGRUPAMENTOS.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              aria-pressed={agrupamento === opcao.id}
              onClick={() => setAgrupamento(opcao.id)}
              className={[
                'rounded px-2.5 py-1 text-xs font-semibold transition',
                agrupamento === opcao.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100',
              ].join(' ')}
            >
              {opcao.label}
            </button>
          ))}
        </div>
      </div>

      {carregando && itens.length === 0 ? (
        <div className="card h-64 animate-pulse bg-slate-50" />
      ) : grupos.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-slate-500">
          Nenhuma demanda para os filtros selecionados.
        </div>
      ) : (
        grupos.map((grupo) => {
          const recolhido = Boolean(recolhidos[grupo.chave]);
          return (
            <section key={grupo.chave} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => alternarGrupo(grupo.chave)}
                aria-expanded={!recolhido}
                className="flex w-full items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 text-left"
                style={{ borderLeft: `4px solid ${grupo.cor}` }}
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${recolhido ? '-rotate-90' : ''}`}
                  style={{ color: grupo.cor }}
                  aria-hidden="true"
                />
                <span className="text-sm font-bold" style={{ color: grupo.cor }}>
                  {grupo.titulo}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {grupo.itens.length} demanda{grupo.itens.length === 1 ? '' : 's'}
                </span>
              </button>

              {recolhido ? null : (
                <div className="overflow-x-auto">
                  {/* Larguras fixas mantêm as colunas alinhadas entre os grupos. */}
                  <table className="w-full min-w-[960px] table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[28%]" />
                      <col className="w-[15%]" />
                      <col className="w-[9%]" />
                      <col className="w-[12%]" />
                      <col className="w-[18%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                    </colgroup>
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Demanda</th>
                        <th className="px-3 py-2">Responsável</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Frequência/Prazo</th>
                        <th className="px-3 py-2">Farol/Status</th>
                        <th className="px-3 py-2">Prioridade</th>
                        <th className="px-3 py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {grupo.itens.map((tarefa) => {
                        const editavel = podeEditar(tarefa, usuario);
                        const movendo = movendoId === tarefa.id;
                        return (
                          <tr key={tarefa.id} className="align-middle transition-colors hover:bg-slate-50/80">
                            <td className="px-4 py-2.5" style={{ borderLeft: `4px solid ${grupo.cor}33` }}>
                              <button
                                type="button"
                                onClick={() => onEditar(tarefa)}
                                className="block max-w-full truncate text-left font-semibold text-slate-800 hover:text-omega-700"
                                title={tarefa.descricao || tarefa.titulo}
                              >
                                {tarefa.titulo}
                              </button>
                              {tarefa.obra ? (
                                <div className="mt-1">
                                  <ObraTag obra={tarefa.obra} />
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5">
                              <Responsavel usuario={tarefa.usuario} />
                            </td>
                            <td className="px-3 py-2.5">
                              <TipoBadge tarefa={{ ...tarefa, dia_recorrencia: null }} />
                            </td>
                            <td className="px-3 py-2.5">
                              <FrequenciaPrazo tarefa={tarefa} />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-1.5">
                                <FarolBadge tarefa={tarefa} />
                                <div className="flex items-center gap-1.5">
                                  <SeletorStatus
                                    tarefa={tarefa}
                                    desabilitado={!editavel || movendo}
                                    onMudar={onMudarStatus}
                                  />
                                  {movendo ? <Spinner tamanho="sm" className="shrink-0 text-omega-600" /> : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <PrioridadeBadge valor={tarefa.prioridade} />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => onEditar(tarefa)}
                                  disabled={!editavel}
                                  title="Editar demanda"
                                  aria-label={`Editar ${tarefa.titulo}`}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-omega-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRemover(tarefa)}
                                  disabled={!editavel}
                                  title="Excluir demanda"
                                  aria-label={`Excluir ${tarefa.titulo}`}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

import { Building2, Repeat } from 'lucide-react';
import { farolDaTarefa, iniciais, obterPrioridade, referenciaObra, rotuloTipo } from '../../utils/demandas.js';

const CORES_FAROL = {
  verde: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', ponto: 'bg-emerald-500' },
  amarelo: { badge: 'bg-amber-50 text-amber-800 ring-amber-300', ponto: 'bg-amber-400' },
  vermelho: { badge: 'bg-red-50 text-red-700 ring-red-200', ponto: 'bg-red-500' },
  cinza: { badge: 'bg-slate-100 text-slate-500 ring-slate-200', ponto: 'bg-slate-400' },
};

/** Badge de prazo (farol) com o detalhe do vencimento como tooltip/linha extra. */
export function FarolBadge({ tarefa, mostrarDetalhe = false }) {
  const farol = farolDaTarefa(tarefa);
  const cores = CORES_FAROL[farol.cor];
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-0.5">
      <span
        title={farol.detalhe}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${cores.badge}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${cores.ponto}`} aria-hidden="true" />
        {farol.rotulo}
      </span>
      {mostrarDetalhe && farol.detalhe ? (
        <span className="pl-1 text-[10px] font-medium text-slate-400">{farol.detalhe}</span>
      ) : null}
    </span>
  );
}

export function TipoBadge({ tarefa }) {
  const fixa = tarefa.tipo === 'FIXA_RECORRENTE';
  return (
    <span
      className={[
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        fixa ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600',
      ].join(' ')}
    >
      {fixa ? <Repeat className="h-3 w-3" aria-hidden="true" /> : null}
      {rotuloTipo(tarefa)}
    </span>
  );
}

export function PrioridadeBadge({ valor }) {
  const prioridade = obterPrioridade(valor);
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${prioridade.cor}`}
    >
      {prioridade.label}
    </span>
  );
}

export function ObraTag({ obra }) {
  const referencia = referenciaObra(obra);
  if (!referencia) return null;
  return (
    <span
      title={obra.orcamento?.descricao || referencia}
      className="inline-flex max-w-full items-center gap-1 truncate rounded bg-omega-50 px-1.5 py-0.5 text-[10px] font-semibold text-omega-700"
    >
      <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{referencia}</span>
    </span>
  );
}

/** Avatar com iniciais + nome do responsável. */
export function Responsavel({ usuario, compacto = false }) {
  const nome = usuario?.nome || 'Sem responsável';
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={nome}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-omega-600 text-[10px] font-bold text-white">
        {iniciais(nome)}
      </span>
      {compacto ? null : <span className="truncate text-xs font-medium text-slate-600">{nome}</span>}
    </span>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FolderTree } from 'lucide-react';
import { formatarData, formatarMoeda, formatarPercentual } from '../../utils/formatters.js';

const STATUS = {
  APROVADO: { rotulo: 'Aprovado', classe: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  EM_ANALISE: { rotulo: 'Em análise', classe: 'border-amber-300 bg-amber-50 text-amber-800' },
  REJEITADO: { rotulo: 'Rejeitado', classe: 'border-red-300 bg-red-50 text-red-700' },
};

function SeloStatus({ status }) {
  const estilo = STATUS[status] || STATUS.EM_ANALISE;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${estilo.classe}`}
    >
      {estilo.rotulo}
    </span>
  );
}

function LinhaSs({ item }) {
  return (
    <li className="flex items-center gap-3 py-2 pl-11 pr-4 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-700">
          <Link to={`/obras/${item.obra_id}`} className="hover:text-omega-700 hover:underline">
            {item.ss || item.osi || `Obra #${item.obra_id}`}
          </Link>
          {item.osi && item.ss ? <span className="font-normal text-slate-400"> · {item.osi}</span> : null}
        </p>
        <p className="truncate text-[11px] text-slate-500" title={item.descricao || ''}>
          {item.descricao || 'Sem descrição'}
        </p>
      </div>
      <div className="hidden w-28 shrink-0 sm:block" title={`${formatarPercentual(item.percentual_do_boletim, 1)} do boletim`}>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-omega-500" style={{ width: `${Math.min(100, item.percentual_do_boletim)}%` }} />
        </div>
      </div>
      <p className="w-28 shrink-0 text-right font-semibold tabular-nums text-slate-700">{formatarMoeda(item.valor)}</p>
      <p className="hidden w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-400 sm:block">
        {formatarPercentual(item.percentual_do_boletim, 0)}
      </p>
    </li>
  );
}

function LinhaBoletim({ boletim, aberto, onAlternar }) {
  const temDetalhe = boletim.itens.length > 0 || Math.abs(boletim.valor_sem_detalhamento) >= 0.01;
  const rejeitado = boletim.status === 'REJEITADO';

  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        disabled={!temDetalhe}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-90' : ''} ${temDetalhe ? '' : 'opacity-30'}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-slate-800">
            {boletim.numero_bmm}
            <SeloStatus status={boletim.status} />
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Ciclo {formatarData(boletim.ciclo_inicio)} a {formatarData(boletim.ciclo_fim)} · {boletim.rotulo}
            {boletim.itens.length > 0 ? ` · ${boletim.itens.length} SS` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-black tabular-nums ${rejeitado ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            {formatarMoeda(boletim.valor_medido)}
          </p>
          <p className="text-[10px] tabular-nums text-slate-400">
            {formatarPercentual(boletim.percentual_do_contrato, 1)} do contrato
          </p>
        </div>
      </button>

      {aberto && temDetalhe ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/60 pb-1">
          {boletim.itens.map((item) => (
            <LinhaSs key={item.obra_id} item={item} />
          ))}
          {Math.abs(boletim.valor_sem_detalhamento) >= 0.01 ? (
            <li className="flex items-center justify-between gap-3 py-2 pl-11 pr-4 text-xs italic text-slate-500">
              <span>Valor do boletim sem detalhamento por SS</span>
              <span className="font-semibold tabular-nums">{formatarMoeda(boletim.valor_sem_detalhamento)}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Hierarquia de medição: Boletins de Medição (BMM) e, dentro de cada um, as
 * Solicitações de Serviço (SS) que compõem o valor. Acordeão: o boletim mais
 * recente já abre expandido.
 */
export default function ArvoreMedicao({ boletins = [] }) {
  const [abertos, setAbertos] = useState(() => new Set(boletins.length ? [boletins[0].id] : []));

  const todosIds = useMemo(() => boletins.filter((b) => b.itens.length > 0).map((b) => b.id), [boletins]);
  const tudoAberto = todosIds.length > 0 && todosIds.every((id) => abertos.has(id));

  function alternar(id) {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  return (
    <section className="card flex flex-col overflow-hidden" aria-label="Boletins de medição por SS">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
            <FolderTree className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Boletins de Medição × SS</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Cada BMM e as solicitações de serviço que compõem o valor medido no ciclo (16 a 15).
            </p>
          </div>
        </div>
        {todosIds.length > 0 ? (
          <button
            type="button"
            className="btn-neutro !px-2.5 !py-1 !text-[11px]"
            onClick={() => setAbertos(tudoAberto ? new Set() : new Set(todosIds))}
          >
            {tudoAberto ? 'Recolher todos' : 'Expandir todos'}
          </button>
        ) : null}
      </header>

      {boletins.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
          <FolderTree className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhum boletim de medição lançado</p>
          <p className="max-w-sm text-xs text-slate-500">
            Os boletins (BMM) do contrato aparecem aqui, com as SS que compõem cada um.
          </p>
        </div>
      ) : (
        <ul className="max-h-[520px] flex-1 overflow-y-auto">
          {boletins.map((boletim) => (
            <LinhaBoletim
              key={boletim.id}
              boletim={boletim}
              aberto={abertos.has(boletim.id)}
              onAlternar={() => alternar(boletim.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

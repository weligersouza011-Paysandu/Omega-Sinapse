import { useMemo, useState } from 'react';
import { ClipboardList, TriangleAlert } from 'lucide-react';
import { formatarData } from '../../utils/formatters.js';
import { OrigemRestricaoBadge, StatusRestricaoBadge } from './DashboardBadges.jsx';

const FILTROS = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'ABERTAS', label: 'Abertas' },
  { id: 'PENDENTE', label: 'Pendentes' },
  { id: 'EM_ANDAMENTO', label: 'Em andamento' },
  { id: 'RESOLVIDA', label: 'Resolvidas' },
];

const ABERTAS = ['PENDENTE', 'EM_ANDAMENTO'];

function contarPorFiltro(itens, filtro) {
  if (filtro === 'TODAS') return itens.length;
  if (filtro === 'ABERTAS') return itens.filter((item) => ABERTAS.includes(item.status)).length;
  return itens.filter((item) => item.status === filtro).length;
}

/**
 * Tabela de restrições 6WLA: constraints cadastradas, pendências documentais
 * derivadas (OSI/Ata) e atividades em aberto, priorizadas por situação e prazo.
 */
export default function TabelaRestricoes6WLA({ restricoes = [] }) {
  const [filtro, setFiltro] = useState('TODAS');

  const abertas = restricoes.filter((item) => ABERTAS.includes(item.status)).length;
  const atrasadas = restricoes.filter((item) => item.atrasada).length;
  const cadastradas = restricoes.filter((item) => item.tipo === 'CADASTRADA').length;

  const itens = useMemo(() => {
    if (filtro === 'TODAS') return restricoes;
    if (filtro === 'ABERTAS') return restricoes.filter((item) => ABERTAS.includes(item.status));
    return restricoes.filter((item) => item.status === filtro);
  }, [restricoes, filtro]);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Tabela de Restrições 6WLA</h3>
            <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-slate-500">
              Restrições cadastradas, pendências documentais e atividades em aberto com plano de ação
              Q1/RFT, responsável, empresa, status e prazo (QUANDO).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
            {restricoes.length} restrição(ões)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700">
            {abertas} aberta(s)
          </span>
          {atrasadas > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700">
              <TriangleAlert className="h-3 w-3" aria-hidden="true" />
              {atrasadas} atrasada(s)
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
          {FILTROS.map((item) => {
            const total = contarPorFiltro(restricoes, item.id);
            const ativo = filtro === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFiltro(item.id)}
                aria-pressed={ativo}
                className={[
                  'rounded px-2.5 py-1 text-[11px] font-semibold transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40',
                  ativo
                    ? 'bg-white text-omega-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {item.label}
                <span className="ml-1 text-[10px] font-bold text-slate-400">{total}</span>
              </button>
            );
          })}
        </div>

        <span className="ml-auto text-[10px] text-slate-400">
          {cadastradas} cadastrada(s) · {restricoes.length - cadastradas} derivada(s)
        </span>
      </div>

      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <ClipboardList className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">
            Nenhuma restrição nesta situação
          </p>
          <p className="max-w-md text-xs text-slate-500">
            Selecione outro filtro ou cadastre as restrições da frente de serviço.
          </p>
        </div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-[11px]">
            <colgroup>
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '10.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8.5%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="px-3 py-2.5">OSI</th>
                <th className="px-3 py-2.5">Obra (SS)</th>
                <th className="px-3 py-2.5">Etapa</th>
                <th className="px-3 py-2.5">Atividade</th>
                <th className="px-3 py-2.5">Descrição</th>
                <th className="px-3 py-2.5">Plano de Ação (Q1/RFT)</th>
                <th className="px-3 py-2.5">Responsável</th>
                <th className="px-3 py-2.5">Empresa Responsável</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Prazo (QUANDO)</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {itens.map((item) => (
                <tr
                  key={item.id}
                  className={`align-top transition-colors ${
                    item.atrasada ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-omega-700">
                    {item.osi || <span className="font-normal text-slate-400">—</span>}
                  </td>

                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-700">{item.ss || '—'}</p>
                    <p
                      className="mt-0.5 max-w-[190px] truncate text-[10px] text-slate-400"
                      title={item.obra_descricao || ''}
                    >
                      {item.obra_descricao || '—'}
                    </p>
                  </td>

                  <td className="px-3 py-3 text-slate-600">{item.etapa || '—'}</td>

                  <td className="px-3 py-3">
                    <p className="max-w-[170px] font-semibold leading-snug text-slate-700">
                      {item.atividade || '—'}
                    </p>
                  </td>

                  <td className="px-3 py-3">
                    <OrigemRestricaoBadge tipo={item.tipo} label={item.origem_label} />
                    <p className="mt-1 max-w-[260px] leading-relaxed text-slate-600">
                      {item.descricao || '—'}
                    </p>
                  </td>

                  <td className="px-3 py-3">
                    <p className="max-w-[260px] leading-relaxed text-slate-600">
                      {item.plano_acao || '—'}
                    </p>
                  </td>

                  <td className="px-3 py-3">
                    <span className="block max-w-[145px] truncate text-slate-700" title={item.responsavel}>
                      {item.responsavel || '—'}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <span
                      className="block max-w-[145px] truncate text-slate-600"
                      title={item.empresa_responsavel}
                    >
                      {item.empresa_responsavel || '—'}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <StatusRestricaoBadge status={item.status} label={item.status_label} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={`font-semibold ${item.atrasada ? 'text-red-700' : 'text-slate-600'}`}>
                      {formatarData(item.prazo)}
                    </span>
                    {item.atrasada ? (
                      <span className="mt-1 flex w-fit items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                        <TriangleAlert className="h-2.5 w-2.5" aria-hidden="true" />
                        Atrasada
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] text-slate-500">
        <span>
          Prazo (QUANDO) é a data limite para remoção da restrição. Linhas em vermelho estão
          atrasadas.
        </span>
        <span>{itens.length} registro(s) no filtro atual</span>
      </footer>
    </section>
  );
}

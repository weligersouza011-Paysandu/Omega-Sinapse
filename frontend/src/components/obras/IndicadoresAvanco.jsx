import { Gauge, TrendingDown, TrendingUp } from 'lucide-react';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';

/**
 * Cards de soma geral do avanço físico: o retrato acumulado da última semana
 * lançada, comparando Realizado x Previsto e evidenciando o desvio.
 */
export default function IndicadoresAvanco({ resumo = {} }) {
  const real = Number(resumo.real_acum || 0);
  const previsto = Number(resumo.previsto_acum || 0);
  const tendencia = Number(resumo.tendencia_acum || 0);
  const desvio = Number(resumo.desvio || 0);
  const temDados = Number(resumo.semanas || 0) > 0;
  const positivo = desvio >= 0;

  const cartoes = [
    {
      chave: 'real',
      label: 'Realizado acumulado',
      valor: formatarPercentual(real, 2),
      detalhe: temDados ? `Semana ${resumo.semana_atual} · ${formatarData(resumo.data_atual)}` : 'Sem medições',
      classe: 'text-omega-700',
      Icone: Gauge,
      cor: 'bg-omega-50 text-omega-700 ring-omega-100',
    },
    {
      chave: 'previsto',
      label: 'Previsto acumulado',
      valor: formatarPercentual(previsto, 2),
      detalhe: `Tendência: ${formatarPercentual(tendencia, 2)}`,
      classe: 'text-slate-700',
      Icone: TrendingUp,
      cor: 'bg-slate-100 text-slate-600 ring-slate-200',
    },
    {
      chave: 'desvio',
      label: 'Desvio Real x Previsto',
      valor: `${positivo ? '+' : ''}${formatarPercentual(desvio, 2)}`,
      detalhe: positivo ? 'Adiantado em relação ao previsto' : 'Atrasado em relação ao previsto',
      classe: positivo ? 'text-emerald-700' : 'text-red-700',
      Icone: positivo ? TrendingUp : TrendingDown,
      cor: positivo
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
        : 'bg-red-50 text-red-700 ring-red-100',
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cartoes.map(({ chave, label, valor, detalhe, classe, Icone, cor }) => (
        <div key={chave} className="card flex items-start gap-3 px-4 py-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${cor}`}>
            <Icone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`text-2xl font-bold leading-tight ${classe}`}>{valor}</p>
            <p className="truncate text-[11px] text-slate-500">{detalhe}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

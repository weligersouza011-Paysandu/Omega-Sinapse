import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { formatarMoeda, formatarMoedaCompacta } from '../../utils/formatters.js';
import { CORES_CURVA_S, linhasPrevisto, prepararCurvaS, seriesTooltip } from '../graficos/curvaSEstilo.jsx';

/** Eixo das colunas (valores do mês). Os acumulados usam o eixo padrão, à direita. */
const EIXO_MENSAL = 'mensal';

function TooltipFinanceiro({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0]?.payload || {};

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">
        {label}
        {ponto.ciclo_inicio ? (
          <span className="ml-1 font-normal text-slate-400">
            (ciclo {ponto.ciclo_inicio.split('-').reverse().slice(0, 2).join('/')} a{' '}
            {ponto.ciclo_fim.split('-').reverse().slice(0, 2).join('/')})
          </span>
        ) : null}
      </p>
      {seriesTooltip(payload).map((serie) => (
        <p key={serie.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: serie.color || serie.fill }} aria-hidden="true" />
          <span className="font-medium">{serie.name}:</span>
          <span className="font-bold text-slate-800">{formatarMoeda(serie.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Amostra({ cor, tipo = 'linha' }) {
  if (tipo === 'coluna') {
    return <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: cor }} aria-hidden="true" />;
  }
  return (
    <span
      className="inline-block h-0 w-5"
      style={{ borderTop: `${tipo === 'tracejada' ? 2 : 3}px ${tipo === 'tracejada' ? 'dashed' : 'solid'} ${cor}` }}
      aria-hidden="true"
    />
  );
}

/**
 * Curva S financeira do contrato: colunas com o Previsto e o Real de cada mês
 * (eixo da esquerda) e linhas com Previsto acumulado, Real acumulado e
 * Tendência (eixo da direita), no padrão visual das demais Curvas S.
 */
export default function CurvaSFinanceira({ curva = [], fonte = 'OBRAS' }) {
  const { dados } = useMemo(
    () =>
      prepararCurvaS(
        curva.map((ponto) => ({
          ...ponto,
          tendencia_acumulada: ponto.tendencia_acumulada > 0 ? ponto.tendencia_acumulada : null,
        })),
        { previsto: 'previsto_acumulado', tendencia: 'tendencia_acumulada', rotulo: 'rotulo', data: 'ciclo_fim' }
      ),
    [curva]
  );

  const temPrevisto = curva.some((ponto) => ponto.previsto_acumulado > 0);

  return (
    <section className="card p-5" aria-label="Curva S financeira">
      <header className="mb-3 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Curva S financeira</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Colunas: valor previsto e medido em cada ciclo mensal. Linhas: acumulado previsto, acumulado medido
            (boletins aprovados) e tendência.
            {fonte === 'CONTRATO'
              ? ' Previsto e tendência vêm da planilha de acompanhamento do contrato.'
              : temPrevisto
                ? ' Previsto e tendência vêm do avanço físico das obras do contrato.'
                : ' O previsto depende do avanço físico lançado nas obras do contrato.'}
          </p>
        </div>
      </header>

      {curva.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
          <BarChart3 className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Sem dados para a Curva S</p>
          <p className="max-w-sm text-xs text-slate-500">
            Lance boletins de medição ou o avanço físico das obras do contrato para montar a curva.
          </p>
        </div>
      ) : (
        <>
          <div className="h-[360px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dados} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis
                  yAxisId={EIXO_MENSAL}
                  orientation="left"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(valor) => formatarMoedaCompacta(valor)}
                />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(valor) => formatarMoedaCompacta(valor)}
                />
                <Tooltip content={<TooltipFinanceiro />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />

                <Bar
                  yAxisId={EIXO_MENSAL}
                  dataKey="previsto"
                  name="Previsto no mês"
                  fill={CORES_CURVA_S.previsto}
                  fillOpacity={0.55}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  isAnimationActive={false}
                />
                <Bar
                  yAxisId={EIXO_MENSAL}
                  dataKey="real"
                  name="Real no mês"
                  fill={CORES_CURVA_S.real}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  isAnimationActive={false}
                />

                {linhasPrevisto({ nome: 'Previsto acumulado' })}
                <Line
                  type="monotone"
                  dataKey="real_acumulado"
                  name="Real acumulado"
                  stroke={CORES_CURVA_S.real}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: CORES_CURVA_S.real, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="tendencia_acumulada"
                  name="Tendência"
                  stroke={CORES_CURVA_S.tendencia}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Amostra cor={CORES_CURVA_S.previsto} tipo="coluna" /> Previsto no mês
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Amostra cor={CORES_CURVA_S.real} tipo="coluna" /> Real no mês
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Amostra cor={CORES_CURVA_S.previsto} /> Previsto acumulado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Amostra cor={CORES_CURVA_S.previstoConcluido} tipo="tracejada" /> Previsto após o total
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Amostra cor={CORES_CURVA_S.real} /> Real acumulado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Amostra cor={CORES_CURVA_S.tendencia} tipo="tracejada" /> Tendência
            </span>
          </div>
        </>
      )}
    </section>
  );
}

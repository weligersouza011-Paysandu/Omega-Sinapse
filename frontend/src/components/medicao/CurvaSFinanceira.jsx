import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { formatarMoeda, formatarMoedaCompacta } from '../../utils/formatters.js';
import { CG, GS } from '../../utils/coresGrafico.js';

/** Cores no padrão do dashboard de acompanhamento do contrato. */
const SERIES = [
  { chave: 'previsto', nome: 'Previsto', tipo: 'coluna', cor: GS.previsto },
  { chave: 'real', nome: 'Real', tipo: 'coluna', cor: GS.real },
  { chave: 'previsto_replanejado', nome: 'Previsto mensal', tipo: 'coluna', cor: GS.mensal },
  { chave: 'previsto_acumulado', nome: 'Prev. acum.', tipo: 'linha', cor: GS.previstoAcum },
  { chave: 'real_acumulado', nome: 'Real acum.', tipo: 'linha', cor: '#7dc3f0' },
  { chave: 'tendencia_acumulada', nome: 'Tendência', tipo: 'tracejada', cor: GS.tendencia },
];

/** Eixo das colunas (valor do mês); as linhas acumuladas usam o eixo da direita. */
const EIXO_MENSAL = 'mensal';

/** Rótulo do eixo X: mês e, na primeira ocorrência de cada ano, o ano embaixo. */
function TickMes({ x, y, payload, dados }) {
  const ponto = dados.find((item) => item.rotulo === payload.value);
  const indice = dados.indexOf(ponto);
  const mostraAno = indice === 0 || ponto?.referencia?.endsWith('-01');
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={12} textAnchor="middle" fontSize={11} fill={CG.eixo}>
        {payload.value.split('/')[0]}
      </text>
      {mostraAno ? (
        <text dy={26} textAnchor="middle" fontSize={11} fontWeight={700} fill={CG.rotulo}>
          {ponto?.referencia?.slice(0, 4)}
        </text>
      ) : null}
    </g>
  );
}

function TooltipFinanceiro({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0]?.payload || {};
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">
        {label}
        {ponto.ciclo_inicio ? (
          <span className="ml-1 font-normal text-slate-400">
            (ciclo {ponto.ciclo_inicio.split('-').reverse().slice(0, 2).join('/')} a {ponto.ciclo_fim.split('-').reverse().slice(0, 2).join('/')})
          </span>
        ) : null}
      </p>
      {SERIES.map((serie) => {
        const valor = ponto[serie.chave];
        if (valor === null || valor === undefined) return null;
        return (
          <p key={serie.chave} className="flex items-center gap-2 text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: serie.cor }} aria-hidden="true" />
            <span className="font-medium">{serie.nome}:</span>
            <span className="font-bold text-slate-800">{formatarMoeda(valor)}</span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Curva S financeira do contrato (linha do tempo mensal).
 *
 * Colunas (eixo esquerdo): Previsto, Real e Previsto mensal de cada ciclo.
 * Linhas (eixo direito): Previsto acumulado, Real acumulado e Tendência.
 * Clicar na legenda mostra ou oculta cada série.
 */
export default function CurvaSFinanceira({ curva = [], fonte = 'OBRAS' }) {
  const [ocultas, setOcultas] = useState(() => new Set());
  const dados = useMemo(
    () => curva.map((ponto) => ({ ...ponto, tendencia_acumulada: ponto.tendencia_acumulada > 0 ? ponto.tendencia_acumulada : null })),
    [curva]
  );
  const visivel = (chave) => !ocultas.has(chave);
  const alternar = (chave) =>
    setOcultas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  return (
    <section className="card p-5" aria-label="Curva S financeira">
      <header className="mb-3 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Curva S financeira — linha do tempo do contrato</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Colunas: previsto, real e previsto mensal de cada ciclo (eixo esquerdo). Linhas: previsto acumulado, real
            acumulado e tendência (eixo direito).
            {fonte === 'CONTRATO'
              ? ' Previsto e tendência vêm da planilha de acompanhamento do contrato.'
              : ' Previsto e tendência vêm do avanço físico das obras do contrato.'}{' '}
            Clique na legenda para ocultar uma série.
          </p>
        </div>
      </header>

      {dados.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
          <BarChart3 className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Sem dados para a Curva S</p>
          <p className="max-w-sm text-xs text-slate-500">Importe as planilhas ou lance boletins para montar a curva.</p>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
            {SERIES.map((serie) => (
              <button
                key={serie.chave}
                type="button"
                onClick={() => alternar(serie.chave)}
                aria-pressed={visivel(serie.chave)}
                className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-medium transition ${
                  visivel(serie.chave) ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 line-through hover:bg-slate-50'
                }`}
              >
                {serie.tipo === 'coluna' ? (
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serie.cor }} aria-hidden="true" />
                ) : (
                  <span
                    className="inline-block h-0 w-5"
                    style={{ borderTop: `${serie.tipo === 'tracejada' ? 2 : 3}px ${serie.tipo === 'tracejada' ? 'dashed' : 'solid'} ${serie.cor}` }}
                    aria-hidden="true"
                  />
                )}
                {serie.nome}
              </button>
            ))}
          </div>

          <div className="h-[420px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dados} margin={{ top: 10, right: 6, left: 2, bottom: 12 }} barGap={1} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke={CG.grade} vertical={false} />
                <XAxis dataKey="rotulo" interval={0} tickLine={false} height={42} tick={<TickMes dados={dados} />} />
                <YAxis
                  yAxisId={EIXO_MENSAL}
                  orientation="left"
                  tick={{ fontSize: 11, fill: CG.eixo }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                  tickFormatter={(valor) => formatarMoedaCompacta(valor)}
                />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 11, fill: CG.eixo }}
                  tickLine={false}
                  axisLine={false}
                  width={66}
                  tickFormatter={(valor) => formatarMoedaCompacta(valor)}
                />
                <Tooltip content={<TooltipFinanceiro />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />

                {SERIES.filter((serie) => serie.tipo === 'coluna' && visivel(serie.chave)).map((serie) => (
                  <Bar
                    key={serie.chave}
                    yAxisId={EIXO_MENSAL}
                    dataKey={serie.chave}
                    name={serie.nome}
                    fill={serie.cor}
                    maxBarSize={14}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                ))}
                {SERIES.filter((serie) => serie.tipo !== 'coluna' && visivel(serie.chave)).map((serie) => (
                  <Line
                    key={serie.chave}
                    type="monotone"
                    dataKey={serie.chave}
                    name={serie.nome}
                    stroke={serie.cor}
                    strokeWidth={serie.tipo === 'tracejada' ? 2.5 : 2.5}
                    strokeDasharray={serie.tipo === 'tracejada' ? '5 4' : undefined}
                    dot={serie.tipo === 'tracejada' ? { r: 3, fill: serie.cor, strokeWidth: 0 } : false}
                    connectNulls={serie.tipo === 'tracejada'}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { formatarMoeda, formatarMoedaCompacta } from '../../utils/formatters.js';
import { CG, CURVA_S } from '../../utils/coresGrafico.js';

/**
 * Séries do gráfico. `cor` é a cor opaca (linha, borda, legenda); `fundo` é o preenchimento das colunas,
 * que no tema escuro é translúcido para as barras agrupadas não pesarem.
 */
const SERIES = [
  { chave: 'previsto_replanejado', nome: 'Projetado', tipo: 'coluna', cor: CURVA_S.mensal.linha, fundo: CURVA_S.mensal.fundo },
  { chave: 'real', nome: 'Real', tipo: 'coluna', cor: CURVA_S.real.linha, fundo: CURVA_S.real.fundo },
  { chave: 'real_acumulado', nome: 'Real acum.', tipo: 'linha', cor: CURVA_S.realAcum.linha },
  { chave: 'tendencia_acumulada', nome: 'Tendência', tipo: 'tracejada', cor: CURVA_S.tendencia.linha },
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
    <div className="min-w-[15rem] rounded-lg border border-slate-200 bg-white/95 px-3.5 py-2.5 text-xs shadow-xl shadow-slate-900/15 backdrop-blur-sm">
      <p className="mb-1.5 border-b border-slate-200 pb-1.5 font-bold text-slate-800">
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
          <p key={serie.chave} className="flex items-center gap-2 py-0.5 text-slate-600">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: serie.fundo || serie.cor, boxShadow: `0 0 0 1px ${serie.cor}` }}
              aria-hidden="true"
            />
            <span className="font-medium">{serie.nome}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-900">{formatarMoeda(valor)}</span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Curva S financeira do contrato (linha do tempo mensal).
 *
 * Colunas (eixo esquerdo): Projetado e Real de cada ciclo.
 * Linhas (eixo direito): Real acumulado e Tendência.
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
            Colunas: projetado e real de cada ciclo (eixo esquerdo). Linhas: real acumulado e tendência
            (eixo direito).
            {fonte === 'CONTRATO'
              ? ' Projetado e tendência vêm da planilha de acompanhamento do contrato.'
              : ' A tendência vem do avanço físico das obras do contrato.'}
            {curva.some((ponto) => ponto.projetado_origem)
              ? ` Projetado de ${curva.filter((ponto) => ponto.projetado_origem === 'PROJECOES').length} mês(es) vem das Projeções de BMM${
                  curva.some((ponto) => ponto.projetado_origem === 'MANUAL') ? ` (${curva.filter((ponto) => ponto.projetado_origem === 'MANUAL').length} ajustado(s) à mão depois)` : ''
                }.`
              : ''}{' '}
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
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: serie.fundo, boxShadow: `0 0 0 1px ${serie.cor}` }}
                    aria-hidden="true"
                  />
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
                <CartesianGrid strokeDasharray="2 5" stroke={CURVA_S.grade.fundo} vertical={false} />
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
                <Tooltip content={<TooltipFinanceiro />} cursor={{ fill: 'rgb(var(--c-slate-500) / 0.1)' }} />

                {SERIES.filter((serie) => serie.tipo === 'coluna' && visivel(serie.chave)).map((serie) => (
                  <Bar
                    key={serie.chave}
                    yAxisId={EIXO_MENSAL}
                    dataKey={serie.chave}
                    name={serie.nome}
                    fill={serie.fundo}
                    stroke={serie.cor}
                    strokeWidth={1}
                    strokeOpacity={0.9}
                    maxBarSize={14}
                    radius={[3, 3, 0, 0]}
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
                    strokeWidth={serie.tipo === 'tracejada' ? 2 : 1.75}
                    strokeLinecap="round"
                    strokeDasharray={serie.tipo === 'tracejada' ? '6 5' : undefined}
                    dot={serie.tipo === 'tracejada' ? { r: 2.5, fill: serie.cor, strokeWidth: 0 } : false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
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

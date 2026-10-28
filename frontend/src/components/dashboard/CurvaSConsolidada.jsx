import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import Dropdown from '../Dropdown.jsx';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';
import { corDesvio, formatarPp } from './dashboardUtils.js';

function TooltipCurva({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const ponto = payload[0]?.payload || {};

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">
        {label}
        {ponto.data ? ` · ${formatarData(ponto.data)}` : ''}
      </p>
      {payload.map((serie) => (
        <p key={serie.dataKey} className="flex items-center gap-2 text-slate-600">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: serie.color }}
            aria-hidden="true"
          />
          <span className="font-medium">{serie.name}:</span>
          <span className="font-bold text-slate-800">{formatarPercentual(serie.value, 2)}</span>
        </p>
      ))}
      {ponto.obras ? (
        <p className="mt-1 border-t border-slate-100 pt-1 text-[10px] text-slate-400">
          {ponto.obras} obra(s) considerada(s)
        </p>
      ) : null}
    </div>
  );
}

function CartaoEstatistica({ rotulo, valor, classe = 'text-slate-800' }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-sm font-black leading-tight ${classe}`}>{valor}</p>
    </div>
  );
}

/**
 * Curva S de avanço físico: consolidado da carteira ou uma obra específica.
 * O seletor usa a OSI como referência e mantém o recorte dos filtros globais.
 */
export default function CurvaSConsolidada({ curva = {} }) {
  const porObra = curva.por_obra || [];
  const [selecao, setSelecao] = useState('consolidado');

  useEffect(() => {
    if (selecao === 'consolidado') return;
    if (!porObra.some((obra) => String(obra.obra_id) === selecao)) {
      setSelecao('consolidado');
    }
  }, [porObra, selecao]);

  const opcoes = useMemo(
    () => [
      {
        value: 'consolidado',
        label: `Consolidado (${porObra.length} obra${porObra.length === 1 ? '' : 's'})`,
      },
      ...porObra.map((obra) => {
        const referencia = obra.osi || obra.ss || `Obra #${obra.obra_id}`;
        return {
          value: String(obra.obra_id),
          label: obra.osi && obra.ss ? `${referencia} · ${obra.ss}` : referencia,
        };
      }),
    ],
    [porObra]
  );

  const serie = useMemo(() => {
    if (selecao === 'consolidado') {
      return {
        titulo: 'Consolidado da carteira',
        pontos: curva.consolidada || [],
      };
    }

    const obra = porObra.find((item) => String(item.obra_id) === selecao);
    return {
      titulo: obra ? obra.osi || obra.ss || `Obra #${obra.obra_id}` : 'Obra',
      pontos: obra?.pontos || [],
    };
  }, [selecao, curva.consolidada, porObra]);

  const dados = useMemo(
    () =>
      (serie.pontos || []).map((ponto) => ({
        ...ponto,
        dataFormatada: formatarData(ponto.data),
      })),
    [serie.pontos]
  );

  const ultimo = dados[dados.length - 1] || {};
  const primeiro = dados[0] || {};
  const previsto = Number(ultimo.previsto || 0);
  const real = Number(ultimo.real || 0);
  const tendencia = Number(ultimo.tendencia || 0);
  const desvio = real - previsto;
  const paletaDesvio = corDesvio(desvio);
  const temDados = dados.length > 0;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Curva S de Avanço Físico</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Previsto × Tendência × Real · {serie.titulo}
            </p>
          </div>
        </div>

        <div className="w-full shrink-0 sm:w-72">
          <label htmlFor="seletor-curva-s" className="rotulo">
            OSI / Obra
          </label>
          <Dropdown
            id="seletor-curva-s"
            value={selecao}
            onChange={setSelecao}
            opcoes={opcoes}
            placeholder="Selecione a obra"
            textoVazio="Nenhuma obra com medição"
          />
        </div>
      </header>

      <div className="p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CartaoEstatistica rotulo="Previsto" valor={formatarPercentual(previsto, 1)} />
          <CartaoEstatistica
            rotulo="Real"
            valor={formatarPercentual(real, 1)}
            classe="text-omega-700"
          />
          <CartaoEstatistica
            rotulo="Tendência"
            valor={formatarPercentual(tendencia, 1)}
            classe="text-emerald-700"
          />
          <CartaoEstatistica
            rotulo="Desvio Real × Previsto"
            valor={formatarPp(desvio, 1)}
            classe={paletaDesvio.texto}
          />
        </div>

        {temDados ? (
          <>
            <div className="mt-4 h-[300px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dados} margin={{ top: 10, right: 18, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(valor) => `${valor}%`}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip content={<TooltipCurva />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <ReferenceLine
                    y={90}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Meta 90%',
                      position: 'insideTopRight',
                      fill: '#94a3b8',
                      fontSize: 9,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="previsto"
                    name="Previsto"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="real"
                    name="Real"
                    stroke="#164b7d"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="tendencia"
                    name="Tendência"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="2 3"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-2 text-[10px] text-slate-400">
              {formatarData(primeiro.data)} a {formatarData(ultimo.data)} · {dados.length} ponto(s)
              {selecao === 'consolidado' ? ' consolidado(s)' : ''}
            </p>
          </>
        ) : (
          <div className="mt-4 flex h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
            <TrendingUp className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">Sem medições para exibir</p>
            <p className="max-w-md text-xs text-slate-500">
              Ajuste os filtros globais ou lance medições de avanço físico nas obras para gerar a
              Curva S.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

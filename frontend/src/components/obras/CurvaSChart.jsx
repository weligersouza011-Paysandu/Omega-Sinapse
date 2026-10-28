import { BarChart3 } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';

/** Tooltip com os percentuais no padrão brasileiro. */
function TooltipCurvaS({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">{label}</p>
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
    </div>
  );
}

/**
 * Curva S do avanço físico: comparativo entre previsto, realizado e tendência
 * acumulados ao longo das semanas lançadas na obra.
 */
export default function CurvaSChart({ linhas = [] }) {
  const dados = [...linhas]
    .sort((a, b) => a.semana - b.semana)
    .map((linha) => ({
      ...linha,
      rotulo: `S${linha.semana}`,
      dataFormatada: formatarData(linha.data),
    }));

  if (dados.length === 0) {
    return (
      <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
        <BarChart3 className="h-8 w-8 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-600">Sem medições de avanço físico</p>
        <p className="max-w-sm text-xs text-slate-500">
          Lance as semanas na aba <strong>Edição / Configuração</strong> para gerar a Curva S.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(valor) => `${valor}%`}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
          />
          <Tooltip content={<TooltipCurvaS />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Line
            type="monotone"
            dataKey="fisico_prev_acum"
            name="Previsto acum."
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="fisico_real_acum"
            name="Realizado acum."
            stroke="#164b7d"
            strokeWidth={2.5}
            dot={{ r: 2.5 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="fisico_tend_acum"
            name="Tendência acum."
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="2 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

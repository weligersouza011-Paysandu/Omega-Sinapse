import { BarChart3, Info } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatarData,
  formatarMoeda,
  formatarMoedaCompacta,
  formatarPercentual,
  formatarSemana,
} from '../../utils/formatters.js';
import { projetarFinanceiro } from '../../utils/financeiroObra.js';

const CORES = { previsto: '#64748b', medido: '#0f766e', tendencia: '#f59e0b' };

function CartaoResumo({ rotulo, valor, detalhe, tom = 'text-slate-800' }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

function TooltipDesembolso({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">{label}</p>
      {payload.map((serie) => (
        <p key={serie.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: serie.color }} aria-hidden="true" />
          <span className="font-medium">{serie.name}:</span>
          <span className="font-bold text-slate-800">{formatarMoeda(serie.value)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Aba "Projeção Financeira & Medição": resumo contratado × medido, histórico de
 * medições e curva de desembolso. Os valores são estimados a partir do avanço
 * físico semanal × valor vigente (ainda não há medição financeira própria).
 */
export default function AbaProjecaoFinanceira({ obra }) {
  const projecao = projetarFinanceiro(obra.avanco_fisico, obra.valor);
  const { medicoes } = projecao;

  const dadosGrafico = medicoes.map((medicao) => ({
    rotulo: formatarSemana(medicao.semana, medicao.data),
    previsto: medicao.previstoAcumulado,
    medido: medicao.status === 'MEDIDO' ? medicao.valorAcumulado : null,
    tendencia: medicao.tendenciaAcumulada || null,
  }));

  const aderencia = projecao.aderencia;
  const tomAderencia =
    aderencia === null ? 'text-slate-400' : aderencia >= 95 ? 'text-emerald-600' : aderencia >= 80 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Valores <strong>estimados</strong> a partir do avanço físico semanal × valor vigente do contrato. As
          medições financeiras contratuais ainda não são lançadas no sistema.
        </p>
      </div>

      <section aria-label="Resumo financeiro" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoResumo rotulo="Total contratado" valor={formatarMoeda(projecao.contratado)} detalhe="Valor vigente da obra" tom="text-omega-700" />
        <CartaoResumo
          rotulo="Total medido acumulado"
          valor={formatarMoeda(projecao.medidoAcumulado)}
          detalhe={`${formatarPercentual(obra.avanco_resumo?.real_acum || 0, 2)} do contrato`}
          tom="text-teal-700"
        />
        <CartaoResumo
          rotulo="Saldo a medir"
          valor={formatarMoeda(projecao.saldo)}
          detalhe={`Previsto ao fim: ${formatarMoeda(projecao.previstoAcumulado)}`}
        />
        <CartaoResumo
          rotulo="Aderência financeira"
          valor={aderencia === null ? '—' : formatarPercentual(aderencia, 1)}
          detalhe="Medido ÷ previsto até a última medição"
          tom={tomAderencia}
        />
      </section>

      <section className="card p-4">
        <header className="mb-2">
          <h2 className="text-sm font-bold text-slate-800">Projeção de desembolso financeiro</h2>
          <p className="text-xs text-slate-500">Valores acumulados por semana: previsto, medido e tendência.</p>
        </header>

        {dadosGrafico.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
            <BarChart3 className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">Sem medições lançadas</p>
            <p className="text-xs text-slate-500">Lance o avanço físico semanal para gerar a projeção.</p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dadosGrafico} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(valor) => formatarMoedaCompacta(valor)}
                />
                <Tooltip content={<TooltipDesembolso />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="previsto"
                  name="Previsto"
                  stroke={CORES.previsto}
                  fill={CORES.previsto}
                  fillOpacity={0.08}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
                <Area
                  type="monotone"
                  dataKey="medido"
                  name="Medido"
                  stroke={CORES.medido}
                  fill={CORES.medido}
                  fillOpacity={0.15}
                  strokeWidth={2.5}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="tendencia"
                  name="Tendência"
                  stroke={CORES.tendencia}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Histórico de medições</h2>
          <p className="text-xs text-slate-500">Uma medição por semana de avanço físico lançada.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Medição nº', 'Data', 'Semana', 'Valor medido (R$)', '% medido', 'Acumulado (R$)', 'Status'].map((titulo) => (
                  <th
                    key={titulo}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {[...medicoes].reverse().map((medicao) => (
                <tr key={medicao.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">
                    #{String(medicao.numero).padStart(2, '0')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatarData(medicao.data)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatarSemana(medicao.semana, medicao.data)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-slate-800">
                    {formatarMoeda(medicao.valorPeriodo)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                    {formatarPercentual(medicao.percentualPeriodo, 2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                    {formatarMoeda(medicao.valorAcumulado)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        medicao.status === 'MEDIDO'
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                          : 'border-amber-300 bg-amber-100 text-amber-800'
                      }`}
                    >
                      {medicao.status === 'MEDIDO' ? 'Medido' : 'Previsto'}
                    </span>
                  </td>
                </tr>
              ))}
              {medicoes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Nenhuma medição lançada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

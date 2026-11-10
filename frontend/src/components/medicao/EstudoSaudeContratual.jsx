import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, Gauge, HeartPulse, Hourglass, Info, Layers, Wallet } from 'lucide-react';
import { formatarData, formatarMoeda, formatarMoedaCompacta, formatarPercentual } from '../../utils/formatters.js';
import { CG, CURVA_S, GS } from '../../utils/coresGrafico.js';
import { montarEstudo, rotuloDoMes } from '../../utils/saudeContratual.js';

const COR_TETO = GS.marca;
const COR_REAL = CURVA_S.real.linha;
const COR_PROJECAO = CURVA_S.realAcum.linha;
const COR_TAC = CURVA_S.tendencia.linha;

/** Tom e texto do veredito de cada situação. */
const SITUACOES = {
  OK: { tom: 'emerald', Icone: CheckCircle2, titulo: 'Teto atual suporta o ritmo até o fim da vigência' },
  ATENCAO: { tom: 'amber', Icone: AlertTriangle, titulo: 'Folga apertada: o teto suporta o ritmo, mas por pouco' },
  ADITIVO: { tom: 'red', Icone: AlertTriangle, titulo: 'No ritmo atual o saldo acaba antes do fim da vigência: novo aditivo provável' },
  ESGOTADO: { tom: 'red', Icone: AlertTriangle, titulo: 'O teto atual já foi ultrapassado' },
  ENCERRADA: { tom: 'slate', Icone: CalendarClock, titulo: 'Vigência encerrada' },
  SEM_DADOS: { tom: 'slate', Icone: Info, titulo: 'Sem boletins aprovados para estimar o ritmo' },
};

const CLASSES_TOM = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  red: 'border-red-200 bg-red-50 text-red-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
};

const LEITURAS = {
  ESTOURADO: { texto: 'Teto anterior já estourado', classe: 'border-red-200 bg-red-50 text-red-700' },
  NO_LIMITE: { texto: 'No limite do teto anterior', classe: 'border-amber-300 bg-amber-50 text-amber-800' },
  ANTECIPADO: { texto: 'Aditivo antecipado', classe: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  SEM_MEDICAO: { texto: 'Anterior à medição importada', classe: 'border-slate-200 bg-slate-100 text-slate-600' },
};

function detalheDaSituacao(ind) {
  switch (ind.situacao) {
    case 'OK':
      return `Folga estimada de ${formatarMoeda(ind.folga)} ao fim da vigência (consumo projetado ${formatarMoeda(ind.consumo_ate_fim)} para um saldo de ${formatarMoeda(ind.saldo)}).`;
    case 'ATENCAO':
      return `Sobram apenas ${formatarMoeda(ind.folga)} ao fim da vigência: qualquer aceleração do ritmo pede aditivo.`;
    case 'ADITIVO':
      return `Faltam cerca de ${formatarMoeda(ind.aditivo_necessario)} para sustentar o ritmo até o fim da vigência. O saldo de ${formatarMoeda(ind.saldo)} acaba por volta de ${rotuloDoMes(ind.referencia_esgota)}.`;
    case 'ESGOTADO':
      return `Medido acumulado ${formatarMoeda(ind.acumulado)} para um teto de ${formatarMoeda(ind.teto_atual)}: excedente de ${formatarMoeda(-ind.saldo)}.`;
    case 'ENCERRADA':
      return `Último ciclo medido: ${rotuloDoMes(ind.ultima_referencia)}. Saldo remanescente de ${formatarMoeda(ind.saldo)}.`;
    default:
      return 'Aprove pelo menos um boletim para calcular o run rate e a projeção.';
  }
}

function Cartao({ Icone, rotulo, valor, apoio, tom = 'text-slate-800' }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {rotulo}
      </div>
      <p className={`text-xl font-black tabular-nums ${tom}`}>{valor}</p>
      <p className="text-[11px] leading-snug text-slate-500">{apoio}</p>
    </div>
  );
}

function TooltipEstudo({ active, payload }) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0].payload;
  const consumo = ponto.real !== null && ponto.teto > 0 ? (ponto.real / ponto.teto) * 100 : null;
  return (
    <div className="min-w-[14rem] rounded-lg border border-slate-200 bg-white/95 px-3.5 py-2.5 text-xs shadow-xl shadow-slate-900/15 backdrop-blur-sm">
      <p className="mb-1.5 border-b border-slate-200 pb-1.5 font-bold text-slate-800">
        {ponto.rotulo}
        {ponto.tacs.length ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">{ponto.tacs.join(' + ')}</span> : null}
      </p>
      <p className="flex justify-between gap-4 py-0.5 text-slate-600">
        <span>Teto do contrato</span>
        <span className="font-semibold tabular-nums text-slate-900">{formatarMoeda(ponto.teto)}</span>
      </p>
      {ponto.real !== null ? (
        <>
          <p className="flex justify-between gap-4 py-0.5 text-slate-600">
            <span>Real acumulado</span>
            <span className="font-semibold tabular-nums text-slate-900">{formatarMoeda(ponto.real)}</span>
          </p>
          <p className="flex justify-between gap-4 py-0.5 text-slate-600">
            <span>Teto consumido</span>
            <span className="font-semibold tabular-nums text-slate-900">{formatarPercentual(consumo, 1)}</span>
          </p>
        </>
      ) : ponto.projecao !== null ? (
        <p className="flex justify-between gap-4 py-0.5 text-slate-600">
          <span>Projeção no ritmo atual</span>
          <span className="font-semibold tabular-nums text-slate-900">{formatarMoeda(ponto.projecao)}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Estudo de saúde contratual: teto em degraus (valor inicial + cada TAC, na data de assinatura) contra o
 * acumulado real, run rate dos ciclos de 16 a 15 e projeção de esgotamento do saldo.
 */
export default function EstudoSaudeContratual({ contrato, curva = [] }) {
  const estudo = useMemo(() => (contrato ? montarEstudo(contrato, curva) : null), [contrato, curva]);
  if (!contrato || !estudo) return null;

  const { serie, analiseTacs, indicadores: ind } = estudo;
  const situacao = SITUACOES[ind.situacao];
  const Veredito = situacao.Icone;
  const rotulos = new Set(serie.map((ponto) => ponto.rotulo));
  const realEm = (referencia) => serie.find((ponto) => ponto.referencia === referencia)?.real ?? null;
  const esgotaNoGrafico = ind.referencia_esgota && serie.some((ponto) => ponto.referencia === ind.referencia_esgota) && ind.situacao !== 'OK';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ------------------------------------------------------------- veredito */}
      <section aria-label="Resumo da saúde contratual" className={`card flex flex-wrap items-start gap-3 border p-4 ${CLASSES_TOM[situacao.tom]}`}>
        <Veredito className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{situacao.titulo}</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-90">{detalheDaSituacao(ind)}</p>
        </div>
        <span className="rounded-full border border-current/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide opacity-80">
          <HeartPulse className="mr-1 inline h-3 w-3" aria-hidden="true" />
          {contrato.id_vale}
        </span>
      </section>

      {/* ----------------------------------------------------------- indicadores */}
      <section aria-label="Indicadores de saúde financeira" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Cartao
          Icone={Activity}
          rotulo="Run rate por ciclo"
          valor={ind.ritmo_recente === null ? '—' : formatarMoeda(ind.ritmo_recente)}
          apoio={ind.ritmo_recente === null ? 'Sem boletins aprovados.' : `Média dos últimos ${Math.min(3, ind.ciclos_medidos)} ciclos (16 a 15). Média geral ${formatarMoeda(ind.ritmo_geral)}.`}
        />
        <Cartao
          Icone={Wallet}
          rotulo="Saldo do teto"
          valor={formatarMoeda(ind.saldo)}
          tom={ind.saldo <= 0 ? 'text-red-700' : 'text-slate-800'}
          apoio={`${formatarPercentual(ind.percentual_consumido, 1)} do teto de ${formatarMoedaCompacta(ind.teto_atual)} consumido.`}
        />
        <Cartao
          Icone={Hourglass}
          rotulo="Runway do saldo"
          valor={ind.ciclos_ate_esgotar === null ? '—' : `${ind.ciclos_ate_esgotar.toLocaleString('pt-BR')} ciclos`}
          tom={ind.situacao === 'ADITIVO' || ind.situacao === 'ESGOTADO' ? 'text-red-700' : 'text-slate-800'}
          apoio={ind.referencia_esgota ? `Saldo esgota por volta de ${rotuloDoMes(ind.referencia_esgota)} no ritmo atual.` : 'Depende do run rate.'}
        />
        <Cartao
          Icone={CalendarClock}
          rotulo="Vigência restante"
          valor={ind.meses_restantes === null ? '—' : `${ind.meses_restantes} ${ind.meses_restantes === 1 ? 'ciclo' : 'ciclos'}`}
          apoio={`Fim em ${formatarData(contrato.data_fim)}${ind.ultima_referencia ? `, a partir de ${rotuloDoMes(ind.ultima_referencia)}` : ''}.`}
        />
        <Cartao
          Icone={Gauge}
          rotulo="Ritmo necessário"
          valor={ind.ritmo_necessario === null ? '—' : formatarMoeda(ind.ritmo_necessario)}
          tom={ind.razao_ritmo !== null && ind.razao_ritmo > 1 ? 'text-red-700' : 'text-slate-800'}
          apoio={
            ind.razao_ritmo === null
              ? 'Por ciclo, para consumir o saldo até o fim da vigência.'
              : `Por ciclo para consumir o saldo até o fim. O ritmo atual é ${formatarPercentual(ind.razao_ritmo * 100, 0)} disso.`
          }
        />
        <Cartao
          Icone={Layers}
          rotulo="Aditivos (TAC)"
          valor={`${ind.quantidade_aditivos} · + ${formatarMoedaCompacta(ind.total_aditivos)}`}
          apoio={ind.percentual_aditivos === null ? 'Sem aditivos.' : `${formatarPercentual(ind.percentual_aditivos, 1)} sobre o valor inicial de ${formatarMoedaCompacta(contrato.valor_inicial)}.`}
        />
      </section>

      {/* ---------------------------------------------------------------- gráfico */}
      <section className="card p-5" aria-label="Teto do contrato em degraus contra o acumulado real">
        <header className="mb-3">
          <h3 className="text-sm font-bold text-slate-800">Teto contratual em degraus × acumulado real</h3>
          <p className="mt-0.5 max-w-4xl text-[11px] leading-relaxed text-slate-500">
            O teto sobe em degraus no mês de assinatura de cada TAC. Os pontos marcam em que mês o realizado alcançou o
            teto anterior, o que mostra o momento em que o aditivo passou a ser necessário. A linha tracejada projeta o
            acumulado no run rate atual.
          </p>
        </header>

        <div className="mb-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-5" style={{ borderTop: `3px solid ${COR_TETO}` }} aria-hidden="true" />Teto do contrato</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-5" style={{ borderTop: `3px solid ${COR_REAL}` }} aria-hidden="true" />Real acumulado</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-5" style={{ borderTop: `2px dashed ${COR_PROJECAO}` }} aria-hidden="true" />Projeção no run rate</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0" style={{ borderLeft: `2px dashed ${COR_TAC}` }} aria-hidden="true" />Assinatura do TAC</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_REAL, boxShadow: `0 0 0 2px ${CG.superficie}` }} aria-hidden="true" />Real alcançou o teto anterior</span>
        </div>

        <div className="h-[400px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 22, right: 12, left: 2, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 5" stroke={CURVA_S.grade.fundo} vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: CG.eixo }} tickLine={false} minTickGap={22} />
              <YAxis
                tick={{ fontSize: 11, fill: CG.eixo }}
                tickLine={false}
                axisLine={false}
                width={66}
                domain={[0, (max) => Math.ceil((max * 1.06) / 1000000) * 1000000]}
                tickFormatter={(valor) => formatarMoedaCompacta(valor)}
              />
              <Tooltip content={<TooltipEstudo />} cursor={{ stroke: 'rgb(var(--c-slate-500) / 0.4)', strokeDasharray: '3 3' }} />

              {analiseTacs
                .filter((tac) => rotulos.has(rotuloDoMes(tac.referencia)))
                .map((tac) => (
                  <ReferenceLine
                    key={tac.id ?? tac.numero_tac}
                    x={rotuloDoMes(tac.referencia)}
                    stroke={COR_TAC}
                    strokeDasharray="4 4"
                    strokeOpacity={0.85}
                    label={{ value: `${tac.numero_tac}  +${formatarMoedaCompacta(tac.valor)}`, position: 'top', fill: COR_TAC, fontSize: 10, fontWeight: 700 }}
                  />
                ))}

              <Area type="monotone" dataKey="real" stroke="none" fill={COR_REAL} fillOpacity={0.13} isAnimationActive={false} connectNulls={false} legendType="none" tooltipType="none" />
              <Line type="stepAfter" dataKey="teto" name="Teto do contrato" stroke={COR_TETO} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="projecao" name="Projeção" stroke={COR_PROJECAO} strokeWidth={1.75} strokeDasharray="6 5" dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="real" name="Real acumulado" stroke={COR_REAL} strokeWidth={2.25} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />

              {analiseTacs
                .filter((tac) => tac.referencia_100 && rotulos.has(rotuloDoMes(tac.referencia_100)))
                .map((tac) => (
                  <ReferenceDot
                    key={`alcance-${tac.id ?? tac.numero_tac}`}
                    x={rotuloDoMes(tac.referencia_100)}
                    y={realEm(tac.referencia_100)}
                    r={5.5}
                    fill={COR_REAL}
                    stroke={CG.superficie}
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                ))}
              {esgotaNoGrafico ? (
                <ReferenceDot
                  x={rotuloDoMes(ind.referencia_esgota)}
                  y={serie.find((ponto) => ponto.referencia === ind.referencia_esgota)?.projecao ?? 0}
                  r={5.5}
                  fill="transparent"
                  stroke={COR_PROJECAO}
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                  label={{ value: 'Teto esgota', position: 'bottom', offset: 12, fill: COR_PROJECAO, fontSize: 10, fontWeight: 700 }}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ------------------------------------------------------ leitura dos TACs */}
      <section className="card overflow-hidden" aria-label="Quando cada aditivo foi necessário">
        <header className="px-5 py-4">
          <h3 className="text-sm font-bold text-slate-800">Quando cada aditivo foi necessário</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Quanto do teto anterior já estava consumido na assinatura e em que mês o realizado chegou a 90% e a 100% dele.
          </p>
        </header>
        {analiseTacs.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-8 text-center text-sm text-slate-500">
            Nenhum TAC registrado em {contrato.id_vale}. Registre os aditivos em "Histórico de contratos" para ver o estudo.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="min-w-full text-xs tabular-nums">
              <thead className="bg-slate-50">
                <tr>
                  {['TAC', 'Assinatura', 'Teto antes → depois', 'Consumo do teto anterior', 'Chegou a 90%', 'Chegou a 100%', 'Leitura'].map((titulo) => (
                    <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analiseTacs.map((tac) => {
                  const leitura = LEITURAS[tac.leitura];
                  const pct = tac.percentual_do_teto_anterior;
                  return (
                    <tr key={tac.id ?? tac.numero_tac}>
                      <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-bold text-omega-700">{tac.numero_tac}</th>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatarData(tac.data_assinatura)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {formatarMoeda(tac.teto_anterior)} <span className="text-slate-400">→</span> <strong>{formatarMoeda(tac.teto_novo)}</strong>
                        <span className="ml-1.5 font-semibold text-amber-700">(+{formatarMoedaCompacta(tac.valor)})</span>
                      </td>
                      <td className="min-w-[11rem] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-12 text-right font-semibold text-slate-800">{pct === null ? '—' : formatarPercentual(pct, 1)}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                            <span
                              className={`block h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{tac.referencia_90 ? rotuloDoMes(tac.referencia_90) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{tac.referencia_100 ? rotuloDoMes(tac.referencia_100) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${leitura.classe}`}>{leitura.texto}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-200 px-5 py-2.5 text-[11px] leading-relaxed text-slate-500">
          Run rate = média do medido nos últimos {Math.min(3, ind.ciclos_medidos) || 3} ciclos aprovados. Runway = saldo ÷ run rate.
          A projeção supõe que o ritmo se mantém; ela não considera sazonalidade nem aditivos futuros.
        </p>
      </section>
    </div>
  );
}

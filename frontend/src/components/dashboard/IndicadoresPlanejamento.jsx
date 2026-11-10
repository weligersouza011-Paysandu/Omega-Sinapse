import { AlertTriangle, Target } from 'lucide-react';
import { formatarPercentual } from '../../utils/formatters.js';
import GaugeSemicircular from './GaugeSemicircular.jsx';
import { corAderencia, formatarPp } from './dashboardUtils.js';

function RodapeIndicador({ itens = [] }) {
  return (
    <dl className="mt-1 grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/70 py-2.5 text-center">
      {itens.map((item) => (
        <div key={item.label} className="min-w-0 px-1.5">
          <dt className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">
            {item.label}
          </dt>
          <dd className={`mt-0.5 text-sm font-black leading-tight ${item.classe || 'text-slate-800'}`}>
            {item.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Dois gauges semicirculares do dashboard:
 *  - aderência geral do avanço físico (real / previsto);
 *  - percentual de obras com desvio acima da tolerância (desvios/retrabalhos).
 */
export default function IndicadoresPlanejamento({ resumo = {}, obraUnica = false }) {
  const aderencia = Number(resumo.aderencia_geral || 0);
  const comMedicao = Number(resumo.com_medicao || 0);
  const percentualDesvio = Number(resumo.percentual_obras_com_desvio || 0);
  const obrasComDesvio = Number(resumo.obras_com_desvio || 0);
  const meta = Number(resumo.aderencia_meta || 90);
  const paletaAderencia = corAderencia(aderencia);
  const temMedicao = comMedicao > 0;

  // Modo "obra em foco": o segundo gauge mostra se a obra está dentro da tolerância.
  const foraDaTolerancia = obraUnica && obrasComDesvio > 0;

  const criticos = (resumo.faixas_desvio || []).find((item) => item.id === 'critico');
  const atencao = (resumo.faixas_desvio || []).find((item) => item.id === 'atencao');

  const corDesvios =
    percentualDesvio >= 40 ? '#dc2626' : percentualDesvio >= 20 ? '#d97706' : '#059669';
  const classeDesvios =
    percentualDesvio >= 40
      ? 'text-red-700'
      : percentualDesvio >= 20
        ? 'text-amber-700'
        : 'text-emerald-700';

  return (
    <section aria-label="Indicadores de planejamento" className="grid gap-4 lg:grid-cols-2">
      <article className="card flex flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
              <Target className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Aderência Geral de Avanço Físico</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                Relação entre o realizado e o previsto nas obras com medição.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            Meta {formatarPercentual(meta, 0)}
          </span>
        </div>

        <GaugeSemicircular
          className="mt-3"
          percentual={temMedicao ? aderencia : 0}
          cor={temMedicao ? paletaAderencia.hex : '#94a3b8'}
          textoPrincipal={temMedicao ? formatarPercentual(aderencia, 1) : '—'}
          textoSecundario={temMedicao ? `meta ${formatarPercentual(meta, 0)}` : 'sem medições no filtro'}
          meta={meta}
          ariaLabel={`Aderência geral de avanço físico: ${formatarPercentual(aderencia, 1)}`}
        />

        <RodapeIndicador
          itens={[
            {
              label: 'Previsto médio',
              valor: formatarPercentual(resumo.previsto_medio, 1),
              classe: 'text-slate-700',
            },
            {
              label: 'Real médio',
              valor: formatarPercentual(resumo.real_medio, 1),
              classe: paletaAderencia.texto,
            },
            {
              label: 'Tendência média',
              valor: formatarPercentual(resumo.tendencia_media, 1),
              classe: 'text-emerald-700',
            },
          ]}
        />
      </article>

      <article className="card flex flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {obraUnica ? 'Desvio / Retrabalhos da Obra' : 'Indicador de Desvios / Retrabalhos'}
              </h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                {obraUnica
                  ? 'Real menos previsto, com tolerância de -2 p.p.'
                  : 'Obras medidas com desvio abaixo de -2 p.p. Quanto menor, melhor.'}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            Tolerância 2 p.p.
          </span>
        </div>

        <GaugeSemicircular
          className="mt-3"
          percentual={temMedicao ? percentualDesvio : 0}
          cor={temMedicao ? corDesvios : '#94a3b8'}
          textoPrincipal={
            temMedicao ? (obraUnica ? formatarPp(resumo.desvio_medio, 1) : formatarPercentual(percentualDesvio, 1)) : '—'
          }
          textoSecundario={
            !temMedicao
              ? obraUnica
                ? 'obra sem medições'
                : 'sem medições no filtro'
              : obraUnica
                ? foraDaTolerancia
                  ? 'fora da tolerância'
                  : 'dentro da tolerância'
                : `${obrasComDesvio} de ${comMedicao} obras medidas`
          }
          ariaLabel={`Indicador de desvios: ${formatarPercentual(percentualDesvio, 1)} das obras medidas`}
        />

        <RodapeIndicador
          itens={
            obraUnica
              ? [
                  {
                    label: 'Restrições abertas',
                    valor: resumo.restricoes_abertas ?? 0,
                    classe: 'text-amber-700',
                  },
                  {
                    label: 'Pend. documentais',
                    valor: resumo.pendencias_documentais ?? 0,
                    classe: 'text-slate-700',
                  },
                  {
                    label: 'Retrabalhos',
                    valor: resumo.retrabalhos ?? 0,
                    classe: classeDesvios,
                  },
                ]
              : [
                  {
                    label: 'Desvio crítico',
                    valor: criticos?.total ?? 0,
                    classe: 'text-red-700',
                  },
                  {
                    label: 'Em atenção',
                    valor: atencao?.total ?? 0,
                    classe: 'text-amber-700',
                  },
                  {
                    label: 'Retrabalhos',
                    valor: resumo.retrabalhos ?? 0,
                    classe: classeDesvios,
                  },
                ]
          }
        />
      </article>
    </section>
  );
}

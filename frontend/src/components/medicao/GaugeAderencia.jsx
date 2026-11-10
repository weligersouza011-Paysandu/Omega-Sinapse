import { Gauge } from 'lucide-react';
import { formatarMoeda, formatarPercentual } from '../../utils/formatters.js';
import { CG } from '../../utils/coresGrafico.js';

/** Escala do medidor: 0% a 150% (a marca de 100% é o "no previsto"). */
const ESCALA_MAXIMA = 150;
const CENTRO_X = 110;
const CENTRO_Y = 112;
const RAIO = 86;

const SITUACOES = {
  ACIMA_DO_PREVISTO: { cor: '#059669', texto: 'text-emerald-700', rotulo: 'Acima do previsto' },
  NO_RITMO: { cor: '#d97706', texto: 'text-amber-700', rotulo: 'Próximo do previsto' },
  ABAIXO_DO_PREVISTO: { cor: '#dc2626', texto: 'text-red-700', rotulo: 'Abaixo do previsto' },
  SEM_BASE: { cor: '#94a3b8', texto: 'text-slate-400', rotulo: 'Sem base de comparação' },
};

/** Ponto do arco para um percentual da escala (0% à esquerda, 150% à direita). */
function pontoNoArco(percentual, raio) {
  const angulo = Math.PI * (1 - Math.min(ESCALA_MAXIMA, Math.max(0, percentual)) / ESCALA_MAXIMA);
  return [CENTRO_X + raio * Math.cos(angulo), CENTRO_Y - raio * Math.sin(angulo)];
}

function Linha({ rotulo, valor, classe = 'text-slate-800' }) {
  return (
    <div className="min-w-0 px-1.5">
      <dt className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className={`mt-0.5 truncate text-sm font-black leading-tight tabular-nums ${classe}`}>{valor}</dd>
    </div>
  );
}

/**
 * Indicador de aderência financeira: medido aprovado ÷ previsto acumulado até
 * o último ciclo medido. O medidor vai de 0% a 150% e marca os 100%, então
 * valores acima do previsto (ex.: 130%) aparecem de forma proporcional.
 */
export default function GaugeAderencia({ aderencia }) {
  const situacao = SITUACOES[aderencia.situacao] || SITUACOES.SEM_BASE;
  const temValor = aderencia.percentual !== null && aderencia.percentual !== undefined;
  const preenchido = temValor ? Math.min(ESCALA_MAXIMA, Math.max(0, aderencia.percentual)) : 0;

  const [marcaX1, marcaY1] = pontoNoArco(100, RAIO - 10);
  const [marcaX2, marcaY2] = pontoNoArco(100, RAIO + 8);
  const [rotuloX, rotuloY] = pontoNoArco(100, RAIO + 18);

  return (
    <section className="card flex flex-col p-5" aria-label="Aderência financeira">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
          <Gauge className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Aderência financeira</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Medido acumulado ÷ previsto acumulado até o último ciclo medido
            {aderencia.referencia ? ` (${aderencia.referencia.split('-').reverse().join('/')})` : ''}.
          </p>
        </div>
      </div>

      <svg
        viewBox="0 0 220 150"
        className="mx-auto mt-2 block w-full max-w-[340px]"
        role="img"
        aria-label={
          temValor
            ? `Aderência financeira de ${formatarPercentual(aderencia.percentual, 1)}`
            : 'Aderência financeira indisponível'
        }
      >
        {/* Trilha */}
        <path
          d={`M ${CENTRO_X - RAIO} ${CENTRO_Y} A ${RAIO} ${RAIO} 0 0 1 ${CENTRO_X + RAIO} ${CENTRO_Y}`}
          fill="none"
          stroke={CG.grade}
          strokeWidth="16"
          strokeLinecap="round"
          pathLength="100"
        />
        {/* Valor */}
        {temValor && preenchido > 0 ? (
          <path
            d={`M ${CENTRO_X - RAIO} ${CENTRO_Y} A ${RAIO} ${RAIO} 0 0 1 ${CENTRO_X + RAIO} ${CENTRO_Y}`}
            fill="none"
            stroke={situacao.cor}
            strokeWidth="16"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${(preenchido / ESCALA_MAXIMA) * 100} 100`}
          />
        ) : null}
        {/* Marca dos 100% */}
        <line x1={marcaX1} y1={marcaY1} x2={marcaX2} y2={marcaY2} stroke={CG.rotulo} strokeWidth="2.5" />
        <text x={rotuloX} y={rotuloY} fontSize="8" fontWeight="700" fill={CG.rotulo} textAnchor="middle">
          100%
        </text>

        <text x={CENTRO_X} y={CENTRO_Y - 14} textAnchor="middle" fontSize="30" fontWeight="900" fill={CG.titulo}>
          {temValor ? formatarPercentual(aderencia.percentual, 0) : '—'}
        </text>
        <text x={CENTRO_X} y={CENTRO_Y + 4} textAnchor="middle" fontSize="9" fill={CG.eixo}>
          {situacao.rotulo}
        </text>
        <text x={CENTRO_X - RAIO} y={CENTRO_Y + 16} textAnchor="middle" fontSize="8" fill={CG.suave}>
          0%
        </text>
        <text x={CENTRO_X + RAIO} y={CENTRO_Y + 16} textAnchor="middle" fontSize="8" fill={CG.suave}>
          {ESCALA_MAXIMA}%
        </text>
      </svg>

      <dl className="mt-1 grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/70 py-2.5 text-center">
        <Linha rotulo="Previsto acum." valor={formatarMoeda(aderencia.previsto_acumulado)} />
        <Linha rotulo="Medido acum." valor={formatarMoeda(aderencia.real_acumulado)} classe={situacao.texto} />
        <Linha
          rotulo="Contra tendência"
          valor={aderencia.contra_tendencia === null ? '—' : formatarPercentual(aderencia.contra_tendencia, 0)}
          classe="text-slate-700"
        />
      </dl>

      {!temValor ? (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          A aderência precisa de boletins aprovados e de obras do contrato com avanço físico lançado (o previsto vem do
          cronograma de cada obra).
        </p>
      ) : null}
    </section>
  );
}

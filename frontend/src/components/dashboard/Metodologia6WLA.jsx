import { AlertTriangle, CalendarRange, ClipboardCheck, Crosshair, Workflow } from 'lucide-react';

const PILARES = [
  {
    Icone: CalendarRange,
    titulo: 'Lookahead de 6 semanas',
    texto: 'Antecipação das frentes de serviço para identificar impedimentos antes da execução.',
  },
  {
    Icone: ClipboardCheck,
    titulo: 'Restrições com Q1/RFT',
    texto: 'Cada impedimento recebe plano de ação, responsável e prazo (QUANDO) para remoção.',
  },
  {
    Icone: AlertTriangle,
    titulo: 'Desvios e retrabalhos',
    texto: 'Previsto, real e tendência revelam atrasos e a necessidade de retrabalho.',
  },
  {
    Icone: Crosshair,
    titulo: 'Previsibilidade em Carajás',
    texto: 'A leitura consolidada sustenta decisões e compromissos de curto prazo.',
  },
];

/** Cartão descritivo da metodologia 6WLA e do objetivo do painel. */
export default function Metodologia6WLA() {
  return (
    <article className="card relative h-full overflow-hidden p-5 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-omega-50"
      />

      <div className="relative flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-omega-600 text-white shadow-sm">
          <Workflow className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-omega-600">
            Metodologia de planejamento
          </p>
          <h2 className="mt-0.5 text-base font-bold leading-snug text-slate-800 sm:text-lg">
            6WLA: antecipação para remover restrições
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm">
            O <strong className="font-semibold text-slate-700">6 Week Lookahead</strong> projeta
            seis semanas de execução e antecipa as restrições que podem travar as frentes de
            serviço. O dashboard cruza o avanço físico previsto, real e a tendência das obras de
            Carajás, evidenciando desvios e retrabalhos e concentrando os planos de ação Q1/RFT com
            responsável e prazo. O resultado é mais previsibilidade para a carteira e decisões
            tomadas antes do impacto em campo.
          </p>
        </div>
      </div>

      <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
        {PILARES.map(({ Icone, titulo, texto }) => (
          <div
            key={titulo}
            className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
          >
            <Icone className="mt-0.5 h-4 w-4 shrink-0 text-omega-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-700">{titulo}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{texto}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

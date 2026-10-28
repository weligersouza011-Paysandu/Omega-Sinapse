import { Activity, Building2, CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { formatarData, formatarDataHora } from '../../utils/formatters.js';

/** Cabeçalho executivo do dashboard: título, escopo e status da atualização. */
export default function DashboardHero({
  geradoEm,
  ultimaMedicao,
  totalObras = 0,
  comMedicao = 0,
  carregando = false,
}) {
  return (
    <header className="relative overflow-hidden rounded-xl bg-gradient-to-br from-omega-900 via-omega-800 to-slate-900 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border border-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 right-24 h-64 w-64 rounded-full border border-white/5"
      />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200/80">
            <span>Omega Sinapse</span>
            <span aria-hidden="true">·</span>
            <span>Contrato CT251</span>
          </div>

          <h2 className="mt-2 text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl xl:text-[2.15rem]">
            Dashboard de Planejamento Omega Sinapse CT251
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
            Visão executiva da carteira de obras de Carajás: aderência do avanço físico,
            desvios e retrabalhos, Curva S consolidada e restrições 6WLA em um único painel.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
              <MapPin className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
              Carajás · Pará
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
              <Building2 className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
              {totalObras} obra(s) na carteira
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
              <Activity className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
              {comMedicao} com medição
            </span>
          </div>
        </div>

        <div className="w-full shrink-0 rounded-lg border border-white/10 bg-white/5 px-4 py-3 backdrop-blur lg:w-auto lg:min-w-[235px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/70">
            Última atualização
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {geradoEm ? formatarDataHora(geradoEm) : 'Carregando dados...'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Última medição: {formatarData(ultimaMedicao)}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            {carregando ? (
              <>
                <Spinner tamanho="sm" className="h-3 w-3 border" />
                Atualizando...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 text-emerald-300" aria-hidden="true" />
                Dados sincronizados
              </>
            )}
          </p>
        </div>
      </div>
    </header>
  );
}

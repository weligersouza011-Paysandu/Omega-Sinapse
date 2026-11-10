import { ArrowDownRight, ArrowUpRight, Minus, PiggyBank, ReceiptText, Wallet } from 'lucide-react';
import { formatarMoeda, formatarPercentual } from '../../utils/formatters.js';

/** Selo ▲/▼ com a variação percentual contra o ciclo anterior. */
function SeloVariacao({ variacao }) {
  if (variacao === null || variacao === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
        <Minus className="h-3 w-3" aria-hidden="true" />
        sem base
      </span>
    );
  }
  const subiu = variacao >= 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        subiu ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
      title="Variação do último ciclo medido contra o ciclo anterior"
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {subiu ? '+' : ''}
      {formatarPercentual(variacao, 1)}
    </span>
  );
}

function Cartao({ rotulo, icone: Icone, tom, children }) {
  return (
    <div className="card flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${tom}`}>
          <Icone className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * Cartões superiores do Dashboard de Medição: teto do contrato (com TACs),
 * total medido acumulado, saldo contratual e o último ciclo contra o anterior.
 */
export default function KpisMedicao({ kpis }) {
  const ultimo = kpis.ultimo_ciclo;
  const anterior = kpis.mes_anterior;
  const saldoNegativo = kpis.saldo_contratual < 0;

  return (
    <section aria-label="Indicadores da medição" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao rotulo="Valor do contrato" icone={Wallet} tom="bg-omega-50 text-omega-700 ring-omega-100">
        <p className="mt-2 text-xl font-black leading-tight tracking-tight text-slate-800 tabular-nums">
          {formatarMoeda(kpis.valor_contrato)}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          Inicial {formatarMoeda(kpis.valor_inicial)}
          {kpis.quantidade_aditivos > 0
            ? ` + ${kpis.quantidade_aditivos} TAC (${formatarMoeda(kpis.total_aditivos)})`
            : ''}
        </p>
      </Cartao>

      <Cartao rotulo="Total acumulado medido" icone={ReceiptText} tom="bg-emerald-50 text-emerald-700 ring-emerald-100">
        <p className="mt-2 text-xl font-black leading-tight tracking-tight text-emerald-700 tabular-nums">
          {formatarMoeda(kpis.total_acumulado)}
        </p>
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(100, Math.max(0, kpis.percentual_medido))}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {formatarPercentual(kpis.percentual_medido, 1)} do contrato
            {kpis.valor_em_analise > 0 ? ` · ${formatarMoeda(kpis.valor_em_analise)} em análise` : ''}
          </p>
        </div>
      </Cartao>

      <Cartao rotulo="Saldo contratual" icone={PiggyBank} tom="bg-amber-50 text-amber-700 ring-amber-100">
        <p
          className={`mt-2 text-xl font-black leading-tight tracking-tight tabular-nums ${
            saldoNegativo ? 'text-red-700' : 'text-slate-800'
          }`}
        >
          {formatarMoeda(kpis.saldo_contratual)}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {saldoNegativo ? 'Medição acima do teto do contrato' : 'Teto vigente menos o total acumulado'}
        </p>
      </Cartao>

      <Cartao
        rotulo={ultimo ? `Ciclo ${ultimo.rotulo}` : 'Último ciclo medido'}
        icone={ReceiptText}
        tom="bg-cyan-50 text-cyan-700 ring-cyan-100"
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xl font-black leading-tight tracking-tight text-slate-800 tabular-nums">
            {ultimo ? formatarMoeda(ultimo.valor) : '—'}
          </p>
          <SeloVariacao variacao={kpis.variacao_percentual} />
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {anterior
            ? `${anterior.rotulo}${anterior.bmm ? ` (${anterior.bmm})` : ''}: ${formatarMoeda(anterior.valor)}`
            : ultimo
              ? 'Sem ciclo anterior medido'
              : 'Nenhum boletim aprovado ainda'}
        </p>
      </Cartao>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { Building2, ExternalLink, UserRound } from 'lucide-react';
import { formatarPercentual } from '../../utils/formatters.js';
import { CategoriaBadge, StatusObraBadge } from './DashboardBadges.jsx';
import { corAderencia, corDesvio, formatarPp, iniciaisDe, resumirFiscais } from './dashboardUtils.js';

function CelulaPercentual({ valor, classe = 'text-slate-700' }) {
  const numero = Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(numero)) {
    return <span className="text-slate-300">—</span>;
  }
  return <span className={`tabular-nums ${classe}`}>{formatarPercentual(numero, 1)}</span>;
}

/** Grid/tabela executiva das obras do recorte, com aderência e desvio. */
export default function TabelaObrasDashboard({ obras = [] }) {
  const comMedicao = obras.filter((obra) => obra.tem_medicao).length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Obras e Aderência de Avanço</h3>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-slate-500">
              OSI, SS, planejador, avanço físico, fiscal, status e carteira de cada obra do recorte.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
            {obras.length} obra(s)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
            {comMedicao} com medição
          </span>
        </div>
      </header>

      {obras.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <Building2 className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhuma obra neste recorte</p>
          <p className="max-w-md text-xs text-slate-500">
            Ajuste os filtros globais para voltar a visualizar a carteira.
          </p>
        </div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-xs">
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="px-3 py-2.5">OSI</th>
                <th className="px-3 py-2.5">Obra (SS)</th>
                <th className="px-3 py-2.5">Planejador</th>
                <th className="px-3 py-2.5 text-right">Físico Previsto</th>
                <th className="px-3 py-2.5 text-right">Físico Real</th>
                <th className="px-3 py-2.5">Aderência</th>
                <th className="px-3 py-2.5 text-right">Desvio</th>
                <th className="px-3 py-2.5">Fiscal</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Categoria</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {obras.map((obra) => {
                const aderencia = Number(obra.aderencia);
                const temAderencia =
                  obra.aderencia !== null &&
                  obra.aderencia !== undefined &&
                  Number.isFinite(aderencia);
                const paletaAderencia = corAderencia(temAderencia ? aderencia : null);
                const paletaDesvio = corDesvio(obra.desvio);
                const fiscais = resumirFiscais(obra.fiscais);
                const referencia = obra.osi || obra.ss || `Obra #${obra.id}`;

                return (
                  <tr key={obra.id} className="align-top transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-3 font-bold">
                      {obra.osi ? (
                        <Link
                          to={`/obras/${obra.id}`}
                          className="inline-flex items-center gap-1 text-omega-700 hover:underline"
                          title={`Abrir ${referencia}`}
                        >
                          {obra.osi}
                          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <Link
                        to={`/obras/${obra.id}`}
                        className="font-bold text-slate-800 hover:text-omega-700 hover:underline"
                      >
                        {obra.ss || referencia}
                      </Link>
                      <p
                        className="mt-0.5 max-w-[290px] truncate text-[11px] text-slate-500"
                        title={obra.descricao || ''}
                      >
                        {obra.descricao || 'Sem descrição informada.'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {obra.semanas_medidas || 0} medição(ões)
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">
                          {iniciaisDe(obra.planejador)}
                        </span>
                        <span
                          className="max-w-[125px] truncate font-medium text-slate-600"
                          title={obra.planejador || 'Planejador não atribuído'}
                        >
                          {obra.planejador || '—'}
                        </span>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right text-[11px]">
                      <CelulaPercentual valor={obra.previsto} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-[11px]">
                      <CelulaPercentual valor={obra.real} classe="text-omega-700" />
                    </td>

                    <td className="px-3 py-3">
                      {temAderencia ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${paletaAderencia.barra}`}
                              style={{ width: `${Math.min(100, Math.max(0, aderencia))}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-bold ${paletaAderencia.texto}`}>
                            {formatarPercentual(aderencia, 1)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      {obra.desvio === null || obra.desvio === undefined ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-bold ring-1 ${paletaDesvio.fundo}`}
                        >
                          {formatarPp(obra.desvio, 2)}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <UserRound className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="max-w-[130px] truncate" title={obra.fiscais?.join(', ')}>
                          {fiscais.principal}
                        </span>
                        {fiscais.extras > 0 ? (
                          <span
                            className="shrink-0 rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-500"
                            title={`+${fiscais.extras} fiscal(is)`}
                          >
                            +{fiscais.extras}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <StatusObraBadge status={obra.status} label={obra.status_label} />
                    </td>

                    <td className="px-3 py-3">
                      <CategoriaBadge
                        categoria={obra.categoria}
                        label={obra.categoria_label}
                        className="!normal-case !tracking-normal !text-[9px] !px-1.5"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] text-slate-500">
        <span>Aderência = real ÷ previsto (limitada a 100%) · Desvio = real − previsto.</span>
        <span>Clique na OSI ou no SS para abrir o detalhamento da obra.</span>
      </footer>
    </section>
  );
}

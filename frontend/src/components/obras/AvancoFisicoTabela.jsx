import { Pencil, Trash2 } from 'lucide-react';
import { formatarData, formatarPercentual, formatarSemana } from '../../utils/formatters.js';

const COLUNAS = [
  { chave: 'fisico_prev', rotulo: 'Físico_Prev' },
  { chave: 'fisico_lb_prev', rotulo: 'Físico_LB_PREV' },
  { chave: 'fisico_real', rotulo: 'Físico_Real' },
  { chave: 'fisico_tend_acum', rotulo: 'Físico_Tend_Acum' },
  { chave: 'fisico_prev_acum', rotulo: 'Físico_Prev_Acum' },
  { chave: 'fisico_real_acum', rotulo: 'Físico_Real_Acum' },
];

/**
 * Tabela histórica do avanço físico. Reutilizada no painel analítico (leitura)
 * e na configuração da obra (com ações de edição/remoção).
 */
export default function AvancoFisicoTabela({
  linhas = [],
  podeEditar = false,
  onEditar,
  onRemover,
  compacta = false,
}) {
  const ordenadas = [...linhas].sort((a, b) => {
    const diferenca = new Date(a.data) - new Date(b.data);
    return diferenca !== 0 ? diferenca : Number(a.id || 0) - Number(b.id || 0);
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Data
            </th>
            <th className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Semana
            </th>
            {COLUNAS.map((coluna) => (
              <th
                key={coluna.chave}
                className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500"
              >
                {coluna.rotulo}
              </th>
            ))}
            {podeEditar ? (
              <th className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Ações
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white">
          {ordenadas.map((linha) => (
            <tr key={linha.id ?? `${linha.data}-${linha.semana}`} className="align-middle hover:bg-slate-50">
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatarData(linha.data)}</td>
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">
                {formatarSemana(linha.semana, linha.data)}
              </td>
              {COLUNAS.map((coluna) => (
                <td
                  key={coluna.chave}
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                    coluna.chave.endsWith('_acum') ? 'font-semibold text-slate-800' : 'text-slate-600'
                  }`}
                >
                  {formatarPercentual(linha[coluna.chave], compacta ? 1 : 2)}
                </td>
              ))}
              {podeEditar ? (
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditar?.(linha)}
                      title="Editar medição"
                      aria-label={`Editar medição de ${formatarSemana(linha.semana, linha.data)}`}
                      className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-omega-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemover?.(linha)}
                      title="Remover medição"
                      aria-label={`Remover medição de ${formatarSemana(linha.semana, linha.data)}`}
                      className="rounded p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}

          {ordenadas.length === 0 ? (
            <tr>
              <td
                colSpan={podeEditar ? COLUNAS.length + 3 : COLUNAS.length + 2}
                className="px-3 py-6 text-center text-sm text-slate-500"
              >
                Nenhuma medição de avanço físico registrada.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

import { Eye, Pencil } from 'lucide-react';
import StatusBadge from './StatusBadge.jsx';
import { formatarData, formatarMoeda } from '../utils/formatters.js';

/** Célula vazia padronizada. */
function Vazio() {
  return <span className="text-slate-300">—</span>;
}

/**
 * Visão em Lista/Tabela de orçamentos e obras.
 *
 * Alternativa compacta às visões Cards e Kanban, pensada para consulta rápida:
 * exibe PEP/CC, SS, descrição, cliente, valor, status, data e as ações de
 * detalhe/edição em uma única linha. A tabela respeita os mesmos filtros das
 * demais visões (recebe a lista já filtrada) e rola horizontalmente em telas
 * estreitas, sem quebrar o layout.
 *
 * @param {object[]} props.itens registros já filtrados e paginados
 * @param {boolean} props.carregando exibe as linhas de carregamento
 * @param {string} props.rotuloItem rótulo do registro (singular) para o vazio
 * @param {(id:number) => void} props.onAbrirDetalhe abre o detalhe do registro
 * @param {(item:object) => void} [props.onEditar] habilita a ação de edição
 */
export default function ListaTabela({
  itens = [],
  carregando = false,
  rotuloItem = 'orçamento',
  onAbrirDetalhe,
  onEditar,
}) {
  const totalColunas = 8;

  function abrir(item) {
    onAbrirDetalhe?.(item.id);
  }

  return (
    <div className="card overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3">PEP / CC</th>
              <th scope="col" className="px-4 py-3">SS</th>
              <th scope="col" className="px-4 py-3">Descrição</th>
              <th scope="col" className="px-4 py-3">Cliente / Local</th>
              <th scope="col" className="px-4 py-3 text-right">Valor atual (R$)</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Data</th>
              <th scope="col" className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {carregando ? (
              Array.from({ length: 6 }).map((_, indice) => (
                <tr key={indice}>
                  {Array.from({ length: totalColunas }).map((__, coluna) => (
                    <td key={coluna} className="px-4 py-3.5">
                      <div className="h-3.5 animate-pulse rounded bg-slate-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : itens.length === 0 ? (
              <tr>
                <td colSpan={totalColunas} className="px-4 py-16 text-center">
                  <p className="text-base font-semibold text-slate-700">
                    Nenhum {rotuloItem} encontrado
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Ajuste os filtros de busca ou status para ver outros registros.
                  </p>
                </td>
              </tr>
            ) : (
              itens.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => abrir(item)}
                  className="cursor-pointer transition hover:bg-omega-50/60"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">
                    {item.pep || <Vazio />}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-600">
                    {item.ss || <Vazio />}
                  </td>

                  <td className="max-w-[22rem] px-4 py-3">
                    <p className="truncate text-slate-700" title={item.descricao || ''}>
                      {item.descricao || <Vazio />}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {item.cliente || <Vazio />}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-omega-700">
                    {formatarMoeda(item.valor)}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatarData(item.created_at)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(evento) => {
                          evento.stopPropagation();
                          abrir(item);
                        }}
                        title="Ver detalhes"
                        aria-label={`Ver detalhes de ${item.pep || rotuloItem}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-omega-500/50 hover:text-omega-700 focus:outline-none focus:ring-2 focus:ring-omega-500/40"
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </button>

                      {onEditar ? (
                        <button
                          type="button"
                          onClick={(evento) => {
                            evento.stopPropagation();
                            onEditar(item);
                          }}
                          title="Editar"
                          aria-label={`Editar ${item.pep || rotuloItem}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-omega-500/50 hover:text-omega-700 focus:outline-none focus:ring-2 focus:ring-omega-500/40"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

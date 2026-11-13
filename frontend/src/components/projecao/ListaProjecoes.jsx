import { Eye, MailQuestion, Pencil, Trash2 } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { rotuloReferencia } from '../../hooks/useProjecaoBmm.js';
import { formatarDataHora, formatarMoeda } from '../../utils/formatters.js';

/** Projeções de BMM do contrato, com filtros por obra, mês e contrato/TAC. */
export default function ListaProjecoes({ lista, carregando, erro, filtros, onFiltrar, obras, escopos, podeEditar, podeExcluir, podeSolicitar, ocupadoId, onAbrir, onExcluir, onSolicitar }) {
  const referencias = [...new Set(lista.map((p) => p.referencia))];
  const totalGeral = lista.reduce((soma, p) => soma + Math.round(p.total * 100), 0) / 100;

  return (
    <div className="card space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="rotulo" htmlFor="filtro-obra">Obra</label>
          <select id="filtro-obra" className="campo" value={filtros.obra} onChange={(e) => onFiltrar({ ...filtros, obra: e.target.value })}>
            <option value="">Todas</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{[o.ss, o.descricao].filter(Boolean).join(' — ') || `Obra ${o.id}`}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="filtro-ref">Mês de referência</label>
          <input id="filtro-ref" type="month" className="campo" value={filtros.referencia} onChange={(e) => onFiltrar({ ...filtros, referencia: e.target.value })} />
        </div>
        <div>
          <label className="rotulo" htmlFor="filtro-tac">Contrato / TAC</label>
          <select id="filtro-tac" className="campo" value={filtros.tac} onChange={(e) => onFiltrar({ ...filtros, tac: e.target.value })}>
            <option value="todos">Todos</option>
            {(escopos || []).map((e) => (
              <option key={e.tac_id} value={e.tac_id}>{e.rotulo}</option>
            ))}
          </select>
        </div>
      </div>

      {erro ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div> : null}

      {carregando && !lista.length ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spinner tamanho="md" className="text-omega-600" />
          Carregando projeções…
        </div>
      ) : !lista.length ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Nenhuma projeção de BMM {filtros.obra || filtros.referencia || filtros.tac !== 'todos' ? 'com estes filtros' : 'cadastrada neste contrato'}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['BMM', 'Mês', 'Período', 'Obra (SS)', 'QQP', 'Itens', 'Total', 'Atualizado', ''].map((t) => (
                  <th key={t} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">
                    {p.numero_bmm}
                    {p.exclusao_pendente ? (
                      <span
                        className="ml-1.5 rounded bg-amber-50 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200"
                        title={`Exclusão solicitada por ${p.exclusao_pendente.solicitante_nome}: ${p.exclusao_pendente.motivo}`}
                      >
                        exclusão pedida
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{rotuloReferencia(p.referencia)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                    {p.ciclo_inicio.split('-').reverse().join('/')} a {p.ciclo_fim.split('-').reverse().join('/')} · {p.dias_uteis} d.u.
                  </td>
                  <td className="px-3 py-2">{p.obra?.ss || `Obra ${p.obra_id}`}<span className="block max-w-[18rem] truncate text-xs text-slate-500">{p.obra?.descricao}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{p.termo_aditivo?.numero_tac || 'TAC0'}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{p.quantidade_itens ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums">{formatarMoeda(p.total)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatarDataHora(p.updated_at)}{p.usuario?.nome ? ` · ${p.usuario.nome}` : ''}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <div className="inline-flex gap-1.5">
                      <button type="button" className="btn-neutro !px-2 !py-1" onClick={() => onAbrir(p)} aria-label={`${podeEditar ? 'Editar' : 'Ver'} BMM ${p.numero_bmm}`} title={podeEditar ? 'Editar' : 'Ver'}>
                        {podeEditar ? <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                      {podeExcluir ? (
                        <button
                          type="button"
                          className="btn-neutro !px-2 !py-1 hover:!border-red-300 hover:!text-red-600"
                          onClick={() => onExcluir(p)}
                          disabled={ocupadoId === p.id}
                          aria-label={`Excluir BMM ${p.numero_bmm}`}
                          title="Excluir"
                        >
                          {ocupadoId === p.id ? <Spinner tamanho="sm" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                      ) : null}
                      {podeSolicitar && !p.exclusao_pendente ? (
                        <button
                          type="button"
                          className="btn-neutro !px-2 !py-1 hover:!border-amber-300 hover:!text-amber-700"
                          onClick={() => onSolicitar(p)}
                          aria-label={`Solicitar exclusão do BMM ${p.numero_bmm}`}
                          title="Solicitar exclusão ao administrador"
                        >
                          <MailQuestion className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-bold">
              <tr>
                <td colSpan={6} className="px-3 py-2">
                  {lista.length} projeção(ões){referencias.length > 1 ? ` em ${referencias.length} meses` : ''}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatarMoeda(totalGeral)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

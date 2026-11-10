import { useEffect, useState } from 'react';
import { Pencil, ReceiptText, Trash2 } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarBoletim } from '../../hooks/useMedicao.js';
import { formatarData, formatarMoeda, formatarPercentual } from '../../utils/formatters.js';

const STATUS = {
  APROVADO: { rotulo: 'Aprovado', classe: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  EM_ANALISE: { rotulo: 'Em análise', classe: 'border-amber-300 bg-amber-50 text-amber-800' },
  REJEITADO: { rotulo: 'Rejeitado', classe: 'border-red-300 bg-red-50 text-red-700' },
};

const Th = ({ children }) => (
  <th scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
    {children}
  </th>
);

/** Correção de um boletim já lançado: número, mês do ciclo, situação, observação e (sem SS) o valor. */
function ModalCorrigirBoletim({ aberto, contratoId, boletim, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState({ numero_bmm: '', mes_referencia: '', status: 'APROVADO', observacao: '', valor_medido: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto && boletim) {
      setForm({
        numero_bmm: boletim.numero_bmm,
        mes_referencia: boletim.referencia,
        status: boletim.status,
        observacao: boletim.observacao || '',
        valor_medido: String(boletim.valor_medido),
      });
      setErro('');
      setSalvando(false);
    }
  }, [aberto, boletim]);

  if (!boletim) return null;
  const alterar = (campo, valor) => setForm((anterior) => ({ ...anterior, [campo]: valor }));
  const temSs = boletim.itens.length > 0;

  async function salvar(evento) {
    evento.preventDefault();
    setErro('');
    if (!form.numero_bmm.trim()) return setErro('Informe o número do boletim.');
    if (!/^\d{4}-\d{2}$/.test(form.mes_referencia)) return setErro('Informe o mês do ciclo.');

    const dados = {
      numero_bmm: form.numero_bmm.trim(),
      mes_referencia: form.mes_referencia,
      status: form.status,
      observacao: form.observacao.trim(),
    };
    if (!temSs) {
      if (form.valor_medido === '' || Number(form.valor_medido) < 0) return setErro('Informe o valor medido.');
      dados.valor_medido = Number(form.valor_medido);
    }

    setSalvando(true);
    try {
      const salvo = await atualizarBoletim(contratoId, boletim.id, dados);
      toast.sucesso(`${salvo.numero_bmm} atualizado.`);
      onSalvo(salvo);
      onFechar();
      return undefined;
    } catch (err) {
      // "Nada a alterar" não é falha para quem só abriu e salvou.
      const mensagem = err.message || 'Não foi possível corrigir o boletim.';
      setErro(mensagem);
      return undefined;
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase
      aberto={aberto}
      titulo="Corrigir boletim"
      subtitulo={`${boletim.numero_bmm} · ciclo ${formatarData(boletim.ciclo_inicio)} a ${formatarData(boletim.ciclo_fim)}`}
      onFechar={() => (salvando ? null : onFechar())}
      tamanho="lg"
    >
      <form onSubmit={salvar} noValidate>
        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-3">
          <div>
            <label className="rotulo" htmlFor="cb-num">Número do boletim *</label>
            <input id="cb-num" className="campo" value={form.numero_bmm} onChange={(e) => alterar('numero_bmm', e.target.value)} disabled={salvando} autoFocus />
          </div>
          <div>
            <label className="rotulo" htmlFor="cb-mes">Mês do ciclo *</label>
            <input id="cb-mes" type="month" className="campo" value={form.mes_referencia} onChange={(e) => alterar('mes_referencia', e.target.value)} disabled={salvando} />
          </div>
          <div>
            <label className="rotulo" htmlFor="cb-status">Situação</label>
            <select id="cb-status" className="campo" value={form.status} onChange={(e) => alterar('status', e.target.value)} disabled={salvando}>
              {Object.entries(STATUS).map(([valor, { rotulo }]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="cb-obs">Observação</label>
            <input id="cb-obs" className="campo" value={form.observacao} onChange={(e) => alterar('observacao', e.target.value)} disabled={salvando} />
          </div>
          <div>
            <label className="rotulo" htmlFor="cb-valor">Valor medido (R$)</label>
            <input
              id="cb-valor"
              type="number"
              min="0"
              step="0.01"
              className="campo"
              value={form.valor_medido}
              onChange={(e) => alterar('valor_medido', e.target.value)}
              disabled={salvando || temSs}
            />
            {temSs ? (
              <p className="mt-1 text-[11px] text-slate-500">Detalhado por {boletim.itens.length} SS: o total é a soma delas.</p>
            ) : null}
          </div>
          {erro ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-3">{erro}</div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" className="btn-primario" disabled={salvando}>
            {salvando ? <Spinner tamanho="sm" /> : null}
            Salvar correção
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

/**
 * Histórico de medições do contrato: todos os boletins (BMM) em uma tabela, com
 * corrigir (número, ciclo, valor, situação) e excluir.
 */
export default function HistoricoBoletins({ contratoId, boletins = [], podeGerir, onAtualizado, onExcluir }) {
  const [emEdicao, setEmEdicao] = useState(null);
  const ordenados = [...boletins].sort((a, b) => (a.ciclo_fim < b.ciclo_fim ? 1 : -1));

  return (
    <section className="card overflow-hidden" aria-label="Histórico de medições">
      <header className="px-5 py-4">
        <h3 className="text-sm font-bold text-slate-800">Histórico de medições (boletins)</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Todos os boletins do contrato, do ciclo mais recente ao mais antigo. Corrija o número, o ciclo, a situação ou o
          valor, ou exclua o que foi lançado por engano.
        </p>
      </header>

      {ordenados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <ReceiptText className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhum boletim neste contrato</p>
        </div>
      ) : (
        <div className="max-h-[640px] overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <Th>Boletim</Th>
                <Th>Ciclo</Th>
                <Th>Situação</Th>
                <Th>Valor medido</Th>
                <Th>% do contrato</Th>
                <Th>SS</Th>
                <Th>Observação</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {ordenados.map((boletim) => {
                const estilo = STATUS[boletim.status] || STATUS.EM_ANALISE;
                return (
                  <tr key={boletim.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-bold text-omega-700">{boletim.numero_bmm}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {formatarData(boletim.ciclo_inicio)} a {formatarData(boletim.ciclo_fim)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${estilo.classe}`}>{estilo.rotulo}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-slate-800">{formatarMoeda(boletim.valor_medido)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{formatarPercentual(boletim.percentual_do_contrato, 2)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{boletim.itens.length}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-xs text-slate-500" title={boletim.observacao || ''}>{boletim.observacao || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {podeGerir ? (
                        <div className="inline-flex gap-1.5">
                          <button type="button" className="btn-neutro !px-2 !py-1 !text-[11px]" onClick={() => setEmEdicao(boletim)} aria-label={`Corrigir ${boletim.numero_bmm}`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Corrigir
                          </button>
                          <button type="button" className="btn-neutro !px-2 !py-1 !text-[11px] hover:!border-red-300 hover:!text-red-600" onClick={() => onExcluir(boletim)} aria-label={`Excluir ${boletim.numero_bmm}`}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Excluir
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ModalCorrigirBoletim
        aberto={Boolean(emEdicao)}
        contratoId={contratoId}
        boletim={emEdicao}
        onFechar={() => setEmEdicao(null)}
        onSalvo={onAtualizado}
      />
    </section>
  );
}

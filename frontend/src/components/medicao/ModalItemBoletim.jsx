import { useEffect, useState } from 'react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarItemBoletim, incluirItemBoletim } from '../../hooks/useMedicao.js';
import { formatarMoeda } from '../../utils/formatters.js';

/**
 * Inclui uma SS no boletim ou corrige o valor de uma SS já lançada. O total do
 * boletim acompanha a diferença.
 */
export default function ModalItemBoletim({ aberto, contratoId, boletim, item = null, obrasDoContrato = [], onFechar, onSalvo }) {
  const toast = useToast();
  const [modo, setModo] = useState('obra');
  const [obraId, setObraId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setSalvando(false);
    setObraId('');
    setCodigo(item && !item.obra_id ? item.ss || '' : '');
    setDescricao(item && !item.obra_id ? item.descricao || '' : '');
    setValor(item ? String(item.valor) : '');
    setModo(obrasDoContrato.length > 0 ? 'obra' : 'codigo');
  }, [aberto, item, obrasDoContrato.length]);

  if (!boletim) return null;

  const editando = Boolean(item);
  const jaNoBoletim = new Set(boletim.itens.filter((i) => i.obra_id).map((i) => i.obra_id));
  const disponiveis = obrasDoContrato.filter((obra) => !jaNoBoletim.has(obra.id));
  const novoTotal = boletim.valor_medido + (Number(valor) > 0 ? Number(valor) : 0) - (editando ? item.valor : 0);

  async function salvar(evento) {
    evento.preventDefault();
    setErro('');
    if (valor === '' || Number(valor) < 0) return setErro('Informe o valor medido da SS (zero ou mais).');

    let dados;
    if (editando) {
      dados = { valor: Number(valor) };
      if (!item.obra_id) {
        if (!codigo.trim()) return setErro('Informe o código da SS.');
        dados.ss_codigo = codigo.trim();
        dados.descricao = descricao.trim();
      }
    } else if (modo === 'obra') {
      if (!obraId) return setErro('Escolha a SS.');
      dados = { obra_id: Number(obraId), valor: Number(valor) };
    } else {
      if (!codigo.trim()) return setErro('Informe o código da SS (ex.: SS113/24).');
      dados = { ss_codigo: codigo.trim(), descricao: descricao.trim() || undefined, valor: Number(valor) };
    }

    setSalvando(true);
    try {
      const atualizado = editando
        ? await atualizarItemBoletim(contratoId, boletim.id, item.id, dados)
        : await incluirItemBoletim(contratoId, boletim.id, dados);
      toast.sucesso(`${boletim.numero_bmm} atualizado: ${formatarMoeda(atualizado.valor_medido)}.`);
      onSalvo(atualizado);
      onFechar();
      return undefined;
    } catch (err) {
      const mensagem = err.message || 'Não foi possível salvar a SS.';
      setErro(mensagem);
      toast.erro(mensagem);
      return undefined;
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase
      aberto={aberto}
      titulo={editando ? 'Corrigir valor da SS' : 'Adicionar SS ao boletim'}
      subtitulo={`${boletim.numero_bmm} · total atual ${formatarMoeda(boletim.valor_medido)}`}
      onFechar={() => (salvando ? null : onFechar())}
      tamanho="lg"
    >
      <form onSubmit={salvar} noValidate>
        <div className="space-y-4 px-5 py-5">
          {editando ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <strong>{item.ss || `Obra #${item.obra_id}`}</strong>
              <span className="block text-xs text-slate-500">{item.descricao || 'Sem descrição'}</span>
            </p>
          ) : (
            <div role="radiogroup" aria-label="Como identificar a SS" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-bold">
              <button type="button" role="radio" aria-checked={modo === 'obra'} disabled={obrasDoContrato.length === 0} onClick={() => setModo('obra')} className={`rounded-md px-3 py-1 transition disabled:opacity-50 ${modo === 'obra' ? 'bg-white text-omega-700 shadow-sm' : 'text-slate-500'}`}>
                Obra do contrato
              </button>
              <button type="button" role="radio" aria-checked={modo === 'codigo'} onClick={() => setModo('codigo')} className={`rounded-md px-3 py-1 transition ${modo === 'codigo' ? 'bg-white text-omega-700 shadow-sm' : 'text-slate-500'}`}>
                Só o código da SS
              </button>
            </div>
          )}

          {!editando && modo === 'obra' ? (
            <div>
              <label className="rotulo" htmlFor="ib-obra">SS (obra vinculada ao contrato) *</label>
              <select id="ib-obra" className="campo" value={obraId} onChange={(e) => setObraId(e.target.value)} disabled={salvando}>
                <option value="">Selecione a SS...</option>
                {disponiveis.map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {(obra.ss || obra.osi || `Obra #${obra.id}`) + (obra.descricao ? ` — ${obra.descricao}` : '')}
                  </option>
                ))}
              </select>
              {disponiveis.length === 0 ? <p className="mt-1 text-[11px] text-amber-700">Todas as obras do contrato já estão neste boletim.</p> : null}
            </div>
          ) : null}

          {(!editando && modo === 'codigo') || (editando && !item.obra_id) ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
              <div>
                <label className="rotulo" htmlFor="ib-cod">Código da SS *</label>
                <input id="ib-cod" className="campo" placeholder="SS113/24" value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={salvando} />
              </div>
              <div>
                <label className="rotulo" htmlFor="ib-desc">Descrição</label>
                <input id="ib-desc" className="campo" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={salvando} />
              </div>
            </div>
          ) : null}

          <div className="max-w-xs">
            <label className="rotulo" htmlFor="ib-valor">Valor medido da SS (R$) *</label>
            <input id="ib-valor" type="number" min="0" step="0.01" className="campo" value={valor} onChange={(e) => setValor(e.target.value)} disabled={salvando} autoFocus />
          </div>

          <p className="text-xs text-slate-600">
            O total do boletim passa para <strong className="tabular-nums text-slate-800">{formatarMoeda(novoTotal)}</strong>.
          </p>

          {erro ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" className="btn-primario" disabled={salvando}>
            {salvando ? <Spinner tamanho="sm" /> : null}
            {editando ? 'Salvar valor' : 'Adicionar SS'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

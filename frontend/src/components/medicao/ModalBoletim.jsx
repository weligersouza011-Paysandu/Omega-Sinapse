import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { criarBoletim } from '../../hooks/useMedicao.js';
import { formatarMoeda } from '../../utils/formatters.js';
import SeletorSs, { useSsDisponiveis } from './SeletorSs.jsx';

const STATUS_INICIAL = [
  { value: 'EM_ANALISE', label: 'Em análise' },
  { value: 'APROVADO', label: 'Aprovado' },
];

const linhaVazia = () => ({ obra_id: '', valor: '' });

/** Mês de referência ("AAAA-MM") do ciclo em que a data cai: do dia 16 em diante vale o mês seguinte. */
function referenciaDe(data) {
  const ano = data.getFullYear();
  const mes = data.getMonth() + (data.getDate() >= 16 ? 1 : 0);
  return `${ano + Math.floor(mes / 12)}-${String((mes % 12) + 1).padStart(2, '0')}`;
}

function somarMes(referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

/** Ciclo padrão (16 do mês anterior a 15 do mês) para exibição. */
function cicloDoMes(referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  const dd = (n) => String(n).padStart(2, '0');
  const inicioMes = mes === 1 ? 12 : mes - 1;
  const inicioAno = mes === 1 ? ano - 1 : ano;
  return `16/${dd(inicioMes)}/${inicioAno} a 15/${dd(mes)}/${ano}`;
}

/** "BMM19" -> "BMM20" (mantém prefixo e zeros à esquerda). */
function proximoNumero(boletins = []) {
  const maisRecente = boletins[0]; // a API devolve do ciclo mais recente ao mais antigo
  const encontrado = maisRecente ? /^(.*?)(\d+)$/.exec(maisRecente.numero_bmm) : null;
  if (!encontrado) return 'BMM01';
  return `${encontrado[1]}${String(Number(encontrado[2]) + 1).padStart(encontrado[2].length, '0')}`;
}

/** Lançamento de um Boletim de Medição (BMM) com o valor medido por obra/SS. */
export default function ModalBoletim({ aberto, contrato, boletins = [], onFechar, onSalvo }) {
  const toast = useToast();
  // Todas as obras aprovadas sem contrato (ou deste contrato): a SS escolhida é vinculada ao salvar.
  const { disponiveis: obrasDoContrato } = useSsDisponiveis(aberto, contrato?.id);
  const temObras = true;

  const [form, setForm] = useState({ numero_bmm: '', mes_referencia: '', status: 'EM_ANALISE', observacao: '' });
  const [modo, setModo] = useState('itens');
  const [itens, setItens] = useState([linhaVazia()]);
  const [valorTotal, setValorTotal] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto || !contrato) return;
    const maisRecente = boletins[0];
    setForm({
      numero_bmm: proximoNumero(boletins),
      mes_referencia: maisRecente ? somarMes(maisRecente.referencia) : referenciaDe(new Date()),
      status: 'EM_ANALISE',
      observacao: '',
    });
    setModo('itens');
    setItens([linhaVazia()]);
    setValorTotal('');
    setErro('');
    setEnviando(false);
  }, [aberto, contrato, boletins]);

  const alterar = (campo, valor) => setForm((anterior) => ({ ...anterior, [campo]: valor }));
  const alterarItem = (indice, campo, valor) =>
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));

  const totalItens = useMemo(
    () => itens.reduce((soma, item) => soma + (Number(item.valor) > 0 ? Number(item.valor) : 0), 0),
    [itens]
  );
  const escolhidas = new Set(itens.map((item) => Number(item.obra_id)).filter(Boolean));

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    if (!form.numero_bmm.trim()) return setErro('Informe o número do boletim (ex.: BMM19).');
    if (!/^\d{4}-\d{2}$/.test(form.mes_referencia)) return setErro('Informe o mês de referência do ciclo.');

    const payload = {
      numero_bmm: form.numero_bmm.trim(),
      mes_referencia: form.mes_referencia,
      status: form.status,
      observacao: form.observacao.trim() || undefined,
    };

    if (modo === 'itens') {
      const preenchidos = itens.filter((item) => item.obra_id || item.valor !== '');
      if (preenchidos.length === 0) return setErro('Informe ao menos uma SS com o valor medido.');
      const incompleto = preenchidos.find((item) => !item.obra_id || item.valor === '' || Number(item.valor) < 0);
      if (incompleto) return setErro('Cada linha precisa de uma SS e de um valor maior ou igual a zero.');
      payload.itens = preenchidos.map((item) => ({ obra_id: Number(item.obra_id), valor: Number(item.valor) }));
    } else {
      if (valorTotal === '' || Number(valorTotal) < 0) return setErro('Informe o valor total medido no boletim.');
      payload.valor_medido = Number(valorTotal);
    }

    setEnviando(true);
    try {
      const boletim = await criarBoletim(contrato.id, payload);
      toast.sucesso(`${boletim.numero_bmm} lançado (${formatarMoeda(boletim.valor_medido)}).`);
      onSalvo(boletim);
      onFechar();
      return undefined;
    } catch (err) {
      const mensagem = err.message || 'Não foi possível lançar o boletim.';
      setErro(mensagem);
      toast.erro(mensagem);
      return undefined;
    } finally {
      setEnviando(false);
    }
  }

  if (!contrato) return null;

  return (
    <ModalBase
      aberto={aberto}
      titulo="Lançar boletim de medição (BMM)"
      subtitulo={`${contrato.id_vale} · ciclo de medição do dia 16 ao dia 15`}
      onFechar={() => (enviando ? null : onFechar())}
      tamanho="xl"
    >
      <form onSubmit={aoEnviar} noValidate>
        <div className="max-h-[68vh] space-y-5 overflow-y-auto px-5 py-5">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="rotulo" htmlFor="bmm-num">Número do boletim *</label>
              <input
                id="bmm-num"
                className="campo"
                value={form.numero_bmm}
                onChange={(e) => alterar('numero_bmm', e.target.value)}
                disabled={enviando}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="bmm-mes">Mês do ciclo *</label>
              <input
                id="bmm-mes"
                type="month"
                className="campo"
                value={form.mes_referencia}
                onChange={(e) => alterar('mes_referencia', e.target.value)}
                disabled={enviando}
              />
              {/^\d{4}-\d{2}$/.test(form.mes_referencia) ? (
                <p className="mt-1 text-[11px] text-slate-500">Ciclo {cicloDoMes(form.mes_referencia)}</p>
              ) : null}
            </div>
            <div>
              <label className="rotulo" htmlFor="bmm-status">Situação *</label>
              <select
                id="bmm-status"
                className="campo"
                value={form.status}
                onChange={(e) => alterar('status', e.target.value)}
                disabled={enviando}
              >
                {STATUS_INICIAL.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                {form.status === 'APROVADO' ? 'Já conta no total acumulado.' : 'Só conta depois de aprovado pela Vale.'}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Valor medido</h3>
              <div role="radiogroup" aria-label="Forma de informar o valor" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  role="radio"
                  aria-checked={modo === 'itens'}
                  disabled={!temObras || enviando}
                  onClick={() => setModo('itens')}
                  className={`rounded-md px-3 py-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    modo === 'itens' ? 'bg-white text-omega-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Por SS
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={modo === 'total'}
                  disabled={enviando}
                  onClick={() => setModo('total')}
                  className={`rounded-md px-3 py-1 transition ${
                    modo === 'total' ? 'bg-white text-omega-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Só o valor total
                </button>
              </div>
            </div>

            {!temObras ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Este contrato ainda não tem obras vinculadas. Vincule as obras (SS) para detalhar o boletim por SS; por
                enquanto só dá para informar o valor total.
              </p>
            ) : null}

            {modo === 'itens' ? (
              <>
                <div className="space-y-2">
                  {itens.map((item, indice) => (
                    <div key={indice} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem_auto]">
                      <SeletorSs
                        obras={obrasDoContrato}
                        contratoId={contrato?.id}
                        valor={item.obra_id}
                        onChange={(obraId) => alterarItem(indice, 'obra_id', obraId)}
                        ignorar={escolhidas}
                        disabled={enviando}
                        rotulo={`SS da linha ${indice + 1}`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="campo"
                        placeholder="Valor medido (R$)"
                        value={item.valor}
                        onChange={(e) => alterarItem(indice, 'valor', e.target.value)}
                        disabled={enviando}
                        aria-label={`Valor medido da linha ${indice + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => setItens((atual) => (atual.length > 1 ? atual.filter((_, i) => i !== indice) : [linhaVazia()]))}
                        disabled={enviando}
                        title="Remover linha"
                        aria-label={`Remover linha ${indice + 1}`}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="btn-neutro"
                    onClick={() => setItens((atual) => [...atual, linhaVazia()])}
                    disabled={enviando || escolhidas.size >= obrasDoContrato.length}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Adicionar SS
                  </button>
                  <p className="text-sm text-slate-600">
                    Total do boletim: <strong className="tabular-nums text-slate-800">{formatarMoeda(totalItens)}</strong>
                  </p>
                </div>
              </>
            ) : (
              <div className="max-w-xs">
                <label className="rotulo" htmlFor="bmm-total">Valor total medido (R$) *</label>
                <input
                  id="bmm-total"
                  type="number"
                  min="0"
                  step="0.01"
                  className="campo"
                  placeholder="0,00"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  disabled={enviando}
                />
                <p className="mt-1 text-[11px] text-slate-500">Sem detalhamento por SS: o boletim entra só no total.</p>
              </div>
            )}
          </section>

          <section>
            <label className="rotulo" htmlFor="bmm-obs">Observação</label>
            <textarea
              id="bmm-obs"
              rows={2}
              className="campo resize-y"
              placeholder="Opcional"
              value={form.observacao}
              onChange={(e) => alterar('observacao', e.target.value)}
              disabled={enviando}
            />
          </section>

          {erro ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {erro}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primario" disabled={enviando}>
            {enviando ? <Spinner tamanho="sm" /> : null}
            {enviando ? 'Salvando...' : 'Lançar boletim'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

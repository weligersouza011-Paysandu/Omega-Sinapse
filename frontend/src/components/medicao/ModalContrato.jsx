import { useEffect, useState } from 'react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { criarContrato } from '../../hooks/useMedicao.js';

const FORM_VAZIO = { id_vale: '', descricao: '', valor_inicial: '', data_inicio: '', data_fim: '' };

/** Cadastro do contrato-mãe com a Vale (ex.: CT-251). */
export default function ModalContrato({ aberto, onFechar, onCriado }) {
  const toast = useToast();
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setForm(FORM_VAZIO);
      setErro('');
      setEnviando(false);
    }
  }, [aberto]);

  const alterar = (campo, valor) => setForm((anterior) => ({ ...anterior, [campo]: valor }));

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    if (!form.id_vale.trim()) return setErro('Informe o identificador do contrato na Vale (ex.: CT-251).');
    if (!form.descricao.trim()) return setErro('Informe a descrição do contrato.');
    if (!(Number(form.valor_inicial) > 0)) return setErro('Informe o valor inicial do contrato (maior que zero).');
    if (!form.data_inicio || !form.data_fim) return setErro('Informe as datas de início e fim do contrato.');
    if (form.data_fim < form.data_inicio) return setErro('A data de fim não pode ser anterior à data de início.');

    setEnviando(true);
    try {
      const contrato = await criarContrato({
        id_vale: form.id_vale.trim(),
        descricao: form.descricao.trim(),
        valor_inicial: Number(form.valor_inicial),
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
      });
      toast.sucesso(`Contrato ${contrato.id_vale} cadastrado.`);
      onCriado(contrato);
      onFechar();
      return undefined;
    } catch (err) {
      const mensagem = err.message || 'Não foi possível cadastrar o contrato.';
      setErro(mensagem);
      toast.erro(mensagem);
      return undefined;
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ModalBase
      aberto={aberto}
      titulo="Novo contrato"
      subtitulo="Contrato-mãe com a Vale. Os aditivos (TAC) e as obras são vinculados depois."
      onFechar={() => (enviando ? null : onFechar())}
      tamanho="lg"
    >
      <form onSubmit={aoEnviar} noValidate>
        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="ct-id">Identificador na Vale *</label>
            <input
              id="ct-id"
              className="campo"
              placeholder="Ex.: CT-251"
              value={form.id_vale}
              onChange={(e) => alterar('id_vale', e.target.value)}
              disabled={enviando}
              autoFocus
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="ct-valor">Valor inicial (R$) *</label>
            <input
              id="ct-valor"
              type="number"
              min="0"
              step="0.01"
              className="campo"
              placeholder="0,00"
              value={form.valor_inicial}
              onChange={(e) => alterar('valor_inicial', e.target.value)}
              disabled={enviando}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="ct-desc">Descrição *</label>
            <input
              id="ct-desc"
              className="campo"
              placeholder="Ex.: Eletromecânica"
              value={form.descricao}
              onChange={(e) => alterar('descricao', e.target.value)}
              disabled={enviando}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="ct-ini">Início da vigência *</label>
            <input
              id="ct-ini"
              type="date"
              className="campo"
              value={form.data_inicio}
              onChange={(e) => alterar('data_inicio', e.target.value)}
              disabled={enviando}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="ct-fim">Fim da vigência *</label>
            <input
              id="ct-fim"
              type="date"
              className="campo"
              value={form.data_fim}
              onChange={(e) => alterar('data_fim', e.target.value)}
              disabled={enviando}
            />
          </div>

          {erro ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2">
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
            {enviando ? 'Salvando...' : 'Cadastrar contrato'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

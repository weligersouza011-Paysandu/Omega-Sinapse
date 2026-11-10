import { useEffect, useMemo, useState } from 'react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarTac, registrarTac } from '../../hooks/useMedicao.js';
import { dataLocalISO, formatarData, formatarMoeda } from '../../utils/formatters.js';

/** Próximo número sugerido ("TAC 01" -> "TAC 02"); "TAC 01" quando não há aditivos. */
function proximoNumero(aditivos = []) {
  const numeros = aditivos
    .map((tac) => Number((String(tac.numero_tac).match(/(\d+)\s*$/) || [])[1]))
    .filter((n) => Number.isFinite(n));
  const proximo = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return `TAC ${String(proximo).padStart(2, '0')}`;
}

/** Registro de um Termo Aditivo (TAC), que eleva o teto financeiro do contrato. */
export default function ModalTac({ aberto, contrato, tac = null, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState({ numero_tac: '', valor_aditivo: '', data_assinatura: '', motivo: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (aberto && contrato) {
      setForm(
        tac
          ? {
              numero_tac: tac.numero_tac,
              valor_aditivo: String(tac.valor_aditivo),
              data_assinatura: tac.data_assinatura,
              motivo: tac.motivo,
            }
          : {
              numero_tac: proximoNumero(contrato.aditivos),
              valor_aditivo: '',
              data_assinatura: dataLocalISO(),
              motivo: '',
            }
      );
      setErro('');
      setEnviando(false);
    }
  }, [aberto, contrato, tac]);

  const alterar = (campo, valor) => setForm((anterior) => ({ ...anterior, [campo]: valor }));

  const tetoAtual = contrato?.consolidado?.teto_atual ?? 0;
  // Ao editar, o teto sem este TAC é a base da prévia.
  const baseTeto = tac ? tetoAtual - Number(tac.valor_aditivo) : tetoAtual;
  const novoTeto = useMemo(
    () => (Number(form.valor_aditivo) > 0 ? baseTeto + Number(form.valor_aditivo) : null),
    [form.valor_aditivo, baseTeto]
  );

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    if (!form.numero_tac.trim()) return setErro('Informe o número do TAC (ex.: TAC 01).');
    if (!(Number(form.valor_aditivo) > 0)) return setErro('Informe o valor do aditivo (maior que zero).');
    if (!form.data_assinatura) return setErro('Informe a data de assinatura.');
    if (!form.motivo.trim()) return setErro('Informe o motivo do aditivo.');

    setEnviando(true);
    try {
      const dados = {
        numero_tac: form.numero_tac.trim(),
        valor_aditivo: Number(form.valor_aditivo),
        data_assinatura: form.data_assinatura,
        motivo: form.motivo.trim(),
      };
      const atualizado = tac ? await atualizarTac(contrato.id, tac.id, dados) : await registrarTac(contrato.id, dados);
      toast.sucesso(
        `${form.numero_tac.trim().toUpperCase()} ${tac ? 'atualizado' : 'registrado'}. Teto do contrato: ${formatarMoeda(atualizado.consolidado.teto_atual)}.`
      );
      onSalvo(atualizado);
      onFechar();
      return undefined;
    } catch (err) {
      const mensagem = err.message || 'Não foi possível registrar o TAC.';
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
      titulo={tac ? 'Corrigir Termo Aditivo (TAC)' : 'Registrar Termo Aditivo (TAC)'}
      subtitulo={`${contrato.id_vale} · teto atual ${formatarMoeda(tetoAtual)}`}
      onFechar={() => (enviando ? null : onFechar())}
      tamanho="lg"
    >
      <form onSubmit={aoEnviar} noValidate>
        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-3">
          <div>
            <label className="rotulo" htmlFor="tac-num">Número do TAC *</label>
            <input
              id="tac-num"
              className="campo"
              value={form.numero_tac}
              onChange={(e) => alterar('numero_tac', e.target.value)}
              disabled={enviando}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="tac-valor">Valor do aditivo (R$) *</label>
            <input
              id="tac-valor"
              type="number"
              min="0"
              step="0.01"
              className="campo"
              placeholder="0,00"
              value={form.valor_aditivo}
              onChange={(e) => alterar('valor_aditivo', e.target.value)}
              disabled={enviando}
              autoFocus
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="tac-data">Assinatura *</label>
            <input
              id="tac-data"
              type="date"
              className="campo"
              value={form.data_assinatura}
              onChange={(e) => alterar('data_assinatura', e.target.value)}
              disabled={enviando}
            />
          </div>
          <div className="sm:col-span-3">
            <label className="rotulo" htmlFor="tac-motivo">Motivo *</label>
            <textarea
              id="tac-motivo"
              rows={2}
              className="campo resize-y"
              placeholder="Ex.: Volume de frentes de serviço acima do previsto"
              value={form.motivo}
              onChange={(e) => alterar('motivo', e.target.value)}
              disabled={enviando}
            />
          </div>

          {novoTeto !== null ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:col-span-3">
              Novo teto do contrato: <strong>{formatarMoeda(novoTeto)}</strong>
              {form.data_assinatura ? ` (a partir de ${formatarData(form.data_assinatura)})` : ''}.
            </p>
          ) : null}

          {contrato.aditivos?.length > 0 ? (
            <div className="sm:col-span-3">
              <p className="rotulo">Aditivos já registrados</p>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-xs">
                {contrato.aditivos.map((tac) => (
                  <li key={tac.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="font-semibold text-slate-700">{tac.numero_tac}</span>
                    <span className="text-slate-500">{formatarData(tac.data_assinatura)}</span>
                    <span className="tabular-nums text-slate-700">+ {formatarMoeda(tac.valor_aditivo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {erro ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-3">
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
            {enviando ? 'Salvando...' : tac ? 'Salvar correção' : 'Registrar TAC'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

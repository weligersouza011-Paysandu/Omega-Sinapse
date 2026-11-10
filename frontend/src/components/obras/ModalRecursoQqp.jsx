import { useEffect, useMemo, useState } from 'react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarRecursoObra, criarRecursoObra } from '../../hooks/useMedicao.js';
import { formatarMoeda } from '../../utils/formatters.js';

export const ROTULO_UNIDADE = { HORA: 'hora', DIA: 'dia útil', MES: 'mês', UNIDADE: 'unidade' };
export const ROTULO_CATEGORIA = { HH: 'HH', EQUIPAMENTO: 'Equipamento', INSUMO: 'Insumo', OUTROS: 'Outros' };

const VAZIO = { item_id: '', quantidade: '', horas_dia: '', data_inicio: '', data_fim: '', inclui_sabados: false, observacao: '' };

/** Alocação de um recurso do QQP na obra (quantidade, período e regime de dias úteis). */
export default function ModalRecursoQqp({ aberto, obra, itens = [], recurso = null, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setEnviando(false);
    setForm(
      recurso
        ? {
            item_id: String(recurso.item_id),
            quantidade: String(recurso.quantidade),
            horas_dia: recurso.horas_dia ? String(recurso.horas_dia) : '',
            data_inicio: recurso.data_inicio || '',
            data_fim: recurso.data_fim || '',
            inclui_sabados: Boolean(recurso.inclui_sabados),
            observacao: recurso.observacao || '',
          }
        : VAZIO
    );
  }, [aberto, recurso]);

  const alterar = (campo, valor) => setForm((anterior) => ({ ...anterior, [campo]: valor }));

  // Ao editar, o item atual aparece mesmo que tenha sido desativado depois.
  const opcoes = useMemo(() => {
    const ativos = itens.filter((item) => item.ativo);
    if (recurso?.item && !ativos.some((item) => item.id === recurso.item.id)) return [recurso.item, ...ativos];
    return ativos;
  }, [itens, recurso]);

  const item = opcoes.find((opcao) => String(opcao.id) === form.item_id) || null;
  const porUnidade = item?.unidade === 'UNIDADE';

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    if (!item) return setErro('Escolha o item do QQP.');
    if (!(Number(form.quantidade) > 0)) return setErro('Informe a quantidade (maior que zero).');
    if (!form.data_inicio) return setErro(porUnidade ? 'Informe a data do lançamento.' : 'Informe a data de início.');
    if (!porUnidade && !form.data_fim) return setErro('Informe a data de fim da alocação.');
    if (!porUnidade && form.data_fim < form.data_inicio) return setErro('A data de fim não pode ser anterior à de início.');

    const payload = {
      item_id: item.id,
      quantidade: Number(form.quantidade),
      data_inicio: form.data_inicio,
      data_fim: porUnidade ? null : form.data_fim,
      horas_dia: item.unidade === 'HORA' && form.horas_dia !== '' ? Number(form.horas_dia) : null,
      inclui_sabados: !porUnidade && form.inclui_sabados,
      observacao: form.observacao.trim() || null,
    };

    setEnviando(true);
    try {
      const salvo = recurso
        ? await atualizarRecursoObra(obra.id, recurso.id, payload)
        : await criarRecursoObra(obra.id, payload);
      toast.sucesso(recurso ? 'Recurso atualizado.' : 'Recurso planejado.');
      onSalvo(salvo);
      onFechar();
      return undefined;
    } catch (err) {
      const mensagem = err.message || 'Não foi possível salvar o recurso.';
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
      titulo={recurso ? 'Editar recurso planejado' : 'Planejar recurso (QQP)'}
      subtitulo="O custo é calculado pelos dias úteis do período (segunda a sexta, sem feriados nacionais)."
      onFechar={() => (enviando ? null : onFechar())}
      tamanho="lg"
    >
      <form onSubmit={aoEnviar} noValidate>
        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="rq-item">Item do QQP *</label>
            <select
              id="rq-item"
              className="campo"
              value={form.item_id}
              onChange={(e) => alterar('item_id', e.target.value)}
              disabled={enviando}
            >
              <option value="">Selecione o item...</option>
              {opcoes.map((opcao) => (
                <option key={opcao.id} value={opcao.id}>
                  {opcao.codigo} — {opcao.descricao} ({ROTULO_CATEGORIA[opcao.categoria]}, {formatarMoeda(opcao.preco_unitario)}/{ROTULO_UNIDADE[opcao.unidade]})
                </option>
              ))}
            </select>
            {opcoes.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">
                O contrato ainda não tem itens ativos no QQP. Cadastre-os em Medição → Matriz QQP.
              </p>
            ) : null}
          </div>

          <div>
            <label className="rotulo" htmlFor="rq-qtd">
              {porUnidade ? 'Quantidade (unidades) *' : 'Quantidade de recursos *'}
            </label>
            <input
              id="rq-qtd"
              type="number"
              min="0"
              step="0.001"
              className="campo"
              value={form.quantidade}
              onChange={(e) => alterar('quantidade', e.target.value)}
              disabled={enviando}
            />
          </div>

          {item?.unidade === 'HORA' ? (
            <div>
              <label className="rotulo" htmlFor="rq-horas">Horas por dia de cada recurso</label>
              <input
                id="rq-horas"
                type="number"
                min="0"
                max="24"
                step="0.1"
                className="campo"
                placeholder="8"
                value={form.horas_dia}
                onChange={(e) => alterar('horas_dia', e.target.value)}
                disabled={enviando}
              />
            </div>
          ) : (
            <div />
          )}

          <div>
            <label className="rotulo" htmlFor="rq-ini">{porUnidade ? 'Data do lançamento *' : 'Início *'}</label>
            <input
              id="rq-ini"
              type="date"
              className="campo"
              value={form.data_inicio}
              onChange={(e) => alterar('data_inicio', e.target.value)}
              disabled={enviando}
            />
          </div>

          {!porUnidade ? (
            <div>
              <label className="rotulo" htmlFor="rq-fim">Fim *</label>
              <input
                id="rq-fim"
                type="date"
                className="campo"
                value={form.data_fim}
                onChange={(e) => alterar('data_fim', e.target.value)}
                disabled={enviando}
              />
            </div>
          ) : (
            <div />
          )}

          {!porUnidade ? (
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.inclui_sabados}
                onChange={(e) => alterar('inclui_sabados', e.target.checked)}
                disabled={enviando}
              />
              Trabalha aos sábados (conta como dia útil)
            </label>
          ) : null}

          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="rq-obs">Observação</label>
            <input
              id="rq-obs"
              className="campo"
              placeholder="Opcional"
              value={form.observacao}
              onChange={(e) => alterar('observacao', e.target.value)}
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
            {enviando ? 'Salvando...' : recurso ? 'Salvar alterações' : 'Planejar recurso'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

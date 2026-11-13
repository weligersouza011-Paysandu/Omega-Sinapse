import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarItemQqp, criarItemQqp, excluirItemQqp, listarItensQqp } from '../../hooks/useMedicao.js';
import { formatarMoeda } from '../../utils/formatters.js';

const CATEGORIAS = [
  ['HH', 'HH (mão de obra)'],
  ['EQUIPAMENTO', 'Equipamento'],
  ['INSUMO', 'Insumo'],
  ['OUTROS', 'Outros'],
];
const UNIDADES = [
  ['HORA', 'Por hora'],
  ['DIA', 'Por dia útil'],
  ['MES', 'Por mês (rateado nos dias úteis)'],
  ['UNIDADE', 'Por unidade (lançamento único)'],
];
const ROTULO_UNIDADE = { HORA: 'hora', DIA: 'dia útil', MES: 'mês', UNIDADE: 'unidade' };
const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS);

const VAZIO = { codigo: '', descricao: '', categoria: 'HH', unidade: 'HORA', preco_unitario: '' };

/**
 * Matriz QQP (Quadro de Quantidades e Preços) do contrato: itens com o preço de
 * HH, equipamentos e insumos usados na projeção de custos das obras.
 */
export default function ModalQqp({ aberto, contrato, podeGerir, onFechar }) {
  const toast = useToast();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState(null);

  async function carregar() {
    setCarregando(true);
    setErroCarga('');
    try {
      setItens(await listarItensQqp(contrato.id));
    } catch (err) {
      setErroCarga(err.message || 'Não foi possível carregar o QQP.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (aberto && contrato) {
      setForm(VAZIO);
      setEditandoId(null);
      setFormAberto(false);
      setErro('');
      carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, contrato?.id]);

  const alterar = (campo, valor) => setForm((anterior) => ({ ...anterior, [campo]: valor }));

  function abrirNovo() {
    setForm(VAZIO);
    setEditandoId(null);
    setErro('');
    setFormAberto(true);
  }

  function abrirEdicao(item) {
    setForm({
      codigo: item.codigo,
      descricao: item.descricao,
      categoria: item.categoria,
      unidade: item.unidade,
      preco_unitario: String(item.preco_unitario),
    });
    setEditandoId(item.id);
    setErro('');
    setFormAberto(true);
  }

  async function salvar(evento) {
    evento.preventDefault();
    setErro('');
    if (!form.codigo.trim()) return setErro('Informe o código do item.');
    if (!form.descricao.trim()) return setErro('Informe a descrição do item.');
    if (!(Number(form.preco_unitario) > 0)) return setErro('Informe o preço unitário (maior que zero).');

    const payload = {
      codigo: form.codigo.trim(),
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      unidade: form.unidade,
      preco_unitario: Number(form.preco_unitario),
    };

    setSalvando(true);
    try {
      if (editandoId) await atualizarItemQqp(contrato.id, editandoId, payload);
      else await criarItemQqp(contrato.id, payload);
      toast.sucesso(editandoId ? 'Item atualizado.' : 'Item adicionado ao QQP.');
      setFormAberto(false);
      setEditandoId(null);
      await carregar();
      return undefined;
    } catch (err) {
      const mensagem = err.message || 'Não foi possível salvar o item.';
      setErro(mensagem);
      toast.erro(mensagem);
      return undefined;
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(item) {
    setOcupadoId(item.id);
    try {
      await atualizarItemQqp(contrato.id, item.id, { ativo: !item.ativo });
      await carregar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível alterar o item.');
    } finally {
      setOcupadoId(null);
    }
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir o item ${item.codigo} do QQP?`)) return;
    setOcupadoId(item.id);
    try {
      await excluirItemQqp(contrato.id, item.id);
      toast.sucesso(`${item.codigo} excluído.`);
      await carregar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível excluir o item.');
    } finally {
      setOcupadoId(null);
    }
  }

  if (!contrato) return null;

  return (
    <ModalBase
      aberto={aberto}
      titulo="Matriz QQP — quantidades e preços"
      subtitulo={`${contrato.id_vale} · preços de HH, equipamentos e insumos usados na projeção de custos das obras`}
      onFechar={onFechar}
      tamanho="xl"
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
        {podeGerir ? (
          <div className="flex justify-end">
            <button type="button" className="btn-primario" onClick={abrirNovo} disabled={formAberto}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar item
            </button>
          </div>
        ) : null}

        {formAberto ? (
          <form onSubmit={salvar} noValidate className="rounded-lg border border-omega-100 bg-omega-50/50 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              {editandoId ? 'Editar item' : 'Novo item'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="rotulo" htmlFor="qqp-cod">Código *</label>
                <input id="qqp-cod" className="campo" value={form.codigo} onChange={(e) => alterar('codigo', e.target.value)} disabled={salvando} autoFocus />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="rotulo" htmlFor="qqp-desc">Descrição *</label>
                <input id="qqp-desc" className="campo" value={form.descricao} onChange={(e) => alterar('descricao', e.target.value)} disabled={salvando} />
              </div>
              <div>
                <label className="rotulo" htmlFor="qqp-cat">Categoria *</label>
                <select id="qqp-cat" className="campo" value={form.categoria} onChange={(e) => alterar('categoria', e.target.value)} disabled={salvando}>
                  {CATEGORIAS.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="rotulo" htmlFor="qqp-un">Unidade de cobrança *</label>
                <select id="qqp-un" className="campo" value={form.unidade} onChange={(e) => alterar('unidade', e.target.value)} disabled={salvando}>
                  {UNIDADES.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rotulo" htmlFor="qqp-preco">Preço unitário (R$) *</label>
                <input id="qqp-preco" type="number" min="0" step="any" className="campo" value={form.preco_unitario} onChange={(e) => alterar('preco_unitario', e.target.value)} disabled={salvando} />
              </div>
            </div>
            {erro ? (
              <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-neutro" onClick={() => setFormAberto(false)} disabled={salvando}>Cancelar</button>
              <button type="submit" className="btn-primario" disabled={salvando}>
                {salvando ? <Spinner tamanho="sm" /> : null}
                {editandoId ? 'Salvar item' : 'Adicionar ao QQP'}
              </button>
            </div>
          </form>
        ) : null}

        {carregando && !itens.length ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Spinner tamanho="md" className="text-omega-600" />
            Carregando o QQP...
          </div>
        ) : erroCarga ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erroCarga}</div>
        ) : itens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            Nenhum item no QQP deste contrato ainda. {podeGerir ? 'Adicione o primeiro item.' : ''}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Código', 'Descrição', 'Categoria', 'Cobrança', 'Preço unitário', 'Em uso', 'Situação', ''].map((titulo) => (
                    <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {itens.map((item) => (
                  <tr key={item.id} className={item.ativo ? '' : 'bg-slate-50/70 text-slate-400'}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">{item.codigo}</td>
                    <td className="px-3 py-2">{item.descricao}</td>
                    <td className="whitespace-nowrap px-3 py-2">{ROTULO_CATEGORIA[item.categoria] || item.categoria}</td>
                    <td className="whitespace-nowrap px-3 py-2">por {ROTULO_UNIDADE[item.unidade]}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums">{formatarMoeda(item.preco_unitario)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.recursos_em_uso}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {podeGerir ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={item.ativo}
                          aria-label={`${item.ativo ? 'Desativar' : 'Ativar'} ${item.codigo}`}
                          onClick={() => alternarAtivo(item)}
                          disabled={ocupadoId === item.id}
                          className={`relative h-5 w-9 rounded-full transition ${item.ativo ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-60`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${item.ativo ? 'left-[1.1rem]' : 'left-0.5'}`} />
                        </button>
                      ) : (
                        <span className="text-xs font-semibold">{item.ativo ? 'Ativo' : 'Inativo'}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {podeGerir ? (
                        <div className="inline-flex gap-1.5">
                          <button type="button" className="btn-neutro !px-2 !py-1" onClick={() => abrirEdicao(item)} aria-label={`Editar ${item.codigo}`} title="Editar">
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button type="button" className="btn-neutro !px-2 !py-1 hover:!border-red-300 hover:!text-red-600" onClick={() => excluir(item)} disabled={ocupadoId === item.id} aria-label={`Excluir ${item.codigo}`} title={item.recursos_em_uso > 0 ? 'Em uso: desative em vez de excluir' : 'Excluir'}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-500">
          Itens em uso por alguma obra não podem ser excluídos nem mudar de unidade; desative-os para que deixem de ser
          sugeridos sem perder as alocações existentes.
        </p>
      </div>

      <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
        <button type="button" className="btn-neutro" onClick={onFechar}>Fechar</button>
      </div>
    </ModalBase>
  );
}

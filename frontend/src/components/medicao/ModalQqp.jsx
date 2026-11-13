import { useEffect, useMemo, useState } from 'react';
import { Download, FileDown, FileSpreadsheet, FileUp, ListOrdered, Plus, RefreshCw, Search } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarItemQqp,
  baixarPdfQqp,
  baixarPlanilhaQqp,
  criarItemQqp,
  excluirItemQqp,
  obterQqp,
  salvarOrdemQqp,
} from '../../hooks/useMedicao.js';
import { formatarMoeda } from '../../utils/formatters.js';
import ArvoreQqp from './ArvoreQqp.jsx';
import PainelImportacaoQqp from './PainelImportacaoQqp.jsx';
import PainelOrdemQqp from './PainelOrdemQqp.jsx';
import { CATEGORIAS, UNIDADES } from './qqpRotulos.js';

const VAZIO = {
  codigo: '',
  descricao: '',
  categoria: 'HH',
  unidade: 'HORA',
  preco_unitario: '',
  quantidade: '',
  categoria_planilha: '',
  grupo: '',
  subgrupo: '',
  unidade_planilha: '',
};

/** Conflito de versão do QQP (alguém gravou antes): o formulário fica preenchido. */
const ehConflito = (err) => err?.status === 409 && err?.detalhes?.revisao_atual !== undefined;

/** Junta a ordem salva do contrato com a nova (outros TACs podem ter categorias/grupos próprios). */
function mesclarOrdem(anterior, nova) {
  const base = anterior || { categorias: [], grupos: {}, subgrupos: {} };
  return {
    categorias: [...nova.categorias, ...(base.categorias || []).filter((c) => !nova.categorias.includes(c))],
    grupos: { ...(base.grupos || {}), ...nova.grupos },
    subgrupos: { ...(base.subgrupos || {}), ...nova.subgrupos },
  };
}

/**
 * Matriz QQP (Quadro de Quantidades e Preços) do contrato, por contrato original (TAC0) ou
 * TAC: árvore Categoria › Grupo › Subgrupo com totais, cadastro de itens, template/importação
 * XLSX, PDF e ordem de visualização. Toda gravação envia a versão carregada (`qqp_revisao`);
 * se outra pessoa gravou antes, a API responde 409 e a tela pede para recarregar.
 */
export default function ModalQqp({ aberto, contrato, podeGerir, onFechar }) {
  const toast = useToast();
  const [tac, setTac] = useState(0);
  const [qqp, setQqp] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [conflito, setConflito] = useState('');
  const [filtro, setFiltro] = useState('');
  const [painel, setPainel] = useState(null); // 'form' | 'importar' | 'ordem'
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [baixando, setBaixando] = useState('');

  async function carregar(escopo = tac) {
    setCarregando(true);
    setErroCarga('');
    try {
      const dados = await obterQqp(contrato.id, escopo);
      setQqp(dados);
      setConflito('');
      return dados;
    } catch (err) {
      setErroCarga(err.message || 'Não foi possível carregar o QQP.');
      return null;
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (aberto && contrato) {
      setTac(0);
      setQqp(null);
      setForm(VAZIO);
      setEditandoId(null);
      setPainel(null);
      setErro('');
      setFiltro('');
      carregar(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, contrato?.id]);

  const revisao = qqp?.qqp_revisao;
  const escopoAtual = qqp?.escopos?.find((e) => e.tac_id === tac);
  const sugestoes = useMemo(() => {
    const itens = qqp?.data || [];
    const unicos = (campo) => [...new Set(itens.map((i) => i[campo]).filter(Boolean))].sort();
    return { categorias: unicos('categoria_planilha'), grupos: unicos('grupo'), subgrupos: unicos('subgrupo'), unidades: unicos('unidade_planilha') };
  }, [qqp]);

  function trocarEscopo(valor) {
    const escopo = Number(valor);
    setTac(escopo);
    setPainel(null);
    carregar(escopo);
  }

  function tratarErroDeGravacao(err, mensagemPadrao) {
    const mensagem = err.message || mensagemPadrao;
    if (ehConflito(err) || err.status === 428) setConflito(mensagem);
    toast.erro(mensagem);
    return mensagem;
  }

  const alterar = (campo, valor) => setForm((anterior) => ({ ...anterior, [campo]: valor }));

  function abrirNovo(hierarquia = {}) {
    setForm({ ...VAZIO, ...hierarquia });
    setEditandoId(null);
    setErro('');
    setPainel('form');
  }

  function abrirEdicao(item) {
    setForm({
      codigo: item.codigo,
      descricao: item.descricao,
      categoria: item.categoria,
      unidade: item.unidade,
      preco_unitario: item.preco_unitario_exato ?? String(item.preco_unitario),
      quantidade: item.quantidade ?? '',
      categoria_planilha: item.categoria_planilha || '',
      grupo: item.grupo || '',
      subgrupo: item.subgrupo || '',
      unidade_planilha: item.unidade_planilha || '',
    });
    setEditandoId(item.id);
    setErro('');
    setPainel('form');
  }

  async function salvar(evento) {
    evento.preventDefault();
    setErro('');
    if (!form.codigo.trim()) return setErro('Informe o código do item.');
    if (!form.descricao.trim()) return setErro('Informe a descrição do item.');
    if (String(form.preco_unitario).trim() === '' || Number(String(form.preco_unitario).replace(',', '.')) < 0) {
      return setErro('Informe o preço unitário (maior ou igual a zero).');
    }

    const payload = {
      codigo: form.codigo.trim(),
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      unidade: form.unidade,
      // Texto exato: a API aceita até 8 casas sem passar por ponto flutuante.
      preco_unitario: String(form.preco_unitario).trim(),
      quantidade: String(form.quantidade).trim(),
      categoria_planilha: form.categoria_planilha.trim(),
      grupo: form.grupo.trim(),
      subgrupo: form.subgrupo.trim(),
      unidade_planilha: form.unidade_planilha.trim(),
      qqp_revisao: revisao,
    };

    setSalvando(true);
    try {
      if (editandoId) await atualizarItemQqp(contrato.id, editandoId, payload);
      else await criarItemQqp(contrato.id, { ...payload, termo_aditivo_id: tac });
      toast.sucesso(editandoId ? 'Item atualizado.' : 'Item adicionado ao QQP.');
      setPainel(null);
      setEditandoId(null);
      await carregar();
    } catch (err) {
      setErro(tratarErroDeGravacao(err, 'Não foi possível salvar o item.'));
    } finally {
      setSalvando(false);
    }
    return undefined;
  }

  async function alternarAtivo(item) {
    setOcupadoId(item.id);
    try {
      await atualizarItemQqp(contrato.id, item.id, { ativo: !item.ativo, qqp_revisao: revisao });
      await carregar();
    } catch (err) {
      tratarErroDeGravacao(err, 'Não foi possível alterar o item.');
    } finally {
      setOcupadoId(null);
    }
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir o item ${item.codigo} do QQP?`)) return;
    setOcupadoId(item.id);
    try {
      await excluirItemQqp(contrato.id, item.id, revisao);
      toast.sucesso(`${item.codigo} excluído.`);
      await carregar();
    } catch (err) {
      tratarErroDeGravacao(err, 'Não foi possível excluir o item.');
    } finally {
      setOcupadoId(null);
    }
  }

  async function salvarOrdem(ordem) {
    try {
      await salvarOrdemQqp(contrato.id, mesclarOrdem(qqp?.ordem, ordem), revisao);
      toast.sucesso('Ordem de visualização salva.');
      setPainel(null);
      await carregar();
    } catch (err) {
      tratarErroDeGravacao(err, 'Não foi possível salvar a ordem.');
    }
  }

  async function baixar(tipo) {
    setBaixando(tipo);
    try {
      if (tipo === 'pdf') await baixarPdfQqp(contrato.id, tac);
      else await baixarPlanilhaQqp(contrato.id, tac, { vazio: tipo === 'template' });
    } catch (err) {
      toast.erro(err.message || 'Não foi possível gerar o arquivo.');
    } finally {
      setBaixando('');
    }
  }

  if (!contrato) return null;
  const itens = qqp?.data || [];

  return (
    <ModalBase
      aberto={aberto}
      titulo="Matriz QQP — quantidades e preços"
      subtitulo={`${contrato.id_vale} · preços contratuais por contrato original (TAC0) e TACs, usados nas projeções de BMM e de custos`}
      onFechar={onFechar}
      tamanho="xxl"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem]">
            <label className="rotulo" htmlFor="qqp-escopo">Nº CT SAP – TAC</label>
            <select id="qqp-escopo" className="campo" value={tac} onChange={(e) => trocarEscopo(e.target.value)} disabled={carregando || salvando}>
              {(qqp?.escopos || [{ tac_id: 0, rotulo: 'TAC0' }]).map((escopo) => (
                <option key={escopo.tac_id} value={escopo.tac_id}>{escopo.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="relative min-w-[14rem] flex-1">
            <label className="rotulo" htmlFor="qqp-busca">Buscar</label>
            <Search className="pointer-events-none absolute bottom-2.5 left-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input id="qqp-busca" className="campo !pl-8" placeholder="Código ou descrição" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-neutro" onClick={() => baixar('template')} disabled={Boolean(baixando)} title="Planilha vazia no layout de importação">
              {baixando === 'template' ? <Spinner tamanho="sm" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
              Baixar template
            </button>
            <button type="button" className="btn-neutro" onClick={() => baixar('xlsx')} disabled={Boolean(baixando) || !itens.length} title="Itens deste QQP no layout de importação">
              {baixando === 'xlsx' ? <Spinner tamanho="sm" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              Exportar XLSX
            </button>
            <button type="button" className="btn-neutro" onClick={() => baixar('pdf')} disabled={Boolean(baixando)}>
              {baixando === 'pdf' ? <Spinner tamanho="sm" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
              Baixar PDF
            </button>
            {podeGerir ? (
              <>
                <button type="button" className="btn-neutro" onClick={() => setPainel(painel === 'importar' ? null : 'importar')} disabled={!qqp}>
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  Importar
                </button>
                <button type="button" className="btn-neutro" onClick={() => setPainel(painel === 'ordem' ? null : 'ordem')} disabled={!qqp?.arvore?.length}>
                  <ListOrdered className="h-4 w-4" aria-hidden="true" />
                  Personalizar visualização
                </button>
                <button type="button" className="btn-primario" onClick={() => abrirNovo()} disabled={!qqp || painel === 'form'}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Adicionar item
                </button>
              </>
            ) : null}
          </div>
        </div>

        {conflito ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>{conflito} O que você digitou continua no formulário.</span>
            <button type="button" className="btn-neutro" onClick={() => carregar()} disabled={carregando}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Recarregar o QQP
            </button>
          </div>
        ) : null}

        {painel === 'importar' && qqp ? (
          <PainelImportacaoQqp
            contratoId={contrato.id}
            tac={tac}
            rotuloEscopo={escopoAtual?.rotulo || ''}
            revisao={revisao}
            onConflito={setConflito}
            onFechar={() => setPainel(null)}
            onConcluido={async (resultado) => {
              toast.sucesso(`QQP importado: ${resultado.resumo.novos} novos, ${resultado.resumo.substituidos} substituídos.`);
              setPainel(null);
              await carregar();
            }}
          />
        ) : null}

        {painel === 'ordem' && qqp ? <PainelOrdemQqp arvore={qqp.arvore} onSalvar={salvarOrdem} onFechar={() => setPainel(null)} /> : null}

        {painel === 'form' ? (
          <form onSubmit={salvar} noValidate className="rounded-lg border border-omega-100 bg-omega-50/50 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              {editandoId ? 'Editar item' : `Novo item · ${escopoAtual?.rotulo || ''}`}
            </p>
            <datalist id="qqp-sug-cat">{sugestoes.categorias.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="qqp-sug-grupo">{sugestoes.grupos.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="qqp-sug-sub">{sugestoes.subgrupos.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="qqp-sug-un">{sugestoes.unidades.map((v) => <option key={v} value={v} />)}</datalist>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <label className="rotulo" htmlFor="qqp-catp">Categoria (planilha)</label>
                <input id="qqp-catp" list="qqp-sug-cat" className="campo" value={form.categoria_planilha} onChange={(e) => alterar('categoria_planilha', e.target.value)} disabled={salvando} />
              </div>
              <div className="lg:col-span-2">
                <label className="rotulo" htmlFor="qqp-grupo">Grupo</label>
                <input id="qqp-grupo" list="qqp-sug-grupo" className="campo" value={form.grupo} onChange={(e) => alterar('grupo', e.target.value)} disabled={salvando} />
              </div>
              <div className="lg:col-span-2">
                <label className="rotulo" htmlFor="qqp-sub">Subgrupo</label>
                <input id="qqp-sub" list="qqp-sug-sub" className="campo" value={form.subgrupo} onChange={(e) => alterar('subgrupo', e.target.value)} disabled={salvando} />
              </div>
              <div>
                <label className="rotulo" htmlFor="qqp-cod">Código *</label>
                <input id="qqp-cod" className="campo" value={form.codigo} onChange={(e) => alterar('codigo', e.target.value)} disabled={salvando} autoFocus />
              </div>
              <div className="sm:col-span-2 lg:col-span-5">
                <label className="rotulo" htmlFor="qqp-desc">Descrição *</label>
                <input id="qqp-desc" className="campo" value={form.descricao} onChange={(e) => alterar('descricao', e.target.value)} disabled={salvando} />
              </div>
              <div>
                <label className="rotulo" htmlFor="qqp-unp">Unidade (planilha)</label>
                <input id="qqp-unp" list="qqp-sug-un" className="campo" placeholder="h, mês, un…" value={form.unidade_planilha} onChange={(e) => alterar('unidade_planilha', e.target.value)} disabled={salvando} />
              </div>
              <div className="lg:col-span-2">
                <label className="rotulo" htmlFor="qqp-un">Cobrança (cálculo) *</label>
                <select id="qqp-un" className="campo" value={form.unidade} onChange={(e) => alterar('unidade', e.target.value)} disabled={salvando}>
                  {UNIDADES.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rotulo" htmlFor="qqp-cat">Categoria Synapse *</label>
                <select id="qqp-cat" className="campo" value={form.categoria} onChange={(e) => alterar('categoria', e.target.value)} disabled={salvando}>
                  {CATEGORIAS.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rotulo" htmlFor="qqp-qtd">Quantidade</label>
                <input id="qqp-qtd" inputMode="decimal" className="campo" value={form.quantidade} onChange={(e) => alterar('quantidade', e.target.value)} disabled={salvando} />
              </div>
              <div>
                <label className="rotulo" htmlFor="qqp-preco">Valor unitário (R$) *</label>
                <input id="qqp-preco" inputMode="decimal" className="campo" placeholder="até 8 casas" value={form.preco_unitario} onChange={(e) => alterar('preco_unitario', e.target.value)} disabled={salvando} />
              </div>
            </div>
            {erro ? <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-neutro" onClick={() => setPainel(null)} disabled={salvando}>Cancelar</button>
              <button type="submit" className="btn-primario" disabled={salvando}>
                {salvando ? <Spinner tamanho="sm" /> : null}
                {editandoId ? 'Salvar item' : 'Adicionar ao QQP'}
              </button>
            </div>
          </form>
        ) : null}

        {carregando && !qqp ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Spinner tamanho="md" className="text-omega-600" />
            Carregando o QQP...
          </div>
        ) : erroCarga ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erroCarga}</div>
        ) : itens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            Nenhum item no QQP de {escopoAtual?.rotulo || 'este contrato'} ainda. {podeGerir ? 'Adicione um item ou importe a planilha.' : ''}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">
                {itens.length} itens · {itens.filter((i) => !i.ativo).length} inativos
                {carregando ? <Spinner tamanho="sm" className="ml-2 inline text-omega-600" /> : null}
              </span>
              <span className="font-bold text-slate-800">Total do QQP: <span className="tabular-nums">{formatarMoeda(qqp.valor_total)}</span></span>
            </div>
            <ArvoreQqp
              arvore={qqp.arvore}
              filtro={filtro}
              podeGerir={podeGerir}
              ocupadoId={ocupadoId}
              onAdicionar={abrirNovo}
              onEditar={abrirEdicao}
              onExcluir={excluir}
              onAlternarAtivo={alternarAtivo}
            />
          </>
        )}

        <p className="text-[11px] leading-relaxed text-slate-500">
          Total = quantidade contratada × valor unitário. Itens em uso por obras (recursos) ou projeções de BMM não podem ser
          excluídos; desative-os para que deixem de ser sugeridos sem perder o histórico. Itens em uso por recursos de obra
          também não podem mudar o tipo de cobrança.
        </p>
      </div>

      <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
        <button type="button" className="btn-neutro" onClick={onFechar}>Fechar</button>
      </div>
    </ModalBase>
  );
}

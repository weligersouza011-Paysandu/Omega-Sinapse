import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Check, FilePlus2, Paperclip, Pencil, Trash2, X } from 'lucide-react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import StatusBadge from './StatusBadge.jsx';
import {
  adicionarRevisao as registrarRevisao,
  atualizarStatusRevisao,
  editarRevisao,
  excluirOrcamento,
  obterImpactoExclusao,
  obterOrcamento,
} from '../hooks/useOrcamentos.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatarDataHora, formatarMoeda, rotuloRevisao } from '../utils/formatters.js';
import { STATUS_APROVACAO_REVISAO, TIPOS_ALTERACAO_REVISAO } from '../utils/status.js';

/** Limite do anexo — o mesmo do back-end (UPLOAD_MAX_BYTES padrão). */
const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;
const ACCEPT_ANEXO = 'application/pdf,image/jpeg,image/png,image/webp';

/** Badge pequena a partir de uma lista de opções `{ value, label, cor }`. */
function Etiqueta({ opcoes, valor, padrao }) {
  const info = opcoes.find((opcao) => opcao.value === (valor || padrao)) || opcoes[0];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${info.cor}`}
    >
      {info.label}
    </span>
  );
}

function Linha({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="truncate text-sm font-medium text-slate-700">{valor || '—'}</p>
    </div>
  );
}

/** Modal de detalhes do orçamento + histórico e inclusão de revisões de valor. */
export default function ModalDetalhesOrcamento({ orcamentoId, aberto, onFechar, onAtualizado }) {
  const toast = useToast();
  const { usuario } = useAuth();
  const ehAdmin = usuario?.perfil === 'ADMIN';
  const [orcamento, setOrcamento] = useState(null);

  // Exclusão do orçamento: { impacto, confirmacao } enquanto o diálogo está aberto.
  const [exclusao, setExclusao] = useState(null);
  const [excluindo, setExcluindo] = useState(false);

  async function iniciarExclusao() {
    setExclusao({ carregando: true, impacto: null, confirmacao: '' });
    try {
      const impacto = await obterImpactoExclusao(orcamentoId);
      setExclusao({ carregando: false, impacto, confirmacao: '' });
    } catch (err) {
      setExclusao(null);
      toast.erro(err.message || 'Não foi possível consultar o orçamento.');
    }
  }

  async function confirmarExclusao() {
    setExcluindo(true);
    try {
      await excluirOrcamento(orcamentoId, { forcar: exclusao.impacto.possui_execucao });
      toast.sucesso(`Orçamento ${orcamento?.pep || ''} excluído.`);
      setExclusao(null);
      if (onAtualizado) onAtualizado();
      onFechar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível excluir o orçamento.');
    } finally {
      setExcluindo(false);
    }
  }
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [novoValor, setNovoValor] = useState('');
  const [observacao, setObservacao] = useState('');
  const [tipoAlteracao, setTipoAlteracao] = useState('REVISAO_SUBSTITUTIVA');
  const [statusInicial, setStatusInicial] = useState('APROVADO');
  const [anexo, setAnexo] = useState(null);
  const [erroRevisao, setErroRevisao] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Revisão com aprovação/rejeição em andamento (id).
  const [decidindo, setDecidindo] = useState(null);
  const campoAnexo = useRef(null);

  // Edição de uma revisão do histórico: { id, tipo, valor, observacao, status }.
  const [edicao, setEdicao] = useState(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState('');

  function iniciarEdicao(revisao) {
    setErroEdicao('');
    setEdicao({
      id: revisao.id,
      rotulo: revisao.rotulo || rotuloRevisao(revisao.numero_revisao),
      tipo: revisao.tipo_alteracao || 'REVISAO_SUBSTITUTIVA',
      valor: String(Number(revisao.valor)),
      observacao: revisao.observacao || '',
      status: revisao.status_aprovacao || 'APROVADO',
    });
  }

  async function salvarEdicao(evento) {
    evento.preventDefault();
    setErroEdicao('');

    const valor = Number(String(edicao.valor).replace(',', '.'));
    if (edicao.valor === '' || !Number.isFinite(valor)) {
      setErroEdicao('Informe o valor.');
      return;
    }
    if (edicao.tipo === 'ADITIVO_FINANCEIRO' && valor <= 0) {
      setErroEdicao('O valor do aditivo deve ser maior que zero.');
      return;
    }
    if (!edicao.observacao.trim()) {
      setErroEdicao('A observação (justificativa) é obrigatória.');
      return;
    }

    setSalvandoEdicao(true);
    try {
      const atualizado = await editarRevisao(orcamentoId, edicao.id, {
        tipo_alteracao: edicao.tipo,
        valor,
        observacao: edicao.observacao.trim(),
        status_aprovacao: edicao.status,
      });
      setOrcamento(atualizado);
      if (onAtualizado) onAtualizado();
      toast.sucesso(`${edicao.rotulo} atualizada.`);
      setEdicao(null);
    } catch (err) {
      const mensagem = err.message || 'Não foi possível editar a revisão.';
      setErroEdicao(mensagem);
      toast.erro(mensagem);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  function limparFormulario() {
    setNovoValor('');
    setObservacao('');
    setTipoAlteracao('REVISAO_SUBSTITUTIVA');
    setStatusInicial('APROVADO');
    setAnexo(null);
    setErroRevisao('');
    if (campoAnexo.current) campoAnexo.current.value = '';
  }

  function selecionarAnexo(evento) {
    const arquivo = evento.target.files?.[0] || null;
    if (arquivo && arquivo.size > TAMANHO_MAXIMO_ANEXO) {
      setErroRevisao('O anexo deve ter no máximo 10 MB.');
      evento.target.value = '';
      setAnexo(null);
      return;
    }
    setErroRevisao('');
    setAnexo(arquivo);
  }

  async function decidirRevisao(revisao, statusAprovacao) {
    setDecidindo(revisao.id);
    try {
      const atualizado = await atualizarStatusRevisao(orcamentoId, revisao.id, statusAprovacao);
      setOrcamento(atualizado);
      if (onAtualizado) onAtualizado();
      toast.sucesso(
        `${revisao.rotulo || rotuloRevisao(revisao.numero_revisao)} ${
          statusAprovacao === 'APROVADO' ? 'aprovada' : 'rejeitada'
        }.`
      );
    } catch (err) {
      toast.erro(err.message || 'Não foi possível atualizar a revisão.');
    } finally {
      setDecidindo(null);
    }
  }

  const carregar = useCallback(async () => {
    if (!orcamentoId) return;

    setCarregando(true);
    setErro('');
    try {
      const dados = await obterOrcamento(orcamentoId);
      setOrcamento(dados);
    } catch (err) {
      const mensagem = err.message || 'Não foi possível carregar o orçamento.';
      setErro(mensagem);
      toast.erro(mensagem);
    } finally {
      setCarregando(false);
    }
  }, [orcamentoId, toast]);

  useEffect(() => {
    if (aberto && orcamentoId) {
      limparFormulario();
      setEdicao(null);
      carregar();
    }
  }, [aberto, orcamentoId, carregar]);

  async function adicionarRevisao(evento) {
    evento.preventDefault();
    setErroRevisao('');

    if (novoValor === '') {
      setErroRevisao('Informe o novo valor.');
      return;
    }
    if (tipoAlteracao === 'ADITIVO_FINANCEIRO' && Number(novoValor) <= 0) {
      setErroRevisao('O valor do aditivo deve ser maior que zero.');
      return;
    }
    if (!observacao.trim()) {
      setErroRevisao('A observação (justificativa) é obrigatória.');
      return;
    }

    setSalvando(true);
    try {
      await registrarRevisao(orcamentoId, {
        valor: Number(novoValor),
        observacao: observacao.trim(),
        tipo_alteracao: tipoAlteracao,
        status_aprovacao: statusInicial,
        anexo,
      });
      limparFormulario();
      await carregar();
      if (onAtualizado) onAtualizado();
      toast.sucesso('Revisão de valor registrada com sucesso.');
    } catch (err) {
      const mensagem = err.message || 'Não foi possível registrar a revisão.';
      setErroRevisao(mensagem);
      toast.erro(mensagem);
    } finally {
      setSalvando(false);
    }
  }

  const revisoes = orcamento?.revisoes || [];
  const pendentes = revisoes.filter((revisao) => revisao.status_aprovacao === 'PENDENTE').length;
  const ehAditivo = tipoAlteracao === 'ADITIVO_FINANCEIRO';
  const fiscais = orcamento?.fiscais || [];
  const fotos = [orcamento?.foto_1, orcamento?.foto_2, orcamento?.foto_3].filter(Boolean);

  return (
    <ModalBase
      aberto={aberto}
      titulo={orcamento ? `Orçamento ${orcamento.pep}` : 'Detalhes do orçamento'}
      subtitulo={orcamento ? `SS ${orcamento.ss || '—'} · Criado em ${formatarDataHora(orcamento.created_at)}` : ''}
      onFechar={onFechar}
      tamanho="xl"
    >
      <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
        {carregando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
            <Spinner tamanho="lg" className="text-omega-600" />
            <p className="text-sm">Carregando orçamento...</p>
          </div>
        ) : erro ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {erro}
          </div>
        ) : orcamento ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={orcamento.status} />
                <span className="text-xs font-medium text-slate-500">
                  {revisoes.length} revisão(ões) registrada(s)
                  {pendentes > 0 ? ` · ${pendentes} pendente(s) de aprovação` : ''}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Valor atual</p>
                <p className="text-xl font-bold text-omega-700">{formatarMoeda(orcamento.valor)}</p>
              </div>
            </div>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Linha rotulo="PEP (CC)" valor={orcamento.pep} />
              <Linha rotulo="SS" valor={orcamento.ss} />
              <Linha rotulo="Cliente / Área" valor={orcamento.cliente} />
              <Linha rotulo="Endereço" valor={orcamento.endereco} />
              <Linha rotulo="Orçamentista" valor={orcamento.orcamentista_nome} />
              <Linha rotulo="Planejador" valor={orcamento.planejador_nome} />
              <Linha rotulo="ART" valor={orcamento.art} />
            </section>

            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Fiscais / Contatos
              </p>
              {fiscais.length > 0 ? (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {fiscais.map((fiscal, indice) => (
                    <li key={fiscal.id ?? indice} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2">
                      <span className="text-sm font-medium text-slate-700">{fiscal.nome}</span>
                      <span className="text-xs text-slate-500">{fiscal.contato || 'sem contato informado'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Nenhum fiscal informado.</p>
              )}
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Detalhamento do Serviço
                </p>
                <p className="whitespace-pre-line text-sm text-slate-700">{orcamento.descricao || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Documentos de Referência
                </p>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {orcamento.documentos_referencia || '—'}
                </p>
              </div>
            </section>

            {fotos.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Fotos da obra</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {fotos.map((url, indice) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-slate-200"
                    >
                      <img
                        src={url}
                        alt={`Foto ${indice + 1} da obra`}
                        loading="lazy"
                        className="h-32 w-full object-cover transition hover:scale-[1.03]"
                      />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Histórico de revisões
              </h3>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Rev', 'Tipo', 'Valor', 'Aprovação', 'Anexo', 'Autor', 'Data', 'Observação', 'Ações'].map((titulo) => (
                        <th
                          key={titulo}
                          scope="col"
                          className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"
                        >
                          {titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {revisoes.map((revisao) => {
                      const rotulo = revisao.rotulo || rotuloRevisao(revisao.numero_revisao);
                      const aditivo = revisao.tipo_alteracao === 'ADITIVO_FINANCEIRO';
                      const pendente = revisao.status_aprovacao === 'PENDENTE';
                      const rejeitada = revisao.status_aprovacao === 'REJEITADO';

                      return (
                        <Fragment key={revisao.id}>
                        <tr className={`align-top ${rejeitada ? 'bg-slate-50/70' : ''} ${edicao?.id === revisao.id ? 'bg-omega-50/50' : ''}`}>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">{rotulo}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Etiqueta
                              opcoes={TIPOS_ALTERACAO_REVISAO}
                              valor={revisao.tipo_alteracao}
                              padrao="REVISAO_SUBSTITUTIVA"
                            />
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-2 font-medium ${
                              rejeitada ? 'text-slate-400 line-through' : aditivo ? 'text-violet-700' : 'text-slate-700'
                            }`}
                            title={aditivo ? 'Soma ao valor base vigente' : 'Substitui o valor anterior'}
                          >
                            {aditivo ? '+ ' : ''}
                            {formatarMoeda(revisao.valor)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Etiqueta
                                opcoes={STATUS_APROVACAO_REVISAO}
                                valor={revisao.status_aprovacao}
                                padrao="APROVADO"
                              />
                              {pendente && decidindo === revisao.id ? (
                                <Spinner tamanho="sm" className="text-omega-600" />
                              ) : null}
                              {pendente && decidindo !== revisao.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => decidirRevisao(revisao, 'APROVADO')}
                                    disabled={Boolean(decidindo)}
                                    title="Aprovar revisão"
                                    aria-label={`Aprovar ${rotulo}`}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => decidirRevisao(revisao, 'REJEITADO')}
                                    disabled={Boolean(decidindo)}
                                    title="Rejeitar revisão"
                                    aria-label={`Rejeitar ${rotulo}`}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {revisao.anexo_url ? (
                              <a
                                href={revisao.anexo_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-omega-700 hover:underline"
                              >
                                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                                Ver anexo
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            {revisao.usuario_nome || (revisao.usuario_id ? `Usuário #${revisao.usuario_id}` : '—')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                            {formatarDataHora(revisao.created_at)}
                          </td>
                          <td className="min-w-[12rem] px-3 py-2 text-slate-600">{revisao.observacao}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <button
                              type="button"
                              onClick={() => (edicao?.id === revisao.id ? setEdicao(null) : iniciarEdicao(revisao))}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-omega-300 hover:text-omega-700"
                              title={`Editar ${rotulo}`}
                              aria-label={`Editar ${rotulo}`}
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                              Editar
                            </button>
                          </td>
                        </tr>
                        {edicao?.id === revisao.id ? (
                          <tr className="bg-omega-50/40">
                            <td colSpan={9} className="px-3 py-3">
                              <form onSubmit={salvarEdicao} className="space-y-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Editando {rotulo}
                                </p>
                                <div className="grid gap-3 sm:grid-cols-[14rem_10rem_10rem_1fr]">
                                  <div>
                                    <label className="rotulo" htmlFor="edTipo">Tipo de alteração</label>
                                    <select
                                      id="edTipo"
                                      className="campo"
                                      value={edicao.tipo}
                                      onChange={(e) => setEdicao({ ...edicao, tipo: e.target.value })}
                                    >
                                      {TIPOS_ALTERACAO_REVISAO.map((opcao) => (
                                        <option key={opcao.value} value={opcao.value}>
                                          {opcao.descricao}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="rotulo" htmlFor="edValor">Valor (R$)</label>
                                    <input
                                      id="edValor"
                                      type="number"
                                      step="0.01"
                                      className="campo"
                                      value={edicao.valor}
                                      onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <label className="rotulo" htmlFor="edStatus">Situação</label>
                                    <select
                                      id="edStatus"
                                      className="campo"
                                      value={edicao.status}
                                      onChange={(e) => setEdicao({ ...edicao, status: e.target.value })}
                                    >
                                      {STATUS_APROVACAO_REVISAO.map((opcao) => (
                                        <option key={opcao.value} value={opcao.value}>
                                          {opcao.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="rotulo" htmlFor="edObs">Justificativa / observação</label>
                                    <input
                                      id="edObs"
                                      className="campo"
                                      value={edicao.observacao}
                                      onChange={(e) => setEdicao({ ...edicao, observacao: e.target.value })}
                                    />
                                  </div>
                                </div>
                                {erroEdicao ? (
                                  <p role="alert" className="text-xs font-semibold text-red-600">{erroEdicao}</p>
                                ) : null}
                                <div className="flex gap-2">
                                  <button type="submit" className="btn-primario" disabled={salvandoEdicao}>
                                    {salvandoEdicao ? <Spinner tamanho="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                                    Salvar alterações
                                  </button>
                                  <button type="button" className="btn-neutro" onClick={() => setEdicao(null)} disabled={salvandoEdicao}>
                                    Cancelar
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
                      );
                    })}
                    {revisoes.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                          Nenhuma revisão registrada.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Valor vigente = última <strong>revisão</strong> aprovada + <strong>aditivos</strong> aprovados
                posteriores. Revisões pendentes ou rejeitadas não entram no cálculo.
              </p>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Adicionar nova revisão de valor
              </h3>

              <form className="space-y-3" onSubmit={adicionarRevisao}>
                <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2" disabled={salvando}>
                  <legend className="rotulo mb-1">Tipo de alteração *</legend>
                  {TIPOS_ALTERACAO_REVISAO.map((opcao) => (
                    <label
                      key={opcao.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium transition ${
                        tipoAlteracao === opcao.value
                          ? 'border-omega-500 text-slate-800 ring-2 ring-omega-500/20'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tipoAlteracao"
                        value={opcao.value}
                        checked={tipoAlteracao === opcao.value}
                        onChange={() => setTipoAlteracao(opcao.value)}
                        className="h-4 w-4 border-slate-300 text-omega-600 focus:ring-omega-500/40"
                      />
                      {opcao.descricao}
                    </label>
                  ))}
                </fieldset>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,160px)_1fr]">
                  <div>
                    <label className="rotulo" htmlFor="novoValor">
                      {ehAditivo ? 'Valor do aditivo (R$) *' : 'Novo valor (R$) *'}
                    </label>
                    <input
                      id="novoValor"
                      type="number"
                      min={ehAditivo ? '0.01' : '0'}
                      step="0.01"
                      className="campo"
                      placeholder="0,00"
                      value={novoValor}
                      onChange={(e) => setNovoValor(e.target.value)}
                      disabled={salvando}
                    />
                  </div>

                  <div>
                    <label className="rotulo" htmlFor="statusInicial">
                      Status inicial
                    </label>
                    <select
                      id="statusInicial"
                      className="campo"
                      value={statusInicial}
                      onChange={(e) => setStatusInicial(e.target.value)}
                      disabled={salvando}
                    >
                      <option value="PENDENTE">Pendente</option>
                      <option value="APROVADO">Aprovada</option>
                    </select>
                  </div>

                  <div>
                    <label className="rotulo" htmlFor="observacao">
                      Justificativa / Observação *
                    </label>
                    <input
                      id="observacao"
                      className="campo"
                      placeholder="Motivo da alteração de valor"
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      disabled={salvando}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="rotulo" htmlFor="anexoRevisao">
                      Anexo comprobatório (PDF ou imagem, até 10 MB)
                    </label>
                    <input
                      id="anexoRevisao"
                      ref={campoAnexo}
                      type="file"
                      accept={ACCEPT_ANEXO}
                      onChange={selecionarAnexo}
                      disabled={salvando}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-50"
                    />
                  </div>

                  <button type="submit" className="btn-primario w-full sm:w-auto" disabled={salvando}>
                    {salvando ? <Spinner tamanho="sm" /> : <FilePlus2 className="h-4 w-4" aria-hidden="true" />}
                    {salvando ? 'Registrando...' : ehAditivo ? 'Registrar aditivo' : 'Registrar revisão'}
                  </button>
                </div>

                {statusInicial === 'PENDENTE' ? (
                  <p className="text-[11px] text-amber-700">
                    Revisões pendentes não alteram o valor vigente até serem aprovadas no histórico acima.
                  </p>
                ) : null}
              </form>

              {erroRevisao ? (
                <div
                  role="alert"
                  className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  {erroRevisao}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
        {ehAdmin && orcamento ? (
          <button type="button" className="btn-perigo" onClick={iniciarExclusao} disabled={Boolean(exclusao)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Excluir orçamento
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn-neutro" onClick={onFechar}>
          Fechar
        </button>
      </div>

      <ModalBase
        aberto={Boolean(exclusao)}
        titulo="Excluir orçamento?"
        subtitulo={orcamento ? `${orcamento.pep} · SS ${orcamento.ss || '—'}` : ''}
        onFechar={() => (excluindo ? null : setExclusao(null))}
        tamanho="md"
      >
        {exclusao?.carregando ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
            <Spinner tamanho="md" className="text-omega-600" />
            Verificando o que será apagado...
          </div>
        ) : exclusao?.impacto ? (
          <div className="space-y-3 p-5">
            <p className="text-sm text-slate-700">
              O orçamento <strong>{exclusao.impacto.orcamento.pep}</strong> será removido
              {exclusao.impacto.obra ? ' junto com a obra vinculada' : ''}. Esta ação <strong>não pode ser desfeita</strong>.
            </p>

            {exclusao.impacto.itens.length > 0 ? (
              <ul className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700">
                {exclusao.impacto.itens.map((item) => (
                  <li key={item.chave} className="flex justify-between py-0.5">
                    <span>{item.rotulo}</span>
                    <span className="font-bold tabular-nums">{item.total}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {exclusao.impacto.possui_execucao ? (
              <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-800">
                  Esta obra já tem registros de execução, que serão apagados. Para confirmar, digite o PEP{' '}
                  <strong>{exclusao.impacto.orcamento.pep}</strong>.
                </p>
                <input
                  className="campo"
                  value={exclusao.confirmacao}
                  onChange={(e) => setExclusao({ ...exclusao, confirmacao: e.target.value })}
                  placeholder="Digite o PEP para confirmar"
                  aria-label="Digite o PEP para confirmar a exclusão"
                />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-neutro" onClick={() => setExclusao(null)} disabled={excluindo}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-perigo"
                onClick={confirmarExclusao}
                disabled={
                  excluindo ||
                  (exclusao.impacto.possui_execucao &&
                    exclusao.confirmacao.trim() !== String(exclusao.impacto.orcamento.pep).trim())
                }
              >
                {excluindo ? <Spinner tamanho="sm" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        ) : null}
      </ModalBase>
    </ModalBase>
  );
}

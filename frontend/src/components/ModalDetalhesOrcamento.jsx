import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FilePlus2, Paperclip, X } from 'lucide-react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import StatusBadge from './StatusBadge.jsx';
import {
  adicionarRevisao as registrarRevisao,
  atualizarStatusRevisao,
  obterOrcamento,
} from '../hooks/useOrcamentos.js';
import { useToast } from '../context/ToastContext.jsx';
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
  const [orcamento, setOrcamento] = useState(null);
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
                      {['Rev', 'Tipo', 'Valor', 'Aprovação', 'Anexo', 'Autor', 'Data', 'Observação'].map((titulo) => (
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
                        <tr key={revisao.id} className={`align-top ${rejeitada ? 'bg-slate-50/70' : ''}`}>
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
                        </tr>
                      );
                    })}
                    {revisoes.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
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

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
        <button type="button" className="btn-neutro" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </ModalBase>
  );
}

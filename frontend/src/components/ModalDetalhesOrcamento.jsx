import { useCallback, useEffect, useState } from 'react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import StatusBadge from './StatusBadge.jsx';
import { adicionarRevisao as registrarRevisao, obterOrcamento } from '../hooks/useOrcamentos.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatarDataHora, formatarMoeda, rotuloRevisao } from '../utils/formatters.js';

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
  const [erroRevisao, setErroRevisao] = useState('');
  const [salvando, setSalvando] = useState(false);

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
      setNovoValor('');
      setObservacao('');
      setErroRevisao('');
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
    if (!observacao.trim()) {
      setErroRevisao('A observação (justificativa) é obrigatória.');
      return;
    }

    setSalvando(true);
    try {
      await registrarRevisao(orcamentoId, {
        valor: Number(novoValor),
        observacao: observacao.trim(),
      });
      setNovoValor('');
      setObservacao('');
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

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Rev
                      </th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Valor
                      </th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Autor
                      </th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Data
                      </th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Observação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {revisoes.map((revisao) => (
                      <tr key={revisao.id} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">
                          {revisao.rotulo || rotuloRevisao(revisao.numero_revisao)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">
                          {formatarMoeda(revisao.valor)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {revisao.usuario_nome || (revisao.usuario_id ? `Usuário #${revisao.usuario_id}` : '—')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                          {formatarDataHora(revisao.created_at)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{revisao.observacao}</td>
                      </tr>
                    ))}
                    {revisoes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                          Nenhuma revisão registrada.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Adicionar nova revisão de valor
              </h3>

              <form className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,180px)_1fr_auto]" onSubmit={adicionarRevisao}>
                <div>
                  <label className="rotulo" htmlFor="novoValor">
                    Novo valor (R$)
                  </label>
                  <input
                    id="novoValor"
                    type="number"
                    min="0"
                    step="0.01"
                    className="campo"
                    placeholder="0,00"
                    value={novoValor}
                    onChange={(e) => setNovoValor(e.target.value)}
                    disabled={salvando}
                  />
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

                <div className="flex items-end">
                  <button type="submit" className="btn-primario w-full sm:w-auto" disabled={salvando}>
                    {salvando ? <Spinner tamanho="sm" /> : null}
                    {salvando ? 'Registrando revisão...' : 'Registrar revisão'}
                  </button>
                </div>
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

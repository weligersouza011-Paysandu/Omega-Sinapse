import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, LockKeyhole } from 'lucide-react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import Dropdown from './Dropdown.jsx';
import Autocomplete from './Autocomplete.jsx';
import { atualizarOrcamento, obterOrcamento, useOpcoesOrcamento } from '../hooks/useOrcamentos.js';
import { STATUS_OPCOES, STATUS_INICIAL } from '../utils/status.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatarMoeda } from '../utils/formatters.js';

/** Linha vazia do repetidor de fiscais. */
function criarFiscal() {
  return { nome: '', contato: '' };
}

/** Normaliza texto para comparar nomes de fiscal (sem acentos, minúsculas). */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Modal de Edição Rápida do orçamento.
 *
 * Permite ajustar apenas os dados cadastrais (PEP, SS, endereço, fiscais,
 * documentos de referência e status). O valor é exibido como somente leitura:
 * qualquer alteração de preço deve passar pelo fluxo de Revisões de Valor,
 * preservando a rastreabilidade financeira (Rev 00, Rev 01, ...).
 */
export default function EditarOrcamentoModal({ aberto, orcamentoId, onFechar, onSalvo, onAbrirRevisoes }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [novoPep, setNovoPep] = useState(false);

  // PEPs e fiscais do histórico orientam o dropdown e o autocompletar.
  const { peps, fiscais, carregando: carregandoOpcoes } = useOpcoesOrcamento(aberto);

  const carregar = useCallback(async () => {
    if (!orcamentoId) return;

    setCarregando(true);
    setErroCarga('');
    try {
      const dados = await obterOrcamento(orcamentoId);
      setForm({
        ss: dados.ss || '',
        pep: dados.pep || '',
        endereco: dados.endereco || '',
        documentos_referencia: dados.documentos_referencia || '',
        status: dados.status || STATUS_INICIAL,
        fiscais: (dados.fiscais || []).length
          ? dados.fiscais.map((fiscal) => ({ nome: fiscal.nome || '', contato: fiscal.contato || '' }))
          : [criarFiscal()],
        valor: Number(dados.valor) || 0,
      });
    } catch (err) {
      setErroCarga(err.message || 'Não foi possível carregar o orçamento.');
    } finally {
      setCarregando(false);
    }
  }, [orcamentoId]);

  useEffect(() => {
    if (aberto && orcamentoId) {
      setForm(null);
      setErro('');
      setNovoPep(false);
      setEnviando(false);
      carregar();
    }
  }, [aberto, orcamentoId, carregar]);

  function alterarCampo(campo, valor) {
    setForm((anterior) => ({ ...anterior, [campo]: valor }));
  }

  /* ----------------------------- Fiscais ------------------------------ */

  function alterarFiscal(indice, campo, valor) {
    setForm((anterior) => {
      const lista = [...anterior.fiscais];
      const atual = { ...lista[indice], [campo]: valor };

      // Autofill: nome reconhecido no histórico copia o contato cadastrado.
      if (campo === 'nome') {
        const conhecido = fiscais.find((fiscal) => normalizar(fiscal.nome) === normalizar(valor));
        if (conhecido?.contato) atual.contato = conhecido.contato;
      }

      lista[indice] = atual;
      return { ...anterior, fiscais: lista };
    });
  }

  function selecionarFiscal(indice, opcao) {
    setForm((anterior) => {
      const lista = [...anterior.fiscais];
      lista[indice] = { nome: opcao.nome, contato: opcao.contato || '' };
      return { ...anterior, fiscais: lista };
    });
  }

  function adicionarFiscal() {
    setForm((anterior) => ({ ...anterior, fiscais: [...anterior.fiscais, criarFiscal()] }));
  }

  function removerFiscal(indice) {
    setForm((anterior) => ({
      ...anterior,
      fiscais: anterior.fiscais.filter((_, posicao) => posicao !== indice),
    }));
  }

  /* ------------------------------ PEP --------------------------------- */

  function alternarNovoPep() {
    setNovoPep((anterior) => !anterior);
  }

  /** Ignora linhas vazias do repetidor; valida as que foram usadas. */
  function fiscaisPreenchidos() {
    return form.fiscais.filter((fiscal) => fiscal.nome.trim() || fiscal.contato.trim());
  }

  function validar() {
    const obrigatorios = [
      ['pep', 'PEP (CC)'],
      ['endereco', 'Endereço'],
      ['documentos_referencia', 'Documentos de Referência'],
    ];
    const faltando = obrigatorios.find(([campo]) => !String(form[campo]).trim());
    if (faltando) return `O campo ${faltando[1]} é obrigatório.`;

    const lista = fiscaisPreenchidos();
    if (lista.length === 0) return 'Informe ao menos um fiscal com nome e contato.';

    const incompleto = lista.find((fiscal) => !fiscal.nome.trim() || !fiscal.contato.trim());
    if (incompleto) {
      return incompleto.nome.trim()
        ? `Informe o contato do fiscal ${incompleto.nome.trim()}.`
        : 'Informe o nome de todos os fiscais adicionados.';
    }

    return '';
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    const mensagemValidacao = validar();
    if (mensagemValidacao) {
      setErro(mensagemValidacao);
      return;
    }

    // O valor NÃO entra no payload: alterações de preço passam por Revisões.
    const payload = {
      pep: form.pep.trim(),
      ss: form.ss.trim(),
      endereco: form.endereco.trim(),
      documentos_referencia: form.documentos_referencia.trim(),
      status: form.status,
      fiscais: fiscaisPreenchidos().map((fiscal) => ({
        nome: fiscal.nome.trim(),
        contato: fiscal.contato.trim(),
      })),
    };

    setEnviando(true);
    try {
      const atualizado = await atualizarOrcamento(orcamentoId, payload);
      onSalvo(atualizado);
      toast.sucesso('Orçamento atualizado com sucesso.');
      onFechar();
    } catch (err) {
      const mensagem = err.message || 'Não foi possível salvar as alterações.';
      setErro(mensagem);
      toast.erro(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  // Garante que o PEP atual apareça no dropdown mesmo fora do histórico.
  const opcoesPep = useMemo(() => {
    const base = peps.map((pep) => ({ value: pep, label: pep }));
    if (form?.pep && !peps.includes(form.pep)) {
      return [{ value: form.pep, label: form.pep }, ...base];
    }
    return base;
  }, [peps, form?.pep]);

  const opcoesStatus = STATUS_OPCOES.map((opcao) => ({
    value: opcao.value,
    label: opcao.label,
    descricao: opcao.descricao,
    cor: opcao.cor,
  }));

  return (
    <ModalBase
      aberto={aberto}
      titulo="Edição Rápida do Orçamento"
      subtitulo="Dados cadastrais do registro. Campos com * são obrigatórios."
      onFechar={onFechar}
      tamanho="lg"
    >
      {carregando || !form ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
          {erroCarga ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {erroCarga}
            </div>
          ) : (
            <>
              <Spinner tamanho="lg" className="text-omega-600" />
              <p className="text-sm">Carregando orçamento...</p>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={aoEnviar} noValidate>
          <div className="max-h-[64vh] space-y-5 overflow-y-auto px-5 py-5">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="rotulo" htmlFor="edit-ss">
                  SS (Solicitação de Serviço)
                </label>
                <input
                  id="edit-ss"
                  className="campo"
                  placeholder="Ex.: SS043/25"
                  value={form.ss}
                  onChange={(e) => alterarCampo('ss', e.target.value)}
                  disabled={enviando}
                />
              </div>

              <div>
                <label className="rotulo" htmlFor="edit-pep">
                  PEP (CC) *
                </label>
                <div className="flex items-center gap-2">
                  {novoPep ? (
                    <input
                      id="edit-pep"
                      className="campo"
                      placeholder="Digite o PEP"
                      value={form.pep}
                      onChange={(e) => alterarCampo('pep', e.target.value)}
                      disabled={enviando}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <Dropdown
                        id="edit-pep"
                        value={form.pep}
                        onChange={(valor) => alterarCampo('pep', valor)}
                        opcoes={opcoesPep}
                        carregando={carregandoOpcoes}
                        placeholder="Selecione o PEP..."
                        textoVazio="Nenhum PEP cadastrado."
                        disabled={enviando}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={alternarNovoPep}
                    disabled={enviando}
                    title={novoPep ? 'Voltar para a lista de PEPs' : 'Informar outro PEP'}
                    aria-label={novoPep ? 'Voltar para a lista de PEPs' : 'Informar outro PEP'}
                    className={[
                      'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md border',
                      'text-lg font-bold leading-none transition focus:outline-none focus:ring-2 focus:ring-omega-500/30',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      novoPep
                        ? 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'border-omega-500/40 bg-omega-50 text-omega-700 hover:bg-omega-100',
                    ].join(' ')}
                  >
                    {novoPep ? '−' : '+'}
                  </button>
                </div>
              </div>

              <div>
                <label className="rotulo" htmlFor="edit-status">
                  Status *
                </label>
                <Dropdown
                  id="edit-status"
                  value={form.status}
                  onChange={(valor) => alterarCampo('status', valor)}
                  opcoes={opcoesStatus}
                  placeholder="Selecione o status..."
                  disabled={enviando}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Local e Fiscais</h3>

              <div>
                <label className="rotulo" htmlFor="edit-endereco">
                  Endereço *
                </label>
                <input
                  id="edit-endereco"
                  className="campo"
                  placeholder="Endereço da obra/serviço"
                  value={form.endereco}
                  onChange={(e) => alterarCampo('endereco', e.target.value)}
                  disabled={enviando}
                />
              </div>

              <div className="space-y-3">
                {form.fiscais.map((fiscal, indice) => (
                  <div key={indice} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <label className="rotulo" htmlFor={`edit-fiscal-nome-${indice}`}>
                        Nome do Fiscal {indice === 0 ? '*' : ''}
                      </label>
                      <Autocomplete
                        id={`edit-fiscal-nome-${indice}`}
                        value={fiscal.nome}
                        onChange={(valor) => alterarFiscal(indice, 'nome', valor)}
                        onSelecionar={(opcao) => selecionarFiscal(indice, opcao)}
                        opcoes={fiscais}
                        placeholder="Selecione ou digite o fiscal"
                        textoVazio={
                          fiscais.length === 0 ? 'Nenhum fiscal no histórico.' : 'Nenhum fiscal encontrado.'
                        }
                        disabled={enviando}
                      />
                    </div>

                    <div>
                      <label className="rotulo" htmlFor={`edit-fiscal-contato-${indice}`}>
                        Contato do Fiscal {indice === 0 ? '*' : ''}
                      </label>
                      <input
                        id={`edit-fiscal-contato-${indice}`}
                        className="campo"
                        placeholder="Telefone ou e-mail"
                        value={fiscal.contato}
                        onChange={(e) => alterarFiscal(indice, 'contato', e.target.value)}
                        disabled={enviando}
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removerFiscal(indice)}
                        disabled={enviando || form.fiscais.length === 1}
                        title="Remover fiscal"
                        aria-label={`Remover fiscal ${indice + 1}`}
                        className={[
                          'flex h-[38px] w-[38px] items-center justify-center rounded-md border border-slate-300',
                          'bg-white text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600',
                          'focus:outline-none focus:ring-2 focus:ring-red-300/40',
                          'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:bg-white disabled:hover:text-slate-500',
                        ].join(' ')}
                      >
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                          <path d="M5.5 5.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={adicionarFiscal}
                  disabled={enviando}
                  className={[
                    'inline-flex items-center gap-2 rounded-md border border-dashed border-omega-500/50 bg-omega-50/60 px-3 py-2',
                    'text-xs font-semibold text-omega-700 transition hover:bg-omega-100',
                    'focus:outline-none focus:ring-2 focus:ring-omega-500/30 disabled:cursor-not-allowed disabled:opacity-50',
                  ].join(' ')}
                >
                  <span aria-hidden="true" className="text-base font-bold leading-none">
                    +
                  </span>
                  Adicionar Fiscal
                </button>
              </div>
            </section>

            <section>
              <label className="rotulo" htmlFor="edit-documentos">
                Documentos de Referência *
              </label>
              <textarea
                id="edit-documentos"
                rows={2}
                className="campo resize-y"
                placeholder="Normas, desenhos, memoriais (referências)"
                value={form.documentos_referencia}
                onChange={(e) => alterarCampo('documentos_referencia', e.target.value)}
                disabled={enviando}
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <label className="rotulo" htmlFor="edit-valor">
                    Valor do Contrato (R$)
                  </label>
                  <input
                    id="edit-valor"
                    className="campo max-w-[220px] cursor-not-allowed bg-slate-100 text-slate-500"
                    value={formatarMoeda(form.valor)}
                    readOnly
                    disabled
                  />
                </div>

                <div className="flex items-center gap-2 text-slate-500">
                  <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="text-xs font-medium">Campo somente leitura</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <p className="text-xs text-slate-500">
                  Alterações de preço devem ser feitas via revisão, para manter o histórico
                  (Rev 00, Rev 01...) e a rastreabilidade financeira.
                </p>
                {onAbrirRevisoes ? (
                  <button
                    type="button"
                    className="btn-neutro shrink-0"
                    onClick={() => {
                      onFechar();
                      onAbrirRevisoes(orcamentoId);
                    }}
                  >
                    <History className="h-4 w-4" aria-hidden="true" />
                    Gerenciar revisões
                  </button>
                ) : null}
              </div>
            </section>

            {erro ? (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
              >
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
              {enviando ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      )}
    </ModalBase>
  );
}

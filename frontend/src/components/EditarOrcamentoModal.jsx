import { useCallback, useEffect, useRef, useState } from 'react';
import { History, ImagePlus, LockKeyhole, RefreshCw, Trash2 } from 'lucide-react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import Dropdown from './Dropdown.jsx';
import Autocomplete from './Autocomplete.jsx';
import { atualizarOrcamento, obterOrcamento, useOpcoesOrcamento } from '../hooks/useOrcamentos.js';
import { enviarFotosObra } from '../hooks/useObras.js';
import { STATUS_OPCOES, STATUS_INICIAL } from '../utils/status.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatarMoeda } from '../utils/formatters.js';

/** Linha vazia do repetidor de fiscais. */
function criarFiscal() {
  return { nome: '', contato: '' };
}

const TOTAL_FOTOS = 3;
const TAMANHO_MAXIMO_FOTO = 10 * 1024 * 1024;

/** Slots de foto a partir do orçamento: { url, arquivo, preview }. */
function slotsDeFotos(dados) {
  const urls = [dados.foto_1, dados.foto_2, dados.foto_3];
  return urls.map((url) => ({ url: url || '', arquivo: null, preview: '' }));
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
  const [novoPepTexto, setNovoPepTexto] = useState('');
  const [fotos, setFotos] = useState(() => slotsDeFotos({}));
  const camposFoto = useRef([]);

  // PEPs e fiscais do histórico orientam as sugestões e o autocompletar.
  const { peps: pepsHistorico, fiscais } = useOpcoesOrcamento(aberto);

  const carregar = useCallback(async () => {
    if (!orcamentoId) return;

    setCarregando(true);
    setErroCarga('');
    try {
      const dados = await obterOrcamento(orcamentoId);
      setForm({
        ss: dados.ss || '',
        // PEPs (CC): vários por orçamento, um ativo por vez.
        peps: (dados.peps || []).length
          ? dados.peps.map((item) => ({ pep: item.pep, ativo: Boolean(item.ativo) }))
          : [{ pep: dados.pep || '', ativo: true }],
        endereco: dados.endereco || '',
        documentos_referencia: dados.documentos_referencia || '',
        status: dados.status || STATUS_INICIAL,
        fiscais: (dados.fiscais || []).length
          ? dados.fiscais.map((fiscal) => ({ nome: fiscal.nome || '', contato: fiscal.contato || '' }))
          : [criarFiscal()],
        valor: Number(dados.valor) || 0,
      });
      setFotos(slotsDeFotos(dados));
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
      setNovoPepTexto('');
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

  /* ------------------------------ PEPs -------------------------------- */

  /** Torna um PEP o ativo (os demais ficam desativados). */
  function ativarPep(indice) {
    setForm((anterior) => ({
      ...anterior,
      peps: anterior.peps.map((item, posicao) => ({ ...item, ativo: posicao === indice })),
    }));
  }

  function removerPep(indice) {
    setForm((anterior) => ({ ...anterior, peps: anterior.peps.filter((_, posicao) => posicao !== indice) }));
  }

  function adicionarPep() {
    const pep = novoPepTexto.trim();
    if (!pep) return;
    if (form.peps.some((item) => item.pep.toLowerCase() === pep.toLowerCase())) {
      setErro(`O PEP ${pep} já está na lista.`);
      return;
    }
    setErro('');
    setForm((anterior) => ({
      ...anterior,
      // O primeiro PEP cadastrado já nasce ativo; os seguintes entram desativados.
      peps: [...anterior.peps, { pep, ativo: anterior.peps.length === 0 }],
    }));
    setNovoPepTexto('');
  }

  /* ------------------------------ Fotos ------------------------------- */

  function trocarFoto(indice, arquivo) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) {
      setErro('Escolha um arquivo de imagem (JPG, PNG ou WEBP).');
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_FOTO) {
      setErro('Cada foto deve ter no máximo 10 MB.');
      return;
    }
    setErro('');
    setFotos((anterior) =>
      anterior.map((slot, posicao) => {
        if (posicao !== indice) return slot;
        if (slot.preview) URL.revokeObjectURL(slot.preview);
        return { url: slot.url, arquivo, preview: URL.createObjectURL(arquivo) };
      })
    );
  }

  function removerFoto(indice) {
    setFotos((anterior) =>
      anterior.map((slot, posicao) => {
        if (posicao !== indice) return slot;
        if (slot.preview) URL.revokeObjectURL(slot.preview);
        return { url: '', arquivo: null, preview: '' };
      })
    );
  }

  const fotosPreenchidas = fotos.filter((slot) => slot.arquivo || slot.url).length;

  /** Ignora linhas vazias do repetidor; valida as que foram usadas. */
  function fiscaisPreenchidos() {
    return form.fiscais.filter((fiscal) => fiscal.nome.trim() || fiscal.contato.trim());
  }

  function validar() {
    const pepsValidos = form.peps.filter((item) => item.pep.trim());
    if (pepsValidos.length === 0) return 'Informe ao menos um PEP (CC).';
    if (pepsValidos.filter((item) => item.ativo).length !== 1) return 'Mantenha exatamente um PEP ativo.';
    if (fotosPreenchidas === 0) return 'Mantenha ao menos uma foto.';

    const obrigatorios = [
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
      peps: form.peps
        .filter((item) => item.pep.trim())
        .map((item) => ({ pep: item.pep.trim(), ativo: item.ativo })),
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
      // Fotos novas sobem primeiro; a lista final é compactada (foto 1 = principal).
      const urls = [];
      for (const slot of fotos) {
        if (slot.arquivo) {
          // eslint-disable-next-line no-await-in-loop
          const enviado = await enviarFotosObra([slot.arquivo]);
          urls.push(enviado.foto_1);
        } else if (slot.url) {
          urls.push(slot.url);
        }
      }
      payload.foto_1 = urls[0] || '';
      payload.foto_2 = urls[1] || '';
      payload.foto_3 = urls[2] || '';

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
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">PEPs (CC) *</h3>
              <p className="text-[11px] text-slate-500">
                Cadastre mais de um PEP e escolha qual está ativo agora. Só um fica ativo por vez; ele aparece nos
                cards e nas listas.
              </p>

              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {form.peps.map((item, indice) => (
                  <li key={`${item.pep}-${indice}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className={`min-w-0 truncate text-sm font-semibold ${item.ativo ? 'text-slate-800' : 'text-slate-400'}`}>
                      {item.pep}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.ativo}
                        aria-label={`${item.ativo ? 'PEP ativo' : 'Ativar PEP'} ${item.pep}`}
                        onClick={() => ativarPep(indice)}
                        disabled={enviando || item.ativo}
                        title={item.ativo ? 'PEP ativo (ative outro para trocar)' : 'Tornar este PEP o ativo'}
                        className={`relative h-5 w-9 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40 ${
                          item.ativo ? 'bg-emerald-500' : 'bg-slate-300 hover:bg-slate-400'
                        } disabled:cursor-default`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                            item.ativo ? 'left-[1.1rem]' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <span className={`w-14 text-[10px] font-bold uppercase tracking-wide ${item.ativo ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {item.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removerPep(indice)}
                        disabled={enviando || item.ativo || form.peps.length === 1}
                        title={item.ativo ? 'Ative outro PEP para poder remover este' : 'Remover PEP'}
                        aria-label={`Remover PEP ${item.pep}`}
                        className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <input
                  className="campo"
                  list="edit-peps-sugestoes"
                  placeholder="Novo PEP (CC)"
                  value={novoPepTexto}
                  onChange={(e) => setNovoPepTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarPep();
                    }
                  }}
                  disabled={enviando}
                  aria-label="Novo PEP (CC)"
                />
                <datalist id="edit-peps-sugestoes">
                  {pepsHistorico.map((pep) => (
                    <option key={pep} value={pep} />
                  ))}
                </datalist>
                <button type="button" className="btn-neutro shrink-0" onClick={adicionarPep} disabled={enviando || !novoPepTexto.trim()}>
                  Adicionar PEP
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Fotos (até {TOTAL_FOTOS})</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {fotos.map((slot, indice) => {
                  const imagem = slot.preview || slot.url;
                  const rotulo = indice === 0 ? 'Foto principal' : `Foto ${indice + 1}`;
                  return (
                    <div key={indice} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                      <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {rotulo}
                        {slot.arquivo ? <span className="text-omega-700">nova</span> : null}
                      </p>
                      <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-slate-200">
                        {imagem ? (
                          <img src={imagem} alt={rotulo} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[11px] text-slate-400">Sem foto</span>
                        )}
                      </div>
                      <input
                        ref={(el) => {
                          camposFoto.current[indice] = el;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          trocarFoto(indice, e.target.files?.[0] || null);
                          e.target.value = '';
                        }}
                        disabled={enviando}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-neutro !px-2 !py-1 !text-[11px]"
                          onClick={() => camposFoto.current[indice]?.click()}
                          disabled={enviando}
                        >
                          {imagem ? (
                            <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ImagePlus className="h-3 w-3" aria-hidden="true" />
                          )}
                          {imagem ? 'Trocar' : 'Adicionar'}
                        </button>
                        {imagem ? (
                          <button
                            type="button"
                            className="btn-neutro !px-2 !py-1 !text-[11px] hover:!border-red-300 hover:!text-red-600"
                            onClick={() => removerFoto(indice)}
                            disabled={enviando || fotosPreenchidas === 1}
                            title={fotosPreenchidas === 1 ? 'Mantenha ao menos uma foto' : 'Remover foto'}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                JPG, PNG ou WEBP, até 10 MB cada. Ao salvar, as fotos sobem na ordem e a primeira vira a principal.
              </p>
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

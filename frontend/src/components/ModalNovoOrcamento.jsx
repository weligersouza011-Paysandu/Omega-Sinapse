import { useEffect, useState } from 'react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import Dropdown from './Dropdown.jsx';
import Autocomplete from './Autocomplete.jsx';
import { criarOrcamento, useOpcoesOrcamento } from '../hooks/useOrcamentos.js';
import { STATUS_OPCOES, STATUS_INICIAL } from '../utils/status.js';
import { useToast } from '../context/ToastContext.jsx';

/** Cliente/área pré-preenchido no formulário. */
const CLIENTE_PADRAO = 'Vale';

/** Linha vazia do repetidor de fiscais. */
function criarFiscal() {
  return { nome: '', contato: '' };
}

/** Estado inicial do formulário (função para não compartilhar referências). */
function criarEstadoInicial() {
  return {
    ss: '',
    pep: '',
    cliente: CLIENTE_PADRAO,
    endereco: '',
    descricao: '',
    documentos_referencia: '',
    valor: '',
    status: STATUS_INICIAL,
    observacao_inicial: '',
    fiscais: [criarFiscal()],
  };
}

/** Campos de texto simples, na ordem em que a validação é apresentada. */
const OBRIGATORIOS = [
  ['pep', 'PEP (CC)'],
  ['cliente', 'Cliente / Área'],
  ['endereco', 'Endereço'],
  ['descricao', 'Detalhamento do Serviço'],
  ['documentos_referencia', 'Documentos de Referência'],
  ['valor', 'Valor Inicial'],
  ['observacao_inicial', 'Justificativa / Observação da Revisão'],
];

/** Campos enviados diretamente no FormData (quando preenchidos). */
const CAMPOS_TEXTO = [
  'ss',
  'cliente',
  'endereco',
  'descricao',
  'documentos_referencia',
  'status',
  'observacao_inicial',
];

/** Normaliza texto para comparar nomes de fiscal (sem acentos, minúsculas). */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Modal de abertura de orçamento com múltiplos fiscais e até 3 fotos. */
export default function ModalNovoOrcamento({ aberto, onFechar, onCriado }) {
  const toast = useToast();
  const [form, setForm] = useState(criarEstadoInicial);
  const [arquivos, setArquivos] = useState([null, null, null]);
  const [previews, setPreviews] = useState([null, null, null]);
  const [novoPep, setNovoPep] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // PEPs e fiscais já cadastrados: alimentam os dropdowns e o autocompletar.
  const { peps, fiscais, carregando: carregandoOpcoes } = useOpcoesOrcamento(aberto);

  // Limpa o formulário ao reabrir.
  useEffect(() => {
    if (aberto) {
      setForm(criarEstadoInicial());
      setArquivos([null, null, null]);
      setPreviews([null, null, null]);
      setNovoPep(false);
      setErro('');
      setEnviando(false);
    }
  }, [aberto]);

  // Libera as URLs de preview quando o componente desmonta.
  useEffect(
    () => () => {
      previews.forEach((url) => url && URL.revokeObjectURL(url));
    },
    [previews]
  );

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

  /** Alterna entre o dropdown de PEPs e o cadastro de um novo código. */
  function alternarNovoPep() {
    setNovoPep((anterior) => !anterior);
    setForm((anterior) => ({ ...anterior, pep: '' }));
  }

  /* ----------------------------- Fotos -------------------------------- */

  function selecionarFoto(indice, file) {
    setArquivos((anterior) => {
      const proximo = [...anterior];
      proximo[indice] = file || null;
      return proximo;
    });
    setPreviews((anterior) => {
      const proximo = [...anterior];
      if (anterior[indice]) URL.revokeObjectURL(anterior[indice]);
      proximo[indice] = file ? URL.createObjectURL(file) : null;
      return proximo;
    });
  }

  /* --------------------------- Validação ------------------------------ */

  /** Ignora linhas totalmente vazias do repetidor; exige nome e contato nas usadas. */
  function fiscaisPreenchidos() {
    return form.fiscais.filter((fiscal) => fiscal.nome.trim() || fiscal.contato.trim());
  }

  /** Valida os campos obrigatórios e devolve a primeira mensagem de erro. */
  function validarFormulario() {
    const faltando = OBRIGATORIOS.find(([campo]) => !String(form[campo]).trim());
    if (faltando) {
      return `O campo ${faltando[1]} é obrigatório.`;
    }

    const valor = Number(form.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      return 'O Valor Inicial deve ser um número maior ou igual a zero.';
    }

    const fiscaisValidos = fiscaisPreenchidos();
    if (fiscaisValidos.length === 0) {
      return 'Informe ao menos um fiscal com nome e contato.';
    }

    const incompleto = fiscaisValidos.find((fiscal) => !fiscal.nome.trim() || !fiscal.contato.trim());
    if (incompleto) {
      return incompleto.nome.trim()
        ? `Informe o contato do fiscal ${incompleto.nome.trim()}.`
        : 'Informe o nome de todos os fiscais adicionados.';
    }

    if (!arquivos[0]) {
      return 'A Foto 1 é obrigatória.';
    }

    return '';
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    const mensagemValidacao = validarFormulario();
    if (mensagemValidacao) {
      setErro(mensagemValidacao);
      return;
    }

    const dados = new FormData();
    dados.append('pep', form.pep.trim());
    dados.append('valor', String(form.valor));

    CAMPOS_TEXTO.forEach((campo) => {
      if (String(form[campo]).trim()) dados.append(campo, String(form[campo]).trim());
    });

    dados.append(
      'fiscais',
      JSON.stringify(
        fiscaisPreenchidos().map((fiscal) => ({
          nome: fiscal.nome.trim(),
          contato: fiscal.contato.trim(),
        }))
      )
    );

    arquivos.forEach((file, indice) => {
      if (file) dados.append(`foto_${indice + 1}`, file);
    });

    setEnviando(true);
    try {
      const criado = await criarOrcamento(dados);
      onCriado(criado);
      toast.sucesso(`Orçamento ${criado?.pep || ''} criado com sucesso.`.trim());
      onFechar();
    } catch (err) {
      const mensagem = err.message || 'Não foi possível criar o orçamento.';
      setErro(mensagem);
      toast.erro(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  const opcoesPep = peps.map((pep) => ({ value: pep, label: pep }));
  const opcoesStatus = STATUS_OPCOES.map((opcao) => ({
    value: opcao.value,
    label: opcao.label,
    descricao: opcao.descricao,
    cor: opcao.cor,
  }));
  const rotulosFoto = ['Foto 1 (obrigatória)', 'Foto 2 (opcional)', 'Foto 3 (opcional)'];

  return (
    <ModalBase
      aberto={aberto}
      titulo="Novo Orçamento"
      subtitulo="Abertura de orçamento de obra — campos com * são obrigatórios."
      onFechar={onFechar}
      tamanho="xl"
    >
      <form onSubmit={aoEnviar} noValidate>
        <div className="max-h-[68vh] space-y-5 overflow-y-auto px-5 py-5">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="rotulo" htmlFor="ss">
                SS (Solicitação de Serviço)
              </label>
              <input
                id="ss"
                className="campo"
                placeholder="Ex.: SS043/25"
                value={form.ss}
                onChange={(e) => alterarCampo('ss', e.target.value)}
                disabled={enviando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="pep">
                PEP (CC) *
              </label>
              <div className="flex items-center gap-2">
                {novoPep ? (
                  <input
                    id="pep"
                    className="campo"
                    placeholder="Digite o novo PEP"
                    value={form.pep}
                    onChange={(e) => alterarCampo('pep', e.target.value)}
                    disabled={enviando}
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <Dropdown
                      id="pep"
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
                  title={novoPep ? 'Voltar para a lista de PEPs' : 'Cadastrar um novo PEP'}
                  aria-label={novoPep ? 'Voltar para a lista de PEPs' : 'Cadastrar um novo PEP'}
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
              <label className="rotulo" htmlFor="cliente">
                Cliente / Área *
              </label>
              <input
                id="cliente"
                className="campo"
                placeholder="Ex.: Vale"
                value={form.cliente}
                onChange={(e) => alterarCampo('cliente', e.target.value)}
                disabled={enviando}
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="status">
                Status *
              </label>
              <Dropdown
                id="status"
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
              <label className="rotulo" htmlFor="endereco">
                Endereço *
              </label>
              <input
                id="endereco"
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
                    <label className="rotulo" htmlFor={`fiscal_nome_${indice}`}>
                      Nome do Fiscal {indice === 0 ? '*' : ''}
                    </label>
                    <Autocomplete
                      id={`fiscal_nome_${indice}`}
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
                    <label className="rotulo" htmlFor={`fiscal_contato_${indice}`}>
                      Contato do Fiscal {indice === 0 ? '*' : ''}
                    </label>
                    <input
                      id={`fiscal_contato_${indice}`}
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
                        <path
                          d="M5.5 5.5l9 9m0-9l-9 9"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
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

          <section className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Escopo</h3>

            <div>
              <label className="rotulo" htmlFor="descricao">
                Detalhamento do Serviço *
              </label>
              <textarea
                id="descricao"
                rows={3}
                className="campo resize-y"
                placeholder="Descreva o serviço a ser orçado"
                value={form.descricao}
                onChange={(e) => alterarCampo('descricao', e.target.value)}
                disabled={enviando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="documentos_referencia">
                Documentos de Referência *
              </label>
              <textarea
                id="documentos_referencia"
                rows={2}
                className="campo resize-y"
                placeholder="Normas, desenhos, memoriais (referências)"
                value={form.documentos_referencia}
                onChange={(e) => alterarCampo('documentos_referencia', e.target.value)}
                disabled={enviando}
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="valor">
                Valor Inicial (R$) *
              </label>
              <input
                id="valor"
                type="number"
                min="0"
                step="0.01"
                className="campo"
                placeholder="0,00"
                value={form.valor}
                onChange={(e) => alterarCampo('valor', e.target.value)}
                disabled={enviando}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="observacao_inicial">
                Justificativa / Observação da Revisão *
              </label>
              <input
                id="observacao_inicial"
                className="campo"
                placeholder="Justificativa do valor inicial"
                value={form.observacao_inicial}
                onChange={(e) => alterarCampo('observacao_inicial', e.target.value)}
                disabled={enviando}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Fotos da obra (JPG, PNG ou WEBP) *
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {rotulosFoto.map((rotulo, indice) => (
                <div key={rotulo} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {rotulo}
                  </p>

                  <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-slate-200">
                    {previews[indice] ? (
                      <img src={previews[indice]} alt={rotulo} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[11px] text-slate-400">Nenhum arquivo</span>
                    )}
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-[11px] text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-omega-600 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-white hover:file:bg-omega-700"
                    onChange={(e) => selecionarFoto(indice, e.target.files?.[0] || null)}
                    disabled={enviando}
                  />
                </div>
              ))}
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

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs text-slate-500">
            {enviando ? 'Salvando orçamento e enviando fotos...' : ''}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-neutro" onClick={onFechar} disabled={enviando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={enviando}>
              {enviando ? <Spinner tamanho="sm" /> : null}
              {enviando ? 'Enviando...' : 'Criar orçamento'}
            </button>
          </div>
        </div>
      </form>
    </ModalBase>
  );
}

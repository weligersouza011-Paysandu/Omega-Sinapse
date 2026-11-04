import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Ban, Columns3, LayoutGrid, ShieldCheck, Table, TriangleAlert, X } from 'lucide-react';
import AbasOrcamentos from '../components/AbasOrcamentos.jsx';
import CardObra from '../components/CardObra.jsx';
import LegendaStatus from '../components/LegendaStatus.jsx';
import ListaTabela from '../components/ListaTabela.jsx';
import ModalBase from '../components/ModalBase.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import QuadroKanban from '../components/QuadroKanban.jsx';
import ModalNovoOrcamento from '../components/ModalNovoOrcamento.jsx';
import ModalDetalhesOrcamento from '../components/ModalDetalhesOrcamento.jsx';
import EditarOrcamentoModal from '../components/EditarOrcamentoModal.jsx';
import Spinner from '../components/Spinner.jsx';
import {
  atualizarOrcamento,
  useContagemStatus,
  useOrcamentos,
  useQuadroOrcamentos,
} from '../hooks/useOrcamentos.js';
import { useToast } from '../context/ToastContext.jsx';
import { OPCOES_COMERCIAL, STATUS_COMERCIAL, STATUS_OPCOES, obterStatus } from '../utils/status.js';
import { formatarMoeda } from '../utils/formatters.js';

const LIMITE = 12;

const VISOES = [
  { id: 'cards', label: 'Cards', Icone: LayoutGrid },
  { id: 'kanban', label: 'Kanban', Icone: Columns3 },
  { id: 'list', label: 'Lista', Icone: Table },
];

/** Rótulos da legenda do topo (só o texto muda; as chaves seguem o enum). */
const ROTULOS_LEGENDA = {
  VISITA_TECNICA: 'Visita Técnica',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  APROVADO: 'Aprovados',
  DESATIVADO: 'Desativados',
};

/**
 * Ações rápidas de status dos cards (individual e em lote). `origens` são os
 * status a partir dos quais a ação faz sentido no fluxo comercial; `apenasLote`
 * mantém a ação só na barra de seleção em lote (fora do rodapé do card).
 */
const ACOES_STATUS = [
  {
    status: 'AGUARDANDO_APROVACAO',
    label: 'Homologar',
    rotuloLote: 'Homologar para aprovação',
    Icone: ShieldCheck,
    estilo: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
    origens: ['VISITA_TECNICA'],
  },
  {
    status: 'DESATIVADO',
    label: 'Desativar',
    rotuloLote: 'Desativar',
    Icone: Ban,
    estilo: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    origens: ['VISITA_TECNICA', 'AGUARDANDO_APROVACAO', 'APROVADO'],
    apenasLote: true,
  },
];

function acoesDisponiveis(orcamento) {
  return ACOES_STATUS.filter((acao) => !acao.apenasLote && acao.origens.includes(orcamento.status));
}

export default function DashboardOrcamentos() {
  const [visao, setVisao] = useState('cards');
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [status, setStatus] = useState('');
  // Recorte padrão: apenas o ciclo comercial do orçamentista (as etapas de OSI
  // ficam no escopo de Planejamento e só aparecem quando solicitadas).
  const [escopo, setEscopo] = useState('comercial');

  const [modalNovo, setModalNovo] = useState(false);
  const [idDetalhe, setIdDetalhe] = useState(null);
  const [idEdicao, setIdEdicao] = useState(null);

  const toast = useToast();
  // Seleção em lote dos cards (id → orçamento) e troca de status pendente de
  // confirmação: `{ itens, para }`.
  const [selecao, setSelecao] = useState({});
  const [mudanca, setMudanca] = useState(null);
  const [aplicandoMudanca, setAplicandoMudanca] = useState(false);

  // Cards e Lista compartilham a mesma consulta paginada/filtrada; o Kanban
  // usa o hook do quadro (sem paginação).
  const cards = useOrcamentos({
    busca: buscaAplicada,
    status,
    escopo,
    pagina,
    limit: LIMITE,
    ativo: visao === 'cards' || visao === 'list',
  });

  const quadro = useQuadroOrcamentos({
    busca: buscaAplicada,
    status,
    escopo,
    ativo: visao === 'kanban',
  });

  const contagem = useContagemStatus({ busca: buscaAplicada, statuses: STATUS_COMERCIAL });

  // A seleção vale só para os cards visíveis: limpa ao trocar página/filtros.
  useEffect(() => {
    setSelecao({});
  }, [pagina, status, buscaAplicada, escopo, visao]);

  // Debounce da busca por texto.
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca]);

  function alterarStatus(valor) {
    setStatus(valor);
    setPagina(1);
  }

  /** Troca o recorte (comercial ↔ todos) e reinicia a paginação/filtro. */
  function alterarEscopo(valor) {
    setEscopo(valor);
    setPagina(1);
    if (valor === 'comercial' && status && !STATUS_COMERCIAL.includes(status)) {
      setStatus('');
    }
  }

  /** Recarrega a visão ativa (o hook inativo ignora a chamada). */
  function recarregarTudo() {
    cards.recarregar();
    quadro.recarregar();
    contagem.recarregar();
  }

  function alternarSelecao(orcamento) {
    setSelecao((atual) => {
      const proxima = { ...atual };
      if (proxima[orcamento.id]) delete proxima[orcamento.id];
      else proxima[orcamento.id] = orcamento;
      return proxima;
    });
  }

  function selecionarPagina() {
    setSelecao(Object.fromEntries(cards.itens.map((item) => [item.id, item])));
  }

  /** Abre a confirmação apenas para os itens elegíveis à ação (individual ou lote). */
  function solicitarMudanca(itens, para) {
    const acao = ACOES_STATUS.find((item) => item.status === para);
    const elegiveis = itens.filter((item) => acao?.origens.includes(item.status));
    if (elegiveis.length > 0) setMudanca({ itens: elegiveis, para });
  }

  async function confirmarMudanca() {
    if (!mudanca) return;
    setAplicandoMudanca(true);

    const resultados = await Promise.allSettled(
      mudanca.itens.map((item) => atualizarOrcamento(item.id, { status: mudanca.para }))
    );
    const falhas = resultados.filter((resultado) => resultado.status === 'rejected').length;
    const sucessos = resultados.length - falhas;

    if (sucessos > 0) {
      toast.sucesso(`${sucessos} orçamento(s) movido(s) para "${obterStatus(mudanca.para).label}".`);
    }
    if (falhas > 0) {
      toast.erro(`${falhas} orçamento(s) não puderam ser atualizados.`);
    }

    setAplicandoMudanca(false);
    setMudanca(null);
    setSelecao({});
    recarregarTudo();
  }

  const itensSelecionados = useMemo(() => Object.values(selecao), [selecao]);
  const somaMudanca = mudanca
    ? mudanca.itens.reduce((soma, item) => soma + (Number(item.valor) || 0), 0)
    : 0;

  const valorTotalPagina = cards.itens.reduce((soma, item) => soma + (Number(item.valor) || 0), 0);
  const exibindoCards = visao === 'cards';
  const exibindoLista = visao === 'list';
  const exibindoKanban = visao === 'kanban';
  const carregando = exibindoKanban ? quadro.carregando : cards.carregando;
  const erro = exibindoKanban ? quadro.erro : cards.erro;

  return (
    <>
      {/* O Kanban usa a largura total (aproveita a expansão da Sidebar);
          a listagem de cards mantém a largura de leitura confortável. */}
      <div className={exibindoCards ? 'mx-auto w-full max-w-7xl' : 'w-full'}>
        <AbasOrcamentos />

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Obras e Orçamentos</h2>
            <p className="text-sm text-slate-500">
              {!exibindoKanban
                ? `${cards.total} orçamento(s) encontrado(s)${
                    // Na visão em Cards os valores ficam ocultos (só no detalhe).
                    cards.itens.length > 0 && exibindoLista ? ` · ${formatarMoeda(valorTotalPagina)} nesta página` : ''
                  }`
                : `${quadro.itens.length} orçamento(s) no quadro`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex gap-1 rounded-md border border-slate-300 bg-white p-1 shadow-sm"
              role="group"
              aria-label="Alternar visualização"
            >
              {VISOES.map(({ id, label, Icone }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisao(id)}
                  aria-pressed={visao === id}
                  className={[
                    'inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40',
                    visao === id
                      ? 'bg-omega-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')}
                >
                  <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <button type="button" className="btn-primario" onClick={() => setModalNovo(true)}>
              <span className="text-base leading-none">+</span> ADICIONAR
            </button>
          </div>
        </div>

        <LegendaStatus
          statuses={STATUS_COMERCIAL}
          rotulos={ROTULOS_LEGENDA}
          contagem={contagem.contagem}
          carregando={contagem.carregando}
          selecionado={status}
          onSelecionar={alterarStatus}
        />

        <section className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              className="campo pl-9"
              placeholder="Buscar por PEP, SS, descrição ou cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="sm:w-64">
            <select
              className="campo"
              value={status}
              onChange={(e) => alterarStatus(e.target.value)}
              aria-label="Filtrar por status"
            >
              <option value="">
                {escopo === 'comercial' ? 'Todos os status comerciais' : 'Todos os status'}
              </option>
              {(escopo === 'comercial' ? OPCOES_COMERCIAL : STATUS_OPCOES).map((opcao) => (
                <option key={opcao.value} value={opcao.value}>
                  {opcao.descricao}
                </option>
              ))}
            </select>
          </div>

          {/* Escopo: por padrão a visão foca o ciclo comercial do orçamentista. */}
          <label
            className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium text-slate-600"
            title="Inclui as etapas de OSI (Planejamento) na listagem"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-omega-600 focus:ring-2 focus:ring-omega-500/40"
              checked={escopo === 'todos'}
              onChange={(e) => alterarEscopo(e.target.checked ? 'todos' : 'comercial')}
            />
            Etapas de Planejamento (OSI)
          </label>

          <button type="button" className="btn-neutro sm:w-auto" onClick={recarregarTudo} disabled={carregando}>
            {carregando ? <Spinner tamanho="sm" /> : null}
            Atualizar
          </button>
        </section>

        {/* O Kanban trata o erro dentro do próprio quadro (com retry). */}
        {erro && !exibindoKanban ? (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            <span>{erro}</span>
            <button type="button" className="btn-perigo" onClick={recarregarTudo}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {exibindoCards ? (
          carregando ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, indice) => (
                <div key={indice} className="card h-72 animate-pulse bg-slate-50" />
              ))}
            </div>
          ) : cards.itens.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-base font-semibold text-slate-700">Nenhum orçamento encontrado</p>
              <p className="max-w-md text-sm text-slate-500">
                Ajuste os filtros de busca ou clique em <strong>+ ADICIONAR</strong> para abrir um novo
                orçamento de obra.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  className="text-xs font-semibold text-omega-700 hover:underline"
                  onClick={selecionarPagina}
                >
                  Selecionar todos desta página
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cards.itens.map((orcamento) => (
                  <CardObra
                    key={orcamento.id}
                    orcamento={orcamento}
                    onClick={() => setIdDetalhe(orcamento.id)}
                    onEditar={() => setIdEdicao(orcamento.id)}
                    ocultarValor
                    selecionado={Boolean(selecao[orcamento.id])}
                    onAlternarSelecao={alternarSelecao}
                    acoesRapidas={acoesDisponiveis(orcamento)}
                    onAcaoRapida={(item, para) => solicitarMudanca([item], para)}
                  />
                ))}
              </div>
            </>
          )
        ) : exibindoLista ? (
          <ListaTabela
            itens={cards.itens}
            carregando={carregando}
            rotuloItem="orçamento"
            onAbrirDetalhe={(id) => setIdDetalhe(id)}
            onEditar={(orcamento) => setIdEdicao(orcamento.id)}
          />
        ) : (
          <QuadroKanban
            itens={quadro.itens}
            carregando={quadro.carregando}
            erro={quadro.erro}
            onRecarregar={quadro.recarregar}
            onAbrirDetalhe={(id) => setIdDetalhe(id)}
            onEditar={(orcamento) => setIdEdicao(orcamento.id)}
          />
        )}

        {!exibindoKanban && cards.totalPaginas > 1 ? (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              className="btn-neutro"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1 || carregando}
            >
              Anterior
            </button>
            <span className="text-sm font-medium text-slate-600">
              Página {pagina} de {cards.totalPaginas}
            </span>
            <button
              type="button"
              className="btn-neutro"
              onClick={() => setPagina((p) => Math.min(cards.totalPaginas, p + 1))}
              disabled={pagina >= cards.totalPaginas || carregando}
            >
              Próxima
            </button>
          </div>
        ) : null}

        {exibindoCards && itensSelecionados.length > 0 ? (
          <div
            role="region"
            aria-label="Ações em lote"
            className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-omega-500/40 bg-white px-4 py-3 shadow-lg"
          >
            <p className="text-sm font-semibold text-slate-700">
              {itensSelecionados.length} orçamento(s) selecionado(s)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {ACOES_STATUS.map(({ status: destino, rotuloLote, Icone, estilo, origens }) => {
                const elegiveis = itensSelecionados.filter((item) => origens.includes(item.status)).length;
                return (
                  <button
                    key={destino}
                    type="button"
                    disabled={elegiveis === 0}
                    onClick={() => solicitarMudanca(itensSelecionados, destino)}
                    title={elegiveis === 0 ? 'Nenhum item selecionado está elegível para esta ação' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${estilo}`}
                  >
                    <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {rotuloLote} ({elegiveis})
                  </button>
                );
              })}
              <button type="button" className="btn-neutro" onClick={() => setSelecao({})}>
                <X className="h-4 w-4" aria-hidden="true" />
                Limpar seleção
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ModalBase
        aberto={Boolean(mudanca)}
        titulo="Alterar status"
        subtitulo={mudanca ? `${mudanca.itens.length} orçamento(s) · total ${formatarMoeda(somaMudanca)}` : ''}
        tamanho="md"
        onFechar={() => {
          if (!aplicandoMudanca) setMudanca(null);
        }}
      >
        {mudanca ? (
          <>
            <div className="space-y-4 px-5 py-5">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <p className="text-sm text-amber-800">
                  Esta ação atualiza a etapa do processo e fica registrada no histórico de cada orçamento.
                </p>
              </div>

              <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {mudanca.itens.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-bold text-slate-800">{item.pep || '—'}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <StatusBadge status={mudanca.para} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button
                type="button"
                className="btn-neutro"
                onClick={() => setMudanca(null)}
                disabled={aplicandoMudanca}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={mudanca.para === 'DESATIVADO' ? 'btn-perigo' : 'btn-primario'}
                onClick={confirmarMudanca}
                disabled={aplicandoMudanca}
              >
                {aplicandoMudanca ? <Spinner tamanho="sm" /> : null}
                Sim, alterar status
              </button>
            </div>
          </>
        ) : null}
      </ModalBase>

      <ModalNovoOrcamento
        aberto={modalNovo}
        onFechar={() => setModalNovo(false)}
        onCriado={() => {
          setPagina(1);
          recarregarTudo();
        }}
      />

      <ModalDetalhesOrcamento
        aberto={Boolean(idDetalhe)}
        orcamentoId={idDetalhe}
        onFechar={() => setIdDetalhe(null)}
        onAtualizado={recarregarTudo}
      />

      <EditarOrcamentoModal
        aberto={Boolean(idEdicao)}
        orcamentoId={idEdicao}
        onFechar={() => setIdEdicao(null)}
        onSalvo={(atualizado) => {
          // Atualização otimista: reflete a edição sem refetch.
          cards.atualizarItemLocal(atualizado);
          quadro.atualizarItemLocal(atualizado);
        }}
        onAbrirRevisoes={(id) => setIdDetalhe(id)}
      />
    </>
  );
}

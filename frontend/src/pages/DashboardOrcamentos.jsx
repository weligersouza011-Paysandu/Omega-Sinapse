import { useEffect, useState } from 'react';
import { Columns3, LayoutGrid, Table } from 'lucide-react';
import AbasOrcamentos from '../components/AbasOrcamentos.jsx';
import CardObra from '../components/CardObra.jsx';
import ListaTabela from '../components/ListaTabela.jsx';
import QuadroKanban from '../components/QuadroKanban.jsx';
import ModalNovoOrcamento from '../components/ModalNovoOrcamento.jsx';
import ModalDetalhesOrcamento from '../components/ModalDetalhesOrcamento.jsx';
import EditarOrcamentoModal from '../components/EditarOrcamentoModal.jsx';
import Spinner from '../components/Spinner.jsx';
import { useOrcamentos, useQuadroOrcamentos } from '../hooks/useOrcamentos.js';
import { OPCOES_COMERCIAL, STATUS_COMERCIAL, STATUS_OPCOES } from '../utils/status.js';
import { formatarMoeda } from '../utils/formatters.js';

const LIMITE = 12;

const VISOES = [
  { id: 'cards', label: 'Cards', Icone: LayoutGrid },
  { id: 'kanban', label: 'Kanban', Icone: Columns3 },
  { id: 'list', label: 'Lista', Icone: Table },
];

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
  }

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
                    cards.itens.length > 0 ? ` · ${formatarMoeda(valorTotalPagina)} nesta página` : ''
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.itens.map((orcamento) => (
                <CardObra
                  key={orcamento.id}
                  orcamento={orcamento}
                  onClick={() => setIdDetalhe(orcamento.id)}
                  onEditar={() => setIdEdicao(orcamento.id)}
                />
              ))}
            </div>
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
      </div>

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

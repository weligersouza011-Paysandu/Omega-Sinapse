import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Columns3, LayoutGrid, UserRound } from 'lucide-react';
import CardObra from '../components/CardObra.jsx';
import Dropdown from '../components/Dropdown.jsx';
import EtiquetasPendencia from '../components/EtiquetasPendencia.jsx';
import QuadroKanban from '../components/QuadroKanban.jsx';
import SeletorPlanejador from '../components/SeletorPlanejador.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  atualizarObra,
  useObras,
  usePlanejadores,
  useQuadroObras,
} from '../hooks/useObras.js';
import { OPCOES_PENDENCIA, STATUS_OBRA_OPCOES } from '../utils/status.js';
import { formatarMoeda } from '../utils/formatters.js';

const LIMITE = 12;

/** Perfis que podem vincular o técnico planejador responsável (espelha o back-end). */
const PERFIS_QUE_ATRIBUEM = ['SUPERVISOR', 'ADMIN'];

const VISOES = [
  { id: 'cards', label: 'Cards', Icone: LayoutGrid },
  { id: 'kanban', label: 'Kanban', Icone: Columns3 },
];

/** Rótulos do quadro operacional (o Kanban é compartilhado com Orçamentos). */
const TEXTOS_QUADRO = {
  rotuloItem: 'obra',
  colunaVazia: 'Solte uma obra aqui',
  tituloConfirmacao: 'Alterar etapa da obra',
  subtituloConfirmacao: 'Tem certeza que deseja alterar a etapa de execução desta obra?',
  avisoConfirmacao:
    'A obra só assume as etapas Em Andamento ou Concluída com a OSI emitida e a Ata de Partida anexada (ISO 9001).',
};

/**
 * Seção de Obras — ciclo operacional de execução.
 *
 * Substitui o antigo funil comercial por um acompanhamento de campo: cada obra
 * aprovada é acompanhada pelas etapas Para Iniciar → Em Andamento → (Paralisada)
 * → Concluída, com a régua de pendências documentais exigida pela ISO 9001
 * (emissão da OSI e Ata de Reunião de Partida).
 */
export default function Obras() {
  const { usuario } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [visao, setVisao] = useState('cards');
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [status, setStatus] = useState('');
  const [pendencia, setPendencia] = useState('');

  const podeAtribuirPlanejador = PERFIS_QUE_ATRIBUEM.includes(usuario?.perfil);
  const { planejadores, carregando: carregandoPlanejadores } = usePlanejadores(
    podeAtribuirPlanejador
  );

  const cards = useObras({
    busca: buscaAplicada,
    status,
    pendencia,
    pagina,
    limit: LIMITE,
    ativo: visao === 'cards',
  });

  const quadro = useQuadroObras({
    busca: buscaAplicada,
    status,
    pendencia,
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

  /** Recarrega a visão ativa (o hook inativo ignora a chamada). */
  function recarregarTudo() {
    cards.recarregar();
    quadro.recarregar();
  }

  /**
   * Persiste a nova etapa da obra a partir do arraste no Kanban. A régua
   * ISO 9001 é aplicada no back-end (HTTP 422) e o quadro faz o rollback.
   */
  const moverStatus = useCallback((id, novoStatus) => atualizarObra(id, { status: novoStatus }), []);

  /**
   * Atribui (ou remove) o técnico planejador direto no card/kanban. A API
   * devolve a obra atualizada e os dois hooks de listagem são sincronizados
   * localmente, sem recarregar o quadro inteiro.
   */
  async function atribuirPlanejador(obra, planejadorId) {
    try {
      const atualizada = await atualizarObra(obra.id, { planejador_id: planejadorId });

      if (atualizada) {
        cards.atualizarItemLocal(atualizada);
        quadro.atualizarItemLocal(atualizada);
      }

      const responsavel =
        atualizada?.planejador_nome || planejadores.find((p) => p.id === planejadorId)?.nome;
      toast.sucesso(
        planejadorId
          ? `Planejador responsável definido: ${responsavel || 'colaborador selecionado'}.`
          : 'Responsável removido da obra.'
      );
      return true;
    } catch (err) {
      toast.erro(err.message || 'Não foi possível atribuir o planejador responsável.');
      return false;
    }
  }

  const exibindoCards = visao === 'cards';
  const itensDaVisao = exibindoCards ? cards.itens : quadro.itens;
  const carregando = exibindoCards ? cards.carregando : quadro.carregando;
  const erro = exibindoCards ? cards.erro : quadro.erro;

  const totalObras = exibindoCards ? cards.total : quadro.itens.length;
  const totalPendentes = itensDaVisao.filter((obra) => obra.pendencias && !obra.pendencias.completa).length;
  const valorTotal = itensDaVisao.reduce((soma, obra) => soma + (Number(obra.valor) || 0), 0);

  return (
    <>
      {/* O Kanban usa a largura total (aproveita a expansão da Sidebar);
          a listagem de cards mantém a largura de leitura confortável. */}
      <div className={exibindoCards ? 'mx-auto w-full max-w-7xl' : 'w-full'}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Obras em Execução</h2>
            <p className="text-sm text-slate-500">
              Acompanhamento do ciclo operacional das obras aprovadas, com a documentação de
              partida exigida pela ISO 9001.
            </p>
          </div>

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
        </div>

        {/* ----------------------------------------------- Indicadores */}
        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {exibindoCards ? 'Obras no filtro' : 'Obras no quadro'}
            </p>
            <p className="text-2xl font-bold text-slate-800">{totalObras}</p>
          </div>

          <div className="card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Com documentação pendente
            </p>
            <p
              className={`text-2xl font-bold ${totalPendentes > 0 ? 'text-red-600' : 'text-emerald-600'}`}
            >
              {totalPendentes}
            </p>
          </div>

          <div className="card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Valor acumulado {exibindoCards ? 'da página' : 'do quadro'}
            </p>
            <p className="text-2xl font-bold text-omega-700">{formatarMoeda(valorTotal)}</p>
          </div>
        </section>

        <section className="card mb-6 grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1fr_240px_260px_auto] lg:items-center">
          <div className="relative">
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
              aria-label="Buscar obras"
            />
          </div>

          <Dropdown
            value={status}
            onChange={(valor) => {
              setStatus(valor);
              setPagina(1);
            }}
            placeholder="Todas as etapas"
            opcoes={[{ value: '', label: 'Todas as etapas', descricao: 'Todas as etapas' }, ...STATUS_OBRA_OPCOES]}
          />

          <Dropdown
            value={pendencia}
            onChange={(valor) => {
              setPendencia(valor);
              setPagina(1);
            }}
            placeholder="Documentação"
            opcoes={[
              { value: '', label: 'Toda a documentação', descricao: 'Toda a documentação' },
              ...OPCOES_PENDENCIA,
            ]}
          />

          <button
            type="button"
            className="btn-neutro"
            onClick={recarregarTudo}
            disabled={carregando}
          >
            {carregando ? <Spinner tamanho="sm" /> : null}
            Atualizar
          </button>
        </section>

        {/* O Kanban trata o erro dentro do próprio quadro (com retry). */}
        {erro && exibindoCards ? (
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
                <div key={indice} className="card h-80 animate-pulse bg-slate-50" />
              ))}
            </div>
          ) : cards.itens.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-base font-semibold text-slate-700">Nenhuma obra encontrada</p>
              <p className="max-w-md text-sm text-slate-500">
                Esta seção reúne os orçamentos aprovados e em execução. Ajuste os filtros ou acompanhe
                as negociações na aba <strong>Orçamentos</strong>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.itens.map((obra) => (
                <CardObra
                  key={obra.id}
                  orcamento={obra}
                  onClick={() => navigate(`/obras/${obra.id}`)}
                  planejadores={planejadores}
                  carregandoPlanejadores={carregandoPlanejadores}
                  onAtribuirPlanejador={podeAtribuirPlanejador ? atribuirPlanejador : undefined}
                />
              ))}
            </div>
          )
        ) : (
          <QuadroKanban
            itens={quadro.itens}
            carregando={quadro.carregando}
            erro={quadro.erro}
            onRecarregar={quadro.recarregar}
            onAbrirDetalhe={(id) => navigate(`/obras/${id}`)}
            opcoes={STATUS_OBRA_OPCOES}
            aoMover={moverStatus}
            textos={TEXTOS_QUADRO}
            renderInfo={(obra) => (
              <div className="flex flex-wrap items-center gap-1">
                <EtiquetasPendencia pendencias={obra.pendencias} />
                {!podeAtribuirPlanejador && obra.planejador_nome ? (
                  <span
                    title={`Planejador responsável: ${obra.planejador_nome}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                  >
                    <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{obra.planejador_nome}</span>
                  </span>
                ) : null}
              </div>
            )}
            renderRodape={
              podeAtribuirPlanejador
                ? (obra) => (
                    <SeletorPlanejador
                      obra={obra}
                      planejadores={planejadores}
                      carregando={carregandoPlanejadores}
                      onAtribuir={atribuirPlanejador}
                    />
                  )
                : undefined
            }
          />
        )}

        {exibindoCards && cards.totalPaginas > 1 ? (
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
    </>
  );
}

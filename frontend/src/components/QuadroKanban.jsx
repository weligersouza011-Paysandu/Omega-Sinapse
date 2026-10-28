import { useEffect, useState } from 'react';
import { ArrowRight, GripVertical, Info, Pencil, TriangleAlert } from 'lucide-react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import StatusBadge from './StatusBadge.jsx';
import { atualizarOrcamento } from '../hooks/useOrcamentos.js';
import { useToast } from '../context/ToastContext.jsx';
import { OPCOES_COMERCIAL, obterStatus } from '../utils/status.js';
import { formatarMoeda, formatarMoedaCompacta } from '../utils/formatters.js';

/** Chevron do botão de troca rápida de status. */
function Chevron({ aberto }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`h-3.5 w-3.5 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
    >
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Miniatura com fallback local quando a foto da obra não carrega. */
function Capa({ url, pep }) {
  const [falhou, setFalhou] = useState(false);

  if (!url || falhou) {
    return (
      <div className="flex h-20 w-full items-center justify-center bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Sem imagem
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={`Foto da obra ${pep || ''}`}
      loading="lazy"
      onError={() => setFalhou(true)}
      className="h-20 w-full object-cover"
    />
  );
}

/** Textos padrão do quadro comercial (sobrescrevíveis via prop `textos`). */
const TEXTOS_PADRAO = {
  rotuloItem: 'orçamento',
  colunaVazia: 'Solte um orçamento aqui',
  tituloConfirmacao: 'Alterar status do orçamento',
  subtituloConfirmacao: 'Tem certeza que deseja alterar o status deste orçamento?',
  avisoConfirmacao:
    'Esta ação atualiza a etapa do processo e fica registrada no histórico do orçamento.',
};

/**
 * Visão Kanban de orçamentos/obras.
 *
 * O quadro é parametrizado pelo conjunto de etapas (`opcoes`) e exibe uma coluna
 * por etapa. Na aba de Orçamentos são as quatro etapas comerciais do Técnico
 * Orçamentista; na aba de Obras, as etapas do ciclo operacional de execução.
 * Registros em etapas fora do conjunto exibido não ganham coluna — são apenas
 * contabilizados em um aviso.
 *
 * Cada coluna exibe a quantidade de registros e o valor total acumulado. As
 * colunas são flexíveis: ocupam toda a largura disponível quando há espaço e
 * passam a rolar horizontalmente (com uma largura mínima confortável) em telas
 * estreitas.
 *
 * A troca de status — por arraste ou pelo menu do card — passa por um diálogo
 * de confirmação; ao confirmar, o card muda de coluna imediatamente (atualização
 * otimista) enquanto a API é chamada em segundo plano, com rollback em caso de
 * falha (ex.: bloqueio da régua ISO 9001 no módulo de Obras).
 *
 * @param {(id:number, novoStatus:string) => Promise<object>} props.aoMover
 *        Persiste a mudança de status; padrão: orçamento comercial. O módulo de
 *        Obras injeta `atualizarObra`.
 * @param {(item:object) => import('react').ReactNode} props.renderInfo
 *        Conteúdo extra exibido no card (ex.: pendências documentais da obra).
 * @param {(item:object) => import('react').ReactNode} props.renderRodape
 *        Conteúdo extra exibido no rodapé do card, fora da área clicável
 *        (ex.: seletor de planejador responsável no módulo de Obras).
 * @param {object} props.textos sobrescreve os rótulos padrão (`TEXTOS_PADRAO`).
 */
export default function QuadroKanban({
  itens,
  carregando,
  erro,
  onRecarregar,
  onAbrirDetalhe,
  onEditar,
  aoMover = atualizarOrcamento,
  renderInfo,
  renderRodape,
  opcoes = OPCOES_COMERCIAL,
  textos = {},
  avisoForaDoEscopo = 'orçamento(s) em etapas de Planejamento (OSI) não aparecem neste quadro — elas pertencem ao fluxo do Supervisor/Coordenador e dos Planejadores.',
}) {
  const toast = useToast();
  const t = { ...TEXTOS_PADRAO, ...textos };

  const [lista, setLista] = useState(itens || []);
  const [arrastandoId, setArrastandoId] = useState(null);
  const [colunaSobre, setColunaSobre] = useState(null);
  const [menuAbertoId, setMenuAbertoId] = useState(null);
  const [movendoId, setMovendoId] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);

  // Espelha a lista recebida do hook (recarregamentos e novas buscas).
  useEffect(() => {
    setLista(itens || []);
  }, [itens]);

  /** Abre o diálogo de confirmação (nenhuma alteração é feita ainda). */
  function solicitarMudanca(orcamento, novoStatus) {
    if (!orcamento || orcamento.status === novoStatus) return;
    setMenuAbertoId(null);
    setConfirmacao({
      id: orcamento.id,
      pep: orcamento.pep,
      valor: orcamento.valor,
      de: orcamento.status,
      para: novoStatus,
    });
  }

  async function mover(id, novoStatus) {
    const atual = lista.find((orcamento) => orcamento.id === id);
    if (!atual || atual.status === novoStatus) return;

    const anterior = lista;

    // Atualização otimista: o card muda de coluna antes da resposta da API.
    setMovendoId(id);
    setLista((atualLista) =>
      atualLista.map((orcamento) => (orcamento.id === id ? { ...orcamento, status: novoStatus } : orcamento))
    );

    try {
      const atualizado = await aoMover(id, novoStatus);
      setLista((atualLista) =>
        atualLista.map((orcamento) => (orcamento.id === id ? { ...orcamento, ...atualizado } : orcamento))
      );
      toast.sucesso(`Status atualizado para "${obterStatus(novoStatus).descricao}".`);
      if (onRecarregar) onRecarregar();
    } catch (err) {
      // Rollback: devolve o card à coluna de origem.
      setLista(anterior);
      toast.erro(err.message || 'Não foi possível atualizar o status.');
    } finally {
      setMovendoId(null);
    }
  }

  function confirmarMudanca() {
    const pendente = confirmacao;
    setConfirmacao(null);
    if (pendente) mover(pendente.id, pendente.para);
  }

  function aoSoltar(evento, status) {
    evento.preventDefault();
    setColunaSobre(null);
    const id = Number(evento.dataTransfer.getData('text/plain')) || arrastandoId;
    setArrastandoId(null);
    if (id) solicitarMudanca(lista.find((orcamento) => orcamento.id === id), status);
  }

  // Apenas as etapas do conjunto exibido viram coluna. Registros em outras
  // etapas são contabilizados no aviso, sem poluir o quadro.
  const valoresExibidos = opcoes.map((opcao) => opcao.value);
  const itensDoQuadro = lista.filter((orcamento) => valoresExibidos.includes(orcamento.status));
  const totalForaDoEscopo = lista.length - itensDoQuadro.length;

  const colunas = opcoes.map((opcao) => {
    const itensColuna = itensDoQuadro.filter((orcamento) => orcamento.status === opcao.value);
    const valorTotal = itensColuna.reduce((soma, orcamento) => soma + (Number(orcamento.valor) || 0), 0);
    return { opcao, itens: itensColuna, valorTotal };
  });

  if (erro) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
      >
        <span>{erro}</span>
        <button type="button" className="btn-perigo" onClick={onRecarregar}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <>
      {totalForaDoEscopo > 0 ? (
        <div
          role="status"
          className="mb-3 flex items-start gap-2.5 rounded-md border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs font-medium text-violet-800"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {totalForaDoEscopo} {avisoForaDoEscopo}
          </p>
        </div>
      ) : null}

      <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3">
        {colunas.map(({ opcao, itens: itensColuna, valorTotal }) => (
          <section
            key={opcao.value}
            className={[
              'flex min-w-[248px] flex-1 basis-0 flex-col overflow-hidden rounded-lg border bg-slate-50/70 transition-colors duration-200',
              colunaSobre === opcao.value ? 'border-omega-500 ring-2 ring-omega-500/25' : 'border-slate-200',
            ].join(' ')}
          >
            <div className="h-1 shrink-0" style={{ backgroundColor: opcao.hex }} />

            <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-600">
                  {opcao.label}
                </p>
                <p className="text-[11px] font-medium text-slate-400">
                  {itensColuna.length} {t.rotuloItem}
                  {itensColuna.length === 1 ? '' : 's'}
                </p>
              </div>
              <span
                title={formatarMoeda(valorTotal)}
                className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
              >
                {formatarMoedaCompacta(valorTotal)}
              </span>
            </header>

            <div
              className="min-h-[14rem] max-h-[calc(100vh_-_22rem)] flex-1 space-y-2 overflow-y-auto p-2"
              onDragOver={(evento) => {
                evento.preventDefault();
                if (colunaSobre !== opcao.value) setColunaSobre(opcao.value);
              }}
              onDragLeave={(evento) => {
                if (!evento.currentTarget.contains(evento.relatedTarget)) setColunaSobre(null);
              }}
              onDrop={(evento) => aoSoltar(evento, opcao.value)}
            >
              {carregando ? (
                Array.from({ length: 2 }).map((_, indice) => (
                  <div key={indice} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white" />
                ))
              ) : itensColuna.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-[11px] font-medium text-slate-400">
                  {t.colunaVazia}
                </p>
              ) : (
                itensColuna.map((orcamento) => {
                  const menuAberto = menuAbertoId === orcamento.id;
                  const movendo = movendoId === orcamento.id;

                  return (
                    <article
                      key={orcamento.id}
                      draggable={!movendo}
                      onDragStart={(evento) => {
                        evento.dataTransfer.setData('text/plain', String(orcamento.id));
                        evento.dataTransfer.effectAllowed = 'move';
                        setArrastandoId(orcamento.id);
                        setMenuAbertoId(null);
                      }}
                      onDragEnd={() => {
                        setArrastandoId(null);
                        setColunaSobre(null);
                      }}
                      className={[
                        'animar-kanban relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow',
                        arrastandoId === orcamento.id ? 'opacity-50' : 'hover:border-omega-500/50 hover:shadow-md',
                      ].join(' ')}
                    >
                      {onEditar ? (
                        <button
                          type="button"
                          onClick={(evento) => {
                            evento.stopPropagation();
                            onEditar(orcamento);
                          }}
                          title="Editar Orçamento"
                          aria-label={`Editar orçamento ${orcamento.pep || ''}`.trim()}
                          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:border-omega-500/50 hover:bg-white hover:text-omega-700 focus:outline-none focus:ring-2 focus:ring-omega-500/40"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : null}

                      {/* Área clicável: usa `div` (e não `button`) porque um controle
                          interativo bloquearia o início do arraste no Chromium. */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onAbrirDetalhe(orcamento.id)}
                        onKeyDown={(evento) => {
                          if (evento.key === 'Enter' || evento.key === ' ') {
                            evento.preventDefault();
                            onAbrirDetalhe(orcamento.id);
                          }
                        }}
                        className="block w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/30"
                      >
                        <Capa url={orcamento.foto_1} pep={orcamento.pep} />

                        <div className="space-y-1.5 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-bold text-slate-800">{orcamento.pep || '—'}</p>
                            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" aria-hidden="true" />
                          </div>

                          <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">
                            {orcamento.descricao || orcamento.cliente || 'Sem descrição informada.'}
                          </p>

                          {renderInfo ? renderInfo(orcamento) : null}

                          <p className="text-sm font-bold text-omega-700">{formatarMoeda(orcamento.valor)}</p>
                        </div>
                      </div>

                      {renderRodape ? (
                        <div className="border-t border-slate-100 px-2.5 py-2">
                          {renderRodape(orcamento)}
                        </div>
                      ) : null}

                      <div className="border-t border-slate-100 px-2.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => setMenuAbertoId(menuAberto ? null : orcamento.id)}
                          disabled={movendo}
                          className="flex w-full items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition hover:text-omega-700 disabled:opacity-50"
                        >
                          <span className="flex items-center gap-1">
                            {movendo ? <Spinner tamanho="sm" /> : null}
                            Trocar status
                          </span>
                          <Chevron aberto={menuAberto} />
                        </button>
                      </div>

                      {menuAberto ? (
                        <div className="grid grid-cols-2 gap-1.5 border-t border-slate-100 bg-slate-50 p-2">
                          {/* Destinos restritos às etapas do quadro em uso. */}
                          {opcoes.map((destino) => (
                            <button
                              key={destino.value}
                              type="button"
                              disabled={destino.value === orcamento.status || movendo}
                              onClick={() => solicitarMudanca(orcamento, destino.value)}
                              className={[
                                'rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition',
                                'disabled:cursor-not-allowed disabled:opacity-40',
                                destino.cor,
                                destino.value === orcamento.status ? '' : 'hover:brightness-95',
                              ].join(' ')}
                            >
                              {destino.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>

      <ModalBase
        aberto={Boolean(confirmacao)}
        titulo={t.tituloConfirmacao}
        subtitulo={t.subtituloConfirmacao}
        tamanho="md"
        onFechar={() => setConfirmacao(null)}
      >
        {confirmacao ? (
          <>
            <div className="px-5 py-5">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <p className="text-sm text-amber-800">{t.avisoConfirmacao}</p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Projeto
                  </p>
                  <p className="truncate text-sm font-bold text-slate-800">{confirmacao.pep || '—'}</p>
                </div>
                <p className="text-sm font-bold text-omega-700">{formatarMoeda(confirmacao.valor)}</p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <StatusBadge status={confirmacao.de} />
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <StatusBadge status={confirmacao.para} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" className="btn-neutro" onClick={() => setConfirmacao(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-primario" onClick={confirmarMudanca}>
                Sim, alterar status
              </button>
            </div>
          </>
        ) : null}
      </ModalBase>
    </>
  );
}

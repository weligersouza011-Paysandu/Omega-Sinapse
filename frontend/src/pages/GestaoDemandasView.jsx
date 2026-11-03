import { useMemo, useState } from 'react';
import { Columns3, Plus, RefreshCw, Table, TriangleAlert } from 'lucide-react';
import KanbanDemandas from '../components/demandas/KanbanDemandas.jsx';
import ListaDemandas from '../components/demandas/ListaDemandas.jsx';
import ModalDemanda from '../components/demandas/ModalDemanda.jsx';
import ModalJustificativa from '../components/demandas/ModalJustificativa.jsx';
import ModalBase from '../components/ModalBase.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { alterarStatusTarefa, removerTarefa, useEquipe, useTarefas } from '../hooks/useTarefas.js';
import {
  FILTROS_TIPO,
  exigeJustificativa,
  farolDaTarefa,
  obterStatusDemanda,
} from '../utils/demandas.js';

const VISOES = [
  { id: 'kanban', label: 'Kanban', Icone: Columns3 },
  { id: 'lista', label: 'Lista', Icone: Table },
];

/** Indicadores rápidos do recorte filtrado. */
function calcularKpis(itens) {
  const agora = new Date();
  const ativas = itens.filter((tarefa) => ['A_FAZER', 'EM_ANDAMENTO'].includes(tarefa.status));
  const farois = ativas.map((tarefa) => farolDaTarefa(tarefa, agora).cor);
  const concluidas = itens.filter((tarefa) => tarefa.status === 'CONCLUIDO');
  const noPrazo = concluidas.filter((tarefa) => !farolDaTarefa(tarefa, agora).atrasada).length;
  return {
    ativas: ativas.length,
    vencidas: farois.filter((cor) => cor === 'vermelho').length,
    venceHoje: farois.filter((cor) => cor === 'amarelo').length,
    pontualidade: concluidas.length > 0 ? Math.round((noPrazo / concluidas.length) * 100) : null,
  };
}

function Kpi({ rotulo, valor, destaque }) {
  return (
    <div className={`card min-w-[8.5rem] flex-1 px-4 py-3 ${destaque || ''}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-0.5 text-2xl font-bold text-slate-800">{valor}</p>
    </div>
  );
}

/**
 * Gestão de Demandas da equipe de planejamento: rotinas semanais e demandas
 * avulsas em Kanban (arrastar e soltar) ou Lista agrupada, com farol de prazo.
 */
export default function GestaoDemandasView() {
  const { usuario } = useAuth();
  const toast = useToast();

  const [visao, setVisao] = useState('kanban');
  const [usuarioId, setUsuarioId] = useState('');
  const [tipo, setTipo] = useState('');

  const { itens, setItens, carregando, erro, recarregar } = useTarefas({ usuarioId, tipo });
  const { equipe } = useEquipe();

  const [movendoId, setMovendoId] = useState(null);
  const [pendenteJustificativa, setPendenteJustificativa] = useState(null);
  const [modalDemanda, setModalDemanda] = useState({ aberto: false, tarefa: null });
  const [paraRemover, setParaRemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  const kpis = useMemo(() => calcularKpis(itens), [itens]);

  /** Aplica a troca de status com atualização otimista e rollback em falha. */
  async function aplicarStatus(tarefa, novoStatus, justificativa) {
    const anterior = itens;
    setMovendoId(tarefa.id);
    // A data de conclusão otimista evita o farol "no prazo" piscar antes da resposta.
    const otimista = {
      status: novoStatus,
      concluido_em: novoStatus === 'CONCLUIDO' ? new Date().toISOString() : null,
    };
    setItens((lista) => lista.map((item) => (item.id === tarefa.id ? { ...item, ...otimista } : item)));

    try {
      const { proxima_ocorrencia: proxima, ...atualizada } = await alterarStatusTarefa(
        tarefa.id,
        novoStatus,
        justificativa
      );
      setItens((lista) => {
        const atualizadas = lista.map((item) => (item.id === tarefa.id ? atualizada : item));
        return proxima ? [...atualizadas, proxima] : atualizadas;
      });
      toast.sucesso(
        proxima
          ? `Rotina concluída. Próxima ocorrência agendada para ${new Date(proxima.data_vencimento).toLocaleDateString('pt-BR')}.`
          : `Status alterado para "${obterStatusDemanda(novoStatus).label}".`
      );
    } catch (falha) {
      setItens(anterior);
      toast.erro(falha.message || 'Não foi possível alterar o status.');
    } finally {
      setMovendoId(null);
    }
  }

  /** Ponto único de troca de status (Kanban e Lista). */
  function mudarStatus(tarefa, novoStatus) {
    if (!tarefa || tarefa.status === novoStatus) return;
    if (novoStatus === 'CONCLUIDO' && exigeJustificativa(tarefa)) {
      setPendenteJustificativa(tarefa);
      return;
    }
    aplicarStatus(tarefa, novoStatus);
  }

  function aoSalvar(tarefa, edicao) {
    toast.sucesso(edicao ? 'Demanda atualizada.' : 'Demanda criada.');
    // Recarrega para respeitar os filtros (responsável/tipo podem ter mudado).
    recarregar();
  }

  async function confirmarRemocao() {
    const alvo = paraRemover;
    setRemovendo(true);
    try {
      await removerTarefa(alvo.id);
      setItens((lista) => lista.filter((item) => item.id !== alvo.id));
      setParaRemover(null);
      toast.sucesso('Demanda excluída.');
    } catch (falha) {
      toast.erro(falha.message || 'Não foi possível excluir a demanda.');
    } finally {
      setRemovendo(false);
    }
  }

  const abrirEdicao = (tarefa) => setModalDemanda({ aberto: true, tarefa });

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gestão de Demandas</h2>
          <p className="text-sm text-slate-500">
            Rotinas e entregas da equipe de planejamento em um só lugar — prioridade clara, prazo no farol e
            nenhuma demanda esquecida.
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
                  visao === id ? 'bg-omega-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
              >
                <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <button type="button" className="btn-primario" onClick={() => setModalDemanda({ aberto: true, tarefa: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova Demanda
          </button>
        </div>
      </div>

      <section className="card mb-4 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="lg:w-72">
          <label className="rotulo" htmlFor="filtro-colaborador">
            Colaborador
          </label>
          <select
            id="filtro-colaborador"
            className="campo"
            value={usuarioId}
            onChange={(evento) => setUsuarioId(evento.target.value)}
          >
            <option value="">Toda a Equipe</option>
            {usuario?.id && !equipe.some((pessoa) => pessoa.id === usuario.id) ? (
              <option value={String(usuario.id)}>{usuario.nome || 'Minhas demandas'}</option>
            ) : null}
            {equipe.map((pessoa) => (
              <option key={pessoa.id} value={String(pessoa.id)}>
                {pessoa.nome}
                {pessoa.id === usuario?.id ? ' (você)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="rotulo">Tipo de demanda</span>
          <div className="inline-flex gap-1 rounded-md border border-slate-300 bg-white p-1" role="group">
            {FILTROS_TIPO.map((opcao) => (
              <button
                key={opcao.value || 'todas'}
                type="button"
                aria-pressed={tipo === opcao.value}
                onClick={() => setTipo(opcao.value)}
                className={[
                  'rounded px-3 py-1 text-sm font-semibold transition',
                  tipo === opcao.value ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="btn-neutro lg:ml-auto lg:self-end" onClick={recarregar} disabled={carregando}>
          {carregando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Atualizar
        </button>
      </section>

      <div className="mb-4 flex flex-wrap gap-3">
        <Kpi rotulo="Ativas" valor={kpis.ativas} />
        <Kpi
          rotulo="Vencidas"
          valor={kpis.vencidas}
          destaque={kpis.vencidas > 0 ? 'border-red-200 bg-red-50/60' : ''}
        />
        <Kpi
          rotulo="Vencem em 24h"
          valor={kpis.venceHoje}
          destaque={kpis.venceHoje > 0 ? 'border-amber-200 bg-amber-50/60' : ''}
        />
        <Kpi rotulo="Entregas no prazo" valor={kpis.pontualidade === null ? '—' : `${kpis.pontualidade}%`} />
      </div>

      {erro ? (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <span>{erro}</span>
          <button type="button" className="btn-perigo" onClick={recarregar}>
            Tentar novamente
          </button>
        </div>
      ) : visao === 'kanban' ? (
        <KanbanDemandas
          itens={itens}
          carregando={carregando}
          usuario={usuario}
          movendoId={movendoId}
          onMudarStatus={mudarStatus}
          onAbrir={abrirEdicao}
        />
      ) : (
        <ListaDemandas
          itens={itens}
          carregando={carregando}
          usuario={usuario}
          movendoId={movendoId}
          onMudarStatus={mudarStatus}
          onEditar={abrirEdicao}
          onRemover={setParaRemover}
        />
      )}

      <ModalDemanda
        aberto={modalDemanda.aberto}
        tarefa={modalDemanda.tarefa}
        equipe={equipe}
        usuario={usuario}
        onFechar={() => setModalDemanda({ aberto: false, tarefa: null })}
        onSalvo={aoSalvar}
        onRemover={(tarefa) => {
          // Fecha a edição antes da confirmação para não empilhar modais.
          setModalDemanda({ aberto: false, tarefa: null });
          setParaRemover(tarefa);
        }}
      />

      <ModalJustificativa
        tarefa={pendenteJustificativa}
        onCancelar={() => setPendenteJustificativa(null)}
        onConfirmar={(tarefa, justificativa) => {
          setPendenteJustificativa(null);
          aplicarStatus(tarefa, 'CONCLUIDO', justificativa);
        }}
      />

      <ModalBase
        aberto={Boolean(paraRemover)}
        titulo="Excluir demanda"
        subtitulo={paraRemover?.titulo}
        tamanho="md"
        onFechar={() => (removendo ? null : setParaRemover(null))}
      >
        <div className="px-5 py-5">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="text-sm text-amber-800">
              A demanda será removida definitivamente. Para manter o histórico, prefira alterar o status para
              <strong> Cancelado</strong>.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={() => setParaRemover(null)} disabled={removendo}>
            Cancelar
          </button>
          <button type="button" className="btn-perigo" onClick={confirmarRemocao} disabled={removendo}>
            {removendo ? <Spinner tamanho="sm" /> : null}
            Excluir demanda
          </button>
        </div>
      </ModalBase>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { CalendarDays, Check, ListChecks, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarAtividadeObra,
  criarAtividadeObra,
  removerAtividadeObra,
} from '../../hooks/useObras.js';
import { formatarData } from '../../utils/formatters.js';

const STATUS = {
  PENDENTE: { label: 'Pendente', cor: 'bg-slate-100 text-slate-700 border-slate-300' },
  EM_ANDAMENTO: { label: 'Em andamento', cor: 'bg-blue-100 text-blue-700 border-blue-300' },
  CONCLUIDA: { label: 'Concluída', cor: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
};

const FORM_VAZIO = {
  titulo: '',
  descricao: '',
  responsavel: '',
  prazo: '',
  status: 'PENDENTE',
};

/** Lista de tarefas/atividades da obra, com criação, edição e mudança de status. */
export default function TarefasObra({ obra, podeEditar = false, onObraAtualizada }) {
  const toast = useToast();
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const atividades = useMemo(() => {
    const lista = [...(obra?.atividades || [])];
    lista.sort((a, b) => {
      const ordem = { PENDENTE: 0, EM_ANDAMENTO: 1, CONCLUIDA: 2 };
      const diferenca = (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9);
      if (diferenca !== 0) return diferenca;
      return Number(b.id) - Number(a.id);
    });
    return filtro ? lista.filter((atividade) => atividade.status === filtro) : lista;
  }, [obra?.atividades, filtro]);

  const contagens = useMemo(() => {
    const lista = obra?.atividades || [];
    return {
      total: lista.length,
      pendentes: lista.filter((a) => a.status === 'PENDENTE').length,
      andamento: lista.filter((a) => a.status === 'EM_ANDAMENTO').length,
      concluidas: lista.filter((a) => a.status === 'CONCLUIDA').length,
    };
  }, [obra?.atividades]);

  function limpar() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setFormAberto(false);
  }

  function iniciarEdicao(atividade) {
    setEditandoId(atividade.id);
    setForm({
      titulo: atividade.titulo || '',
      descricao: atividade.descricao || '',
      responsavel: atividade.responsavel || '',
      prazo: atividade.prazo ? String(atividade.prazo).slice(0, 10) : '',
      status: atividade.status || 'PENDENTE',
    });
    setFormAberto(true);
  }

  async function salvar(evento) {
    evento.preventDefault();
    if (!form.titulo.trim()) {
      toast.aviso('Informe o título da atividade.');
      return;
    }

    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      responsavel: form.responsavel.trim() || null,
      prazo: form.prazo || null,
      status: form.status,
    };

    setSalvando(true);
    try {
      const atualizada = editandoId
        ? await atualizarAtividadeObra(obra.id, editandoId, payload)
        : await criarAtividadeObra(obra.id, payload);

      onObraAtualizada?.(atualizada);
      toast.sucesso(editandoId ? 'Atividade atualizada.' : 'Atividade criada.');
      limpar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível salvar a atividade.');
    } finally {
      setSalvando(false);
    }
  }

  async function alterarStatus(atividade, status) {
    try {
      const atualizada = await atualizarAtividadeObra(obra.id, atividade.id, { status });
      onObraAtualizada?.(atualizada);
      toast.sucesso(`Status atualizado para "${STATUS[status]?.label || status}".`);
    } catch (err) {
      toast.erro(err.message || 'Não foi possível alterar o status.');
    }
  }

  async function remover(atividade) {
    if (!window.confirm(`Remover a atividade "${atividade.titulo}"?`)) return;
    try {
      const atualizada = await removerAtividadeObra(obra.id, atividade.id);
      onObraAtualizada?.(atualizada);
      toast.sucesso('Atividade removida.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover a atividade.');
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <ListChecks className="h-5 w-5 text-omega-600" aria-hidden="true" />
            Lista de Tarefas
          </h2>
          <p className="text-sm text-slate-500">
            Atividades planejadas e executadas na obra, com responsável, prazo e situação.
          </p>
        </div>

        {podeEditar ? (
          <button
            type="button"
            className="btn-primario"
            onClick={() => (formAberto ? limpar() : setFormAberto(true))}
          >
            {formAberto ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {formAberto ? 'Cancelar' : 'Nova tarefa'}
          </button>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Total', contagens.total, 'text-slate-800'],
          ['Pendentes', contagens.pendentes, 'text-amber-700'],
          ['Em andamento', contagens.andamento, 'text-blue-700'],
          ['Concluídas', contagens.concluidas, 'text-emerald-700'],
        ].map(([label, valor, classe]) => (
          <div key={label} className="card px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`text-xl font-bold ${classe}`}>{valor}</p>
          </div>
        ))}
      </div>

      {formAberto && podeEditar ? (
        <form onSubmit={salvar} className="card space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="ativTitulo">Título *</label>
              <input
                id="ativTitulo"
                className="campo"
                placeholder="Ex.: Concluir travessia do KM 12+350"
                value={form.titulo}
                onChange={(e) => setForm((atual) => ({ ...atual, titulo: e.target.value }))}
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="ativResponsavel">Responsável</label>
              <input
                id="ativResponsavel"
                className="campo"
                placeholder="Equipe / colaborador"
                value={form.responsavel}
                onChange={(e) => setForm((atual) => ({ ...atual, responsavel: e.target.value }))}
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="ativPrazo">Prazo</label>
              <input
                id="ativPrazo"
                type="date"
                className="campo"
                value={form.prazo}
                onChange={(e) => setForm((atual) => ({ ...atual, prazo: e.target.value }))}
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="ativStatus">Situação</label>
              <select
                id="ativStatus"
                className="campo"
                value={form.status}
                onChange={(e) => setForm((atual) => ({ ...atual, status: e.target.value }))}
                disabled={salvando}
              >
                {Object.entries(STATUS).map(([valor, dados]) => (
                  <option key={valor} value={valor}>{dados.label}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="ativDescricao">Descrição</label>
              <textarea
                id="ativDescricao"
                className="campo min-h-[72px] resize-y"
                placeholder="Detalhamento da atividade"
                value={form.descricao}
                onChange={(e) => setForm((atual) => ({ ...atual, descricao: e.target.value }))}
                disabled={salvando}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-neutro" onClick={limpar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando}>
              {salvando ? <Spinner tamanho="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {editandoId ? 'Salvar alterações' : 'Criar tarefa'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {[{ value: '', label: 'Todas' }, ...Object.entries(STATUS).map(([value, dados]) => ({ value, label: dados.label }))].map(
          (opcao) => (
            <button
              key={opcao.value || 'todas'}
              type="button"
              onClick={() => setFiltro(opcao.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                filtro === opcao.value
                  ? 'border-omega-600 bg-omega-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opcao.label}
            </button>
          )
        )}
      </div>

      {atividades.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <ListChecks className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhuma tarefa encontrada</p>
          <p className="max-w-md text-xs text-slate-500">
            {filtro ? 'Ajuste o filtro de situação ou crie uma nova tarefa.' : 'Crie a primeira tarefa para acompanhar a execução da obra.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {atividades.map((atividade) => {
            const dadosStatus = STATUS[atividade.status] || STATUS.PENDENTE;
            return (
              <li key={atividade.id} className="card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${dadosStatus.cor}`}>
                        {dadosStatus.label}
                      </span>
                      {atividade.relatorio ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          RDO #{atividade.relatorio.id}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-800">{atividade.titulo}</p>
                    {atividade.descricao ? (
                      <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">{atividade.descricao}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      {atividade.responsavel ? (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" aria-hidden="true" />
                          {atividade.responsavel}
                        </span>
                      ) : null}
                      {atividade.prazo ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" aria-hidden="true" />
                          Prazo: {formatarData(atividade.prazo)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {podeEditar ? (
                      <select
                        className="campo w-auto py-1 text-xs"
                        value={atividade.status}
                        onChange={(e) => alterarStatus(atividade, e.target.value)}
                        aria-label={`Status da atividade ${atividade.titulo}`}
                      >
                        {Object.entries(STATUS).map(([valor, dados]) => (
                          <option key={valor} value={valor}>{dados.label}</option>
                        ))}
                      </select>
                    ) : null}

                    {podeEditar ? (
                      <>
                        <button
                          type="button"
                          onClick={() => iniciarEdicao(atividade)}
                          title="Editar tarefa"
                          className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-omega-700"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remover(atividade)}
                          title="Remover tarefa"
                          className="rounded p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

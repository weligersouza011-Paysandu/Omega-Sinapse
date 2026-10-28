import { useMemo, useState } from 'react';
import { CalendarDays, Check, Gauge, Pencil, Plus, X } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import AvancoFisicoTabela from './AvancoFisicoTabela.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarAvancoFisico,
  criarAvancoFisico,
  removerAvancoFisico,
} from '../../hooks/useObras.js';
import { dataLocalISO, dataParaInput, formatarSemana, semanaISO } from '../../utils/formatters.js';

function formularioVazio(linhas = []) {
  const ordenadas = [...linhas].sort((a, b) => {
    const diferenca = new Date(a.data) - new Date(b.data);
    return diferenca !== 0 ? diferenca : Number(a.id || 0) - Number(b.id || 0);
  });
  const ultima = ordenadas[ordenadas.length - 1];

  let proximaData = dataLocalISO();
  if (ultima?.data) {
    const base = new Date(`${dataParaInput(ultima.data)}T12:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() + 7);
    proximaData = base.toISOString().slice(0, 10);
  }

  return {
    data: proximaData,
    semana: String(semanaISO(proximaData)),
    fisico_prev: '',
    fisico_lb_prev: '',
    fisico_real: '',
  };
}

/**
 * Editor do avanço físico semanal (base da Curva S).
 *
 * O usuário lança apenas os percentuais do período (previsto, linha de base e
 * realizado); os acumulados são preenchidos pelo back-end a partir da medição
 * anterior. A tabela reaproveitada exibe todo o histórico.
 */
export default function AvancoFisicoEditor({ obra, podeEditar = false, onObraAtualizada }) {
  const toast = useToast();
  const [form, setForm] = useState(() => formularioVazio(obra?.avanco_fisico || []));
  const [editandoId, setEditandoId] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const linhas = useMemo(
    () => [...(obra?.avanco_fisico || [])].sort((a, b) => {
      const diferenca = new Date(a.data) - new Date(b.data);
      return diferenca !== 0 ? diferenca : Number(a.id || 0) - Number(b.id || 0);
    }),
    [obra?.avanco_fisico]
  );

  const ultima = linhas[linhas.length - 1] || null;

  function alterar(campo, valor) {
    setForm((atual) => {
      if (campo !== 'data') return { ...atual, [campo]: valor };
      const semana = semanaISO(valor);
      return {
        ...atual,
        data: valor,
        semana: semana > 0 ? String(semana) : atual.semana,
      };
    });
  }

  function abrirNovo() {
    setEditandoId(null);
    setForm(formularioVazio(linhas));
    setFormAberto(true);
  }

  function limpar() {
    setEditandoId(null);
    setForm(formularioVazio(linhas));
    setFormAberto(false);
  }

  function iniciarEdicao(linha) {
    setEditandoId(linha.id);
    setForm({
      data: dataParaInput(linha.data),
      semana: String(linha.semana || semanaISO(linha.data)),
      fisico_prev: String(linha.fisico_prev ?? ''),
      fisico_lb_prev: String(linha.fisico_lb_prev ?? ''),
      fisico_real: String(linha.fisico_real ?? ''),
    });
    setFormAberto(true);
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!form.data) {
      toast.aviso('Informe a data da medição.');
      return;
    }
    if (!form.semana || Number(form.semana) <= 0) {
      toast.aviso('Informe a semana da medição (número inteiro positivo).');
      return;
    }

    const payload = {
      data: form.data,
      semana: Number(form.semana),
      fisico_prev: form.fisico_prev === '' ? 0 : Number(form.fisico_prev),
      fisico_lb_prev: form.fisico_lb_prev === '' ? 0 : Number(form.fisico_lb_prev),
      fisico_real: form.fisico_real === '' ? 0 : Number(form.fisico_real),
    };

    setSalvando(true);
    try {
      const atualizada = editandoId
        ? await atualizarAvancoFisico(obra.id, editandoId, payload)
        : await criarAvancoFisico(obra.id, payload);

      onObraAtualizada?.(atualizada);
      toast.sucesso(editandoId ? 'Medição atualizada.' : 'Medição da semana lançada.');
      setEditandoId(null);
      setFormAberto(false);
      setForm(formularioVazio(atualizada.avanco_fisico || []));
    } catch (err) {
      toast.erro(err.message || 'Não foi possível salvar a medição.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(linha) {
    const rotulo = formatarSemana(linha.semana, linha.data);
    if (!window.confirm(`Remover a medição de ${rotulo}?`)) return;

    try {
      const atualizada = await removerAvancoFisico(obra.id, linha.id);
      onObraAtualizada?.(atualizada);
      toast.sucesso('Medição removida.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover a medição.');
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Gauge className="h-4 w-4 text-omega-600" aria-hidden="true" />
            Avanço físico por medição
          </h3>
          <p className="text-xs text-slate-500">
            Lance os percentuais do período. Os acumulados são calculados automaticamente a partir da
            medição anterior.
          </p>
        </div>

        {podeEditar ? (
          <button
            type="button"
            className="btn-primario"
            onClick={() => (formAberto ? limpar() : abrirNovo())}
          >
            {formAberto ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {formAberto ? 'Cancelar' : 'Lançar medição'}
          </button>
        ) : null}
      </header>

      {ultima ? (
        <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Última medição: <strong>{formatarSemana(ultima.semana, ultima.data)}</strong> · Realizado acumulado{' '}
          <strong>{Number(ultima.fisico_real_acum || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</strong>{' '}
          · Previsto acumulado{' '}
          <strong>{Number(ultima.fisico_prev_acum || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</strong>
        </p>
      ) : null}

      {formAberto && podeEditar ? (
        <form onSubmit={salvar} className="mb-4 rounded-lg border border-omega-100 bg-omega-50/50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="rotulo" htmlFor="avData">Data *</label>
              <input
                id="avData"
                type="date"
                className="campo"
                value={form.data}
                onChange={(e) => alterar('data', e.target.value)}
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="avSemana">Semana (ISO)</label>
              <input
                id="avSemana"
                type="number"
                min="1"
                max="53"
                step="1"
                className="campo"
                value={form.semana}
                onChange={(e) => alterar('semana', e.target.value)}
                disabled={salvando}
              />
              <p className="mt-1 text-[10px] text-slate-400">Calculada pela data.</p>
            </div>

            <div>
              <label className="rotulo" htmlFor="avPrev">Físico_Prev (%)</label>
              <input
                id="avPrev"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="campo"
                placeholder="0,00"
                value={form.fisico_prev}
                onChange={(e) => alterar('fisico_prev', e.target.value)}
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="avLb">Físico_LB_PREV (%)</label>
              <input
                id="avLb"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="campo"
                placeholder="0,00"
                value={form.fisico_lb_prev}
                onChange={(e) => alterar('fisico_lb_prev', e.target.value)}
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="avReal">Físico_Real (%)</label>
              <input
                id="avReal"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="campo"
                placeholder="0,00"
                value={form.fisico_real}
                onChange={(e) => alterar('fisico_real', e.target.value)}
                disabled={salvando}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Percentuais do período — não informe os acumulados.
            </p>

            <div className="flex gap-2">
              <button type="button" className="btn-neutro" onClick={limpar} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={salvando}>
                {salvando ? <Spinner tamanho="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {editandoId ? 'Salvar alterações' : 'Lançar medição'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <AvancoFisicoTabela
        linhas={linhas}
        podeEditar={podeEditar}
        onEditar={iniciarEdicao}
        onRemover={remover}
      />

      {podeEditar && linhas.length > 0 ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400">
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edite ou remova uma medição pela coluna de ações da tabela.
        </p>
      ) : null}

      {podeEditar && linhas.length > 0 ? (
        <div className="mt-2 flex justify-end">
          <button type="button" className="btn-neutro" onClick={abrirNovo}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Lançar próxima medição
          </button>
        </div>
      ) : null}

      {linhas.length === 0 && !formAberto ? (
        <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Nenhuma medição registrada. Lance a primeira medição para gerar a Curva S da obra.
        </div>
      ) : null}
    </section>
  );
}

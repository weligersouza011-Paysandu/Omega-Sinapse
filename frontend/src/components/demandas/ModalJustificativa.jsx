import { useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import {
  CATEGORIAS_JUSTIFICATIVA,
  calcularAderencia,
  farolDaTarefa,
  formatarAderencia,
  rotuloTipo,
} from '../../utils/demandas.js';
import { formatarDataHora } from '../../utils/formatters.js';

/**
 * Concluir uma demanda após o vencimento exige justificativa com categoria
 * (regra de rastreabilidade validada também pela API) e permite vincular a
 * atividade que gerou ou impactou o atraso.
 */
export default function ModalJustificativa({ tarefa, tarefas = [], onConfirmar, onCancelar }) {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tarefaId, setTarefaId] = useState('');

  useEffect(() => {
    setTexto('');
    setCategoria('');
    setTarefaId('');
  }, [tarefa]);

  // Candidatas ao vínculo: demais atividades do mesmo responsável (exceto canceladas).
  const candidatas = useMemo(() => {
    if (!tarefa) return [];
    return tarefas
      .filter(
        (item) =>
          item.id !== tarefa.id && item.usuario_id === tarefa.usuario_id && item.status !== 'CANCELADO'
      )
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }, [tarefas, tarefa]);

  if (!tarefa) return null;
  const farol = farolDaTarefa(tarefa);
  const aderencia = calcularAderencia(tarefa.data_vencimento, new Date());
  const valido = texto.trim() && categoria;

  function confirmar(evento) {
    evento.preventDefault();
    if (!valido) return;
    onConfirmar(tarefa, {
      texto: texto.trim(),
      categoria,
      tarefaId: tarefaId ? Number(tarefaId) : null,
    });
  }

  return (
    <ModalBase
      aberto
      titulo="Justificativa de Conclusão em Atraso"
      subtitulo={tarefa.titulo}
      tamanho="md"
      onFechar={onCancelar}
    >
      <form onSubmit={confirmar}>
        <div className="space-y-4 px-5 py-5">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div className="text-sm text-red-800">
              <p>
                Esta demanda ({rotuloTipo(tarefa)}) venceu em{' '}
                <strong>{formatarDataHora(tarefa.data_vencimento)}</strong>
                {farol.diasAtraso ? ` (${farol.rotulo.toLowerCase()})` : ''}. Registre o motivo do atraso para
                concluí-la.
              </p>
              <p className="mt-1 text-xs">
                Aderência se concluída agora: <strong>{formatarAderencia(aderencia)}</strong> (−0,5% a cada 30 min
                de atraso).
              </p>
            </div>
          </div>

          <div>
            <label className="rotulo" htmlFor="justificativa-categoria">
              Categoria do atraso *
            </label>
            <select
              id="justificativa-categoria"
              className="campo"
              value={categoria}
              onChange={(evento) => setCategoria(evento.target.value)}
              autoFocus
            >
              <option value="">Selecione o motivo…</option>
              {CATEGORIAS_JUSTIFICATIVA.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="rotulo" htmlFor="justificativa-vinculo">
              Atividade que impactou o prazo (opcional)
            </label>
            <select
              id="justificativa-vinculo"
              className="campo"
              value={tarefaId}
              onChange={(evento) => setTarefaId(evento.target.value)}
            >
              <option value="">Sem vínculo com outra atividade</option>
              {candidatas.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.titulo} · {rotuloTipo(item)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="rotulo" htmlFor="justificativa-atraso">
              Justificativa do atraso *
            </label>
            <textarea
              id="justificativa-atraso"
              className="campo min-h-[120px] resize-y"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              placeholder="Explique o que levou à extrapolação do prazo (solicitação extra, dependências, mudanças de escopo, impedimentos de campo...)."
            />
            <p className="mt-1 text-[11px] text-slate-400">
              A justificativa e a data/hora exata do encerramento ficam registradas no histórico da demanda.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primario" disabled={!valido}>
            Concluir com justificativa
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

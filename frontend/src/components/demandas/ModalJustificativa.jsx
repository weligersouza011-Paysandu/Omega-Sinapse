import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import { farolDaTarefa } from '../../utils/demandas.js';
import { formatarDataHora } from '../../utils/formatters.js';

/**
 * Concluir uma demanda após o vencimento exige justificativa (regra ISO de
 * rastreabilidade validada também pela API).
 */
export default function ModalJustificativa({ tarefa, onConfirmar, onCancelar }) {
  const [texto, setTexto] = useState('');

  useEffect(() => {
    setTexto('');
  }, [tarefa]);

  if (!tarefa) return null;
  const farol = farolDaTarefa(tarefa);

  function confirmar(evento) {
    evento.preventDefault();
    if (texto.trim()) onConfirmar(tarefa, texto.trim());
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
            <p className="text-sm text-red-800">
              Esta demanda venceu em <strong>{formatarDataHora(tarefa.data_vencimento)}</strong>
              {farol.diasAtraso ? ` (${farol.rotulo.toLowerCase()})` : ''}. Registre o motivo do atraso para concluí-la.
            </p>
          </div>

          <div>
            <label className="rotulo" htmlFor="justificativa-atraso">
              Justificativa do atraso *
            </label>
            <textarea
              id="justificativa-atraso"
              className="campo min-h-[160px] resize-y"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              placeholder="Explique o que levou à extrapolação do prazo (dependências, mudanças de escopo, impedimentos de campo...)."
              autoFocus
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
          <button type="submit" className="btn-primario" disabled={!texto.trim()}>
            Concluir com justificativa
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

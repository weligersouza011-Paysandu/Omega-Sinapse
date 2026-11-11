import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { restaurarAlteracaoDaCurva } from '../../hooks/useMedicao.js';
import { formatarDataHora, formatarMoeda } from '../../utils/formatters.js';

const CAMPOS = {
  PREVISTO: { rotulo: 'Previsto', classe: 'bg-slate-100 text-slate-700' },
  PROJETADO: { rotulo: 'Projetado', classe: 'bg-amber-100 text-amber-800' },
  TENDENCIA: { rotulo: 'Tendência', classe: 'bg-amber-100 text-amber-800' },
};

const valorTexto = (valor) => (valor === null || valor === undefined ? 'vazio' : formatarMoeda(valor));

const FILTROS = [
  { chave: 'TODOS', rotulo: 'Todos' },
  { chave: 'PREVISTO', rotulo: 'Previsto' },
  { chave: 'PROJETADO', rotulo: 'Projetado' },
  { chave: 'TENDENCIA', rotulo: 'Tendência' },
];

/**
 * Histórico de alterações da curva (previsto, projetado e tendência por mês), logo abaixo da tabela
 * Previsto × Real. Cada linha pode ser restaurada: o mês volta ao valor de antes daquela alteração.
 */
export default function HistoricoCurva({ historico = [], contratoId, podeGerir, onAlterado }) {
  const toast = useToast();
  const [filtro, setFiltro] = useState('TODOS');
  const [restaurando, setRestaurando] = useState(null);
  const [confirmando, setConfirmando] = useState(null);

  const visiveis = historico.filter((item) => filtro === 'TODOS' || item.campo === filtro);
  const porId = new Map(historico.map((item) => [item.id, item]));

  async function restaurar(item) {
    setRestaurando(item.id);
    try {
      await restaurarAlteracaoDaCurva(contratoId, item.id);
      toast.sucesso(`${CAMPOS[item.campo]?.rotulo ?? 'Valor'} de ${item.rotulo} voltou para ${valorTexto(item.valor_anterior)}.`);
      setConfirmando(null);
      onAlterado();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível restaurar o valor.');
    } finally {
      setRestaurando(null);
    }
  }

  return (
    <section className="card overflow-hidden" aria-label="Histórico de alterações da curva">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200">
            <History className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Histórico de alterações</h3>
            <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-slate-500">
              Cada ajuste de previsto, projetado ou tendência fica registrado aqui.
              {podeGerir ? ' Use "Voltar ao anterior" para devolver o mês ao valor da coluna "De".' : ''}
            </p>
          </div>
        </div>
        <div role="group" aria-label="Filtrar histórico" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {FILTROS.map((opcao) => (
            <button
              key={opcao.chave}
              type="button"
              aria-pressed={filtro === opcao.chave}
              onClick={() => setFiltro(opcao.chave)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                filtro === opcao.chave ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      </header>

      {visiveis.length === 0 ? (
        <p className="border-t border-slate-200 px-5 py-6 text-center text-xs text-slate-500">
          {historico.length === 0
            ? 'Nenhuma alteração registrada ainda. Os próximos ajustes na tabela aparecem aqui.'
            : 'Nenhuma alteração deste tipo.'}
        </p>
      ) : (
        <div className="max-h-[22rem] overflow-auto border-t border-slate-200">
          <table className="min-w-full text-xs tabular-nums">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-left">Quando</th>
                <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-left">Mês</th>
                <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-left">Campo</th>
                <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-right">De</th>
                <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-right">Para</th>
                <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-right">Diferença</th>
                <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-left">Por</th>
                {podeGerir ? <th scope="col" className="sticky top-0 z-10 bg-slate-50 px-3 py-2"><span className="sr-only">Ações</span></th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiveis.map((item) => {
                const campo = CAMPOS[item.campo] ?? { rotulo: item.campo, classe: 'bg-slate-100 text-slate-700' };
                const diferenca =
                  item.valor_anterior !== null && item.valor_novo !== null ? item.valor_novo - item.valor_anterior : null;
                const origem = item.restaurado_de ? porId.get(item.restaurado_de) : null;
                return (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{formatarDataHora(item.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-slate-700">{item.rotulo}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className={`rounded px-1.5 py-px text-[10px] font-bold uppercase ${campo.classe}`}>{campo.rotulo}</span>
                      {item.restaurado_de ? (
                        <span className="ml-1.5 text-[10px] text-slate-500" title={origem ? `Restaurou a alteração de ${formatarDataHora(origem.created_at)}` : undefined}>
                          restauração
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-500">{valorTexto(item.valor_anterior)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-slate-800">{valorTexto(item.valor_novo)}</td>
                    <td
                      className={`whitespace-nowrap px-3 py-1.5 text-right ${
                        diferenca === null || Math.abs(diferenca) < 0.005 ? 'text-slate-400' : diferenca < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {diferenca === null ? '—' : `${diferenca > 0 ? '+' : ''}${formatarMoeda(diferenca)}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{item.usuario_nome || '—'}</td>
                    {podeGerir ? (
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">
                        {confirmando === item.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">Voltar {item.rotulo} para {valorTexto(item.valor_anterior)}?</span>
                            <button
                              type="button"
                              className="btn-primario !px-2 !py-1 !text-[11px]"
                              onClick={() => restaurar(item)}
                              disabled={restaurando !== null}
                            >
                              {restaurando === item.id ? <Spinner tamanho="sm" /> : null}
                              Confirmar
                            </button>
                            <button
                              type="button"
                              className="btn-neutro !px-2 !py-1 !text-[11px]"
                              onClick={() => setConfirmando(null)}
                              disabled={restaurando !== null}
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-neutro !px-2 !py-1 !text-[11px]"
                            onClick={() => setConfirmando(item.id)}
                            disabled={restaurando !== null}
                            title={`Volta ${campo.rotulo.toLowerCase()} de ${item.rotulo} para ${valorTexto(item.valor_anterior)}`}
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                            Voltar ao anterior
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

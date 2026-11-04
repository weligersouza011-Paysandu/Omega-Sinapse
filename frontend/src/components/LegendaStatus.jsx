import { obterStatus } from '../utils/status.js';

/**
 * Legenda de status do ciclo comercial com a quantidade de orçamentos em cada
 * etapa. Cada pílula funciona como filtro rápido: clicar seleciona o status;
 * clicar de novo na pílula ativa limpa o filtro.
 */
export default function LegendaStatus({ statuses, rotulos = {}, contagem, carregando, selecionado, onSelecionar }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
      {statuses.map((valor) => {
        const info = obterStatus(valor);
        const ativo = selecionado === valor;
        const quantidade = contagem[valor];

        return (
          <button
            key={valor}
            type="button"
            onClick={() => onSelecionar(ativo ? '' : valor)}
            aria-pressed={ativo}
            title={ativo ? 'Clique para limpar o filtro' : `Exibir apenas: ${info.descricao}`}
            className={[
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40',
              ativo ? `${info.cor} shadow-sm ring-1 ring-black/10` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: info.hex }} aria-hidden="true" />
            {rotulos[valor] || info.label}
            <span
              className={[
                'min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums',
                ativo ? 'bg-white/70' : 'bg-slate-100 text-slate-700',
                carregando && quantidade === undefined ? 'animate-pulse' : '',
              ].join(' ')}
            >
              {quantidade ?? '–'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

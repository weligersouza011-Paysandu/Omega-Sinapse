import { useState } from 'react';
import { Check, Pencil, RefreshCw, TableProperties, X } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarPrevistoDaCurva, atualizarTendenciaDaCurva, recalcularTendenciaDaCurva } from '../../hooks/useMedicao.js';
import { formatarMoeda, formatarPercentual } from '../../utils/formatters.js';

const Th = ({ children, className = '' }) => (
  <th
    scope="col"
    className={`sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500 first:text-left ${className}`}
  >
    {children}
  </th>
);

/** Desvio em cor: abaixo do previsto em vermelho, acima em verde, zero neutro. */
function classeDesvio(valor) {
  if (valor === null || valor === undefined) return 'text-slate-300';
  if (Math.abs(valor) < 0.005) return 'text-slate-500';
  return valor < 0 ? 'text-red-700' : 'text-emerald-700';
}

const sinal = (valor) => (valor > 0 ? '+' : '');

function percentualDe(parte, base) {
  return base > 0 ? (parte / base) * 100 : null;
}

/**
 * Célula de valor editável (previsto ou tendência): botão com lápis; ao clicar vira campo numérico
 * (Enter salva, Esc cancela).
 */
function CelulaEditavel({ ponto, campo, valor, texto, classe, rotuloAria, podeEditar, edicao, setEdicao, salvar, salvando, vazio = false }) {
  const emEdicao = edicao?.referencia === ponto.referencia && edicao?.campo === campo;
  if (emEdicao) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="0.01"
          autoFocus
          aria-label={`${rotuloAria} de ${ponto.rotulo}`}
          className="campo !w-32 !px-2 !py-1 text-right text-xs"
          value={edicao.valor}
          onChange={(e) => setEdicao({ referencia: ponto.referencia, campo, valor: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') salvar();
            if (e.key === 'Escape') setEdicao(null);
          }}
          disabled={salvando}
        />
        <button type="button" onClick={salvar} disabled={salvando} aria-label={`Salvar ${rotuloAria.toLowerCase()}`} className="flex h-6 w-6 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
          {salvando ? <Spinner tamanho="sm" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => setEdicao(null)} disabled={salvando} aria-label="Cancelar" className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:bg-slate-50">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    );
  }
  if (podeEditar) {
    return (
      <button
        type="button"
        onClick={() => setEdicao({ referencia: ponto.referencia, campo, valor: vazio ? '' : String(valor) })}
        className={`group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition hover:bg-slate-100 ${classe}`}
        aria-label={`Ajustar ${rotuloAria.toLowerCase()} de ${ponto.rotulo}`}
        title={`Ajustar ${rotuloAria.toLowerCase()} deste mês`}
      >
        {texto}
        <Pencil className="h-3 w-3 text-slate-300 transition group-hover:text-omega-600" aria-hidden="true" />
      </button>
    );
  }
  return <span className={classe}>{texto}</span>;
}

/**
 * Previsto × Real por mês, logo abaixo da Curva S. O previsto de cada mês pode ser ajustado aqui
 * (Supervisor/Admin): o acumulado dos meses seguintes acompanha e a tendência é recalculada.
 */
export default function TabelaPrevistoReal({ curva = [], fonte, contratoId, podeGerir, onAlterado }) {
  const toast = useToast();
  const [edicao, setEdicao] = useState(null); // { referencia, campo: 'previsto' | 'tendencia', valor }
  const [salvando, setSalvando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  if (curva.length === 0) return null;

  const ultimaMedida = [...curva].reverse().find((ponto) => ponto.real !== null && ponto.real !== undefined);
  const ritmo = ultimaMedida ? percentualDe(ultimaMedida.real_acumulado, ultimaMedida.previsto_acumulado) : null;
  const editavel = podeGerir && fonte === 'CONTRATO';
  const celula = { edicao, setEdicao, salvar, salvando };

  async function salvar() {
    if (!edicao) return;
    const valor = Number(edicao.valor);
    if (edicao.valor === '' || Number.isNaN(valor) || valor < 0) {
      toast.erro('Informe um valor válido (zero ou mais).');
      return;
    }
    setSalvando(true);
    try {
      if (edicao.campo === 'tendencia') {
        await atualizarTendenciaDaCurva(contratoId, edicao.referencia, valor);
        toast.sucesso('Tendência do mês atualizada.');
      } else {
        await atualizarPrevistoDaCurva(contratoId, edicao.referencia, valor);
        toast.sucesso('Previsto atualizado. Acumulado e tendência recalculados.');
      }
      setEdicao(null);
      onAlterado();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível atualizar o previsto.');
    } finally {
      setSalvando(false);
    }
  }

  async function recalcular() {
    setRecalculando(true);
    try {
      await recalcularTendenciaDaCurva(contratoId);
      toast.sucesso('Tendência recalculada com o previsto e o medido atuais.');
      onAlterado();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível recalcular a tendência.');
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <section className="card overflow-hidden" aria-label="Previsto versus real por mês">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <TableProperties className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Previsto × Real por mês</h3>
            <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-slate-500">
              Real = boletins aprovados do ciclo (16 a 15). Desvio = real − previsto.
              {editavel ? ' Clique no previsto de um mês para ajustá-lo (o acumulado seguinte acompanha e a tendência é recalculada) ou na tendência para fixar um valor manual.' : ''}
            </p>
          </div>
        </div>
        {editavel ? (
          <button
            type="button"
            className="btn-neutro !px-3 !py-1.5 !text-xs"
            onClick={recalcular}
            disabled={recalculando}
            title="Recalcula a tendência com o previsto e o medido atuais"
          >
            {recalculando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Recalcular tendência
          </button>
        ) : null}
      </header>

      <div className="max-h-[26rem] overflow-auto border-t border-slate-200">
        <table className="min-w-full text-xs tabular-nums">
          <thead>
            <tr>
              <Th>Mês</Th>
              <Th>Previsto</Th>
              <Th>Real</Th>
              <Th>Desvio (R$)</Th>
              <Th>Desvio (%)</Th>
              <Th>Prev. acum.</Th>
              <Th>Real acum.</Th>
              <Th>Desvio acum.</Th>
              <Th>Tendência</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {curva.map((ponto) => {
              const medido = ponto.real !== null && ponto.real !== undefined;
              const desvio = medido ? ponto.real - ponto.previsto : null;
              const desvioPct = medido ? percentualDe(desvio, ponto.previsto) : null;
              const desvioAcum = medido ? ponto.real_acumulado - ponto.previsto_acumulado : null;
              const desvioAcumPct = medido ? percentualDe(desvioAcum, ponto.previsto_acumulado) : null;
              const ehUltima = ultimaMedida && ultimaMedida.referencia === ponto.referencia;

              return (
                <tr
                  key={ponto.referencia}
                  className={ehUltima ? 'bg-omega-50/60' : medido ? '' : 'text-slate-500'}
                  aria-current={ehUltima ? 'true' : undefined}
                >
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-semibold text-slate-700">
                    {ponto.rotulo}
                    {ehUltima ? <span className="ml-1.5 rounded bg-omega-100 px-1 py-px text-[9px] font-bold uppercase text-omega-700">último medido</span> : null}
                  </th>
                  <td className="px-3 py-1.5 text-right">
                    <CelulaEditavel
                      ponto={ponto}
                      campo="previsto"
                      valor={ponto.previsto}
                      texto={formatarMoeda(ponto.previsto)}
                      classe="font-semibold text-slate-800"
                      rotuloAria="Previsto"
                      podeEditar={editavel && ponto.editavel}
                      {...celula}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{medido ? formatarMoeda(ponto.real) : '—'}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${classeDesvio(desvio)}`}>
                    {medido ? `${sinal(desvio)}${formatarMoeda(desvio)}` : '—'}
                  </td>
                  <td className={`px-3 py-1.5 text-right ${classeDesvio(desvioPct)}`}>
                    {desvioPct === null ? '—' : `${sinal(desvioPct)}${formatarPercentual(desvioPct, 1)}`}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600">{formatarMoeda(ponto.previsto_acumulado)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-600">{medido ? formatarMoeda(ponto.real_acumulado) : '—'}</td>
                  <td className={`px-3 py-1.5 text-right ${classeDesvio(desvioAcum)}`}>
                    {medido ? `${sinal(desvioAcum)}${formatarMoeda(desvioAcum)}` : '—'}
                    {desvioAcumPct === null ? '' : <span className="ml-1 text-[10px] opacity-80">({sinal(desvioAcumPct)}{formatarPercentual(desvioAcumPct, 1)})</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <CelulaEditavel
                      ponto={ponto}
                      campo="tendencia"
                      valor={ponto.tendencia_acumulada}
                      vazio={!(ponto.tendencia_acumulada > 0)}
                      texto={ponto.tendencia_acumulada > 0 ? formatarMoeda(ponto.tendencia_acumulada) : '—'}
                      classe="text-amber-700"
                      rotuloAria="Tendência"
                      podeEditar={editavel && ponto.editavel}
                      {...celula}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-200 px-5 py-2.5 text-[11px] leading-relaxed text-slate-500">
        Tendência = medido acumulado até o último ciclo medido + previsto de cada mês seguinte × o ritmo do contrato
        {ritmo !== null ? ` (hoje ${formatarPercentual(ritmo, 1)} do previsto)` : ''}.
      </p>
    </section>
  );
}

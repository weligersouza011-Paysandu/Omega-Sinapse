import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, RefreshCw, TableProperties, X } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarPrevistoDaCurva,
  atualizarProjetadoDaCurva,
  atualizarTendenciaDaCurva,
  recalcularTendenciaDaCurva,
} from '../../hooks/useMedicao.js';
import { formatarData, formatarMoeda, formatarPercentual } from '../../utils/formatters.js';

const Th = ({ children, className = '', title }) => (
  <th
    scope="col"
    title={title}
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
const medidoEm = (ponto) => ponto.real !== null && ponto.real !== undefined;

function percentualDe(parte, base) {
  return base > 0 ? (parte / base) * 100 : null;
}

/** Valor com sinal e, opcionalmente, o percentual pequeno ao lado. */
function ValorDesvio({ valor, percentual }) {
  if (valor === null) return <span className="text-slate-300">—</span>;
  return (
    <span className={classeDesvio(valor)}>
      {sinal(valor)}
      {formatarMoeda(valor)}
      {percentual === null || percentual === undefined ? null : (
        <span className="ml-1 text-[10px] opacity-80">
          ({sinal(percentual)}
          {formatarPercentual(percentual, 1)})
        </span>
      )}
    </span>
  );
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

function Indicador({ rotulo, valor, detalhe, classeValor = 'text-slate-800' }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-0.5 truncate text-sm font-bold tabular-nums ${classeValor}`}>{valor}</p>
      {detalhe ? <p className="mt-0.5 truncate text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

const FILTROS = [
  { chave: 'TUDO', rotulo: 'Tudo' },
  { chave: 'REALIZADO', rotulo: 'Realizado' },
  { chave: 'PROJECAO', rotulo: 'Projeção' },
];

/**
 * Previsto × Real por mês, logo abaixo da Curva S, do início da curva até a última medição prevista
 * (fim do contrato). O previsto e a tendência de cada mês podem ser ajustados aqui (Supervisor/Admin);
 * um mês futuro que ainda não está na curva ganha a linha ao ser ajustado.
 */
export default function TabelaPrevistoReal({ curva = [], fonte, contratoId, podeGerir, onAlterado, dataFim, valorContrato }) {
  const toast = useToast();
  const [edicao, setEdicao] = useState(null); // { referencia, campo: 'previsto' | 'tendencia', valor }
  const [salvando, setSalvando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [filtro, setFiltro] = useState('TUDO');
  const rolagemRef = useRef(null);
  const ultimaLinhaRef = useRef(null);

  const ultimaMedida = useMemo(() => [...curva].reverse().find(medidoEm), [curva]);
  const projetados = useMemo(() => curva.filter((ponto) => ponto.projecao), [curva]);

  // Ao abrir, rola até o último mês medido para mostrar o realizado recente e a projeção juntos.
  useEffect(() => {
    const caixa = rolagemRef.current;
    const linha = ultimaLinhaRef.current;
    if (!caixa || !linha || filtro !== 'TUDO') return;
    caixa.scrollTop = Math.max(0, linha.offsetTop - caixa.clientHeight / 2);
  }, [ultimaMedida?.referencia, filtro]);

  if (curva.length === 0) return null;

  const ritmo = ultimaMedida ? percentualDe(ultimaMedida.real_acumulado, ultimaMedida.previsto_acumulado) : null;
  const editavel = podeGerir && fonte === 'CONTRATO';
  const celula = { edicao, setEdicao, salvar, salvando };

  const ultimoPonto = curva[curva.length - 1];
  const tendenciaFinal = ultimoPonto.tendencia_acumulada > 0 ? ultimoPonto.tendencia_acumulada : null;
  const folga = tendenciaFinal !== null && valorContrato > 0 ? valorContrato - tendenciaFinal : null;
  const previstoFuturoZerado = projetados.length > 0 && projetados.every((ponto) => !(ponto.previsto > 0));

  const totalPrevisto = ultimoPonto.previsto_acumulado;
  const totalProjetado = curva.reduce((soma, ponto) => soma + (Number(ponto.previsto_replanejado) || 0), 0);
  const totalReal = ultimaMedida ? ultimaMedida.real_acumulado : 0;
  const previstoAteUltima = ultimaMedida ? ultimaMedida.previsto_acumulado : 0;

  const linhasVisiveis = curva.filter((ponto) => {
    if (filtro === 'REALIZADO') return !ponto.projecao;
    if (filtro === 'PROJECAO') return ponto.projecao || ponto.referencia === ultimaMedida?.referencia;
    return true;
  });
  const primeiraProjecao = linhasVisiveis.find((ponto) => ponto.projecao)?.referencia;

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
      } else if (edicao.campo === 'projetado') {
        await atualizarProjetadoDaCurva(contratoId, edicao.referencia, valor);
        toast.sucesso('Projetado do mês atualizado.');
      } else {
        await atualizarPrevistoDaCurva(contratoId, edicao.referencia, valor);
        toast.sucesso('Previsto atualizado. Acumulado e tendência recalculados.');
      }
      setEdicao(null);
      onAlterado();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível atualizar o valor.');
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
              {dataFim ? ` Projeção até a última medição prevista (${formatarData(dataFim)}).` : ''}
              {editavel ? ' Clique no previsto, no projetado ou na tendência de um mês para ajustá-lo.' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filtrar meses" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
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
          {editavel ? (
            <button
              type="button"
              className="btn-neutro !px-3 !py-1.5 !text-xs"
              onClick={recalcular}
              disabled={recalculando}
              title="Recalcula a tendência com o previsto e o medido atuais (descarta ajustes manuais)"
            >
              {recalculando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Recalcular tendência
            </button>
          ) : null}
        </div>
      </header>

      {fonte === 'CONTRATO' ? (
        <div className="grid grid-cols-2 gap-2 px-5 pb-3 lg:grid-cols-4">
          <Indicador
            rotulo="Última medição prevista"
            valor={dataFim ? formatarData(dataFim) : ultimoPonto.rotulo}
            detalhe={`${projetados.length} ${projetados.length === 1 ? 'medição restante' : 'medições restantes'} após ${ultimaMedida?.rotulo ?? '—'}`}
          />
          <Indicador
            rotulo="Real acumulado"
            valor={formatarMoeda(totalReal)}
            detalhe={ritmo !== null ? `${formatarPercentual(ritmo, 1)} do previsto até ${ultimaMedida.rotulo}` : null}
            classeValor={classeDesvio(totalReal - previstoAteUltima)}
          />
          <Indicador rotulo="Previsto no fim" valor={formatarMoeda(totalPrevisto)} detalhe={`acumulado até ${ultimoPonto.rotulo}`} />
          <Indicador
            rotulo="Tendência no fim"
            valor={tendenciaFinal !== null ? formatarMoeda(tendenciaFinal) : '—'}
            classeValor="text-amber-700"
            detalhe={
              folga === null
                ? null
                : folga >= 0
                  ? `folga de ${formatarMoeda(folga)} no valor do contrato`
                  : `excede o contrato em ${formatarMoeda(-folga)}`
            }
          />
        </div>
      ) : null}

      {editavel && previstoFuturoZerado ? (
        <p className="mx-5 mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Os meses de {projetados[0].rotulo} a {ultimoPonto.rotulo} ainda estão sem previsto. Informe o previsto de cada mês
          para a tendência projetar o fim do contrato.
        </p>
      ) : null}

      <div ref={rolagemRef} className="relative max-h-[30rem] overflow-auto border-t border-slate-200">
        <table className="min-w-full text-xs tabular-nums">
          <thead>
            <tr>
              <Th className="sticky left-0 z-20">Mês</Th>
              <Th>Previsto</Th>
              <Th title="Previsto replanejado do ciclo (colunas amarelas da Curva S)">Projetado</Th>
              <Th>Real</Th>
              <Th title="Real − previsto do mês">Desvio</Th>
              <Th>Prev. acum.</Th>
              <Th>Real acum.</Th>
              <Th title="Real acumulado − previsto acumulado">Desvio acum.</Th>
              <Th title="Quanto a tendência projeta medir no mês">Tend. mês</Th>
              <Th title="Medido acumulado + projeção dos meses seguintes">Tend. acum.</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhasVisiveis.map((ponto) => {
              const medido = medidoEm(ponto);
              const desvio = medido ? ponto.real - ponto.previsto : null;
              const desvioPct = medido ? percentualDe(desvio, ponto.previsto) : null;
              const desvioAcum = medido ? ponto.real_acumulado - ponto.previsto_acumulado : null;
              const desvioAcumPct = medido ? percentualDe(desvioAcum, ponto.previsto_acumulado) : null;
              const ehUltima = ultimaMedida && ultimaMedida.referencia === ponto.referencia;
              const temTendencia = (ponto.projecao || ehUltima) && ponto.tendencia_acumulada > 0;

              const linha = (
                <tr
                  key={ponto.referencia}
                  ref={ehUltima ? ultimaLinhaRef : undefined}
                  className={ehUltima ? 'bg-omega-50' : undefined}
                  aria-current={ehUltima ? 'true' : undefined}
                >
                  <th
                    scope="row"
                    className={`sticky left-0 whitespace-nowrap px-3 py-1.5 text-left font-semibold text-slate-700 ${ehUltima ? 'bg-omega-50' : 'bg-white'} ${ponto.projecao ? 'border-l-2 border-amber-300' : ''}`}
                  >
                    {ponto.rotulo}
                    {ehUltima ? <span className="ml-1.5 rounded bg-omega-100 px-1 py-px text-[9px] font-bold uppercase text-omega-700">último medido</span> : null}
                    {ponto.fim_do_contrato ? <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] font-bold uppercase text-amber-800">fim do contrato</span> : null}
                  </th>
                  <td className="px-3 py-1.5 text-right">
                    <CelulaEditavel
                      ponto={ponto}
                      campo="previsto"
                      valor={ponto.previsto}
                      vazio={!(ponto.previsto > 0)}
                      texto={ponto.previsto > 0 ? formatarMoeda(ponto.previsto) : <span className="text-slate-400">a definir</span>}
                      classe="font-semibold text-slate-800"
                      rotuloAria="Previsto"
                      podeEditar={editavel && ponto.editavel}
                      {...celula}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <CelulaEditavel
                      ponto={ponto}
                      campo="projetado"
                      valor={ponto.previsto_replanejado}
                      vazio={ponto.previsto_replanejado === null || ponto.previsto_replanejado === undefined}
                      texto={
                        ponto.previsto_replanejado === null || ponto.previsto_replanejado === undefined ? (
                          <span className="text-slate-400">a definir</span>
                        ) : (
                          formatarMoeda(ponto.previsto_replanejado)
                        )
                      }
                      classe="text-amber-700"
                      rotuloAria="Projetado"
                      podeEditar={editavel && ponto.editavel}
                      {...celula}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{medido ? formatarMoeda(ponto.real) : <span className="text-slate-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold">
                    <ValorDesvio valor={desvio} percentual={ponto.previsto > 0 ? desvioPct : null} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600">{formatarMoeda(ponto.previsto_acumulado)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-600">{medido ? formatarMoeda(ponto.real_acumulado) : <span className="text-slate-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <ValorDesvio valor={desvioAcum} percentual={desvioAcumPct} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-amber-700">
                    {ponto.projecao && ponto.tendencia_mensal !== null ? formatarMoeda(ponto.tendencia_mensal) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <CelulaEditavel
                      ponto={ponto}
                      campo="tendencia"
                      valor={ponto.tendencia_acumulada}
                      vazio={!temTendencia}
                      texto={temTendencia ? formatarMoeda(ponto.tendencia_acumulada) : <span className="text-slate-300">—</span>}
                      classe={`text-amber-700 ${ponto.tendencia_calculada ? '' : 'font-semibold'}`}
                      rotuloAria="Tendência"
                      podeEditar={editavel && ponto.editavel && ponto.projecao}
                      {...celula}
                    />
                  </td>
                </tr>
              );

              if (ponto.referencia !== primeiraProjecao) return linha;
              return [
                <tr key={`${ponto.referencia}-divisor`} aria-hidden="true">
                  <td colSpan={10} className="bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                    Projeção — {ponto.rotulo} a {ultimoPonto.rotulo}
                    {dataFim ? ` · última medição prevista em ${formatarData(dataFim)}` : ''}
                  </td>
                </tr>,
                linha,
              ];
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold text-slate-800">
              <th scope="row" className="sticky bottom-0 left-0 z-10 whitespace-nowrap border-t border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">
                Total até {ultimoPonto.rotulo}
              </th>
              <td className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-right">{formatarMoeda(totalPrevisto)}</td>
              <td className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-right text-amber-700">{formatarMoeda(totalProjetado)}</td>
              <td className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-right">{formatarMoeda(totalReal)}</td>
              <td className="sticky bottom-0 whitespace-nowrap border-t border-slate-200 bg-slate-50 px-3 py-2 text-right">
                {ultimaMedida ? <ValorDesvio valor={totalReal - previstoAteUltima} percentual={percentualDe(totalReal - previstoAteUltima, previstoAteUltima)} /> : '—'}
              </td>
              <td className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-3 py-2" colSpan={3} />
              <td className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-right text-amber-700">
                {tendenciaFinal !== null ? formatarMoeda(tendenciaFinal - totalReal) : '—'}
              </td>
              <td className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-right text-amber-700">
                {tendenciaFinal !== null ? formatarMoeda(tendenciaFinal) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-slate-200 px-5 py-2.5 text-[11px] leading-relaxed text-slate-500">
        Tendência = medido acumulado até o último ciclo medido + previsto de cada mês seguinte × o ritmo do contrato
        {ritmo !== null ? ` (hoje ${formatarPercentual(ritmo, 1)} do previsto)` : ''}. Valores em negrito na tendência
        foram fixados (planilha ou ajuste manual); os demais são calculados.
      </p>
    </section>
  );
}

import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FilePlus2, FileText, Pencil, Trash2 } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import ModalTac from './ModalTac.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { excluirTac } from '../../hooks/useMedicao.js';
import { formatarData, formatarMoeda, formatarMoedaCompacta } from '../../utils/formatters.js';
import { CG, GS } from '../../utils/coresGrafico.js';

const COR_TETO = GS.marca;
const COR_TAC = '#d97706';

function TooltipTac({ active, payload }) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">
        {ponto.rotulo}
        {ponto.data ? <span className="ml-1 font-normal text-slate-400">{formatarData(ponto.data)}</span> : null}
      </p>
      {ponto.aditivo ? (
        <p className="text-slate-600">
          Aditivo: <strong className="text-amber-700">+ {formatarMoeda(ponto.aditivo)}</strong>
        </p>
      ) : null}
      <p className="text-slate-600">
        Teto do contrato: <strong className="text-slate-800">{formatarMoeda(ponto.teto)}</strong>
      </p>
      {ponto.motivo ? <p className="mt-1 max-w-xs text-slate-500">{ponto.motivo}</p> : null}
    </div>
  );
}

/**
 * Termos aditivos (TAC) de um contrato: linha do tempo do teto (início, cada TAC e
 * fim da vigência) e tabela para corrigir ou excluir cada TAC.
 */
export default function TacsDoContrato({ contratos, contratoId, onContratoChange, podeGerir, onAlterado }) {
  const toast = useToast();
  const contrato = contratos.find((item) => item.id === contratoId) || contratos[0] || null;
  const [modal, setModal] = useState({ aberto: false, tac: null });
  const [excluir, setExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);

  const aditivos = useMemo(
    () => [...(contrato?.aditivos || [])].sort((a, b) => (a.data_assinatura < b.data_assinatura ? -1 : 1)),
    [contrato]
  );

  // Pontos do gráfico: início, um por TAC e fim da vigência (o teto muda em degraus).
  const pontos = useMemo(() => {
    if (!contrato) return [];
    const lista = [
      { rotulo: 'Início', data: contrato.data_inicio, aditivo: 0, teto: contrato.valor_inicial, motivo: 'Valor inicial do contrato' },
      ...aditivos.map((tac) => ({
        rotulo: tac.numero_tac,
        data: tac.data_assinatura,
        aditivo: tac.valor_aditivo,
        teto: tac.novo_valor_total,
        motivo: tac.motivo,
      })),
    ];
    const ultimo = lista[lista.length - 1];
    lista.push({ rotulo: 'Fim da vigência', data: contrato.data_fim, aditivo: 0, teto: ultimo.teto, motivo: null });
    return lista;
  }, [contrato, aditivos]);

  async function confirmarExclusao() {
    setExcluindo(true);
    try {
      await excluirTac(contrato.id, excluir.id);
      toast.sucesso(`${excluir.numero_tac} excluído.`);
      setExcluir(null);
      onAlterado();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível excluir o TAC.');
    } finally {
      setExcluindo(false);
    }
  }

  if (!contrato) return null;

  return (
    <section className="card overflow-hidden" aria-label="Termos aditivos do contrato">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Termos aditivos (TAC)</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Quando cada aditivo foi assinado e como o teto do contrato mudou. Corrija ou exclua pela tabela.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {contratos.length > 1 ? (
            <label className="min-w-[200px]">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Contrato</span>
              <select className="campo w-full" value={contrato.id} onChange={(e) => onContratoChange(Number(e.target.value))}>
                {contratos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id_vale} ({item.aditivos.length} TAC)
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {podeGerir ? (
            <button type="button" className="btn-primario" onClick={() => setModal({ aberto: true, tac: null })}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Registrar TAC
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-px border-y border-slate-100 bg-slate-100 sm:grid-cols-3">
        {[
          ['Valor inicial', formatarMoeda(contrato.valor_inicial), 'text-slate-800'],
          ['Total dos aditivos', `${formatarMoeda(contrato.consolidado.total_aditivos)} (${aditivos.length})`, 'text-amber-700'],
          ['Teto atual', formatarMoeda(contrato.consolidado.teto_atual), 'text-omega-700'],
        ].map(([rotulo, valor, cor]) => (
          <div key={rotulo} className="bg-white px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
            <p className={`text-base font-black tabular-nums ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-4">
        {aditivos.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
            <FileText className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">Nenhum TAC registrado em {contrato.id_vale}</p>
            <p className="max-w-sm text-xs text-slate-500">Quando você registrar um aditivo, ele aparece aqui na linha do tempo e na tabela.</p>
          </div>
        ) : (
          <>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pontos} margin={{ top: 14, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CG.grade} vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: CG.eixo }} tickLine={false} />
                  <YAxis
                    yAxisId="aditivo"
                    orientation="left"
                    tick={{ fontSize: 11, fill: GS.previstoAcum }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(v) => formatarMoedaCompacta(v)}
                  />
                  <YAxis
                    orientation="right"
                    domain={['dataMin - 1000000', 'dataMax + 1000000']}
                    tick={{ fontSize: 11, fill: COR_TETO }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    tickFormatter={(v) => formatarMoedaCompacta(v)}
                  />
                  <Tooltip content={<TooltipTac />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                  <Bar yAxisId="aditivo" dataKey="aditivo" name="Valor do aditivo" fill={COR_TAC} maxBarSize={38} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="teto" name="Teto do contrato" stroke={COR_TETO} strokeWidth={2.5} dot={{ r: 4, fill: COR_TETO, strokeWidth: 0 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COR_TAC }} aria-hidden="true" />
                Valor de cada aditivo (eixo esquerdo)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0 w-5" style={{ borderTop: `3px solid ${COR_TETO}` }} aria-hidden="true" />
                Teto do contrato (eixo direito)
              </span>
            </div>
          </>
        )}
      </div>

      {aditivos.length > 0 ? (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['TAC', 'Assinatura', 'Valor do aditivo', 'Teto depois', 'Motivo', 'Registrado por', ''].map((titulo) => (
                  <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {aditivos.map((tac) => (
                <tr key={tac.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-omega-700">{tac.numero_tac}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatarData(tac.data_assinatura)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums text-amber-700">+ {formatarMoeda(tac.valor_aditivo)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">{formatarMoeda(tac.novo_valor_total)}</td>
                  <td className="max-w-[20rem] truncate px-3 py-2 text-xs text-slate-500" title={tac.motivo}>{tac.motivo}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{tac.registrado_por || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {podeGerir ? (
                      <div className="inline-flex gap-1.5">
                        <button type="button" className="btn-neutro !px-2 !py-1 !text-[11px]" onClick={() => setModal({ aberto: true, tac })} aria-label={`Corrigir ${tac.numero_tac}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Corrigir
                        </button>
                        <button type="button" className="btn-neutro !px-2 !py-1 !text-[11px] hover:!border-red-300 hover:!text-red-600" onClick={() => setExcluir(tac)} aria-label={`Excluir ${tac.numero_tac}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Excluir
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ModalTac
        aberto={modal.aberto}
        contrato={contrato}
        tac={modal.tac}
        onFechar={() => setModal({ aberto: false, tac: null })}
        onSalvo={onAlterado}
      />

      <ModalBase
        aberto={Boolean(excluir)}
        titulo="Excluir TAC?"
        subtitulo={excluir ? `${excluir.numero_tac} · ${formatarMoeda(excluir.valor_aditivo)}` : ''}
        onFechar={() => (excluindo ? null : setExcluir(null))}
        tamanho="md"
      >
        {excluir ? (
          <div className="space-y-3 p-5">
            <p className="text-sm text-slate-700">
              O aditivo será removido e o teto do contrato volta a ser calculado sem ele. Isso não pode ser desfeito.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-neutro" onClick={() => setExcluir(null)} disabled={excluindo}>Cancelar</button>
              <button type="button" className="btn-perigo" onClick={confirmarExclusao} disabled={excluindo}>
                {excluindo ? <Spinner tamanho="sm" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                Excluir TAC
              </button>
            </div>
          </div>
        ) : null}
      </ModalBase>
    </section>
  );
}

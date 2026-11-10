import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, Calculator, ExternalLink, FileSignature, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import ModalRecursoQqp, { ROTULO_CATEGORIA, ROTULO_UNIDADE } from './ModalRecursoQqp.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  excluirRecursoObra,
  listarItensQqp,
  listarRecursosObra,
  obterProjecaoObra,
  useCarregamento,
} from '../../hooks/useMedicao.js';
import { formatarData, formatarMoeda, formatarMoedaCompacta, formatarPercentual } from '../../utils/formatters.js';
import { CORES_CURVA_S, linhasPrevisto, prepararCurvaS, seriesTooltip } from '../graficos/curvaSEstilo.jsx';

const COR_FISICO_REAL = '#0ea5e9';
const CORES_CATEGORIA = { hh: '#6366f1', equipamento: '#f97316', insumo: '#14b8a6', outros: '#94a3b8' };
const EIXO_MENSAL = 'mensal';

function Cartao({ rotulo, valor, detalhe, tom = 'text-slate-800' }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

function TooltipMoeda({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">{label}</p>
      {seriesTooltip(payload).map((serie) => (
        <p key={serie.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: serie.color || serie.fill }} aria-hidden="true" />
          <span className="font-medium">{serie.name}:</span>
          <span className="font-bold text-slate-800">{formatarMoeda(serie.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Vazio({ icone: Icone, titulo, texto, altura = 'h-64' }) {
  return (
    <div className={`flex ${altura} flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center`}>
      <Icone className="h-8 w-8 text-slate-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-600">{titulo}</p>
      <p className="max-w-md text-xs text-slate-500">{texto}</p>
    </div>
  );
}

const Cabecalho = ({ children }) => (
  <th scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
    {children}
  </th>
);

/**
 * Aba "Projeção Financeira" da obra: compara o avanço físico previsto, o físico
 * realizado e o valor medido (R$), e projeta o fluxo de caixa com o custo dos
 * recursos do QQP (HH, equipamentos e insumos) pelos dias úteis de cada ciclo.
 */
export default function AbaProjecaoObra({ obra, podeEditar = false }) {
  const toast = useToast();
  const projecao = useCarregamento(() => obterProjecaoObra(obra.id), [obra.id]);
  const recursos = useCarregamento(() => listarRecursosObra(obra.id), [obra.id]);
  const itensQqp = useCarregamento(
    () => (obra.contrato_id ? listarItensQqp(obra.contrato_id) : Promise.resolve([])),
    [obra.contrato_id]
  );

  const [modal, setModal] = useState({ aberto: false, recurso: null });
  const [removendoId, setRemovendoId] = useState(null);

  const dados = projecao.dados;
  const meses = useMemo(() => dados?.meses || [], [dados]);

  const dadosComparativo = useMemo(
    () =>
      prepararCurvaS(
        meses.map((mes) => ({ ...mes, tendencia_acumulada: mes.tendencia_acumulada > 0 ? mes.tendencia_acumulada : null })),
        { previsto: 'previsto_acumulado', tendencia: 'tendencia_acumulada', alvo: dados?.resumo?.valor_obra || null }
      ).dados,
    [meses, dados]
  );

  function recarregarTudo() {
    projecao.recarregar();
    recursos.recarregar();
  }

  async function remover(recurso) {
    if (!window.confirm(`Remover a alocação de ${recurso.item?.codigo}?`)) return;
    setRemovendoId(recurso.id);
    try {
      await excluirRecursoObra(obra.id, recurso.id);
      toast.sucesso('Alocação removida.');
      recarregarTudo();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover a alocação.');
    } finally {
      setRemovendoId(null);
    }
  }

  if (projecao.carregando && !dados) {
    return (
      <div className="card flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Spinner tamanho="md" className="text-omega-600" />
        Calculando a projeção financeira...
      </div>
    );
  }

  if (projecao.erro && !dados) {
    return (
      <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-red-800">{projecao.erro}</p>
        </div>
        <button type="button" className="btn-neutro" onClick={recarregarTudo}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    );
  }

  const { resumo, qqp, obra: dadosObra } = dados;
  const lista = recursos.dados?.data || [];
  const aderenciaTom =
    resumo.aderencia_financeira === null
      ? 'text-slate-400'
      : resumo.aderencia_financeira >= 100
        ? 'text-emerald-600'
        : resumo.aderencia_financeira >= 90
          ? 'text-amber-600'
          : 'text-red-600';
  const temFluxo = meses.some((mes) => mes.custo_qqp > 0 || mes.receita > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {dadosObra.contrato ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-omega-200 bg-omega-50 px-2.5 py-1 font-bold text-omega-700">
                <FileSignature className="h-3.5 w-3.5" aria-hidden="true" />
                {dadosObra.contrato.id_vale}
              </span>
              <span>Preços do QQP deste contrato</span>
            </>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
              Vincule a obra a um contrato para usar os preços do QQP
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/medicao" className="inline-flex items-center gap-1 text-xs font-bold text-omega-700 hover:underline">
            Dashboard de Medição
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
          <button type="button" className="btn-neutro" onClick={recarregarTudo} disabled={projecao.carregando}>
            {projecao.carregando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Atualizar
          </button>
        </div>
      </div>

      <section aria-label="Resumo da projeção" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao
          rotulo="Aderência financeira"
          valor={resumo.aderencia_financeira === null ? '—' : formatarPercentual(resumo.aderencia_financeira, 1)}
          detalhe={`Medido ÷ previsto${resumo.ultimo_ciclo_medido ? ` até ${resumo.ultimo_ciclo_medido.split('-').reverse().join('/')}` : ''}`}
          tom={aderenciaTom}
        />
        <Cartao
          rotulo="Receita futura projetada"
          valor={formatarMoeda(resumo.receita_futura_projetada)}
          detalhe="Pelo ritmo da tendência do cronograma, depois do último ciclo medido"
          tom="text-omega-700"
        />
        <Cartao
          rotulo="Custo projetado (QQP)"
          valor={formatarMoeda(resumo.custo_qqp_total)}
          detalhe={
            resumo.tem_recursos_qqp
              ? `Incorrido ${formatarMoeda(resumo.custo_qqp_incorrido)} · a incorrer ${formatarMoeda(resumo.custo_qqp_a_incorrer)}`
              : 'Nenhum recurso planejado ainda'
          }
          tom="text-orange-600"
        />
        <Cartao
          rotulo="Resultado projetado"
          valor={resumo.resultado_projetado === null ? '—' : formatarMoeda(resumo.resultado_projetado)}
          detalhe={
            resumo.margem_projetada === null
              ? 'Planeje os recursos para ver o resultado'
              : `Margem de ${formatarPercentual(resumo.margem_projetada, 1)} sobre o faturamento projetado`
          }
          tom={resumo.resultado_projetado !== null && resumo.resultado_projetado < 0 ? 'text-red-700' : 'text-emerald-700'}
        />
      </section>

      {/* ------------------------ Previsto x físico real x medido ------------------------ */}
      <section className="card p-4">
        <header className="mb-2">
          <h2 className="text-sm font-bold text-slate-800">Avanço previsto × realizado × medido (R$)</h2>
          <p className="text-xs text-slate-500">
            Valor da obra x avanço físico planejado e real, comparado ao que já foi medido nos boletins aprovados.
          </p>
        </header>

        {meses.length === 0 || !(resumo.tem_avanco_fisico || resumo.medido_aprovado > 0) ? (
          <Vazio
            icone={BarChart3}
            titulo="Sem avanço físico nem medição"
            texto="Lance o avanço físico da obra ou inclua a SS em um boletim de medição para montar o comparativo."
          />
        ) : (
          <>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dadosComparativo} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={68} tickFormatter={(v) => formatarMoedaCompacta(v)} />
                  <Tooltip content={<TooltipMoeda />} />
                  {linhasPrevisto({ nome: 'Previsto (físico planejado)' })}
                  <Line type="monotone" dataKey="tendencia_acumulada" name="Tendência" stroke={CORES_CURVA_S.tendencia} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="fisico_real_acumulado" name="Físico realizado (valorizado)" stroke={COR_FISICO_REAL} strokeWidth={2.5} dot={{ r: 3, fill: COR_FISICO_REAL, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="medido_acumulado" name="Medido (boletins aprovados)" stroke={CORES_CURVA_S.real} strokeWidth={2.5} dot={{ r: 3, fill: CORES_CURVA_S.real, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              {[
                [CORES_CURVA_S.previsto, 'Previsto (físico planejado)', false],
                [COR_FISICO_REAL, 'Físico realizado', false],
                [CORES_CURVA_S.real, 'Medido aprovado', false],
                [CORES_CURVA_S.tendencia, 'Tendência', true],
              ].map(([cor, rotulo, tracejada]) => (
                <span key={rotulo} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0 w-5" style={{ borderTop: `${tracejada ? 2 : 3}px ${tracejada ? 'dashed' : 'solid'} ${cor}` }} aria-hidden="true" />
                  {rotulo}
                </span>
              ))}
            </div>
          </>
        )}

        {meses.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Cabecalho>Ciclo</Cabecalho>
                  <Cabecalho>Previsto acum.</Cabecalho>
                  <Cabecalho>Físico real acum.</Cabecalho>
                  <Cabecalho>Medido no ciclo</Cabecalho>
                  <Cabecalho>Medido acum.</Cabecalho>
                  <Cabecalho>Desvio (medido − previsto)</Cabecalho>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {meses.map((mes) => (
                  <tr key={mes.referencia}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{mes.rotulo}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{formatarMoeda(mes.previsto_acumulado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-sky-700">{mes.fisico_real_acumulado === null ? '—' : formatarMoeda(mes.fisico_real_acumulado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{mes.medido === null ? '—' : formatarMoeda(mes.medido)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums font-medium text-emerald-700">{mes.medido_acumulado === null ? '—' : formatarMoeda(mes.medido_acumulado)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 font-semibold tabular-nums ${mes.desvio === null ? 'text-slate-300' : mes.desvio < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {mes.desvio === null ? '—' : `${formatarMoeda(mes.desvio)} (${mes.desvio_pontos > 0 ? '+' : ''}${formatarPercentual(mes.desvio_pontos, 1)})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* ------------------------ Fluxo de caixa projetado (QQP) ------------------------ */}
      <section className="card p-4">
        <header className="mb-2">
          <h2 className="text-sm font-bold text-slate-800">Fluxo de caixa projetado</h2>
          <p className="text-xs text-slate-500">
            Colunas (eixo esquerdo): custo dos recursos do QQP em cada ciclo (dias úteis × quantidade × preço).
            Linhas (eixo direito): receita do ciclo (medido; depois, a tendência) e fluxo acumulado.
          </p>
        </header>

        {!temFluxo ? (
          <Vazio
            icone={Calculator}
            titulo="Sem recursos planejados"
            texto="Planeje abaixo os recursos da obra (HH, equipamentos e insumos do QQP) para projetar o custo pelos dias úteis."
            altura="h-56"
          />
        ) : (
          <>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={meses} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                  <YAxis yAxisId={EIXO_MENSAL} orientation="left" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={68} tickFormatter={(v) => formatarMoedaCompacta(v)} />
                  <YAxis orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={68} tickFormatter={(v) => formatarMoedaCompacta(v)} />
                  <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                  <Bar yAxisId={EIXO_MENSAL} stackId="custo" dataKey="custo_hh" name="HH" fill={CORES_CATEGORIA.hh} maxBarSize={34} isAnimationActive={false} />
                  <Bar yAxisId={EIXO_MENSAL} stackId="custo" dataKey="custo_equipamento" name="Equipamentos" fill={CORES_CATEGORIA.equipamento} maxBarSize={34} isAnimationActive={false} />
                  <Bar yAxisId={EIXO_MENSAL} stackId="custo" dataKey="custo_insumo" name="Insumos" fill={CORES_CATEGORIA.insumo} maxBarSize={34} isAnimationActive={false} />
                  <Bar yAxisId={EIXO_MENSAL} stackId="custo" dataKey="custo_outros" name="Outros" fill={CORES_CATEGORIA.outros} radius={[3, 3, 0, 0]} maxBarSize={34} isAnimationActive={false} />
                  <Line type="monotone" dataKey="receita" name="Receita do ciclo" stroke={CORES_CURVA_S.real} strokeWidth={2.5} dot={{ r: 3, fill: CORES_CURVA_S.real, strokeWidth: 0 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="fluxo_acumulado" name="Fluxo acumulado" stroke="#1e293b" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              {[['HH', CORES_CATEGORIA.hh], ['Equipamentos', CORES_CATEGORIA.equipamento], ['Insumos', CORES_CATEGORIA.insumo], ['Outros', CORES_CATEGORIA.outros]].map(([rotulo, cor]) => (
                <span key={rotulo} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: cor }} aria-hidden="true" />
                  {rotulo}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0 w-5" style={{ borderTop: `3px solid ${CORES_CURVA_S.real}` }} aria-hidden="true" />
                Receita do ciclo (eixo direito)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0 w-5" style={{ borderTop: '2px dashed #1e293b' }} aria-hidden="true" />
                Fluxo acumulado (eixo direito)
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Cabecalho>Ciclo</Cabecalho>
                    <Cabecalho>Dias úteis</Cabecalho>
                    <Cabecalho>HH</Cabecalho>
                    <Cabecalho>Equip.</Cabecalho>
                    <Cabecalho>Insumos</Cabecalho>
                    <Cabecalho>Custo total</Cabecalho>
                    <Cabecalho>Receita</Cabecalho>
                    <Cabecalho>Fluxo</Cabecalho>
                    <Cabecalho>Fluxo acum.</Cabecalho>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {meses.map((mes) => (
                    <tr key={mes.referencia}>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{mes.rotulo}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{mes.dias_uteis}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{formatarMoeda(mes.custo_hh)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{formatarMoeda(mes.custo_equipamento)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{formatarMoeda(mes.custo_insumo + mes.custo_outros)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-orange-700">{formatarMoeda(mes.custo_qqp)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                        {formatarMoeda(mes.receita)}
                        {mes.receita_projetada ? <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">proj.</span> : null}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 font-semibold tabular-nums ${mes.fluxo < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatarMoeda(mes.fluxo)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${mes.fluxo_acumulado < 0 ? 'text-red-600' : 'text-slate-700'}`}>{formatarMoeda(mes.fluxo_acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Premissas: {dados.premissas.dias_uteis} {dados.premissas.ciclo} Itens por hora usam {dados.premissas.horas_por_dia_padrao} h/dia quando
          não informado.
        </p>
      </section>

      {/* ----------------------------- Recursos planejados ----------------------------- */}
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Recursos planejados (QQP)</h2>
            <p className="text-xs text-slate-500">HH, equipamentos e insumos alocados nesta obra, com o preço do contrato.</p>
          </div>
          {podeEditar ? (
            <button
              type="button"
              className="btn-primario"
              onClick={() => setModal({ aberto: true, recurso: null })}
              disabled={!obra.contrato_id}
              title={obra.contrato_id ? '' : 'Vincule a obra a um contrato primeiro'}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Planejar recurso
            </button>
          ) : null}
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Cabecalho>Item</Cabecalho>
                <Cabecalho>Categoria</Cabecalho>
                <Cabecalho>Qtd.</Cabecalho>
                <Cabecalho>Preço</Cabecalho>
                <Cabecalho>Período</Cabecalho>
                <Cabecalho>Dias úteis</Cabecalho>
                <Cabecalho>Custo</Cabecalho>
                <Cabecalho> </Cabecalho>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {lista.map((recurso) => (
                <tr key={recurso.id}>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-800">{recurso.item?.codigo}</p>
                    <p className="text-[11px] text-slate-500">{recurso.item?.descricao}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{ROTULO_CATEGORIA[recurso.item?.categoria]}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                    {recurso.quantidade}
                    {recurso.horas_dia ? <span className="text-[11px] text-slate-400"> × {recurso.horas_dia} h</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                    {formatarMoeda(recurso.item?.preco_unitario)}/{ROTULO_UNIDADE[recurso.item?.unidade]}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {recurso.data_fim
                      ? `${formatarData(recurso.data_inicio)} a ${formatarData(recurso.data_fim)}`
                      : formatarData(recurso.data_inicio)}
                    {recurso.inclui_sabados ? <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">c/ sáb.</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{recurso.item?.unidade === 'UNIDADE' ? '—' : recurso.dias_uteis}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums text-orange-700">{formatarMoeda(recurso.custo_total)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {podeEditar ? (
                      <div className="inline-flex gap-1.5">
                        <button type="button" className="btn-neutro !px-2 !py-1" onClick={() => setModal({ aberto: true, recurso })} aria-label={`Editar ${recurso.item?.codigo}`} title="Editar">
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button type="button" className="btn-neutro !px-2 !py-1 hover:!border-red-300 hover:!text-red-600" onClick={() => remover(recurso)} disabled={removendoId === recurso.id} aria-label={`Remover ${recurso.item?.codigo}`} title="Remover">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    {recursos.carregando
                      ? 'Carregando recursos...'
                      : obra.contrato_id
                        ? 'Nenhum recurso planejado nesta obra ainda.'
                        : 'Vincule a obra a um contrato (Dashboard de Medição) para planejar recursos com os preços do QQP.'}
                  </td>
                </tr>
              ) : (
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-slate-500">Custo total projetado</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-orange-700">{formatarMoeda(recursos.dados?.totais?.total ?? qqp.totais.total)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ModalRecursoQqp
        aberto={modal.aberto}
        obra={obra}
        itens={itensQqp.dados || []}
        recurso={modal.recurso}
        onFechar={() => setModal({ aberto: false, recurso: null })}
        onSalvo={recarregarTudo}
      />
    </div>
  );
}

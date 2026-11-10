import { Link } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ExternalLink, FileSignature, ReceiptText, RefreshCw } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { obterMedicaoObra, useCarregamento } from '../../hooks/useMedicao.js';
import { formatarData, formatarMoeda, formatarMoedaCompacta, formatarPercentual } from '../../utils/formatters.js';
import { CORES_CURVA_S } from '../graficos/curvaSEstilo.jsx';

const STATUS = {
  APROVADO: { rotulo: 'Aprovado', classe: 'border-emerald-300 bg-emerald-50 text-emerald-700', cor: CORES_CURVA_S.real },
  EM_ANALISE: { rotulo: 'Em análise', classe: 'border-amber-300 bg-amber-50 text-amber-800', cor: '#f59e0b' },
  REJEITADO: { rotulo: 'Rejeitado', classe: 'border-red-300 bg-red-50 text-red-700', cor: '#cbd5e1' },
};

function Cartao({ rotulo, valor, detalhe, tom = 'text-slate-800', children }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
      {children}
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

function TooltipBoletim({ active, payload }) {
  if (!active || !payload?.length) return null;
  const boletim = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">
        {boletim.numero_bmm} · {boletim.rotulo}
      </p>
      <p className="text-slate-600">
        Valor da SS: <strong className="text-slate-800">{formatarMoeda(boletim.valor)}</strong>
      </p>
      <p className="text-slate-600">
        Situação: <strong>{(STATUS[boletim.status] || STATUS.EM_ANALISE).rotulo}</strong>
      </p>
      <p className="text-slate-600">
        Acumulado aprovado: <strong className="text-slate-800">{formatarMoeda(boletim.acumulado_aprovado)}</strong>
      </p>
    </div>
  );
}

/**
 * Aba "Medição" da obra: os Boletins de Medição (BMM) em que esta SS pontuou,
 * o valor medido em cada ciclo (16 a 15) e o acumulado aprovado. Os dados vêm do
 * mesmo lançamento do Dashboard de Medição, então qualquer boletim lançado ou
 * aprovado lá aparece aqui ao abrir (ou atualizar) a aba.
 */
export default function AbaMedicaoObra({ obra }) {
  const { dados, carregando, erro, recarregar } = useCarregamento(() => obterMedicaoObra(obra.id), [obra.id]);

  if (carregando && !dados) {
    return (
      <div className="card flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Spinner tamanho="md" className="text-omega-600" />
        Carregando a medição da obra...
      </div>
    );
  }

  if (erro && !dados) {
    return (
      <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-red-800">{erro}</p>
        </div>
        <button type="button" className="btn-neutro" onClick={recarregar}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    );
  }

  const { resumo, boletins, obra: dadosObra } = dados;

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
              <span>{dadosObra.contrato.descricao}</span>
            </>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
              Obra ainda não vinculada a um contrato
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/medicao" className="inline-flex items-center gap-1 text-xs font-bold text-omega-700 hover:underline">
            Abrir Dashboard de Medição
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
          <button type="button" className="btn-neutro" onClick={recarregar} disabled={carregando}>
            {carregando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Atualizar
          </button>
        </div>
      </div>

      <section aria-label="Resumo da medição" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao rotulo="Valor da obra" valor={formatarMoeda(resumo.valor_obra)} detalhe="Valor vigente do orçamento" tom="text-omega-700" />
        <Cartao
          rotulo="Medido aprovado"
          valor={formatarMoeda(resumo.medido_aprovado)}
          tom="text-emerald-700"
          detalhe={`${formatarPercentual(resumo.percentual_medido, 1)} da obra · ${resumo.quantidade_boletins} boletim(ns)`}
        >
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, resumo.percentual_medido)}%` }} />
          </div>
        </Cartao>
        <Cartao
          rotulo="Saldo a medir"
          valor={formatarMoeda(resumo.saldo_a_medir)}
          tom={resumo.saldo_a_medir < 0 ? 'text-red-700' : 'text-slate-800'}
          detalhe={resumo.saldo_a_medir < 0 ? 'Medido acima do valor da obra' : 'Valor da obra menos o medido aprovado'}
        />
        <Cartao
          rotulo="Em análise"
          valor={formatarMoeda(resumo.em_analise)}
          tom="text-amber-700"
          detalhe="Boletins ainda não aprovados (não contam no acumulado)"
        />
      </section>

      <section className="card p-4">
        <header className="mb-2">
          <h2 className="text-sm font-bold text-slate-800">Valor medido por ciclo</h2>
          <p className="text-xs text-slate-500">Colunas: valor da SS em cada boletim. Linha: acumulado aprovado.</p>
        </header>

        {boletins.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
            <ReceiptText className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">Esta obra ainda não pontuou em nenhum boletim</p>
            <p className="max-w-md text-xs text-slate-500">
              {dadosObra.contrato
                ? 'Quando um BMM do contrato incluir esta SS, o valor medido aparece aqui.'
                : 'Vincule a obra a um contrato no Dashboard de Medição para acompanhar a medição.'}
            </p>
          </div>
        ) : (
          <>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={boletins} margin={{ top: 14, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="numero_bmm" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    width={68}
                    tickFormatter={(valor) => formatarMoedaCompacta(valor)}
                  />
                  <Tooltip content={<TooltipBoletim />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                  <Bar dataKey="valor" name="Valor da SS" radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                    {boletins.map((boletim) => (
                      <Cell key={boletim.boletim_id} fill={(STATUS[boletim.status] || STATUS.EM_ANALISE).cor} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="acumulado_aprovado"
                    name="Acumulado aprovado"
                    stroke={CORES_CURVA_S.real}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: CORES_CURVA_S.real, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              {Object.entries(STATUS).map(([chave, estilo]) => (
                <span key={chave} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: estilo.cor }} aria-hidden="true" />
                  {estilo.rotulo}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0 w-5" style={{ borderTop: `3px solid ${CORES_CURVA_S.real}` }} aria-hidden="true" />
                Acumulado aprovado
              </span>
            </div>
          </>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Boletins em que a SS pontuou</h2>
          <p className="text-xs text-slate-500">Do ciclo mais antigo ao mais recente; só os aprovados somam no acumulado.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Boletim', 'Ciclo', 'Situação', 'Valor da SS', '% do boletim', 'Acumulado aprovado', '% da obra'].map((titulo) => (
                  <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {boletins.map((boletim) => {
                const estilo = STATUS[boletim.status] || STATUS.EM_ANALISE;
                return (
                  <tr key={boletim.boletim_id} className={boletim.status === 'REJEITADO' ? 'bg-slate-50/70' : ''}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">{boletim.numero_bmm}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {formatarData(boletim.ciclo_inicio)} a {formatarData(boletim.ciclo_fim)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${estilo.classe}`}>
                        {estilo.rotulo}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 font-medium tabular-nums ${boletim.status === 'REJEITADO' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {formatarMoeda(boletim.valor)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                      {formatarPercentual(boletim.participacao_no_boletim, 1)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{formatarMoeda(boletim.acumulado_aprovado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{formatarPercentual(boletim.percentual_acumulado, 1)}</td>
                  </tr>
                );
              })}
              {boletins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Nenhum boletim com esta SS.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarRange,
  CircleCheckBig,
  ClipboardList,
  Coins,
  Search,
  Trophy,
  Wallet,
} from 'lucide-react';
import AbasOrcamentos from '../components/AbasOrcamentos.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useEstatisticas } from '../hooks/useOrcamentos.js';
import { obterStatus } from '../utils/status.js';
import { formatarData, formatarMoeda, formatarMoedaCompacta } from '../utils/formatters.js';

/** Cartão de indicador (KPI) do topo do dashboard. */
function Kpi({ Icone, rotulo, valor, detalhe, destaque = 'text-slate-800' }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icone className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
        <p className={`truncate text-xl font-bold ${destaque}`}>{valor}</p>
        {detalhe ? <p className="mt-0.5 text-[11px] font-medium text-slate-400">{detalhe}</p> : null}
      </div>
    </div>
  );
}

/** Tooltip compacto reaproveitado pelos dois gráficos. */
function TooltipCustom(props) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;

  const item = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-slate-700">{item.nome}</p>
      <p className="text-slate-500">
        Valor: <span className="font-semibold text-slate-700">{formatarMoeda(item.valor)}</span>
      </p>
      <p className="text-slate-500">
        Orçamentos: <span className="font-semibold text-slate-700">{item.quantidade}</span>
      </p>
    </div>
  );
}

export default function DashboardOrcamentosBI() {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');

  const { dados, carregando, erro, recarregar } = useEstatisticas({
    de,
    ate,
    busca: buscaAplicada,
  });

  // Debounce da busca por texto (mesmo comportamento da listagem).
  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  const porStatus = dados?.porStatus || [];
  const resumo = dados?.resumo;
  const top = dados?.top || [];

  // Base dos gráficos: rótulo curto + cor sólida vindos da hierarquia semântica.
  const series = useMemo(
    () =>
      porStatus.map((linha) => {
        const info = obterStatus(linha.status);
        return { nome: info.label, hex: info.hex, quantidade: linha.quantidade, valor: linha.valor };
      }),
    [porStatus]
  );

  const comDados = series.filter((item) => item.quantidade > 0);
  const temFiltro = Boolean(de || ate || buscaAplicada);

  const taxaAprovacao = resumo ? `${(resumo.taxaAprovacao * 100).toFixed(1)}%` : '—';

  return (
    <div className="mx-auto w-full max-w-7xl">
      <AbasOrcamentos />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Dashboard BI de Orçamentos</h2>
          <p className="text-sm text-slate-500">
            Indicadores consolidados de valor, aprovação e distribuição por status.
          </p>
        </div>

        <button type="button" className="btn-neutro" onClick={recarregar} disabled={carregando}>
          {carregando ? <Spinner tamanho="sm" /> : null}
          Atualizar
        </button>
      </div>

      <section className="card mb-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label className="rotulo" htmlFor="bi-busca">
            Busca
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="bi-busca"
              type="search"
              className="campo pl-9"
              placeholder="PEP, SS, descrição ou cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="sm:w-44">
            <label className="rotulo" htmlFor="bi-de">
              De
            </label>
            <input
              id="bi-de"
              type="date"
              className="campo"
              value={de}
              max={ate || undefined}
              onChange={(e) => setDe(e.target.value)}
            />
          </div>

          <div className="sm:w-44">
            <label className="rotulo" htmlFor="bi-ate">
              Até
            </label>
            <input
              id="bi-ate"
              type="date"
              className="campo"
              value={ate}
              min={de || undefined}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="btn-neutro"
              disabled={!temFiltro}
              onClick={() => {
                setDe('');
                setAte('');
                setBusca('');
              }}
            >
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
              Limpar
            </button>
          </div>
        </div>
      </section>

      {erro ? (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <span>{erro}</span>
          <button type="button" className="btn-perigo" onClick={recarregar}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {carregando && !dados ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, indice) => (
              <div key={indice} className="card h-24 animate-pulse bg-slate-50" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card h-80 animate-pulse bg-slate-50 lg:col-span-1" />
            <div className="card h-80 animate-pulse bg-slate-50 lg:col-span-2" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              Icone={Wallet}
              rotulo="Valor total orçado"
              valor={resumo ? formatarMoeda(resumo.valorTotal) : '—'}
              detalhe={`${resumo?.total ?? 0} orçamento(s) no escopo`}
              destaque="text-omega-700"
            />
            <Kpi
              Icone={CircleCheckBig}
              rotulo="Taxa de aprovação"
              valor={taxaAprovacao}
              detalhe={`${resumo?.aprovados ?? 0} aprovado(s) de ${resumo?.decididos ?? 0} decidido(s)`}
              destaque="text-emerald-600"
            />
            <Kpi
              Icone={Coins}
              rotulo="Ticket médio"
              valor={resumo ? formatarMoeda(resumo.ticketMedio) : '—'}
              detalhe="Média por orçamento"
            />
            <Kpi
              Icone={ClipboardList}
              rotulo="Total de orçamentos"
              valor={String(resumo?.total ?? 0)}
              detalhe={`${comDados.length} status com registros`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="card p-4 lg:col-span-1">
              <h3 className="mb-1 text-sm font-bold text-slate-700">Distribuição por status</h3>
              <p className="mb-3 text-xs text-slate-400">Quantidade de orçamentos em cada etapa</p>

              {comDados.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">Sem dados no período selecionado.</p>
              ) : (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={comDados}
                          dataKey="quantidade"
                          nameKey="nome"
                          innerRadius={52}
                          outerRadius={82}
                          paddingAngle={2}
                          stroke="#ffffff"
                          strokeWidth={2}
                        >
                          {comDados.map((item) => (
                            <Cell key={item.nome} fill={item.hex} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipCustom />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {comDados.map((item) => (
                      <li key={item.nome} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.hex }}
                          />
                          <span className="truncate font-medium text-slate-600">{item.nome}</span>
                        </span>
                        <span className="shrink-0 font-bold text-slate-700">{item.quantidade}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="card p-4 lg:col-span-2">
              <h3 className="mb-1 text-sm font-bold text-slate-700">Valor acumulado por status</h3>
              <p className="mb-3 text-xs text-slate-400">Soma dos valores orçados em cada etapa</p>

              {comDados.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">Sem dados no período selecionado.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="nome"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={0}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tickFormatter={(valor) => formatarMoedaCompacta(valor)}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                      />
                      <Tooltip content={<TooltipCustom />} cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={72}>
                        {series.map((item) => (
                          <Cell key={item.nome} fill={item.hex} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>

          <section className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-700">Top orçamentos de maior valor</h3>
            </header>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      #
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      PEP (CC)
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Descrição
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Valor
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Data
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {top.map((orcamento, indice) => (
                    <tr key={orcamento.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-bold text-slate-400">{indice + 1}</td>
                      <td className="whitespace-nowrap px-4 py-2 font-bold text-slate-700">
                        {orcamento.pep || '—'}
                      </td>
                      <td className="max-w-md px-4 py-2 text-slate-600">
                        <span className="line-clamp-1">
                          {orcamento.descricao || orcamento.cliente || 'Sem descrição informada.'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <StatusBadge status={orcamento.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-omega-700">
                        {formatarMoeda(orcamento.valor)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                        {formatarData(orcamento.created_at)}
                      </td>
                    </tr>
                  ))}
                  {top.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        Nenhum orçamento encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

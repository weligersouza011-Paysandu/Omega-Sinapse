import { lazy, Suspense, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useDashboard } from '../../hooks/useDashboard.js';
import CurvaSConsolidada from './CurvaSConsolidada.jsx';
import DashboardHero from './DashboardHero.jsx';
import FiltrosDashboard from './FiltrosDashboard.jsx';
import IndicadoresPlanejamento from './IndicadoresPlanejamento.jsx';
import KpisDashboard from './KpisDashboard.jsx';
import Metodologia6WLA from './Metodologia6WLA.jsx';
import TabelaObrasDashboard from './TabelaObrasDashboard.jsx';
import TabelaRestricoes6WLA from './TabelaRestricoes6WLA.jsx';
import { totalDeOpcoes } from './dashboardUtils.js';

// O mapa carrega o Leaflet sob demanda, mantendo o bundle inicial enxuto.
const MapaGeralObras = lazy(() => import('./MapaGeralObras.jsx'));

function MapaCarregando() {
  return (
    <div className="card flex h-[420px] items-center justify-center gap-2 text-sm text-slate-500 sm:h-[460px] xl:h-[520px]">
      <Spinner tamanho="md" className="text-omega-600" />
      Carregando mapa de localizações...
    </div>
  );
}

function EstadoInicial() {
  return (
    <div className="card flex min-h-[320px] flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <Spinner tamanho="lg" className="text-omega-600" />
      <div>
        <p className="text-sm font-semibold text-slate-700">Consolidando o planejamento</p>
        <p className="mt-1 text-xs text-slate-500">
          Carregando obras, medições, Curva S e restrições 6WLA.
        </p>
      </div>
    </div>
  );
}

/**
 * Dashboard de Planejamento Omega Sinapse CT251.
 *
 * Consome o payload agregado de `/api/dashboard` e distribui os dados entre os
 * componentes executivos. Os filtros globais (status e categoria) são aplicados
 * no servidor e atualizam todos os painéis de uma vez.
 */
export default function ExecutiveDashboard() {
  const [status, setStatus] = useState('');
  const [categoria, setCategoria] = useState('');

  const { dados, carregando, erro, recarregar } = useDashboard({ status, categoria });

  const totalGeral = totalDeOpcoes(dados?.opcoes?.status || []);
  const totalFiltrado = dados?.obras?.length || 0;
  const carregandoInicial = carregando && !dados;

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 pb-4 sm:space-y-5">
      <DashboardHero
        geradoEm={dados?.gerado_em}
        ultimaMedicao={dados?.resumo?.ultima_medicao}
        totalObras={dados?.resumo?.total_obras ?? 0}
        comMedicao={dados?.resumo?.com_medicao ?? 0}
        carregando={carregando}
      />

      <FiltrosDashboard
        status={status}
        categoria={categoria}
        onStatus={setStatus}
        onCategoria={setCategoria}
        onLimpar={() => {
          setStatus('');
          setCategoria('');
        }}
        opcoes={dados?.opcoes || {}}
        totalFiltrado={totalFiltrado}
        totalGeral={totalGeral}
        carregando={carregando}
      />

      {erro ? (
        <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-red-800">Não foi possível atualizar o dashboard</p>
              <p className="mt-0.5 text-xs text-red-700">{erro}</p>
              {dados ? (
                <p className="mt-1 text-[11px] text-red-600">
                  Os últimos dados carregados continuam visíveis.
                </p>
              ) : null}
            </div>
          </div>

          <button type="button" onClick={recarregar} className="btn-neutro shrink-0">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      ) : null}

      {carregandoInicial ? (
        <EstadoInicial />
      ) : dados ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
            <Metodologia6WLA />
            <KpisDashboard resumo={dados.resumo} />
          </section>

          <IndicadoresPlanejamento resumo={dados.resumo} />

          <Suspense fallback={<MapaCarregando />}>
            <MapaGeralObras mapa={dados.mapa} obras={dados.obras} />
          </Suspense>

          <CurvaSConsolidada curva={dados.curva_s} />

          <TabelaObrasDashboard obras={dados.obras} />

          <TabelaRestricoes6WLA restricoes={dados.restricoes} />
        </>
      ) : null}
    </div>
  );
}

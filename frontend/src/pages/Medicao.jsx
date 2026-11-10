import { useEffect } from 'react';
import { AlertTriangle, FileSignature, RefreshCw } from 'lucide-react';
import Spinner from '../components/Spinner.jsx';
import ArvoreMedicao from '../components/medicao/ArvoreMedicao.jsx';
import CurvaSFinanceira from '../components/medicao/CurvaSFinanceira.jsx';
import GaugeAderencia from '../components/medicao/GaugeAderencia.jsx';
import KpisMedicao from '../components/medicao/KpisMedicao.jsx';
import { useDashboardMedicao } from '../hooks/useMedicao.js';
import { formatarData } from '../utils/formatters.js';

/**
 * Dashboard de Medição: contrato (ex.: CT-251), TACs, boletins de medição (BMM)
 * por SS e Curva S financeira.
 */
export default function Medicao() {
  const { contratos, contratoId, selecionarContrato, dados, carregando, carregandoContratos, erro, recarregar } =
    useDashboardMedicao();

  useEffect(() => {
    const anterior = document.title;
    document.title = 'Medição · Synapse';
    return () => {
      document.title = anterior;
    };
  }, []);

  const contrato = contratos.find((item) => item.id === contratoId) || null;

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 pb-4 sm:space-y-5">
      <header className="card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Medição e projeção financeira</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-800">
            {contrato ? `${contrato.id_vale} · ${contrato.descricao}` : 'Dashboard de Medição'}
          </h2>
          {contrato ? (
            <p className="mt-0.5 text-xs text-slate-500">
              Vigência {formatarData(contrato.data_inicio)} a {formatarData(contrato.data_fim)}
              {contrato.em_vigencia ? '' : ' (fora da vigência)'} · {contrato.obras.length} obra(s) vinculada(s)
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {contratos.length > 1 ? (
            <label className="min-w-[220px]">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Contrato</span>
              <select
                className="campo w-full"
                value={contratoId ?? ''}
                onChange={(evento) => selecionarContrato(Number(evento.target.value))}
              >
                {contratos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id_vale} — {item.descricao}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="btn-neutro" onClick={recarregar} disabled={carregando}>
            {carregando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Atualizar
          </button>
        </div>
      </header>

      {erro ? (
        <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-red-800">Não foi possível carregar a medição</p>
              <p className="mt-0.5 text-xs text-red-700">{erro}</p>
            </div>
          </div>
          <button type="button" onClick={recarregar} className="btn-neutro shrink-0">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      ) : null}

      {carregandoContratos && !contratos.length ? (
        <div className="card flex min-h-[260px] items-center justify-center gap-2 text-sm text-slate-500">
          <Spinner tamanho="md" className="text-omega-600" />
          Carregando contratos...
        </div>
      ) : !contratos.length && !erro ? (
        <div className="card flex min-h-[260px] flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <FileSignature className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhum contrato cadastrado</p>
          <p className="max-w-md text-xs text-slate-500">
            Cadastre o contrato com a Vale (ex.: CT-251), seus termos aditivos e os boletins de medição para acompanhar
            o saldo contratual e a Curva S financeira aqui.
          </p>
        </div>
      ) : dados ? (
        <div className={carregando ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <div className="space-y-4 sm:space-y-5">
            <KpisMedicao kpis={dados.kpis} />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
              <GaugeAderencia aderencia={dados.aderencia_financeira} />
              <ArvoreMedicao key={dados.contrato.id} boletins={dados.boletins} />
            </div>

            <CurvaSFinanceira curva={dados.curva_s} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, ExternalLink, LineChart, MapPin, Route, X } from 'lucide-react';
import AbaCronograma from '../obras/AbaCronograma.jsx';
import AbaProgramacao6Semanas from '../obras/AbaProgramacao6Semanas.jsx';
import CurvaSConsolidada from './CurvaSConsolidada.jsx';
import { CategoriaBadge, StatusObraBadge } from './DashboardBadges.jsx';
import IndicadoresPlanejamento from './IndicadoresPlanejamento.jsx';
import KpisDashboard from './KpisDashboard.jsx';
import Metodologia6WLA from './Metodologia6WLA.jsx';
import TabelaRestricoes6WLA from './TabelaRestricoes6WLA.jsx';

const VISOES = [
  { id: 'cronograma', rotulo: 'Curva S e Caminho Crítico', icone: Route },
  { id: 'programacao', rotulo: 'Programação de 6 semanas', icone: CalendarRange },
];

function rotuloObra(obra) {
  const referencia = obra.ss || obra.osi || `Obra #${obra.id}`;
  return `${referencia}${obra.osi && obra.ss ? ` / ${obra.osi}` : ''} — ${obra.descricao || 'Sem descrição'}`;
}

/**
 * Análise do dashboard com um único seletor de obra (também acionado pelo clique
 * na tabela ou no mapa):
 *
 *  - "Carteira consolidada": indicadores gerais, Curva S consolidada e todas as
 *    restrições 6WLA do recorte;
 *  - uma obra: indicadores, Curva S, caminho crítico, programação de 6 semanas e
 *    restrições só daquela obra.
 */
export default function AnaliseDashboard({ dados, obraFocoId = null, onSelecionarObra }) {
  const [apenasAndamento, setApenasAndamento] = useState(false);
  const [visao, setVisao] = useState('cronograma');

  const obras = useMemo(() => dados.obras || [], [dados.obras]);
  const obra = obraFocoId ? obras.find((item) => item.id === obraFocoId) || null : null;

  // A obra escolhida sempre aparece na lista, mesmo fora do filtro "em andamento".
  const opcoes = useMemo(
    () => obras.filter((item) => !apenasAndamento || item.status === 'EM_ANDAMENTO' || item.id === obra?.id),
    [obras, apenasAndamento, obra?.id]
  );
  const emAndamento = useMemo(() => obras.filter((item) => item.status === 'EM_ANDAMENTO').length, [obras]);

  const restricoes = useMemo(
    () => (obra ? (dados.restricoes || []).filter((item) => item.obra_id === obra.id) : dados.restricoes || []),
    [dados.restricoes, obra]
  );
  const resumoObra = obra ? dados.resumos_por_obra?.[obra.id] || null : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
              <LineChart className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Análise por obra</h3>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-slate-500">
                Escolha uma obra aqui, clique numa linha da tabela ou num ponto do mapa: indicadores, Curva S, caminho
                crítico, programação de 6 semanas e restrições passam a mostrar só essa obra.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
            {emAndamento} em andamento
          </span>
        </header>

        <div className="flex flex-wrap items-end gap-3 bg-slate-50/60 px-5 py-3">
          <label className="min-w-[260px] flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Obra</span>
            <select
              className="campo w-full"
              value={obra?.id ?? ''}
              onChange={(evento) => onSelecionarObra(evento.target.value ? Number(evento.target.value) : null, 'painel')}
            >
              <option value="">Carteira consolidada (todas as obras do recorte)</option>
              {opcoes.map((item) => (
                <option key={item.id} value={item.id}>
                  {rotuloObra(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={apenasAndamento}
              onChange={(evento) => setApenasAndamento(evento.target.checked)}
            />
            Só obras em andamento
          </label>

          {obra ? (
            <div className="flex items-center gap-3 pb-2">
              <Link
                to={`/obras/${obra.id}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-omega-700 hover:underline"
              >
                Abrir obra
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => onSelecionarObra(null, 'painel')}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Voltar à carteira
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {!obra ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
            <Metodologia6WLA />
            <KpisDashboard resumo={dados.resumo} />
          </section>

          <IndicadoresPlanejamento resumo={dados.resumo} />

          <CurvaSConsolidada curva={dados.curva_s} />
        </>
      ) : (
        <>
          <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Obra em foco</p>
              <p className="truncate text-sm font-bold text-slate-800" title={rotuloObra(obra)}>
                {rotuloObra(obra)}
              </p>
            </div>
            <StatusObraBadge status={obra.status} label={obra.status_label} />
            <CategoriaBadge categoria={obra.categoria} label={obra.categoria_label} />
            {Number(obra.quantidade_localizacoes) === 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                sem localização cadastrada
              </span>
            ) : null}
          </section>

          {resumoObra ? <IndicadoresPlanejamento resumo={resumoObra} obraUnica /> : null}

          <section className="card p-4">
            <div role="tablist" aria-label="Visão da obra" className="mb-4 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
              {VISOES.map(({ id, rotulo, icone: Icone }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={visao === id}
                  onClick={() => setVisao(id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                    visao === id ? 'bg-white text-omega-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                  {rotulo}
                </button>
              ))}
            </div>

            {visao === 'cronograma' ? (
              <AbaCronograma key={`c-${obra.id}`} obra={obra} podeEditar={false} />
            ) : (
              <AbaProgramacao6Semanas key={`p-${obra.id}`} obra={obra} podeEditar={false} />
            )}
          </section>
        </>
      )}

      <TabelaRestricoes6WLA restricoes={restricoes} />
    </div>
  );
}

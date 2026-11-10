import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, ExternalLink, LineChart, MapPin, Route } from 'lucide-react';
import AbaCronograma from '../obras/AbaCronograma.jsx';
import AbaProgramacao6Semanas from '../obras/AbaProgramacao6Semanas.jsx';
import CurvaSConsolidada from './CurvaSConsolidada.jsx';
import { CategoriaBadge, StatusObraBadge } from './DashboardBadges.jsx';
import IndicadoresPlanejamento from './IndicadoresPlanejamento.jsx';
import KpisDashboard from './KpisDashboard.jsx';

function rotuloObra(obra) {
  const referencia = obra.ss || obra.osi || `Obra #${obra.id}`;
  return `${referencia}${obra.osi && obra.ss ? ` / ${obra.osi}` : ''} — ${obra.descricao || 'Sem descrição'}`;
}

function TituloSecao({ icone: Icone, titulo, texto }) {
  return (
    <div className="flex items-start gap-3 px-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
        <Icone className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{texto}</p>
      </div>
    </div>
  );
}

/**
 * Análise por obra do dashboard. Por padrão lista só as obras em andamento e já
 * abre a primeira; a obra também pode ser escolhida na tabela ou no mapa.
 *
 * Para a obra escolhida mostra, uma abaixo da outra, as mesmas informações do
 * detalhe da obra: Curva S, caminho crítico, carga e alocação por função e a
 * programação de 6 semanas. Depois vêm os indicadores gerais da carteira.
 */
export default function AnaliseDashboard({ dados, obraFocoId = null, onSelecionarObra }) {
  const [apenasAndamento, setApenasAndamento] = useState(true);

  const obras = useMemo(() => dados.obras || [], [dados.obras]);
  const emAndamento = useMemo(() => obras.filter((item) => item.status === 'EM_ANDAMENTO'), [obras]);
  const escolhida = obraFocoId ? obras.find((item) => item.id === obraFocoId) || null : null;

  // A obra escolhida na tabela/mapa sempre aparece na lista, mesmo fora do filtro.
  const opcoes = useMemo(
    () => obras.filter((item) => !apenasAndamento || item.status === 'EM_ANDAMENTO' || item.id === escolhida?.id),
    [obras, apenasAndamento, escolhida?.id]
  );
  const obra = escolhida || opcoes[0] || null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
              <LineChart className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Curva S, Caminho Crítico e Programação por Obra</h3>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-slate-500">
                Escolha a obra (ou clique nela na tabela ou no mapa) para ver a Curva S, o caminho crítico, a carga e
                alocação por função e a programação de 6 semanas do cronograma importado.
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
            {emAndamento.length} em andamento
          </span>
        </header>

        <div className="flex flex-wrap items-end gap-3 bg-slate-50/60 px-5 py-3">
          <label className="min-w-[260px] flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Obra</span>
            <select
              className="campo w-full"
              value={obra?.id ?? ''}
              onChange={(evento) => onSelecionarObra(Number(evento.target.value), 'painel')}
              disabled={!opcoes.length}
            >
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
            Somente obras em andamento
          </label>

          {obra ? (
            <Link
              to={`/obras/${obra.id}`}
              className="mb-1.5 inline-flex items-center gap-1 text-xs font-bold text-omega-700 hover:underline"
            >
              Abrir obra
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </section>

      {!obra ? (
        <section className="card flex flex-col items-center gap-2 px-4 py-14 text-center">
          <LineChart className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">
            {apenasAndamento ? 'Nenhuma obra em andamento neste recorte' : 'Nenhuma obra neste recorte'}
          </p>
          <p className="max-w-md text-xs text-slate-500">
            {apenasAndamento
              ? 'Desmarque "Somente obras em andamento" ou ajuste os filtros globais para ver as demais obras.'
              : 'Ajuste os filtros globais para voltar a visualizar a carteira.'}
          </p>
        </section>
      ) : (
        <>
          <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Obra selecionada</p>
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

          <section className="space-y-3">
            <TituloSecao
              icone={Route}
              titulo="Curva S, caminho crítico e carga por função"
              texto="Planejado x realizado, rede do caminho crítico e alocação de trabalho do cronograma da obra."
            />
            <AbaCronograma key={`c-${obra.id}`} obra={obra} podeEditar={false} />
          </section>

          <section className="space-y-3">
            <TituloSecao
              icone={CalendarRange}
              titulo="Programação de 6 semanas"
              texto="Lookahead das atividades das próximas seis semanas, com restrições e plano de ação."
            />
            <AbaProgramacao6Semanas key={`p-${obra.id}`} obra={obra} podeEditar={false} />
          </section>
        </>
      )}

      <section className="space-y-3">
        <TituloSecao
          icone={LineChart}
          titulo="Carteira"
          texto="Indicadores gerais e Curva S consolidada de todas as obras do recorte."
        />
        <KpisDashboard resumo={dados.resumo} />
        <IndicadoresPlanejamento resumo={dados.resumo} />
        <CurvaSConsolidada curva={dados.curva_s} />
      </section>
    </div>
  );
}

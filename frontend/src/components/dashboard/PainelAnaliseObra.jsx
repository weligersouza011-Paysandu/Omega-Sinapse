import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, ExternalLink, LineChart, Route } from 'lucide-react';
import AbaCronograma from '../obras/AbaCronograma.jsx';
import AbaProgramacao6Semanas from '../obras/AbaProgramacao6Semanas.jsx';

const VISOES = [
  { id: 'cronograma', rotulo: 'Curva S e Caminho Crítico', icone: Route },
  { id: 'programacao', rotulo: 'Programação de 6 semanas', icone: CalendarRange },
];

function rotuloObra(obra) {
  const referencia = obra.ss || obra.osi || `Obra #${obra.id}`;
  return `${referencia}${obra.osi && obra.ss ? ` / ${obra.osi}` : ''} — ${obra.descricao || 'Sem descrição'}`;
}

/**
 * Análise por obra no dashboard: escolhe uma obra (por padrão, só as em
 * andamento) e mostra a Curva S, o caminho crítico e a programação de 6 semanas
 * dela, no mesmo formato do detalhe da obra (somente leitura).
 */
export default function PainelAnaliseObra({ obras = [] }) {
  const [apenasAndamento, setApenasAndamento] = useState(true);
  const [obraId, setObraId] = useState(null);
  const [visao, setVisao] = useState('cronograma');

  const andamento = useMemo(() => obras.filter((obra) => obra.status === 'EM_ANDAMENTO'), [obras]);
  const lista = apenasAndamento ? andamento : obras;
  const obra = lista.find((item) => item.id === obraId) || lista[0] || null;

  useEffect(() => {
    if (obra && obra.id !== obraId) setObraId(obra.id);
  }, [obra, obraId]);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700 ring-1 ring-omega-100">
            <LineChart className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Curva S, Caminho Crítico e Programação por Obra</h3>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-slate-500">
              Escolha a obra para ver o planejado x realizado, o caminho crítico e o lookahead de 6 semanas do
              cronograma importado.
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
          {andamento.length} em andamento
        </span>
      </header>

      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
        <label className="min-w-[260px] flex-1">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Obra</span>
          <select
            className="campo w-full"
            value={obra?.id ?? ''}
            onChange={(evento) => setObraId(Number(evento.target.value))}
            disabled={!lista.length}
          >
            {lista.map((item) => (
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

      {!obra ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <LineChart className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">
            {apenasAndamento ? 'Nenhuma obra em andamento neste recorte' : 'Nenhuma obra neste recorte'}
          </p>
          <p className="max-w-md text-xs text-slate-500">
            {apenasAndamento
              ? 'Desmarque "Somente obras em andamento" ou ajuste os filtros globais para ver as demais obras.'
              : 'Ajuste os filtros globais para voltar a visualizar a carteira.'}
          </p>
        </div>
      ) : (
        <div className="p-4">
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
        </div>
      )}
    </section>
  );
}

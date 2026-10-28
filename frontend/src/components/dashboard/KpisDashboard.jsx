import { Activity, Building2, ClipboardList, TrendingDown, TrendingUp } from 'lucide-react';
import { formatarPercentual } from '../../utils/formatters.js';
import { corDesvio, formatarPp } from './dashboardUtils.js';

/** Quatro KPIs de contexto exibidos ao lado do cartão de metodologia. */
export default function KpisDashboard({ resumo = {} }) {
  const total = Number(resumo.total_obras || 0);
  const comMedicao = Number(resumo.com_medicao || 0);
  const cobertura = total > 0 ? (comMedicao / total) * 100 : 0;
  const desvioMedio = Number(resumo.desvio_medio || 0);
  const paletaDesvio = corDesvio(desvioMedio);
  const Positivo = desvioMedio >= 0;

  const cadeia = (resumo.por_categoria || []).find(
    (item) => item.categoria === 'CADEIA_DE_AJUDA'
  );
  const coordenacao = (resumo.por_categoria || []).find(
    (item) => item.categoria === 'CARTEIRA_DA_COORDENACAO'
  );

  const cartoes = [
    {
      chave: 'obras',
      rotulo: 'Obras na carteira',
      valor: total,
      detalhe: `${cadeia?.total ?? 0} Cadeia · ${coordenacao?.total ?? 0} Coordenação`,
      Icone: Building2,
      iconeClasse: 'bg-omega-50 text-omega-700 ring-omega-100',
    },
    {
      chave: 'medicao',
      rotulo: 'Cobertura de medição',
      valor: formatarPercentual(cobertura, 0),
      detalhe: `${comMedicao} de ${total} obras com avanço físico`,
      Icone: Activity,
      iconeClasse: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    },
    {
      chave: 'desvio',
      rotulo: 'Desvio médio',
      valor: formatarPp(desvioMedio, 1),
      detalhe: `${resumo.obras_com_desvio ?? 0} obra(s) fora da tolerância de 2 p.p.`,
      Icone: Positivo ? TrendingUp : TrendingDown,
      iconeClasse: `ring-1 ${paletaDesvio.fundo}`,
      valorClasse: paletaDesvio.texto,
    },
    {
      chave: 'restricoes',
      rotulo: 'Restrições abertas',
      valor: Number(resumo.restricoes_abertas || 0),
      detalhe: `${resumo.pendencias_documentais ?? 0} documentais · ${
        resumo.restricoes_cadastradas ?? 0
      } 6WLA`,
      Icone: ClipboardList,
      iconeClasse: 'bg-amber-50 text-amber-700 ring-amber-100',
    },
  ];

  return (
    <section aria-label="Indicadores gerais" className="grid h-full grid-cols-2 gap-3">
      {cartoes.map(({ chave, rotulo, valor, detalhe, Icone, iconeClasse, valorClasse }) => (
        <div key={chave} className="card flex flex-col justify-between p-3.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {rotulo}
            </p>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${iconeClasse}`}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p
            className={`mt-1 text-xl font-black leading-tight tracking-tight ${
              valorClasse || 'text-slate-800'
            }`}
          >
            {valor}
          </p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">{detalhe}</p>
        </div>
      ))}
    </section>
  );
}

import { AlertTriangle, FileText, Image, ListChecks, MessageSquare, Video } from 'lucide-react';

/**
 * Cartões de resumo do detalhamento da obra.
 * Cada cartão é clicável e leva para a aba correspondente.
 */
const CARTOES = [
  {
    chave: 'relatorios',
    label: 'Relatórios',
    Icone: FileText,
    aba: 'relatorios',
    cor: 'bg-omega-50 text-omega-700 ring-omega-100',
  },
  {
    chave: 'atividades',
    label: 'Atividades',
    Icone: ListChecks,
    aba: 'tarefas',
    cor: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    chave: 'ocorrencias',
    label: 'Ocorrências',
    Icone: AlertTriangle,
    aba: 'relatorios',
    cor: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
  {
    chave: 'comentarios',
    label: 'Comentários',
    Icone: MessageSquare,
    aba: 'relatorios',
    cor: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  {
    chave: 'fotos',
    label: 'Fotos',
    Icone: Image,
    aba: 'configuracao',
    cor: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  {
    chave: 'videos',
    label: 'Vídeos',
    Icone: Video,
    aba: 'configuracao',
    cor: 'bg-rose-50 text-rose-700 ring-rose-100',
  },
];

export default function ResumoObraCards({ resumo = {}, onSelecionarAba }) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {CARTOES.map(({ chave, label, Icone, aba, cor }) => {
        const valor = Number(resumo[chave] || 0);
        return (
          <button
            key={chave}
            type="button"
            onClick={() => onSelecionarAba?.(aba)}
            className="card group flex items-center gap-3 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-omega-500/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${cor}`}>
              <Icone className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </span>
              <span className="block text-2xl font-bold leading-tight text-slate-800">{valor}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

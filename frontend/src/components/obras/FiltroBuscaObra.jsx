import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Image,
  ListChecks,
  MapPin,
  MessageSquare,
  Search,
  Video,
} from 'lucide-react';
import { formatarData, formatarDataHora } from '../../utils/formatters.js';

const TIPOS = [
  { value: 'todos', label: 'Tudo' },
  { value: 'relatorios', label: 'Relatórios' },
  { value: 'atividades', label: 'Atividades' },
  { value: 'ocorrencias', label: 'Ocorrências' },
  { value: 'comentarios', label: 'Comentários' },
  { value: 'midias', label: 'Fotos e vídeos' },
  { value: 'localizacoes', label: 'Localizações' },
];

const ESTILOS = {
  relatorios: { Icone: FileText, cor: 'bg-omega-50 text-omega-700 ring-omega-100', aba: 'relatorios' },
  atividades: { Icone: ListChecks, cor: 'bg-blue-50 text-blue-700 ring-blue-100', aba: 'tarefas' },
  ocorrencias: { Icone: AlertTriangle, cor: 'bg-amber-50 text-amber-700 ring-amber-100', aba: 'relatorios' },
  comentarios: { Icone: MessageSquare, cor: 'bg-violet-50 text-violet-700 ring-violet-100', aba: 'relatorios' },
  midias: { Icone: Image, cor: 'bg-emerald-50 text-emerald-700 ring-emerald-100', aba: 'configuracao' },
  localizacoes: { Icone: MapPin, cor: 'bg-rose-50 text-rose-700 ring-rose-100', aba: 'configuracao' },
};

/** Normaliza texto para busca sem diferenciar maiúsculas, acentos e espaços. */
function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function montarIndice(obra) {
  const itens = [];

  (obra.relatorios || []).forEach((relatorio) => {
    itens.push({
      tipo: 'relatorios',
      id: `relatorio-${relatorio.id}`,
      titulo: relatorio.titulo,
      descricao: relatorio.resumo || 'Relatório Diário de Obra',
      meta: `${formatarData(relatorio.data)} · ${relatorio.status}`,
      busca: [relatorio.titulo, relatorio.resumo, relatorio.autor_nome, relatorio.status].join(' '),
    });
  });

  (obra.atividades || []).forEach((atividade) => {
    itens.push({
      tipo: 'atividades',
      id: `atividade-${atividade.id}`,
      titulo: atividade.titulo,
      descricao: atividade.descricao || 'Atividade da obra',
      meta: [atividade.status, atividade.responsavel, atividade.prazo ? `Prazo ${formatarData(atividade.prazo)}` : null]
        .filter(Boolean)
        .join(' · '),
      busca: [atividade.titulo, atividade.descricao, atividade.responsavel, atividade.status].join(' '),
    });
  });

  (obra.ocorrencias || []).forEach((ocorrencia) => {
    itens.push({
      tipo: 'ocorrencias',
      id: `ocorrencia-${ocorrencia.id}`,
      titulo: `Ocorrência ${(ocorrencia.gravidade || '').toLowerCase()}`,
      descricao: ocorrencia.descricao,
      meta: formatarDataHora(ocorrencia.created_at),
      busca: [ocorrencia.descricao, ocorrencia.gravidade].join(' '),
    });
  });

  (obra.comentarios || []).forEach((comentario) => {
    itens.push({
      tipo: 'comentarios',
      id: `comentario-${comentario.id}`,
      titulo: comentario.autor_nome || 'Comentário',
      descricao: comentario.texto,
      meta: formatarDataHora(comentario.created_at),
      busca: [comentario.texto, comentario.autor_nome].join(' '),
    });
  });

  (obra.midias || []).forEach((midia) => {
    itens.push({
      tipo: 'midias',
      id: `midia-${midia.id}`,
      titulo: midia.legenda || (midia.tipo === 'FOTO' ? 'Foto da obra' : 'Vídeo da obra'),
      descricao: midia.url,
      meta: `${midia.tipo === 'FOTO' ? 'Foto' : 'Vídeo'} · ${formatarDataHora(midia.created_at)}`,
      busca: [midia.legenda, midia.url, midia.tipo].join(' '),
    });
  });

  (obra.localizacoes || []).forEach((localizacao) => {
    const detalhes = [];
    if (localizacao.km_inicial !== null && localizacao.km_inicial !== undefined) {
      detalhes.push(`KM ${localizacao.km_inicial}${localizacao.km_final != null ? ` ao ${localizacao.km_final}` : ''}`);
    }
    if (localizacao.latitude != null && localizacao.longitude != null) {
      detalhes.push(`${localizacao.latitude}, ${localizacao.longitude}`);
    }
    if (localizacao.referencia) detalhes.push(localizacao.referencia);

    itens.push({
      tipo: 'localizacoes',
      id: `localizacao-${localizacao.id}`,
      titulo: localizacao.descricao,
      descricao: detalhes.join(' · ') || 'Localização da obra',
      meta: localizacao.tipo === 'TRECHO' ? 'Trecho linear' : 'Ponto geográfico',
      busca: [localizacao.descricao, localizacao.referencia, localizacao.tipo, detalhes.join(' ')].join(' '),
    });
  });

  return itens.map((item) => ({ ...item, buscaNormalizada: normalizar(item.busca) }));
}

/**
 * Filtro de busca unificado do detalhamento: encontra relatórios, atividades,
 * ocorrências, comentários, mídias e localizações da obra por texto ou tipo.
 */
export default function FiltroBuscaObra({ obra, onIrParaAba }) {
  const [termo, setTermo] = useState('');
  const [tipo, setTipo] = useState('todos');

  const indice = useMemo(() => montarIndice(obra), [obra]);

  const resultados = useMemo(() => {
    const alvo = normalizar(termo);
    return indice.filter((item) => {
      if (tipo !== 'todos' && item.tipo !== tipo) return false;
      if (!alvo) return true;
      return item.buscaNormalizada.includes(alvo);
    });
  }, [indice, termo, tipo]);

  const contagem = useMemo(() => {
    const mapa = { todos: indice.length };
    indice.forEach((item) => {
      mapa[item.tipo] = (mapa[item.tipo] || 0) + 1;
    });
    return mapa;
  }, [indice]);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <Search className="h-5 w-5 text-omega-600" aria-hidden="true" />
          Filtro de Busca
        </h2>
        <p className="text-sm text-slate-500">
          Pesquise em todos os registros da obra e salte direto para o módulo correspondente.
        </p>
      </header>

      <div className="card space-y-3 p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            className="campo pl-9"
            placeholder="Buscar por título, descrição, responsável, localização..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            aria-label="Buscar no detalhamento da obra"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map((opcao) => (
            <button
              key={opcao.value}
              type="button"
              onClick={() => setTipo(opcao.value)}
              aria-pressed={tipo === opcao.value}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                tipo === opcao.value
                  ? 'border-omega-600 bg-omega-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opcao.label}
              <span className={`ml-1.5 text-[10px] ${tipo === opcao.value ? 'text-white/80' : 'text-slate-400'}`}>
                {contagem[opcao.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {resultados.length} resultado{resultados.length === 1 ? '' : 's'}
        </p>
        {termo ? (
          <button type="button" className="text-xs font-semibold text-omega-700 hover:underline" onClick={() => setTermo('')}>
            Limpar busca
          </button>
        ) : null}
      </div>

      {resultados.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <Search className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhum registro encontrado</p>
          <p className="max-w-md text-xs text-slate-500">
            Ajuste o texto pesquisado ou selecione outro tipo de registro.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {resultados.map((resultado) => {
            const estilo = ESTILOS[resultado.tipo] || ESTILOS.relatorios;
            const { Icone } = estilo;

            return (
              <li key={resultado.id}>
                <button
                  type="button"
                  onClick={() => onIrParaAba?.(estilo.aba)}
                  className="card flex w-full items-start gap-3 p-3 text-left transition hover:border-omega-300 hover:bg-slate-50"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${estilo.cor}`}>
                    {resultado.tipo === 'midias' && resultado.meta.startsWith('Vídeo') ? (
                      <Video className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Icone className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-800">{resultado.titulo}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {TIPOS.find((opcao) => opcao.value === resultado.tipo)?.label || resultado.tipo}
                      </span>
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-slate-600">{resultado.descricao}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <CalendarDays className="h-3 w-3" aria-hidden="true" />
                      {resultado.meta}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

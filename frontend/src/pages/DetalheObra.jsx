import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  FileText,
  Image,
  LayoutDashboard,
  ListChecks,
  MapPin,
  RefreshCw,
  Search,
  Settings,
  UserRound,
  Video,
} from 'lucide-react';
import EtiquetasPendencia from '../components/EtiquetasPendencia.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import AvancoFisicoTabela from '../components/obras/AvancoFisicoTabela.jsx';
import ConfiguracaoObra from '../components/obras/ConfiguracaoObra.jsx';
import CurvaSChart from '../components/obras/CurvaSChart.jsx';
import FiltroBuscaObra from '../components/obras/FiltroBuscaObra.jsx';
import IndicadoresAvanco from '../components/obras/IndicadoresAvanco.jsx';
import LocalizacoesObra from '../components/obras/LocalizacoesObra.jsx';
import RelatoriosObra from '../components/obras/RelatoriosObra.jsx';
import ResumoObraCards from '../components/obras/ResumoObraCards.jsx';
import TarefasObra from '../components/obras/TarefasObra.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useObraDetalhe } from '../hooks/useObras.js';
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarPercentual,
  formatarSemana,
} from '../utils/formatters.js';

const PERFIS_ESCRITA = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const PERFIS_QUE_ATRIBUEM = ['SUPERVISOR', 'ADMIN'];

const ABAS = [
  { id: 'visao-geral', label: 'Visão Geral', Icone: LayoutDashboard },
  { id: 'tarefas', label: 'Lista de Tarefas', Icone: ListChecks },
  { id: 'relatorios', label: 'Relatórios', Icone: FileText },
  { id: 'busca', label: 'Filtro de Busca', Icone: Search },
  { id: 'configuracao', label: 'Edição / Configuração', Icone: Settings },
];

function LinhaResumo({ rotulo, valor, Icone }) {
  return (
    <div className="flex items-start gap-2">
      {Icone ? <Icone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /> : null}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
        <p className="truncate text-xs font-semibold text-slate-700">{valor || '—'}</p>
      </div>
    </div>
  );
}

/**
 * Página dedicada de detalhamento da obra.
 *
 * Reúne os cartões de resumo, os painéis analíticos de avanço físico/Curva S e
 * as abas operacionais (visão geral, tarefas, relatórios, busca e configuração).
 * Todas as mutações devolvem a obra consolidada e atualizam a página sem refetch.
 */
export default function DetalheObra() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { usuario } = useAuth();

  const { obra, carregando, erro, recarregar, setObra } = useObraDetalhe(id);
  const [aba, setAba] = useState('visao-geral');

  const podeEditar = PERFIS_ESCRITA.includes(usuario?.perfil);
  const podeAtribuir = PERFIS_QUE_ATRIBUEM.includes(usuario?.perfil);
  const podeDocumentar = podeEditar;

  const aplicarAtualizacao = useCallback(
    (atualizada) => {
      if (atualizada?.id) setObra(atualizada);
    },
    [setObra]
  );

  useEffect(() => {
    if (!obra) return undefined;
    const anterior = document.title;
    document.title = `${obra.pep || `Obra ${obra.id}`} · Synapse`;
    return () => {
      document.title = anterior;
    };
  }, [obra]);

  function selecionarAba(novaAba) {
    if (ABAS.some((item) => item.id === novaAba)) {
      setAba(novaAba);
    }
  }

  if (carregando && !obra) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-3 py-24 text-slate-500">
        <Spinner tamanho="lg" className="text-omega-600" />
        <p className="text-sm font-medium">Carregando detalhamento da obra...</p>
      </div>
    );
  }

  if (erro || !obra) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Link to="/obras" className="btn-neutro mb-4">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para Obras
        </Link>

        <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <FileText className="h-10 w-10 text-slate-400" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-800">Obra não encontrada</h1>
          <p className="max-w-md text-sm text-slate-500">
            {erro || 'Não foi possível carregar o detalhamento desta obra.'}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-neutro" onClick={recarregar}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </button>
            <button type="button" className="btn-primario" onClick={() => navigate('/obras')}>
              Ir para a lista de obras
            </button>
          </div>
        </div>
      </div>
    );
  }

  const relatorios = obra.relatorios || [];
  const localizacoes = obra.localizacoes || [];
  const ultimaAtualizacao = obra.updated_at
    ? formatarDataHora(obra.updated_at)
    : formatarData(obra.created_at);
  const semanaAtual = obra.avanco_resumo?.semana_atual;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      {/* ---------------------------------------------------- Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/obras" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-omega-700">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para Obras
        </Link>

        <button type="button" className="btn-neutro" onClick={recarregar} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
          Atualizar
        </button>
      </div>

      <header className="card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={obra.status} />
              <EtiquetasPendencia pendencias={obra.pendencias} />
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
              {obra.pep || `Obra ${obra.id}`}
            </h1>
            <p className="text-sm font-semibold text-slate-600">
              SS {obra.ss || '—'} · {obra.cliente || 'Cliente não informado'}
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
              {obra.descricao || 'Sem detalhamento do serviço informado.'}
            </p>
          </div>

          <div className="shrink-0 rounded-lg border border-omega-100 bg-omega-50/60 px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-omega-700/70">Valor do contrato</p>
            <p className="text-2xl font-bold text-omega-700">{formatarMoeda(obra.valor)}</p>
            <p className="mt-1 text-[11px] text-slate-500">Atualizado em {ultimaAtualizacao}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3 sm:grid-cols-3 xl:grid-cols-6">
          <LinhaResumo rotulo="Responsável" valor={obra.planejador_nome || 'Sem responsável'} Icone={UserRound} />
          <LinhaResumo rotulo="OSI" valor={obra.osi_numero || 'Pendente'} Icone={FileText} />
          <LinhaResumo rotulo="Localizações" valor={`${localizacoes.length} cadastrada(s)`} Icone={MapPin} />
          <LinhaResumo
            rotulo="Avanço realizado"
            valor={formatarPercentual(obra.avanco_resumo?.real_acum || 0, 2)}
            Icone={CalendarDays}
          />
          <LinhaResumo rotulo="Relatórios" valor={`${obra.resumo?.relatorios || 0} RDO(s)`} Icone={FileText} />
          <LinhaResumo
            rotulo="Mídias"
            valor={`${obra.resumo?.fotos || 0} foto(s) · ${obra.resumo?.videos || 0} vídeo(s)`}
            Icone={Image}
          />
        </div>
      </header>

      {/* ------------------------------------------ Cartões de resumo */}
      <ResumoObraCards resumo={obra.resumo} onSelecionarAba={selecionarAba} />

      {/* ---------------------------------- Painéis analíticos superiores */}
      <IndicadoresAvanco resumo={obra.avanco_resumo} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <section className="card p-4 xl:col-span-2">
          <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Curva S — Previsto x Real</h2>
              <p className="text-xs text-slate-500">Avanço físico acumulado ao longo das semanas lançadas.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {obra.avanco_resumo?.semanas || 0} medição(ões)
            </span>
          </header>
          <CurvaSChart linhas={obra.avanco_fisico || []} />
        </section>

        <aside className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-slate-800">Resumo executivo</h2>
          <dl className="space-y-2">
            {[
              ['Semana atual', semanaAtual ? formatarSemana(semanaAtual, obra.avanco_resumo?.data_atual) : 'Sem medições'],
              ['Data da última medição', obra.avanco_resumo?.data_atual ? formatarData(obra.avanco_resumo.data_atual) : '—'],
              ['Previsto acumulado', formatarPercentual(obra.avanco_resumo?.previsto_acum || 0, 2)],
              ['Realizado acumulado', formatarPercentual(obra.avanco_resumo?.real_acum || 0, 2)],
              ['Desvio', formatarPercentual(obra.avanco_resumo?.desvio || 0, 2)],
              ['Localizações', String(localizacoes.length)],
              ['Relatórios', String(relatorios.length)],
              ['Atividades', String((obra.atividades || []).length)],
              ['Ocorrências', String((obra.ocorrencias || []).length)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                <dt className="text-xs text-slate-500">{rotulo}</dt>
                <dd className="text-xs font-bold text-slate-800">{valor}</dd>
              </div>
            ))}
          </dl>

          {podeEditar ? (
            <button type="button" className="btn-primario mt-4 w-full" onClick={() => selecionarAba('configuracao')}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Lançar avanço físico
            </button>
          ) : null}
        </aside>
      </div>

      <section className="card p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Avanço Físico Geral</h2>
            <p className="text-xs text-slate-500">Histórico de medições com valores de previsão, linha de base e realizado.</p>
          </div>
          {podeEditar ? (
            <button type="button" className="btn-neutro" onClick={() => selecionarAba('configuracao')}>
              Editar medições
            </button>
          ) : null}
        </header>

        <AvancoFisicoTabela linhas={obra.avanco_fisico || []} />
      </section>

      {/* ------------------------------------------------------- Abas */}
      <nav
        className="card flex gap-1 overflow-x-auto p-1"
        role="tablist"
        aria-label="Seções do detalhamento da obra"
      >
        {ABAS.map(({ id: idAba, label, Icone }) => {
          const ativa = aba === idAba;
          return (
            <button
              key={idAba}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => selecionarAba(idAba)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40 ${
                ativa
                  ? 'bg-omega-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      <div role="tabpanel">
        {aba === 'visao-geral' ? (
          <div className="space-y-4">
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <h2 className="mb-3 text-sm font-bold text-slate-800">Dados do projeto</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <LinhaResumo rotulo="PEP (CC)" valor={obra.pep} />
                  <LinhaResumo rotulo="SS" valor={obra.ss} />
                  <LinhaResumo rotulo="Cliente / Área" valor={obra.cliente} />
                  <LinhaResumo rotulo="Endereço" valor={obra.endereco} />
                  <LinhaResumo rotulo="Orçamentista" valor={obra.orcamentista_nome} />
                  <LinhaResumo rotulo="ART" valor={obra.art} />
                  <LinhaResumo rotulo="Criado em" valor={formatarDataHora(obra.created_at)} />
                  <LinhaResumo rotulo="Atualizado em" valor={formatarDataHora(obra.updated_at)} />
                </div>

                {obra.documentos_referencia ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Documentos de referência
                    </p>
                    <p className="whitespace-pre-line text-xs text-slate-600">{obra.documentos_referencia}</p>
                  </div>
                ) : null}
              </div>

              <div className="card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Documentação de partida</h2>
                  <EtiquetasPendencia pendencias={obra.pendencias} />
                </div>

                <ul className="space-y-2">
                  <li className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">Emissão da OSI</p>
                      <p className="text-[11px] text-slate-500">
                        {obra.osi_emitida_em
                          ? `${formatarDataHora(obra.osi_emitida_em)} · ${obra.osi_emitida_por_nome || 'sistema'}`
                          : 'Ainda não emitida.'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      obra.osi_emitida_em ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {obra.osi_emitida_em ? 'OK' : 'Pendente'}
                    </span>
                  </li>

                  <li className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">Ata de Reunião de Partida</p>
                      <p className="text-[11px] text-slate-500">
                        {obra.ata_partida_url ? 'Documento anexado.' : 'Ainda não anexada.'}
                      </p>
                    </div>
                    {obra.ata_partida_url ? (
                      <a
                        href={obra.ata_partida_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[11px] font-bold text-omega-700 hover:underline"
                      >
                        Ver ata
                      </a>
                    ) : (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                        Pendente
                      </span>
                    )}
                  </li>
                </ul>

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  <LinhaResumo rotulo="Responsável" valor={obra.planejador_nome || 'Sem responsável'} Icone={UserRound} />
                  <LinhaResumo rotulo="Etapa" valor={obra.status} Icone={LayoutDashboard} />
                </div>
              </div>
            </section>

            <LocalizacoesObra obra={obra} podeEditar={podeEditar} onObraAtualizada={aplicarAtualizacao} />

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Últimos relatórios</h2>
                  {relatorios.length > 0 ? (
                    <button
                      type="button"
                      className="text-xs font-bold text-omega-700 hover:underline"
                      onClick={() => selecionarAba('relatorios')}
                    >
                      Ver todos
                    </button>
                  ) : null}
                </div>

                {relatorios.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                    Nenhum RDO registrado.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {relatorios.slice(0, 4).map((relatorio) => (
                      <li key={relatorio.id} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-700">{relatorio.titulo}</p>
                          <p className="text-[10px] text-slate-400">{formatarData(relatorio.data)}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                          {relatorio.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Últimas ocorrências</h2>
                  {(obra.ocorrencias || []).length > 0 ? (
                    <button
                      type="button"
                      className="text-xs font-bold text-omega-700 hover:underline"
                      onClick={() => selecionarAba('relatorios')}
                    >
                      Ver todas
                    </button>
                  ) : null}
                </div>

                {(obra.ocorrencias || []).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                    Nenhuma ocorrência registrada.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {obra.ocorrencias.slice(0, 4).map((ocorrencia) => (
                      <li key={ocorrencia.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-xs text-slate-700">{ocorrencia.descricao}</p>
                          <p className="text-[10px] text-slate-400">
                            {ocorrencia.gravidade} · {formatarDataHora(ocorrencia.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {(obra.midias || []).length > 0 ? (
              <section className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Galeria recente</h2>
                  <button
                    type="button"
                    className="text-xs font-bold text-omega-700 hover:underline"
                    onClick={() => selecionarAba('configuracao')}
                  >
                    Gerenciar mídias
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {obra.midias.slice(0, 6).map((midia) => (
                    <a
                      key={midia.id}
                      href={midia.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative block overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                      title={midia.legenda || midia.url}
                    >
                      {midia.tipo === 'FOTO' ? (
                        <img
                          src={midia.url}
                          alt={midia.legenda || 'Foto da obra'}
                          loading="lazy"
                          className="h-24 w-full object-cover transition group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="flex h-24 w-full flex-col items-center justify-center gap-1 bg-slate-900 text-white">
                          <Video className="h-6 w-6 text-rose-400" aria-hidden="true" />
                          <span className="text-[10px] font-semibold">Vídeo</span>
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {aba === 'tarefas' ? (
          <TarefasObra obra={obra} podeEditar={podeEditar} onObraAtualizada={aplicarAtualizacao} />
        ) : null}

        {aba === 'relatorios' ? (
          <RelatoriosObra obra={obra} podeEditar={podeEditar} onObraAtualizada={aplicarAtualizacao} />
        ) : null}

        {aba === 'busca' ? <FiltroBuscaObra obra={obra} onIrParaAba={selecionarAba} /> : null}

        {aba === 'configuracao' ? (
          <ConfiguracaoObra
            obra={obra}
            podeEditar={podeEditar}
            podeAtribuir={podeAtribuir}
            podeDocumentar={podeDocumentar}
            onObraAtualizada={aplicarAtualizacao}
          />
        ) : null}
      </div>

      <div className="pb-4">
        <button
          type="button"
          className="btn-neutro"
          onClick={() => {
            toast.info('Detalhamento atualizado.');
            recarregar();
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Recarregar dados da obra
        </button>
      </div>
    </div>
  );
}

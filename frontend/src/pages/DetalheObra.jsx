import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  Search,
  Settings,
  Wallet,
} from 'lucide-react';
import EtiquetasPendencia from '../components/EtiquetasPendencia.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import AbaCronograma from '../components/obras/AbaCronograma.jsx';
import AbaProgramacao6Semanas from '../components/obras/AbaProgramacao6Semanas.jsx';
import AbaProjecaoFinanceira from '../components/obras/AbaProjecaoFinanceira.jsx';
import AbaVisaoGeral from '../components/obras/AbaVisaoGeral.jsx';
import ConfiguracaoObra from '../components/obras/ConfiguracaoObra.jsx';
import FiltroBuscaObra from '../components/obras/FiltroBuscaObra.jsx';
import RelatoriosObra from '../components/obras/RelatoriosObra.jsx';
import TarefasObra from '../components/obras/TarefasObra.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCabecalhoPagina } from '../context/CabecalhoContext.jsx';
import { useObraDetalhe } from '../hooks/useObras.js';

const PERFIS_ESCRITA = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const PERFIS_QUE_ATRIBUEM = ['SUPERVISOR', 'ADMIN'];

/** Abas principais (análise da obra). */
const ABAS_PRINCIPAIS = [
  { id: 'visao-geral', label: 'Visão Geral', Icone: LayoutDashboard },
  { id: 'cronograma', label: 'Cronograma', Icone: FileSpreadsheet },
  { id: '6wla', label: 'Programação de 6 Semanas (6WLA)', Icone: CalendarRange },
  { id: 'financeiro', label: 'Projeção Financeira & Medição', Icone: Wallet },
];

/** Abas operacionais (registros do dia a dia e edição). */
const ABAS_OPERACIONAIS = [
  { id: 'tarefas', label: 'Tarefas', Icone: ListChecks },
  { id: 'relatorios', label: 'Relatórios', Icone: FileText },
  { id: 'busca', label: 'Busca', Icone: Search },
  { id: 'configuracao', label: 'Edição / Configuração', Icone: Settings },
];

const TODAS_AS_ABAS = [...ABAS_PRINCIPAIS, ...ABAS_OPERACIONAIS];

function BotaoAba({ aba, ativa, onSelecionar, discreta = false }) {
  const { id, label, Icone } = aba;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={() => onSelecionar(id)}
      className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40 ${
        discreta ? 'text-xs' : 'text-sm'
      } ${
        ativa
          ? 'bg-omega-600 text-white shadow-sm'
          : discreta
            ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icone className={`${discreta ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0`} aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * Cabeçalho compacto da obra, exibido na barra superior do layout:
 * voltar · SS / PEP + nome curto + badges · atualizar.
 */
function CabecalhoObra({ obra, carregando, onAtualizar }) {
  const nomeCurto = obra.descricao || obra.cliente || 'Sem descrição informada';

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link
        to="/obras"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-omega-700"
        title="Voltar para Obras"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Voltar para Obras</span>
      </Link>

      <span className="h-8 w-px shrink-0 bg-slate-200" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-base font-bold tracking-tight text-slate-800">
            {obra.ss || '—'}
            <span className="font-semibold text-slate-400"> / </span>
            {obra.pep || `Obra ${obra.id}`}
          </h1>
          <div className="hidden shrink-0 items-center gap-1.5 md:flex">
            <StatusBadge status={obra.status} />
            <EtiquetasPendencia pendencias={obra.pendencias} />
          </div>
        </div>
        <p className="truncate text-xs text-slate-500" title={nomeCurto}>
          {nomeCurto}
        </p>
      </div>

      <button type="button" className="btn-neutro shrink-0" onClick={onAtualizar} disabled={carregando}>
        <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span className="hidden sm:inline">Atualizar</span>
      </button>
    </div>
  );
}

/**
 * Página dedicada de detalhamento da obra.
 *
 * A identificação da obra fica na barra superior do layout; o conteúdo é
 * dividido nas abas principais (Visão Geral, Projeção Financeira & Medição e
 * Programação de 6 Semanas) e nas operacionais (tarefas, relatórios, busca e
 * configuração). Todas as mutações devolvem a obra consolidada e atualizam a
 * página sem refetch.
 */
export default function DetalheObra() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  useCabecalhoPagina(
    obra ? <CabecalhoObra obra={obra} carregando={carregando} onAtualizar={recarregar} /> : null,
    [obra, carregando, recarregar]
  );

  useEffect(() => {
    if (!obra) return undefined;
    const anterior = document.title;
    document.title = `${obra.ss || obra.pep || `Obra ${obra.id}`} · Synapse`;
    return () => {
      document.title = anterior;
    };
  }, [obra]);

  function selecionarAba(novaAba) {
    if (TODAS_AS_ABAS.some((item) => item.id === novaAba)) {
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

  return (
    <div className="w-full space-y-4">
      {/* ------------------------------------------------------- Abas */}
      <nav
        className="card flex flex-wrap items-center gap-1 p-1"
        role="tablist"
        aria-label="Seções do detalhamento da obra"
      >
        <div className="flex gap-1 overflow-x-auto">
          {ABAS_PRINCIPAIS.map((item) => (
            <BotaoAba key={item.id} aba={item} ativa={aba === item.id} onSelecionar={selecionarAba} />
          ))}
        </div>

        <span className="mx-1 hidden h-6 w-px bg-slate-200 lg:block" aria-hidden="true" />

        <div className="flex gap-1 overflow-x-auto lg:ml-auto">
          {ABAS_OPERACIONAIS.map((item) => (
            <BotaoAba key={item.id} aba={item} ativa={aba === item.id} onSelecionar={selecionarAba} discreta />
          ))}
        </div>
      </nav>

      <div role="tabpanel">
        {aba === 'visao-geral' ? (
          <AbaVisaoGeral obra={obra} podeEditar={podeEditar} onIrParaAba={selecionarAba} />
        ) : null}

        {aba === 'cronograma' ? <AbaCronograma obra={obra} podeEditar={podeEditar} /> : null}

        {aba === 'financeiro' ? <AbaProjecaoFinanceira obra={obra} /> : null}

        {aba === '6wla' ? (
          <AbaProgramacao6Semanas obra={obra} podeEditar={podeEditar} onIrParaAba={selecionarAba} />
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
    </div>
  );
}

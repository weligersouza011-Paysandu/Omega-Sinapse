import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  NotebookPen,
  RefreshCw,
  ReceiptText,
  Settings,
  Wallet,
} from 'lucide-react';
import EtiquetasPendencia from '../components/EtiquetasPendencia.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import AbaCronograma from '../components/obras/AbaCronograma.jsx';
import AbaProgramacao6Semanas from '../components/obras/AbaProgramacao6Semanas.jsx';
import AbaMedicaoObra from '../components/obras/AbaMedicaoObra.jsx';
import AbaProjecaoObra from '../components/obras/AbaProjecaoObra.jsx';
import AbaVisaoGeral from '../components/obras/AbaVisaoGeral.jsx';
import ConfiguracaoObra from '../components/obras/ConfiguracaoObra.jsx';
import RelatoriosObra from '../components/obras/RelatoriosObra.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCabecalhoPagina } from '../context/CabecalhoContext.jsx';
import { useObraDetalhe } from '../hooks/useObras.js';

const PERFIS_ESCRITA = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const PERFIS_QUE_ATRIBUEM = ['SUPERVISOR', 'ADMIN'];

/** Abas da obra (só as essenciais). */
const ABAS = [
  { id: 'visao-geral', label: 'Visão Geral', Icone: LayoutDashboard },
  { id: 'cronograma', label: 'Cronograma', Icone: FileSpreadsheet },
  { id: '6wla', label: 'Programação de 6 Semanas (6WLA)', Icone: CalendarRange },
  { id: 'medicao', label: 'Medição', Icone: ReceiptText },
  { id: 'projecao', label: 'Projeção Financeira', Icone: Wallet },
  { id: 'relatorios', label: 'RDO (Relatório de Diário de Obra)', Icone: NotebookPen },
];

/**
 * Edição da obra (status, OSI, planejadores, documentos de partida, localizações): fica fora da
 * barra de abas e abre pelo botão "Editar obra" do cabeçalho.
 */
const VISAO_EDICAO = 'configuracao';

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
function CabecalhoObra({ obra, carregando, onAtualizar, podeEditar, editando, onEditar }) {
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

      {podeEditar ? (
        <button
          type="button"
          className={`shrink-0 ${editando ? 'btn-primario' : 'btn-neutro'}`}
          onClick={onEditar}
          aria-pressed={editando}
          title="Status, OSI, planejadores, documentos de partida e localizações"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Editar obra</span>
        </button>
      ) : null}

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
 * dividido nas abas Visão Geral, Cronograma, 6WLA, Medição, Projeção Financeira e RDO; a edição
 * da obra abre pelo botão "Editar obra" do cabeçalho. Todas as mutações devolvem a obra consolidada e atualizam a
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
    obra ? (
      <CabecalhoObra
        obra={obra}
        carregando={carregando}
        onAtualizar={recarregar}
        podeEditar={podeEditar}
        editando={aba === VISAO_EDICAO}
        onEditar={() => setAba((atual) => (atual === VISAO_EDICAO ? 'visao-geral' : VISAO_EDICAO))}
      />
    ) : null,
    [obra, carregando, recarregar, podeEditar, aba]
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
    if (novaAba === VISAO_EDICAO || ABAS.some((item) => item.id === novaAba)) {
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
          {ABAS.map((item) => (
            <BotaoAba key={item.id} aba={item} ativa={aba === item.id} onSelecionar={selecionarAba} />
          ))}
        </div>
      </nav>

      <div role="tabpanel">
        {aba === 'visao-geral' ? (
          <AbaVisaoGeral obra={obra} podeEditar={podeEditar} onIrParaAba={selecionarAba} />
        ) : null}

        {aba === 'cronograma' ? <AbaCronograma obra={obra} podeEditar={podeEditar} /> : null}

        {aba === 'medicao' ? <AbaMedicaoObra obra={obra} /> : null}

        {aba === 'projecao' ? <AbaProjecaoObra obra={obra} podeEditar={podeEditar} /> : null}

        {aba === '6wla' ? (
          <AbaProgramacao6Semanas obra={obra} podeEditar={podeEditar} onIrParaAba={selecionarAba} />
        ) : null}

        {aba === 'relatorios' ? (
          <RelatoriosObra obra={obra} podeEditar={podeEditar} onObraAtualizada={aplicarAtualizacao} />
        ) : null}

        {aba === VISAO_EDICAO ? (
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

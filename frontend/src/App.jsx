import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RotaPorPerfil from './components/RotaPorPerfil.jsx';
import RotaPorPagina from './components/RotaPorPagina.jsx';
import { useAuth } from './context/AuthContext.jsx';
import BotaoTema from './components/BotaoTema.jsx';
import Sidebar from './components/Sidebar.jsx';
import Spinner from './components/Spinner.jsx';
import { CabecalhoProvider, useConteudoCabecalho } from './context/CabecalhoContext.jsx';
import Login from './pages/Login.jsx';
import DashboardOrcamentos from './pages/DashboardOrcamentos.jsx';

// Páginas secundárias (gráficos, mapas, gestão) carregadas sob demanda para
// reduzir o bundle inicial; a tela padrão (/orcamentos) segue no bundle principal.
const DashboardOrcamentosBI = lazy(() => import('./pages/DashboardOrcamentosBI.jsx'));
const Obras = lazy(() => import('./pages/Obras.jsx'));
const DetalheObra = lazy(() => import('./pages/DetalheObra.jsx'));
const DashboardPlanejamento = lazy(() => import('./pages/DashboardPlanejamento.jsx'));
const Medicao = lazy(() => import('./pages/Medicao.jsx'));
const UsuariosPage = lazy(() => import('./pages/UsuariosPage.jsx'));
const GestaoDemandasView = lazy(() => import('./pages/GestaoDemandasView.jsx'));
const MeuPerfil = lazy(() => import('./pages/MeuPerfil.jsx'));

/** Fallback exibido enquanto o código de uma página é baixado. */
function PaginaCarregando() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <Spinner tamanho="lg" />
    </div>
  );
}
import { MODULOS, rotaInicial } from './config/modulos.js';
import { MODO_DEMO, BYPASS_LOGIN } from './config/demo.js';

/** Selo de ambiente exibido na barra de cabeçalho. */
const AMBIENTE = MODO_DEMO
  ? {
      texto: 'Modo demonstração',
      classe: 'bg-amber-100 text-amber-800 ring-amber-300',
    }
  : BYPASS_LOGIN
    ? {
        texto: 'Acesso aberto (sem login)',
        classe: 'bg-sky-100 text-sky-700 ring-sky-300',
      }
    : {
        texto: 'Produção',
        classe: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
      };

/**
 * Layout raiz da aplicação: Sidebar retrátil à esquerda + painel de conteúdo
 * à direita (cabeçalho minimalista com o módulo ativo e área de renderização).
 *
 * O container usa `flex h-screen overflow-hidden`, portanto somente a coluna
 * da direita rola — a Sidebar permanece fixa. O `min-w-0` na coluna de conteúdo
 * evita que a grid de cards force overflow horizontal quando a Sidebar expande.
 */
function AppLayout() {
  return (
    <CabecalhoProvider>
      <AppLayoutConteudo />
    </CabecalhoProvider>
  );
}

function AppLayoutConteudo() {
  const conteudoCabecalho = useConteudoCabecalho();
  // Em telas menores (tablets e notebooks compactos) a Sidebar inicia recolhida
  // para preservar a área útil dos dashboards; o usuário ainda pode expandi-la.
  const [recolhido, setRecolhido] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 1280
  );
  const local = useLocation();

  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 1279px)');
    const aoMudar = (evento) => setRecolhido(evento.matches);

    setRecolhido(consulta.matches);
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  const moduloAtual = local.pathname.startsWith('/perfil')
    ? { label: 'Meu perfil', descricao: 'Foto, dados de contato e senha.' }
    : MODULOS.find((modulo) => local.pathname.startsWith(modulo.rota)) || MODULOS[0];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar recolhido={recolhido} onToggle={() => setRecolhido((valor) => !valor)} />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          {/* Páginas podem ocupar a barra com o próprio cabeçalho compacto. */}
          {conteudoCabecalho ? (
            <div className="min-w-0 flex-1">{conteudoCabecalho}</div>
          ) : (
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Synapse
              </p>
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-800">
                {moduloAtual.label}
              </h1>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-3">
            {conteudoCabecalho ? null : (
              <p className="hidden max-w-xs truncate text-xs text-slate-400 lg:block">
                {moduloAtual.descricao}
              </p>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${AMBIENTE.classe}`}
            >
              {AMBIENTE.texto}
            </span>
            <BotaoTema />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">
          <Suspense fallback={<PaginaCarregando />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** Leva o usuário à primeira página que ele pode abrir (Cliente: a primeira liberada). */
function Inicio() {
  const { usuario } = useAuth();
  return <Navigate to={rotaInicial(usuario)} replace />;
}

/** Cliente sem nenhuma página liberada. */
function SemAcesso() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
      <h2 className="text-base font-bold text-slate-800">Nenhuma página liberada</h2>
      <p className="mt-2 text-sm text-slate-500">
        Seu usuário ainda não tem páginas liberadas. Peça ao administrador do Synapse para liberar o acesso.
      </p>
    </div>
  );
}

/** Rota privada: exige autenticação e monta o layout com Sidebar. */
function AreaPrivada() {
  return (
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Com o acesso temporário ativo a tela de login é ignorada. */}
      <Route
        path="/login"
        element={BYPASS_LOGIN ? <Navigate to="/orcamentos" replace /> : <Login />}
      />

      {/* Rotas privadas: renderizadas dentro do <Outlet /> do AppLayout. */}
      <Route element={<AreaPrivada />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/sem-acesso" element={<SemAcesso />} />
        <Route path="/perfil" element={<MeuPerfil />} />
        <Route path="/orcamentos" element={<RotaPorPagina pagina="orcamentos"><DashboardOrcamentos /></RotaPorPagina>} />
        <Route path="/obras" element={<RotaPorPagina pagina="obras"><Obras /></RotaPorPagina>} />
        <Route path="/obras/:id" element={<RotaPorPagina pagina="obras"><DetalheObra /></RotaPorPagina>} />
        <Route
          path="/usuarios"
          element={
            <RotaPorPerfil perfis={['ADMIN']}>
              <UsuariosPage />
            </RotaPorPerfil>
          }
        />
        <Route path="/orcamentos/dashboard" element={<RotaPorPagina pagina="orcamentos"><DashboardOrcamentosBI /></RotaPorPagina>} />
        <Route path="/planejamento" element={<RotaPorPagina pagina="planejamento"><DashboardPlanejamento /></RotaPorPagina>} />
        <Route path="/demandas" element={<RotaPorPagina pagina="demandas"><GestaoDemandasView /></RotaPorPagina>} />
        <Route path="/medicao" element={<RotaPorPagina pagina="medicao"><Medicao /></RotaPorPagina>} />
      </Route>

      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}

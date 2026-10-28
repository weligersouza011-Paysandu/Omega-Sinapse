import { useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RotaPorPerfil from './components/RotaPorPerfil.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import DashboardOrcamentos from './pages/DashboardOrcamentos.jsx';
import DashboardOrcamentosBI from './pages/DashboardOrcamentosBI.jsx';
import Obras from './pages/Obras.jsx';
import DetalheObra from './pages/DetalheObra.jsx';
import Planejamento6WLA from './pages/Planejamento6WLA.jsx';
import CurvaS from './pages/CurvaS.jsx';
import MapaObras from './pages/MapaObras.jsx';
import UsuariosPage from './pages/UsuariosPage.jsx';
import { MODULOS } from './config/modulos.js';
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
  const [recolhido, setRecolhido] = useState(false);
  const local = useLocation();

  const moduloAtual =
    MODULOS.find((modulo) => local.pathname.startsWith(modulo.rota)) || MODULOS[0];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar recolhido={recolhido} onToggle={() => setRecolhido((valor) => !valor)} />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Synapse
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-800">
              {moduloAtual.label}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <p className="hidden max-w-xs truncate text-xs text-slate-400 lg:block">
              {moduloAtual.descricao}
            </p>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${AMBIENTE.classe}`}
            >
              {AMBIENTE.texto}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
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
        <Route path="/" element={<Navigate to="/orcamentos" replace />} />
        <Route path="/orcamentos" element={<DashboardOrcamentos />} />
        <Route path="/obras" element={<Obras />} />
        <Route path="/obras/:id" element={<DetalheObra />} />
        <Route
          path="/usuarios"
          element={
            <RotaPorPerfil perfis={['ADMIN']}>
              <UsuariosPage />
            </RotaPorPerfil>
          }
        />
        <Route path="/orcamentos/dashboard" element={<DashboardOrcamentosBI />} />
        <Route path="/planejamento" element={<Planejamento6WLA />} />
        <Route path="/curva-s" element={<CurvaS />} />
        <Route path="/mapa" element={<MapaObras />} />
      </Route>

      <Route path="*" element={<Navigate to="/orcamentos" replace />} />
    </Routes>
  );
}

import { NavLink } from 'react-router-dom';
import { MODULOS } from '../config/modulos.js';
import { MODO_DEMO, BYPASS_LOGIN } from '../config/demo.js';
import { useAuth } from '../context/AuthContext.jsx';

/** Rótulo curto + cores do selo de ambiente exibido no rodapé. */
const AMBIENTE = MODO_DEMO
  ? {
      texto: 'Demonstração',
      classe: 'bg-amber-400/15 text-amber-300 ring-amber-300/30',
      ponto: 'bg-amber-400',
    }
  : BYPASS_LOGIN
    ? {
        texto: 'Acesso aberto',
        classe: 'bg-sky-400/15 text-sky-300 ring-sky-400/30',
        ponto: 'bg-sky-400',
      }
    : {
        texto: 'Produção',
        classe: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
        ponto: 'bg-emerald-400',
      };

/** Ícone SVG genérico (traço único) reaproveitado pelos itens de menu. */
function Icone({ caminho, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d={caminho}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICONE_SETA = 'M15 6l-6 6 6 6';
const ICONE_SAIR = 'M14 8V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2M9 12h11m0 0-3-3m3 3-3 3';

/** Extrai até duas iniciais do nome para o avatar. */
function iniciaisDe(nome) {
  return (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

/**
 * Sidebar lateral retrátil (colapsável).
 *
 * - Expandida (w-64): logo, rótulos dos módulos e rodapé com o usuário logado.
 * - Recolhida (w-20): apenas os ícones centralizados, com tooltip nativo (`title`).
 *
 * Os estados são controlados pelo layout (`recolhido` + `onToggle`), garantindo
 * que o painel de conteúdo à direita acompanhe a transição sem re-render de página.
 */
export default function Sidebar({ recolhido = false, onToggle }) {
  const { usuario, logout } = useAuth();

  // Módulos com `perfis` definidos (ex.: Gestão de Usuários) só são exibidos
  // para os perfis autorizados; os demais continuam visíveis para todos.
  const modulosVisiveis = MODULOS.filter(
    (modulo) => !modulo.perfis || modulo.perfis.includes(usuario?.perfil)
  );

  return (
    <aside
      className={[
        'flex h-screen shrink-0 flex-col overflow-hidden bg-slate-900 text-slate-200',
        'transition-all duration-300 ease-in-out',
        recolhido ? 'w-20' : 'w-64',
      ].join(' ')}
    >
      {/* ---------------------------------------------------------------- Logo */}
      <div
        className={[
          'flex h-16 shrink-0 items-center border-b border-white/10',
          recolhido ? 'justify-center px-0' : 'gap-3 px-4',
        ].join(' ')}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-omega-600 ring-1 ring-white/20">
          <span className="text-sm font-black tracking-tight text-white">OS</span>
        </div>

        {recolhido ? null : (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-omega-100/60">
              Omega Service
            </p>
            <p className="truncate text-base font-bold tracking-tight text-white">Synapse</p>
          </div>
        )}
      </div>

      {/* ------------------------------------------- Botão expandir / recolher */}
      <button
        type="button"
        onClick={onToggle}
        title={recolhido ? 'Expandir menu' : 'Recolher menu'}
        aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
        aria-expanded={!recolhido}
        className={[
          'flex h-10 shrink-0 items-center gap-2 border-b border-white/10 text-[11px] font-semibold uppercase tracking-wide',
          'text-slate-400 transition hover:bg-white/5 hover:text-white',
          'focus:outline-none focus-visible:bg-white/10',
          recolhido ? 'justify-center px-0' : 'justify-end px-4',
        ].join(' ')}
      >
        {recolhido ? null : <span className="truncate">Recolher</span>}
        <Icone
          caminho={ICONE_SETA}
          className={[
            'h-4 w-4 shrink-0 transition-transform duration-300',
            recolhido ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {/* ------------------------------------------------------------- Módulos */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {recolhido ? null : (
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Módulos
          </p>
        )}

        <ul className="space-y-1">
          {modulosVisiveis.map((modulo) => {
            const alinhamento = recolhido ? 'justify-center px-0' : 'gap-3 px-3';

            // Módulos ainda não implementados: visíveis, porém desabilitados.
            if (!modulo.ativo) {
              return (
                <li key={modulo.id}>
                  <span
                    aria-disabled="true"
                    title={`${modulo.label} — em breve`}
                    className={[
                      'relative flex h-10 cursor-not-allowed items-center rounded-md text-sm font-semibold text-slate-500',
                      alinhamento,
                    ].join(' ')}
                  >
                    <Icone caminho={modulo.icone} className="h-5 w-5 shrink-0" />

                    {recolhido ? (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400/80" />
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">{modulo.label}</span>
                        <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300 ring-1 ring-amber-300/30">
                          breve
                        </span>
                      </>
                    )}
                  </span>
                </li>
              );
            }

            return (
              <li key={modulo.id}>
                <NavLink
                  to={modulo.rota}
                  title={recolhido ? modulo.label : modulo.descricao}
                  className={({ isActive }) =>
                    [
                      'flex h-10 items-center rounded-md text-sm font-semibold transition',
                      alinhamento,
                      isActive
                        ? 'bg-omega-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white',
                    ].join(' ')
                  }
                >
                  <Icone caminho={modulo.icone} className="h-5 w-5 shrink-0" />
                  {recolhido ? null : (
                    <span className="min-w-0 flex-1 truncate">{modulo.label}</span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ------------------------------------------------------------- Rodapé */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div
          className={[
            'flex items-center rounded-md py-1',
            recolhido ? 'justify-center' : 'gap-3',
          ].join(' ')}
        >
          <div
            title={recolhido ? `${usuario?.nome || 'Usuário'} · ${usuario?.perfil || '—'}` : undefined}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-omega-600 text-xs font-bold text-white ring-1 ring-white/20"
          >
            {iniciaisDe(usuario?.nome) || '?'}
          </div>

          {recolhido ? null : (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-white">
                {usuario?.nome || 'Usuário'}
              </p>
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {usuario?.perfil || '—'}
              </p>
            </div>
          )}
        </div>

        <div
          className={[
            'mt-3 flex items-center gap-2 rounded-md px-2 py-1.5 ring-1',
            AMBIENTE.classe,
            recolhido ? 'justify-center' : '',
          ].join(' ')}
          title={`Ambiente: ${AMBIENTE.texto}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${AMBIENTE.ponto}`} />
          {recolhido ? null : (
            <span className="truncate text-[10px] font-bold uppercase tracking-wider">
              {AMBIENTE.texto}
            </span>
          )}
        </div>

        {MODO_DEMO || BYPASS_LOGIN ? null : (
          <button
            type="button"
            onClick={logout}
            title="Sair"
            className={[
              'mt-2 flex h-9 w-full items-center gap-2 rounded-md border border-white/15 text-xs font-semibold',
              'text-slate-200 transition hover:bg-white/10 hover:text-white',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              recolhido ? 'justify-center px-0' : 'justify-center px-3',
            ].join(' ')}
          >
            <Icone caminho={ICONE_SAIR} className="h-4 w-4 shrink-0" />
            {recolhido ? null : <span className="truncate">Sair</span>}
          </button>
        )}
      </div>
    </aside>
  );
}

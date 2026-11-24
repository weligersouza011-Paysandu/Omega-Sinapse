import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import BotaoTema from '../components/BotaoTema.jsx';
import CapaLoginAnimada from '../components/CapaLoginAnimada.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/** Frentes de trabalho exibidas no painel da marca. */
const FRENTES = ['Orçamentos', 'Obras', 'Medição', 'Demandas'];

/** Tela de autenticação: painel da marca com a capa animada das obras (telas largas) e formulário. */
export default function Login() {
  const { login, autenticado } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (autenticado) {
    return <Navigate to="/" replace />;
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    if (!email.trim() || !senha.trim()) {
      setErro('Informe o e-mail e a senha.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErro('Informe um e-mail válido.');
      return;
    }

    setEnviando(true);
    try {
      await login(email.trim(), senha);
      const destino = local.state?.de || '/';
      navegar(destino, { replace: true });
    } catch (err) {
      setErro(err.message || 'Não foi possível autenticar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.15fr_1fr]">
      {/* ------------------------------------------- Painel da marca (telas largas) */}
      <aside className="tema-claro relative hidden overflow-hidden bg-omega-900 lg:block">
        <CapaLoginAnimada />
        {/* Véu vinho: dá leitura ao texto e amarra as fotos à identidade da marca. */}
        <div className="absolute inset-0 bg-gradient-to-t from-omega-900/95 via-omega-800/60 to-omega-700/35" />

        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <img src="/brand/logo-branco.png" alt="Omega Service" className="h-16 w-auto self-start xl:h-20" />

          <div className="max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">Omega Service</p>
            <h1 className="mt-2 text-5xl font-black tracking-tight xl:text-6xl">Sinapse</h1>
            <p className="mt-4 text-lg leading-relaxed text-white/85">
              Orçamentos, obras e demandas da equipe em um só lugar, com prazo claro e rastreabilidade ISO 9001.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {FRENTES.map((frente) => (
                <li
                  key={frente}
                  className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur"
                >
                  {frente}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/60">Segurança, qualidade e entrega em cada obra.</p>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- Formulário */}
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <BotaoTema className="absolute right-4 top-4" />

        <div className="w-full max-w-md">
          {/* Faixa da marca nas telas estreitas, onde o painel de fotos não aparece. */}
          <div className="tema-claro mb-6 flex items-center justify-between rounded-xl bg-gradient-to-br from-omega-900 via-omega-800 to-omega-600 px-5 py-4 text-white shadow-sm lg:hidden">
            <img src="/brand/logo-branco.png" alt="Omega Service" className="h-12 w-auto" />
            <p className="text-2xl font-black tracking-tight">Sinapse</p>
          </div>

          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-800">Acesso ao Sinapse</h2>
            <p className="mt-1 text-sm text-slate-500">
              Entre com suas credenciais corporativas para gerenciar orçamentos, obras e demandas.
            </p>

            <form className="mt-6 space-y-4" onSubmit={aoEnviar} noValidate>
              <div>
                <label className="rotulo" htmlFor="email">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="campo"
                  placeholder="nome@omegaservice.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={enviando}
                />
              </div>

              <div>
                <label className="rotulo" htmlFor="senha">
                  Senha
                </label>
                <input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  className="campo"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={enviando}
                />
              </div>

              {erro ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  {erro}
                </div>
              ) : null}

              <button type="submit" className="btn-primario w-full" disabled={enviando}>
                {enviando ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Sinapse · Gestão de Orçamentos e Obras · ISO 9001
          </p>
        </div>
      </main>
    </div>
  );
}

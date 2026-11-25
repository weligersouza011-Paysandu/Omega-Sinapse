import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import BotaoTema from '../components/BotaoTema.jsx';
import CapaLoginAnimada from '../components/CapaLoginAnimada.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/** Frentes de trabalho exibidas no painel da marca. */
const FRENTES = ['Orçamentos', 'Obras', 'Medição', 'Demandas'];

/** Atraso (em ms) da animação de entrada de um elemento da cascata (classes login-surgir/login-cartao). */
const atraso = (ms) => ({ '--atraso': `${ms}ms` });

/** Tela de autenticação: painel da marca com o vídeo das obras (telas largas) e formulário. */
export default function Login() {
  const { login, autenticado } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  /** Conta as tentativas: remonta o alerta para ele balançar de novo a cada erro. */
  const [tentativa, setTentativa] = useState(0);

  if (autenticado) {
    return <Navigate to="/" replace />;
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');
    setTentativa((n) => n + 1);

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
        {/* Véu vinho: dá leitura ao texto e amarra o vídeo à identidade da marca. */}
        <div className="absolute inset-0 bg-gradient-to-t from-omega-900/95 via-omega-800/55 to-omega-700/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-omega-900/40 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <img
            src="/brand/logo-branco.png"
            alt="Omega Service"
            className="login-surgir h-16 w-auto self-start xl:h-20"
            style={atraso(200)}
          />

          <div className="max-w-lg">
            <p
              className="login-surgir text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70"
              style={atraso(450)}
            >
              Omega Service
            </p>
            <h1 className="login-surgir mt-2 text-5xl font-black tracking-tight xl:text-6xl" style={atraso(550)}>
              Sinapse
            </h1>
            <p className="login-surgir mt-4 text-lg leading-relaxed text-white/85" style={atraso(700)}>
              Orçamentos, obras e demandas da equipe em um só lugar, com prazo claro e rastreabilidade ISO 9001.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {FRENTES.map((frente, i) => (
                <li key={frente} className="login-surgir" style={atraso(850 + i * 90)}>
                  <span className="block rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/20">
                    {frente}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="login-surgir text-xs text-white/60" style={atraso(1250)}>
            Segurança, qualidade e entrega em cada obra.
          </p>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- Formulário */}
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
        {/* Manchas de luz em movimento lento atrás do cartão. */}
        <div aria-hidden="true" className="login-aurora -left-24 -top-24 h-96 w-96 bg-omega-500/15" />
        <div
          aria-hidden="true"
          className="login-aurora -bottom-32 -right-20 h-[28rem] w-[28rem] bg-omega-400/10"
          style={{ animationDelay: '-11s', animationDuration: '28s' }}
        />

        <div className="login-surgir absolute right-4 top-4 z-10" style={atraso(900)}>
          <BotaoTema />
        </div>

        <div className="relative w-full max-w-md">
          {/* Faixa da marca nas telas estreitas, onde o painel do vídeo não aparece. */}
          <div className="login-surgir tema-claro mb-6 flex items-center justify-between rounded-xl bg-gradient-to-br from-omega-900 via-omega-800 to-omega-600 px-5 py-4 text-white shadow-sm lg:hidden">
            <img src="/brand/logo-branco.png" alt="Omega Service" className="h-12 w-auto" />
            <p className="text-2xl font-black tracking-tight">Sinapse</p>
          </div>

          <div className="login-cartao card p-6 shadow-xl shadow-slate-900/5 sm:p-8" style={atraso(250)}>
            <h2 className="login-surgir text-xl font-bold text-slate-800" style={atraso(500)}>
              Acesso ao Sinapse
            </h2>
            <p className="login-surgir mt-1 text-sm text-slate-500" style={atraso(580)}>
              Entre com suas credenciais corporativas para gerenciar orçamentos, obras e demandas.
            </p>

            <form className="mt-6 space-y-4" onSubmit={aoEnviar} noValidate>
              <div className="login-surgir group" style={atraso(680)}>
                <label className="rotulo transition-colors group-focus-within:text-omega-600" htmlFor="email">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="campo duration-300 focus:shadow-md"
                  placeholder="nome@omegaservice.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={enviando}
                />
              </div>

              <div className="login-surgir group" style={atraso(760)}>
                <label className="rotulo transition-colors group-focus-within:text-omega-600" htmlFor="senha">
                  Senha
                </label>
                <input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  className="campo duration-300 focus:shadow-md"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={enviando}
                />
              </div>

              {erro ? (
                <div
                  key={tentativa}
                  role="alert"
                  className="login-alerta rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  {erro}
                </div>
              ) : null}

              <div className="login-surgir" style={atraso(860)}>
                <button
                  type="submit"
                  className="btn-primario w-full py-2.5 duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-omega-600/25 active:translate-y-0 active:scale-[0.99]"
                  disabled={enviando}
                >
                  {enviando ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="login-girar h-4 w-4 rounded-full border-2 border-white/40 border-t-white"
                      />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </button>
              </div>
            </form>
          </div>

          <p className="login-surgir mt-5 text-center text-xs text-slate-400" style={atraso(1000)}>
            Sinapse · Gestão de Orçamentos e Obras · ISO 9001
          </p>
        </div>
      </main>
    </div>
  );
}

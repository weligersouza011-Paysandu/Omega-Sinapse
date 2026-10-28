import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/** Tela de autenticação. */
export default function Login() {
  const { login, autenticado } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();

  const [identificador, setIdentificador] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (autenticado) {
    return <Navigate to="/" replace />;
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');

    if (!identificador.trim() || !senha.trim()) {
      setErro('Informe a matrícula (ou e-mail) e a senha.');
      return;
    }

    setEnviando(true);
    try {
      await login(identificador.trim(), senha);
      const destino = local.state?.de || '/';
      navegar(destino, { replace: true });
    } catch (err) {
      setErro(err.message || 'Não foi possível autenticar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-omega-900 via-omega-800 to-omega-700 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
            <span className="text-base font-black">OS</span>
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
              Omega Service
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Synapse</h1>
          </div>
        </div>

        <div className="card p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800">Acesso ao sistema</h2>
          <p className="mt-1 text-sm text-slate-500">
            Entre com suas credenciais corporativas para gerenciar orçamentos e obras.
          </p>

          <form className="mt-6 space-y-4" onSubmit={aoEnviar} noValidate>
            <div>
              <label className="rotulo" htmlFor="identificador">
                Matrícula ou E-mail
              </label>
              <input
                id="identificador"
                type="text"
                autoComplete="username"
                className="campo"
                placeholder="23574 ou nome@omega.com"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
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

        <p className="mt-4 text-center text-xs text-white/50">
          Synapse · Gestão de Orçamentos e Obras · ISO 9001
        </p>
      </div>
    </div>
  );
}

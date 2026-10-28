import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { obterToken, salvarToken } from '../services/api.js';
import { fazerLogin } from '../hooks/useOrcamentos.js';
import { BYPASS_LOGIN, USUARIO_BYPASS } from '../config/demo.js';

const USUARIO_KEY = 'synapse.usuario';

const AuthContext = createContext(null);

function lerUsuarioArmazenado() {
  try {
    const bruto = localStorage.getItem(USUARIO_KEY);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Com BYPASS_LOGIN ativo a sessão começa já "logada" com o usuário fixo.
  const [usuario, setUsuario] = useState(() =>
    BYPASS_LOGIN ? USUARIO_BYPASS : lerUsuarioArmazenado()
  );
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // No acesso temporário o usuário é fixo e não deve ser persistido.
    if (BYPASS_LOGIN) return;

    if (usuario) {
      localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
    } else {
      localStorage.removeItem(USUARIO_KEY);
    }
  }, [usuario]);

  /** Autentica na API (matrícula ou e-mail) e guarda token + usuário. */
  const login = useCallback(async (identificador, senha) => {
    if (BYPASS_LOGIN) {
      setUsuario(USUARIO_BYPASS);
      return USUARIO_BYPASS;
    }

    setCarregando(true);
    try {
      const data = await fazerLogin({ identificador, senha });
      salvarToken(data.token);
      setUsuario(data.usuario);
      return data.usuario;
    } finally {
      setCarregando(false);
    }
  }, []);

  const logout = useCallback(() => {
    if (BYPASS_LOGIN) return;

    salvarToken(null);
    setUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      autenticado: BYPASS_LOGIN ? true : Boolean(usuario && obterToken()),
      carregando,
      login,
      logout,
    }),
    [usuario, carregando, login, logout]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  }
  return contexto;
}

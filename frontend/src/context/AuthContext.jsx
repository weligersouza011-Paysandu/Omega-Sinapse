import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { obterToken, salvarToken } from '../services/api.js';
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

    try {
      if (usuario) {
        localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
      } else {
        localStorage.removeItem(USUARIO_KEY);
      }
    } catch {
      // Armazenamento indisponível: a sessão segue apenas em memória.
    }
  }, [usuario]);

  // Ao abrir o sistema, atualiza perfil e páginas liberadas a partir da API: se o administrador
  // mudou as páginas de um Cliente, o menu acompanha sem precisar sair e entrar de novo.
  useEffect(() => {
    if (BYPASS_LOGIN || !obterToken()) return;
    let ativo = true;
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (ativo && data?.usuario) setUsuario((atual) => (atual ? { ...atual, ...data.usuario } : atual));
      })
      .catch(() => {
        // Token inválido/expirado: o interceptador da API já trata o 401.
      });
    return () => {
      ativo = false;
    };
  }, []);

  /** Autentica na API (e-mail) e guarda token + usuário. */
  const login = useCallback(async (email, senha) => {
    if (BYPASS_LOGIN) {
      setUsuario(USUARIO_BYPASS);
      return USUARIO_BYPASS;
    }

    setCarregando(true);
    try {
      const data = await fazerLogin({ email, senha });
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

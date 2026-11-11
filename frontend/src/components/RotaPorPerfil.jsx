import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { rotaInicial } from '../config/modulos.js';

/**
 * Proteção de rota por perfil (RBAC no front-end).
 *
 * Complementa o `ProtectedRoute` (autenticação): se o usuário logado não
 * possuir um dos perfis autorizados, é redirecionado ao dashboard principal.
 * A restrição real continua sendo aplicada pelo back-end em cada endpoint.
 */
export default function RotaPorPerfil({ perfis = [], children }) {
  const { usuario } = useAuth();

  if (!perfis.includes(usuario?.perfil)) {
    return <Navigate to={rotaInicial(usuario)} replace />;
  }

  return children;
}

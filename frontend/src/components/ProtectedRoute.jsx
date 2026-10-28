import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/** Bloqueia rotas privadas: sem usuário autenticado redireciona para /login. */
export default function ProtectedRoute({ children }) {
  const { autenticado } = useAuth();
  const local = useLocation();

  if (!autenticado) {
    return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  }

  return children;
}

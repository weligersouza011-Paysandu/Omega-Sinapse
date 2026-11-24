import { cloneElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useValoresOcultos } from '../context/ValoresOcultosContext.jsx';
import { MODULOS, moduloLiberado, rotaInicial } from '../config/modulos.js';

/**
 * Proteção de rota por página (front-end) para o perfil Cliente: abre a página só se o módulo
 * estiver liberado no cadastro do usuário; senão, leva à primeira página liberada.
 * Os demais perfis passam direto. A restrição real é aplicada no back-end (acessoCliente).
 */
export default function RotaPorPagina({ pagina, children }) {
  const { usuario } = useAuth();
  useValoresOcultos(); // re-renderiza a página quando o olho muda
  const modulo = MODULOS.find((item) => item.id === pagina);

  if ((usuario?.perfil === 'CLIENTE' || usuario?.perfil === 'ENCARREGADO') && !moduloLiberado(usuario, modulo)) {
    return <Navigate to={rotaInicial(usuario)} replace />;
  }
  // Elemento novo a cada render: a página (e tudo dentro dela) reformata os valores sem perder o estado.
  return cloneElement(children);
}

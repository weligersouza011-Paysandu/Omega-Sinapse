import axios from 'axios';
import { BYPASS_LOGIN } from '../config/demo.js';

const TOKEN_KEY = 'synapse.token';

export function obterToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function salvarToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Instância única do Axios.
 * baseURL padrão: "/api" (o proxy do Vite encaminha para http://localhost:3000).
 * Em produção defina VITE_API_URL com a URL completa do back-end.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 45000,
});

// Injeta o Bearer token em toda requisição.
api.interceptors.request.use((config) => {
  const token = obterToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Mensagens padrão por status HTTP, usadas quando o back-end não envia
 * um corpo `{ erro }` (ex.: falhas de proxy/rede antes da API responder).
 */
const MENSAGENS_HTTP = {
  401: 'Sessão expirada. Faça login novamente.',
  403: 'Acesso negado: seu perfil não tem permissão para esta operação.',
  500: 'Erro interno no servidor. Tente novamente em instantes.',
  502: 'Serviço temporariamente indisponível.',
  503: 'Serviço temporariamente indisponível.',
  504: 'O servidor demorou demais para responder. Tente novamente.',
};

/**
 * Normaliza os erros da API em um Error com `message` legível e `status`.
 * Em 401 (token expirado/inválido) limpa a sessão e volta para o login.
 */
api.interceptors.response.use(
  (resposta) => resposta,
  (error) => {
    const status = error.response?.status;
    const dados = error.response?.data;
    const mensagem =
      dados?.erro ||
      MENSAGENS_HTTP[status] ||
      (error.code === 'ERR_NETWORK'
        ? 'Não foi possível conectar ao servidor. Verifique se o back-end está rodando.'
        : error.message) ||
      'Erro inesperado.';

    if (status === 401 && !BYPASS_LOGIN) {
      salvarToken(null);
      localStorage.removeItem('synapse.usuario');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    const erroNormalizado = new Error(mensagem);
    erroNormalizado.status = status;
    erroNormalizado.detalhes = dados?.detalhes;
    return Promise.reject(erroNormalizado);
  }
);

export default api;

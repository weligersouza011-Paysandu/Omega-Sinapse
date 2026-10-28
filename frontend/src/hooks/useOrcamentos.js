import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';
import demoApi from '../services/demoApi.js';
import { MODO_DEMO, USUARIO_BYPASS } from '../config/demo.js';

/* -------------------------------------------------------------------------- */
/* Camada de dados (encapsula todas as chamadas HTTP do módulo de orçamentos) */
/* Em MODO_DEMO as funções abaixo respondem com dados locais, sem tocar a API. */
/* -------------------------------------------------------------------------- */

/** Lista orçamentos com paginação e filtros. */
export async function listarOrcamentos(filtros = {}) {
  if (MODO_DEMO) {
    return demoApi.listarOrcamentos({
      busca: filtros.busca,
      status: filtros.status,
      escopo: filtros.escopo,
      page: filtros.page,
      limit: filtros.limit,
    });
  }

  const { data } = await api.get('/orcamentos', {
    params: {
      page: filtros.page,
      limit: filtros.limit,
      busca: filtros.busca || undefined,
      status: filtros.status || undefined,
      escopo: filtros.escopo || undefined,
      pep: filtros.pep || undefined,
    },
  });
  return data;
}

/** Busca um orçamento por ID (com histórico de revisões). */
export async function obterOrcamento(id) {
  if (MODO_DEMO) {
    return demoApi.obterOrcamento(id);
  }

  const { data } = await api.get(`/orcamentos/${id}`);
  return data;
}

/** Cria um orçamento. Recebe FormData (com as fotos) ou um objeto JSON. */
export async function criarOrcamento(formData) {
  if (MODO_DEMO) {
    return demoApi.criarOrcamento(formData);
  }

  const { data } = await api.post('/orcamentos', formData);
  return data;
}

/** Atualiza os dados permitidos de um orçamento. */
export async function atualizarOrcamento(id, dados) {
  if (MODO_DEMO) {
    return demoApi.atualizarOrcamento(id, dados);
  }

  const { data } = await api.put(`/orcamentos/${id}`, dados);
  return data;
}

/** Registra uma nova revisão de valor. */
export async function adicionarRevisao(id, dadosRevisao) {
  if (MODO_DEMO) {
    return demoApi.adicionarRevisao(id, {
      valor: dadosRevisao.valor,
      observacao: dadosRevisao.observacao,
    });
  }

  const { data } = await api.post(`/orcamentos/${id}/revisoes`, {
    valor: dadosRevisao.valor,
    observacao: dadosRevisao.observacao,
  });
  return data;
}

/** Busca os PEPs e fiscais já usados no histórico (dropdowns/autocomplete). */
export async function obterOpcoes() {
  const { data } = await api.get('/orcamentos/opcoes');
  return data;
}

/** Indicadores agregados do Dashboard BI (período + busca). */
export async function obterEstatisticas(filtros = {}) {
  const { data } = await api.get('/orcamentos/estatisticas', {
    params: {
      de: filtros.de || undefined,
      ate: filtros.ate || undefined,
      busca: filtros.busca || undefined,
    },
  });
  return data;
}

/** Tamanho máximo de página aceito pela API (validado no service do back-end). */
const LIMITE_MAXIMO = 100;

/**
 * Lista TODOS os orçamentos que casam com o filtro (sem paginação), para a
 * visão Kanban. A API limita cada página a 100 itens; as páginas restantes são
 * buscadas em paralelo, garantindo que nenhum registro fique de fora.
 */
export async function listarQuadro(filtros = {}) {
  const primeira = await listarOrcamentos({ ...filtros, page: 1, limit: LIMITE_MAXIMO });
  const itens = [...(primeira.data || [])];
  const totalPaginas = primeira.totalPages || 0;

  if (totalPaginas > 1) {
    const restantes = await Promise.all(
      Array.from({ length: totalPaginas - 1 }, (_, indice) =>
        listarOrcamentos({ ...filtros, page: indice + 2, limit: LIMITE_MAXIMO })
      )
    );
    restantes.forEach((pagina) => itens.push(...(pagina.data || [])));
  }

  return itens;
}

/** Autentica e devolve { token, usuario }. */
export async function fazerLogin(credenciais) {
  if (MODO_DEMO) {
    return { token: 'token-demonstracao', usuario: USUARIO_BYPASS };
  }

  const { data } = await api.post('/auth/login', {
    email: credenciais.email ?? credenciais.identificador ?? credenciais.matricula,
    senha: credenciais.senha,
  });
  return data;
}

/* -------------------------------------------------------------------------- */
/* Hook de opções do formulário                                               */
/* -------------------------------------------------------------------------- */

/**
 * Carrega os PEPs e fiscais do histórico enquanto `ativo` for verdadeiro
 * (o modal passa `aberto`, refazendo a busca a cada abertura).
 */
export function useOpcoesOrcamento(ativo = true) {
  const [opcoes, setOpcoes] = useState({ peps: [], fiscais: [] });
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!ativo) return undefined;

    let cancelado = false;
    setCarregando(true);

    obterOpcoes()
      .then((dados) => {
        if (cancelado) return;
        setOpcoes({ peps: dados?.peps || [], fiscais: dados?.fiscais || [] });
      })
      .catch(() => {
        if (!cancelado) setOpcoes({ peps: [], fiscais: [] });
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [ativo]);

  return { peps: opcoes.peps, fiscais: opcoes.fiscais, carregando };
}

/* -------------------------------------------------------------------------- */
/* Hook de listagem                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Hook de listagem de orçamentos: cuida de loading, erro, paginação e refetch.
 * @param {{busca?:string, status?:string, escopo?:string, pagina?:number, limit?:number, ativo?:boolean}} parametros
 *        `escopo` recorta a listagem (padrão do back-end: `comercial`).
 *        `ativo: false` suspende as requisições (a visão Kanban usa outro hook).
 */
export function useOrcamentos({
  busca = '',
  status = '',
  escopo = '',
  pagina = 1,
  limit = 12,
  ativo = true,
} = {}) {
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [carregando, setCarregando] = useState(ativo);
  const [erro, setErro] = useState('');

  // Ignora respostas de requisições antigas (evita corrida com o debounce).
  const requisicaoAtual = useRef(0);

  const recarregar = useCallback(async () => {
    if (!ativo) return;

    const idRequisicao = requisicaoAtual.current + 1;
    requisicaoAtual.current = idRequisicao;

    setCarregando(true);
    setErro('');

    try {
      const dados = await listarOrcamentos({ busca, status, escopo, page: pagina, limit });
      if (requisicaoAtual.current !== idRequisicao) return;

      setItens(dados.data || []);
      setTotal(dados.total || 0);
      setTotalPaginas(dados.totalPages || 0);
    } catch (err) {
      if (requisicaoAtual.current !== idRequisicao) return;

      setErro(err.message || 'Não foi possível carregar os orçamentos.');
      setItens([]);
      setTotal(0);
      setTotalPaginas(0);
    } finally {
      if (requisicaoAtual.current === idRequisicao) {
        setCarregando(false);
      }
    }
  }, [busca, status, escopo, pagina, limit, ativo]);

  useEffect(() => {
    if (!ativo) {
      setCarregando(false);
      return;
    }
    recarregar();
  }, [recarregar, ativo]);

  /**
   * Reflete no estado local (sem refetch) um orçamento recém-editado — usado
   * pela edição rápida, evitando o "piscar" de uma nova busca.
   */
  const atualizarItemLocal = useCallback((orcamento) => {
    if (!orcamento?.id) return;
    setItens((atual) =>
      atual.map((item) => (item.id === orcamento.id ? { ...item, ...orcamento } : item))
    );
  }, []);

  return { itens, total, totalPaginas, carregando, erro, recarregar, atualizarItemLocal };
}

/* -------------------------------------------------------------------------- */
/* Hook do quadro (Kanban)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Carrega TODOS os orçamentos do filtro para o Kanban (sem paginação).
 * Só faz requisições quando `ativo` é verdadeiro (visão Kanban selecionada).
 * @param {{busca?:string, status?:string, escopo?:string, ativo?:boolean}} parametros
 */
export function useQuadroOrcamentos({ busca = '', status = '', escopo = '', ativo = true } = {}) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(ativo);
  const [erro, setErro] = useState('');

  const requisicaoAtual = useRef(0);

  const recarregar = useCallback(async () => {
    if (!ativo) return;

    const idRequisicao = requisicaoAtual.current + 1;
    requisicaoAtual.current = idRequisicao;

    setCarregando(true);
    setErro('');

    try {
      const dados = await listarQuadro({ busca, status, escopo });
      if (requisicaoAtual.current !== idRequisicao) return;
      setItens(dados);
    } catch (err) {
      if (requisicaoAtual.current !== idRequisicao) return;
      setErro(err.message || 'Não foi possível carregar o quadro.');
      setItens([]);
    } finally {
      if (requisicaoAtual.current === idRequisicao) {
        setCarregando(false);
      }
    }
  }, [busca, status, escopo, ativo]);

  useEffect(() => {
    if (!ativo) {
      setCarregando(false);
      return;
    }
    recarregar();
  }, [recarregar, ativo]);

  /** Reflete no quadro (sem refetch) um orçamento recém-editado. */
  const atualizarItemLocal = useCallback((orcamento) => {
    if (!orcamento?.id) return;
    setItens((atual) =>
      atual.map((item) => (item.id === orcamento.id ? { ...item, ...orcamento } : item))
    );
  }, []);

  return { itens, carregando, erro, recarregar, atualizarItemLocal };
}

/* -------------------------------------------------------------------------- */
/* Hook do Dashboard BI                                                       */
/* -------------------------------------------------------------------------- */

/** Carrega os indicadores agregados do Dashboard BI (período + busca). */
export function useEstatisticas({ de = '', ate = '', busca = '' } = {}) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const requisicaoAtual = useRef(0);

  const recarregar = useCallback(async () => {
    const idRequisicao = requisicaoAtual.current + 1;
    requisicaoAtual.current = idRequisicao;

    setCarregando(true);
    setErro('');

    try {
      const resultado = await obterEstatisticas({ de, ate, busca });
      if (requisicaoAtual.current !== idRequisicao) return;
      setDados(resultado);
    } catch (err) {
      if (requisicaoAtual.current !== idRequisicao) return;
      setErro(err.message || 'Não foi possível carregar as estatísticas.');
      setDados(null);
    } finally {
      if (requisicaoAtual.current === idRequisicao) {
        setCarregando(false);
      }
    }
  }, [de, ate, busca]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { dados, carregando, erro, recarregar };
}

export default useOrcamentos;

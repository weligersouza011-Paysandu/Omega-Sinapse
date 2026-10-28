import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';

/* -------------------------------------------------------------------------- */
/* Camada de dados (chamadas HTTP do módulo de Obras)                          */
/* -------------------------------------------------------------------------- */

/**
 * Lista as obras (projetos em execução) com paginação e filtros.
 * @param {{busca?:string, status?:string, pendencia?:string, pep?:string,
 *   page?:number, limit?:number}} filtros
 */
export async function listarObras(filtros = {}) {
  const { data } = await api.get('/obras', {
    params: {
      page: filtros.page,
      limit: filtros.limit,
      busca: filtros.busca || undefined,
      status: filtros.status || undefined,
      pendencia: filtros.pendencia || undefined,
      pep: filtros.pep || undefined,
    },
  });
  return data;
}

/** Busca uma obra por ID (com projeto, fiscais, revisões e detalhamento). */
export async function obterObra(id) {
  const { data } = await api.get(`/obras/${id}`);
  return data;
}

/* -------------------------------------------------------------------------- */
/* Detalhamento da obra (localizações, Curva S, RDO, tarefas e mídias)        */
/* -------------------------------------------------------------------------- */

export async function criarLocalizacaoObra(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/localizacoes`, dados);
  return data;
}

export async function atualizarLocalizacaoObra(obraId, localizacaoId, dados) {
  const { data } = await api.put(`/obras/${obraId}/localizacoes/${localizacaoId}`, dados);
  return data;
}

export async function removerLocalizacaoObra(obraId, localizacaoId) {
  const { data } = await api.delete(`/obras/${obraId}/localizacoes/${localizacaoId}`);
  return data;
}

export async function criarAvancoFisico(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/avanco-fisico`, dados);
  return data;
}

export async function atualizarAvancoFisico(obraId, avancoId, dados) {
  const { data } = await api.put(`/obras/${obraId}/avanco-fisico/${avancoId}`, dados);
  return data;
}

export async function removerAvancoFisico(obraId, avancoId) {
  const { data } = await api.delete(`/obras/${obraId}/avanco-fisico/${avancoId}`);
  return data;
}

export async function criarRelatorioObra(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/relatorios`, dados);
  return data;
}

export async function atualizarRelatorioObra(obraId, relatorioId, dados) {
  const { data } = await api.put(`/obras/${obraId}/relatorios/${relatorioId}`, dados);
  return data;
}

export async function removerRelatorioObra(obraId, relatorioId) {
  const { data } = await api.delete(`/obras/${obraId}/relatorios/${relatorioId}`);
  return data;
}

export async function criarAtividadeObra(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/atividades`, dados);
  return data;
}

export async function atualizarAtividadeObra(obraId, atividadeId, dados) {
  const { data } = await api.put(`/obras/${obraId}/atividades/${atividadeId}`, dados);
  return data;
}

export async function removerAtividadeObra(obraId, atividadeId) {
  const { data } = await api.delete(`/obras/${obraId}/atividades/${atividadeId}`);
  return data;
}

export async function criarOcorrenciaObra(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/ocorrencias`, dados);
  return data;
}

export async function removerOcorrenciaObra(obraId, ocorrenciaId) {
  const { data } = await api.delete(`/obras/${obraId}/ocorrencias/${ocorrenciaId}`);
  return data;
}

export async function criarComentarioObra(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/comentarios`, dados);
  return data;
}

export async function removerComentarioObra(obraId, comentarioId) {
  const { data } = await api.delete(`/obras/${obraId}/comentarios/${comentarioId}`);
  return data;
}

export async function criarMidiaObra(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/midias`, dados);
  return data;
}

export async function removerMidiaObra(obraId, midiaId) {
  const { data } = await api.delete(`/obras/${obraId}/midias/${midiaId}`);
  return data;
}

/**
 * Atualiza a obra. Aceita `status` (ciclo operacional), `planejador_id`,
 * `ata_partida_url` e `observacoes`. O back-end aplica o RBAC por campo e a
 * régua ISO 9001 (HTTP 422 quando a documentação de partida está pendente).
 */
export async function atualizarObra(id, dados) {
  const { data } = await api.put(`/obras/${id}`, dados);
  return data;
}

/** Registra a emissão da OSI (número + responsável autenticado). */
export async function registrarOsi(id, numero) {
  const { data } = await api.post(`/obras/${id}/osi`, { osi_numero: numero });
  return data;
}

/** Lista os técnicos planejadores ativos (para atribuição em uma obra). */
export async function listarPlanejadores() {
  const { data } = await api.get('/obras/planejadores');
  return data?.data || [];
}

/**
 * Envia o documento comprobatório (imagem ou PDF) e devolve a URL pública.
 * Usado no anexo da Ata de Reunião de Partida.
 */
export async function enviarDocumento(arquivo) {
  const formulario = new FormData();
  formulario.append('documento', arquivo);

  const { data } = await api.post('/uploads/documento', formulario, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * Envia até 3 imagens (campo "fotos") e devolve as URLs já otimizadas.
 * Usado no cadastro de fotos do detalhamento da obra.
 */
export async function enviarFotosObra(arquivos = []) {
  const formulario = new FormData();
  arquivos.forEach((arquivo) => formulario.append('fotos', arquivo));

  const { data } = await api.post('/uploads/fotos', formulario, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Tamanho máximo de página aceito pela API (validado no service do back-end). */
const LIMITE_MAXIMO = 100;

/**
 * Lista TODAS as obras do filtro (sem paginação) para a visão Kanban.
 * A API limita cada página a 100 itens; as páginas restantes são buscadas em
 * paralelo, garantindo que nenhum registro fique de fora.
 */
export async function listarQuadroObras(filtros = {}) {
  const primeira = await listarObras({ ...filtros, page: 1, limit: LIMITE_MAXIMO });
  const itens = [...(primeira.data || [])];
  const totalPaginas = primeira.totalPages || 0;

  if (totalPaginas > 1) {
    const restantes = await Promise.all(
      Array.from({ length: totalPaginas - 1 }, (_, indice) =>
        listarObras({ ...filtros, page: indice + 2, limit: LIMITE_MAXIMO })
      )
    );
    restantes.forEach((pagina) => itens.push(...(pagina.data || [])));
  }

  return itens;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hook de listagem de obras: cuida de loading, erro, paginação e refetch.
 * @param {{busca?:string, status?:string, pendencia?:string, pagina?:number,
 *   limit?:number, ativo?:boolean}} parametros
 */
export function useObras({
  busca = '',
  status = '',
  pendencia = '',
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
      const dados = await listarObras({ busca, status, pendencia, page: pagina, limit });
      if (requisicaoAtual.current !== idRequisicao) return;

      setItens(dados.data || []);
      setTotal(dados.total || 0);
      setTotalPaginas(dados.totalPages || 0);
    } catch (err) {
      if (requisicaoAtual.current !== idRequisicao) return;

      setErro(err.message || 'Não foi possível carregar as obras.');
      setItens([]);
      setTotal(0);
      setTotalPaginas(0);
    } finally {
      if (requisicaoAtual.current === idRequisicao) {
        setCarregando(false);
      }
    }
  }, [busca, status, pendencia, pagina, limit, ativo]);

  useEffect(() => {
    if (!ativo) {
      setCarregando(false);
      return;
    }
    recarregar();
  }, [recarregar, ativo]);

  /** Reflete no estado local (sem refetch) uma obra recém-atualizada. */
  const atualizarItemLocal = useCallback((obra) => {
    if (!obra?.id) return;
    setItens((atual) => atual.map((item) => (item.id === obra.id ? { ...item, ...obra } : item)));
  }, []);

  return { itens, total, totalPaginas, carregando, erro, recarregar, atualizarItemLocal };
}

/**
 * Carrega TODAS as obras do filtro para o Kanban (sem paginação).
 * Só faz requisições quando `ativo` é verdadeiro (visão Kanban selecionada).
 */
export function useQuadroObras({ busca = '', status = '', pendencia = '', ativo = true } = {}) {
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
      const dados = await listarQuadroObras({ busca, status, pendencia });
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
  }, [busca, status, pendencia, ativo]);

  useEffect(() => {
    if (!ativo) {
      setCarregando(false);
      return;
    }
    recarregar();
  }, [recarregar, ativo]);

  const atualizarItemLocal = useCallback((obra) => {
    if (!obra?.id) return;
    setItens((atual) => atual.map((item) => (item.id === obra.id ? { ...item, ...obra } : item)));
  }, []);

  return { itens, carregando, erro, recarregar, atualizarItemLocal };
}

/**
 * Carrega os técnicos planejadores ativos (atribuição de responsável).
 * A rota exige perfil SUPERVISOR/ADMIN — para os demais o hook apenas devolve
 * uma lista vazia, sem propagar o erro de autorização.
 */
export function usePlanejadores(ativo = true) {
  const [planejadores, setPlanejadores] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!ativo) return undefined;

    let cancelado = false;
    setCarregando(true);

    listarPlanejadores()
      .then((dados) => {
        if (!cancelado) setPlanejadores(dados);
      })
      .catch(() => {
        if (!cancelado) setPlanejadores([]);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [ativo]);

  return { planejadores, carregando };
}

/**
 * Carrega o detalhamento completo de uma obra e expõe `setObra` para que as
 * mutações (que devolvem a obra consolidada) atualizem a página sem refetch.
 */
export function useObraDetalhe(obraId) {
  const [obra, setObra] = useState(null);
  const [carregando, setCarregando] = useState(Boolean(obraId));
  const [erro, setErro] = useState('');
  const [gatilho, setGatilho] = useState(0);

  useEffect(() => {
    if (!obraId) {
      setObra(null);
      setCarregando(false);
      return undefined;
    }

    let cancelado = false;
    setCarregando(true);
    setErro('');

    obterObra(obraId)
      .then((dados) => {
        if (!cancelado) setObra(dados);
      })
      .catch((err) => {
        if (!cancelado) {
          setErro(err.message || 'Não foi possível carregar a obra.');
          setObra(null);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [obraId, gatilho]);

  const recarregar = useCallback(() => setGatilho((valor) => valor + 1), []);

  return { obra, carregando, erro, recarregar, setObra };
}

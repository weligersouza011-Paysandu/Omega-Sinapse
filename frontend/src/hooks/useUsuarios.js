import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';

/* -------------------------------------------------------------------------- */
/* Camada de dados — Gestão de Usuários (RBAC ADMIN, aplicado no back-end)     */
/* -------------------------------------------------------------------------- */

/**
 * Lista colaboradores com paginação e filtros.
 * @param {{busca?:string, perfil?:string, ativo?:boolean, page?:number, limit?:number}} filtros
 */
export async function listarUsuarios(filtros = {}) {
  const { data } = await api.get('/usuarios', {
    params: {
      page: filtros.page,
      limit: filtros.limit,
      busca: filtros.busca || undefined,
      perfil: filtros.perfil || undefined,
      ativo: typeof filtros.ativo === 'boolean' ? filtros.ativo : undefined,
    },
  });
  return data;
}

/** Cadastra um colaborador (nome, matrícula, e-mail, senha e perfil). */
export async function criarUsuario(dados) {
  const { data } = await api.post('/usuarios', dados);
  return data;
}

/** Atualiza os dados cadastrais e o status (ativo) de um colaborador. */
export async function atualizarUsuario(id, dados) {
  const { data } = await api.put(`/usuarios/${id}`, dados);
  return data;
}

/** Redefine a senha de um colaborador. */
export async function atualizarSenha(id, senha) {
  const { data } = await api.put(`/usuarios/${id}/senha`, { senha });
  return data;
}

/* -------------------------------------------------------------------------- */
/* Hook de listagem                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Hook de listagem de usuários: loading, erro, paginação e refetch.
 * @param {{busca?:string, perfil?:string, ativo?:string|boolean, pagina?:number,
 *   limit?:number}} parametros
 *        `ativo` aceita '' (todos), true/false ou 'true'/'false'.
 */
export function useUsuarios({ busca = '', perfil = '', ativo = '', pagina = 1, limit = 20 } = {}) {
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const requisicaoAtual = useRef(0);

  const ativoNormalizado =
    typeof ativo === 'boolean' ? ativo : ativo === 'true' ? true : ativo === 'false' ? false : undefined;

  const recarregar = useCallback(async () => {
    const idRequisicao = requisicaoAtual.current + 1;
    requisicaoAtual.current = idRequisicao;

    setCarregando(true);
    setErro('');

    try {
      const dados = await listarUsuarios({
        busca,
        perfil,
        ativo: ativoNormalizado,
        page: pagina,
        limit,
      });
      if (requisicaoAtual.current !== idRequisicao) return;

      setItens(dados.data || []);
      setTotal(dados.total || 0);
      setTotalPaginas(dados.totalPages || 0);
    } catch (err) {
      if (requisicaoAtual.current !== idRequisicao) return;

      setErro(err.message || 'Não foi possível carregar os usuários.');
      setItens([]);
      setTotal(0);
      setTotalPaginas(0);
    } finally {
      if (requisicaoAtual.current === idRequisicao) {
        setCarregando(false);
      }
    }
  }, [busca, perfil, ativoNormalizado, pagina, limit]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  /** Reflete no estado local (sem refetch) um colaborador recém-atualizado. */
  const atualizarItemLocal = useCallback((usuario) => {
    if (!usuario?.id) return;
    setItens((atual) => atual.map((item) => (item.id === usuario.id ? { ...item, ...usuario } : item)));
  }, []);

  return { itens, total, totalPaginas, carregando, erro, recarregar, atualizarItemLocal };
}

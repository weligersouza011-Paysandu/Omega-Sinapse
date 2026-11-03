import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.js';

/* -------------------------------------------------------------------------- */
/* Camada de dados da Gestão de Demandas (/api/tarefas)                       */
/* -------------------------------------------------------------------------- */

/** Teto de itens carregados de uma vez (quadro e lista trabalham sem paginação). */
const LIMITE_QUADRO = 500;

export async function listarTarefas(filtros = {}) {
  const { data } = await api.get('/tarefas', {
    params: {
      usuario_id: filtros.usuarioId || undefined,
      tipo: filtros.tipo || undefined,
      status: filtros.status || undefined,
      limit: LIMITE_QUADRO,
    },
  });
  return data;
}

export async function criarTarefa(dados) {
  const { data } = await api.post('/tarefas', dados);
  return data;
}

export async function atualizarTarefa(id, dados) {
  const { data } = await api.put(`/tarefas/${id}`, dados);
  return data;
}

/** Troca de status; `justificativa_atraso` é exigida ao concluir após o vencimento. */
export async function alterarStatusTarefa(id, status, justificativaAtraso) {
  const { data } = await api.patch(`/tarefas/${id}/status`, {
    status,
    justificativa_atraso: justificativaAtraso || undefined,
  });
  return data;
}

export async function removerTarefa(id) {
  await api.delete(`/tarefas/${id}`);
}

export async function obterCargaEquipe() {
  const { data } = await api.get('/tarefas/carga-equipe');
  return data;
}

export async function listarEquipe() {
  const { data } = await api.get('/tarefas/equipe');
  return data.data || [];
}

/**
 * Tarefas da equipe com filtros de colaborador e tipo.
 * Expõe `setItens` para atualizações otimistas (arraste no Kanban, status inline).
 * As respostas antigas são descartadas para não sobrescrever um filtro mais recente.
 */
export function useTarefas({ usuarioId = '', tipo = '' } = {}) {
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');

    listarTarefas({ usuarioId, tipo })
      .then((resultado) => {
        if (!ativo) return;
        setItens(resultado.data || []);
        setTotal(resultado.total || 0);
      })
      .catch((falha) => {
        if (!ativo) return;
        setErro(falha.message || 'Não foi possível carregar as demandas.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [usuarioId, tipo, versao]);

  return { itens, setItens, total, carregando, erro, recarregar };
}

/** Colaboradores ativos (filtro "Toda a Equipe" e atribuição de responsável). */
export function useEquipe() {
  const [equipe, setEquipe] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    listarEquipe()
      .then((lista) => {
        if (ativo) setEquipe(lista);
      })
      .catch(() => {
        // Sem a lista, os filtros mostram apenas "Toda a Equipe".
        if (ativo) setEquipe([]);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return { equipe, carregando };
}

/**
 * Resumo de carga por colaborador. `atualizacao` é qualquer valor que mude
 * quando as demandas mudam (ex.: a lista carregada), disparando um novo resumo.
 */
export function useCargaEquipe(atualizacao) {
  const [carga, setCarga] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    obterCargaEquipe()
      .then((resultado) => {
        if (!ativo) return;
        setCarga(resultado);
        setErro('');
      })
      .catch((falha) => {
        if (ativo) setErro(falha.message || 'Não foi possível carregar a carga da equipe.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [atualizacao]);

  return { carga, carregando, erro };
}

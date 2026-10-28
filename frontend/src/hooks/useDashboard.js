import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.js';

/* -------------------------------------------------------------------------- */
/* Camada de dados do Dashboard de Planejamento                               */
/* -------------------------------------------------------------------------- */

/**
 * Busca o payload agregado do dashboard em uma única requisição.
 * @param {{status?:string, categoria?:string, busca?:string}} filtros
 */
export async function obterDashboard(filtros = {}) {
  const { data } = await api.get('/dashboard', {
    params: {
      status: filtros.status || undefined,
      categoria: filtros.categoria || undefined,
      busca: filtros.busca || undefined,
    },
  });
  return data;
}

/**
 * Hook de leitura do Dashboard de Planejamento.
 *
 * Mantém os últimos dados em tela durante a troca de filtros (evita o "pisca"
 * do layout) e expõe `recarregar` para atualização manual. As respostas antigas
 * são descartadas para não sobrescrever um filtro mais recente.
 */
export function useDashboard({ status = '', categoria = '', busca = '' } = {}) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => {
    setVersao((atual) => atual + 1);
  }, []);

  useEffect(() => {
    let ativo = true;

    setCarregando(true);
    setErro('');

    obterDashboard({ status, categoria, busca })
      .then((resultado) => {
        if (!ativo) return;
        setDados(resultado);
      })
      .catch((falha) => {
        if (!ativo) return;
        setErro(falha.message || 'Não foi possível carregar o dashboard.');
      })
      .finally(() => {
        if (!ativo) return;
        setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [status, categoria, busca, versao]);

  return { dados, carregando, erro, recarregar };
}

export default useDashboard;

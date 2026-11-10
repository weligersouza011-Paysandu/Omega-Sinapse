import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.js';

/* -------------------------------------------------------------------------- */
/* Camada de dados do Dashboard de Medição (contratos, TACs e boletins)       */
/* -------------------------------------------------------------------------- */

/** Contratos cadastrados, com aditivos, obras vinculadas e saldo consolidado. */
export async function listarContratos() {
  const { data } = await api.get('/contratos');
  return data.data || [];
}

/** KPIs, aderência financeira, árvore BMM x SS e Curva S financeira do contrato. */
export async function obterDashboardMedicao(contratoId) {
  const { data } = await api.get(`/contratos/${contratoId}/dashboard-medicao`);
  return data;
}

/**
 * Hook do Dashboard de Medição: carrega os contratos, mantém o contrato escolhido
 * (o vigente por padrão) e busca o dashboard dele. Respostas antigas são
 * descartadas ao trocar de contrato.
 */
export function useDashboardMedicao() {
  const [contratos, setContratos] = useState([]);
  const [contratoId, setContratoId] = useState(null);
  const [dados, setDados] = useState(null);
  const [carregandoContratos, setCarregandoContratos] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

  useEffect(() => {
    let ativo = true;
    setCarregandoContratos(true);
    setErro('');

    listarContratos()
      .then((lista) => {
        if (!ativo) return;
        setContratos(lista);
        setContratoId((atual) => {
          if (atual && lista.some((contrato) => contrato.id === atual)) return atual;
          const vigente = lista.find((contrato) => contrato.em_vigencia) || lista[0];
          return vigente ? vigente.id : null;
        });
      })
      .catch((falha) => {
        if (!ativo) return;
        setErro(falha.message || 'Não foi possível carregar os contratos.');
      })
      .finally(() => {
        if (ativo) setCarregandoContratos(false);
      });

    return () => {
      ativo = false;
    };
  }, [versao]);

  useEffect(() => {
    if (!contratoId) {
      setDados(null);
      return undefined;
    }

    let ativo = true;
    setCarregandoDados(true);
    setErro('');

    obterDashboardMedicao(contratoId)
      .then((resultado) => {
        if (ativo) setDados(resultado);
      })
      .catch((falha) => {
        if (ativo) setErro(falha.message || 'Não foi possível carregar o dashboard de medição.');
      })
      .finally(() => {
        if (ativo) setCarregandoDados(false);
      });

    return () => {
      ativo = false;
    };
  }, [contratoId, versao]);

  return {
    contratos,
    contratoId,
    selecionarContrato: setContratoId,
    dados,
    carregando: carregandoContratos || carregandoDados,
    carregandoContratos,
    erro,
    recarregar,
  };
}

export default useDashboardMedicao;

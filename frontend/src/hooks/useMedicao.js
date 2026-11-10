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

/* ----------------------------- Escrita (SUPERVISOR/ADMIN) ----------------------------- */

/** Cadastra o contrato-mãe. */
export async function criarContrato(dados) {
  const { data } = await api.post('/contratos', dados);
  return data;
}

/** Registra um Termo Aditivo (TAC); devolve o contrato com o novo teto. */
export async function registrarTac(contratoId, dados) {
  const { data } = await api.post(`/contratos/${contratoId}/tac`, dados);
  return data;
}

/** Vincula obras ao contrato (cada obra tem um único contrato-mãe). */
export async function vincularObrasAoContrato(contratoId, obraIds) {
  const { data } = await api.post(`/contratos/${contratoId}/obras`, { obra_ids: obraIds });
  return data;
}

/** Lança um Boletim de Medição (BMM) com os valores por obra/SS. */
export async function criarBoletim(contratoId, dados) {
  const { data } = await api.post(`/contratos/${contratoId}/boletins`, dados);
  return data;
}

/** Aprova, rejeita ou reabre (em análise) um boletim. */
export async function atualizarStatusBoletim(contratoId, boletimId, status) {
  const { data } = await api.patch(`/contratos/${contratoId}/boletins/${boletimId}`, { status });
  return data;
}

export async function excluirBoletim(contratoId, boletimId) {
  const { data } = await api.delete(`/contratos/${contratoId}/boletins/${boletimId}`);
  return data;
}

/**
 * Importa as planilhas do histórico de medição (ADMIN). Sem `aplicar` só simula e
 * devolve o resumo do que seria gravado; com `aplicar` grava no banco.
 */
export async function importarPlanilhasMedicao({ medicao, curva, aplicar = false, campos = {} }) {
  const formulario = new FormData();
  formulario.append('medicao', medicao);
  formulario.append('curva', curva);
  formulario.append('aplicar', aplicar ? 'true' : 'false');
  Object.entries(campos).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') formulario.append(chave, valor);
  });
  const { data } = await api.post('/contratos/importar-medicao', formulario, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data;
}

/* ----------------------------- Medição e projeção por obra ----------------------------- */

/** BMMs em que a obra (SS) pontuou, com o valor por ciclo e o acumulado aprovado. */
export async function obterMedicaoObra(obraId) {
  const { data } = await api.get(`/obras/${obraId}/medicao`);
  return data;
}

/** Previsto x físico real x medido e o custo projetado do QQP (dias úteis) por ciclo. */
export async function obterProjecaoObra(obraId) {
  const { data } = await api.get(`/obras/${obraId}/projecao-financeira`);
  return data;
}

/* ----------------------------- QQP do contrato e recursos da obra ----------------------------- */

export async function listarItensQqp(contratoId) {
  const { data } = await api.get(`/contratos/${contratoId}/qqp`);
  return data.data || [];
}

export async function criarItemQqp(contratoId, dados) {
  const { data } = await api.post(`/contratos/${contratoId}/qqp`, dados);
  return data;
}

export async function atualizarItemQqp(contratoId, itemId, dados) {
  const { data } = await api.put(`/contratos/${contratoId}/qqp/${itemId}`, dados);
  return data;
}

export async function excluirItemQqp(contratoId, itemId) {
  const { data } = await api.delete(`/contratos/${contratoId}/qqp/${itemId}`);
  return data;
}

export async function listarRecursosObra(obraId) {
  const { data } = await api.get(`/obras/${obraId}/recursos-qqp`);
  return data;
}

export async function criarRecursoObra(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/recursos-qqp`, dados);
  return data;
}

export async function atualizarRecursoObra(obraId, recursoId, dados) {
  const { data } = await api.put(`/obras/${obraId}/recursos-qqp/${recursoId}`, dados);
  return data;
}

export async function excluirRecursoObra(obraId, recursoId) {
  const { data } = await api.delete(`/obras/${obraId}/recursos-qqp/${recursoId}`);
  return data;
}

/**
 * Carrega dados assíncronos com estado de carregamento/erro e `recarregar`.
 * Respostas antigas (de uma obra anterior, por exemplo) são descartadas.
 */
export function useCarregamento(carregar, dependencias) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    carregar()
      .then((resultado) => {
        if (ativo) setDados(resultado);
      })
      .catch((falha) => {
        if (ativo) setErro(falha.message || 'Não foi possível carregar os dados.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, versao]);

  return { dados, carregando, erro, recarregar };
}

/** Perfis que podem cadastrar contratos, TACs e boletins (espelha o back-end). */
export const PERFIS_QUE_GEREM_MEDICAO = ['SUPERVISOR', 'ADMIN'];

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
          // Abre o contrato que tem medição (vigente primeiro); contrato novo e vazio não esconde os dados.
          const comDados = lista.filter((contrato) => contrato.quantidade_boletins > 0);
          const escolhido =
            comDados.find((contrato) => contrato.em_vigencia) ||
            [...comDados].sort((a, b) => b.quantidade_boletins - a.quantidade_boletins)[0] ||
            lista.find((contrato) => contrato.em_vigencia) ||
            lista[0];
          return escolhido ? escolhido.id : null;
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

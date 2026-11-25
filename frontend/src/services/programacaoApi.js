import api from './api.js';

/** Chamadas da Programação S+1 (programação semanal de mão de obra). */

export const listarProgramacoes = async () => (await api.get('/programacoes')).data;
export const obterProgramacao = async (id) => (await api.get(`/programacoes/${id}`)).data;
export const criarProgramacao = async (corpo) => (await api.post('/programacoes', corpo)).data;
export const atualizarProgramacao = async (id, corpo) => (await api.put(`/programacoes/${id}`, corpo)).data;
export const excluirProgramacao = async (id) => (await api.delete(`/programacoes/${id}`)).data;
export const emitirProgramacao = async (id) => (await api.post(`/programacoes/${id}/emitir`)).data;
export const novaRevisaoProgramacao = async (id) => (await api.post(`/programacoes/${id}/revisao`)).data;
export const listarObrasProgramacao = async () => (await api.get('/programacoes/obras')).data;

export async function importarPlanilhaProgramacao(arquivo, substituir = false) {
  const formulario = new FormData();
  formulario.append('arquivo', arquivo);
  if (substituir) formulario.append('substituir', 'true');
  return (await api.post('/programacoes/importar', formulario, { timeout: 180000 })).data;
}

export const criarFrente = async (programacaoId, corpo) => (await api.post(`/programacoes/${programacaoId}/frentes`, corpo)).data;
export const atualizarFrente = async (id, corpo) => (await api.put(`/programacoes/frentes/${id}`, corpo)).data;
export const excluirFrente = async (id) => (await api.delete(`/programacoes/frentes/${id}`)).data;
export const criarEquipe = async (frenteId, corpo) => (await api.post(`/programacoes/frentes/${frenteId}/equipes`, corpo)).data;
export const atualizarEquipe = async (id, corpo) => (await api.put(`/programacoes/equipes/${id}`, corpo)).data;
export const excluirEquipe = async (id) => (await api.delete(`/programacoes/equipes/${id}`)).data;
export const criarAlocacao = async (equipeId, corpo) => (await api.post(`/programacoes/equipes/${equipeId}/alocacoes`, corpo)).data;
export const atualizarAlocacao = async (id, corpo) => (await api.put(`/programacoes/alocacoes/${id}`, corpo)).data;
export const excluirAlocacao = async (id) => (await api.delete(`/programacoes/alocacoes/${id}`)).data;

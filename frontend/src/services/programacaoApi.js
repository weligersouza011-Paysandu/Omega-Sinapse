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
/** Efetivo do contrato. `todos`: inclui os desmobilizados (campo `mobilizado`). */
export const listarEfetivoProgramacao = async ({ todos = false } = {}) => (await api.get('/programacoes/efetivo', { params: todos ? { todos: 1 } : {} })).data;
export const mobilizarColaborador = async (corpo) => (await api.post('/programacoes/efetivo/mobilizar', corpo)).data;
export const desmobilizarColaborador = async (id, corpo = {}) => (await api.post(`/programacoes/efetivo/${id}/desmobilizar`, corpo)).data;
export const atualizarColaboradorEfetivo = async (id, corpo) => (await api.put(`/programacoes/efetivo/${id}`, corpo)).data;
/** Atualiza o efetivo do contrato pela aba "EFETIVO A DISTRIBUIR" da planilha da reunião. */
export async function importarEfetivoProgramacao(arquivo) {
  const formulario = new FormData();
  formulario.append('arquivo', arquivo);
  return (await api.post('/programacoes/efetivo/importar', formulario, { timeout: 180000 })).data;
}
/** Funções de planejamento cadastradas; nova função (Planejador/Admin). */
export const listarFuncoesProgramacao = async () => (await api.get('/programacoes/funcoes')).data;
export const criarFuncaoProgramacao = async (nome) => (await api.post('/programacoes/funcoes', { nome })).data;
/** Efetivo nominal a partir da programação (cadastra quem falta e liga as pessoas ao cadastro). */
export const sincronizarEfetivoProgramacao = async (id) => (await api.post(`/programacoes/${id}/sincronizar-efetivo`)).data;
/** Programação e efetivo nominal de uma obra (recorte: proxima | atual | ultima, ou programacao_id). */
export const obterProgramacaoDaObra = async (obraId, params = { recorte: 'proxima' }) => (await api.get(`/programacoes/por-obra/${obraId}`, { params })).data;
/** Início da reunião: nova semana copiando a última programação. */
export const criarProximaProgramacao = async () => (await api.post('/programacoes/proxima', {}, { timeout: 120000 })).data;

/** Baixa a programação em .xlsx (layout da reunião). */
export async function baixarExportacaoProgramacao(id) {
  const resposta = await api.get(`/programacoes/${id}/exportar`, { responseType: 'blob', timeout: 120000 });
  const nome = /filename="([^"]+)"/.exec(resposta.headers['content-disposition'] || '')?.[1];
  return { blob: resposta.data, nome: nome ? decodeURIComponent(nome) : `programacao-${id}.xlsx` };
}

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
/** Atividades programadas da equipe (linha do cronograma da obra ou serviço escrito). */
export const obterCronogramaDaObraProgramacao = async (obraId) => (await api.get(`/programacoes/cronograma/${obraId}`)).data;
export const criarItemAtividadeProgramacao = async (equipeId, corpo) => (await api.post(`/programacoes/equipes/${equipeId}/atividades`, corpo)).data;
export const atualizarItemAtividadeProgramacao = async (id, corpo) => (await api.put(`/programacoes/atividades/${id}`, corpo)).data;
export const excluirItemAtividadeProgramacao = async (id) => (await api.delete(`/programacoes/atividades/${id}`)).data;
export const excluirAlocacao = async (id) => (await api.delete(`/programacoes/alocacoes/${id}`)).data;

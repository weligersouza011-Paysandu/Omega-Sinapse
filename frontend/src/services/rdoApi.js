import api from './api.js';

/** Chamadas do módulo RDO (Relatório Diário de Obra). */

export const obterObrasRdo = async () => (await api.get('/rdos/obras')).data;
export const obterAtividadesObraRdo = async (obraId) => (await api.get(`/rdos/obras/${obraId}/atividades`)).data;
export const listarRdos = async (params = {}) => (await api.get('/rdos', { params })).data;
export const obterRdo = async (id) => (await api.get(`/rdos/${id}`)).data;
export const criarRdo = async (corpo) => (await api.post('/rdos', corpo)).data;
export const atualizarRdo = async (id, corpo) => (await api.put(`/rdos/${id}`, corpo)).data;
export const excluirRdo = async (id) => (await api.delete(`/rdos/${id}`)).data;
export const finalizarRdo = async (id) => (await api.post(`/rdos/${id}/finalizar`)).data;
export const aprovarRdo = async (id, corpo = {}) => (await api.post(`/rdos/${id}/aprovar`, corpo)).data;
export const devolverRdo = async (id, motivo) => (await api.post(`/rdos/${id}/devolver`, { motivo })).data;

export async function enviarFotoRdo(id, atividadeId, arquivo, legenda) {
  const formulario = new FormData();
  formulario.append('foto', arquivo);
  if (legenda) formulario.append('legenda', legenda);
  return (await api.post(`/rdos/${id}/atividades/${atividadeId}/fotos`, formulario, { timeout: 120000 })).data;
}
export const removerFotoRdo = async (id, fotoId) => (await api.delete(`/rdos/${id}/fotos/${fotoId}`)).data;

/** Baixa o PDF do RDO como Blob. */
export async function baixarPdfRdo(id) {
  const resposta = await api.get(`/rdos/${id}/pdf`, { responseType: 'blob', timeout: 120000 });
  return resposta.data;
}

export const obterAvancoRdoObra = async (obraId) => (await api.get(`/obras/${obraId}/avanco-rdo`)).data;

/* Cadastros */
export const listarCadastroRdo = async (tipo, params = {}) => (await api.get(`/rdo-cadastros/${tipo}`, { params })).data;
export const criarCadastroRdo = async (tipo, corpo) => (await api.post(`/rdo-cadastros/${tipo}`, corpo)).data;
export const atualizarCadastroRdo = async (tipo, id, corpo) => (await api.put(`/rdo-cadastros/${tipo}/${id}`, corpo)).data;
export const listarEncarregados = async () => (await api.get('/rdo-cadastros/encarregados')).data;
export const definirObrasEncarregado = async (usuarioId, obraIds) =>
  (await api.put(`/rdo-cadastros/encarregados/${usuarioId}/obras`, { obra_ids: obraIds })).data;

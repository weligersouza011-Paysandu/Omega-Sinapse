import api from './api.js';

/**
 * Chamadas do módulo de cronogramas: ingestão/versionamento, Curva S, caminho
 * crítico, lookahead 6WLA, carga de trabalho e exportação do RDO.
 */

/** Envia a planilha do modelo padrão e cria uma nova revisão do cronograma. */
export async function enviarCronograma(obraId, arquivo, { observacao, onProgresso } = {}) {
  const formulario = new FormData();
  formulario.append('obra_id', String(obraId));
  formulario.append('arquivo', arquivo);
  if (observacao) formulario.append('observacao', observacao);
  const { data } = await api.post('/cronogramas/upload', formulario, {
    timeout: 180000,
    onUploadProgress: (evento) => {
      if (onProgresso && evento.total) onProgresso(Math.round((evento.loaded / evento.total) * 100));
    },
  });
  return data;
}

export async function listarVersoesCronograma(obraId) {
  const { data } = await api.get(`/cronogramas/obra/${obraId}`);
  return data;
}

export async function obterCurvaS(obraId, params = {}) {
  const { data } = await api.get(`/obras/${obraId}/curva-s`, { params });
  return data;
}

export async function obterCaminhoCritico(obraId, params = {}) {
  const { data } = await api.get(`/obras/${obraId}/caminho-critico`, { params });
  return data;
}

export async function obterLookahead(obraId, params = {}) {
  const { data } = await api.get(`/obras/${obraId}/lookahead`, { params });
  return data;
}

export async function obterCargaTrabalho(obraId, params = {}) {
  const { data } = await api.get(`/obras/${obraId}/carga-trabalho`, { params });
  return data;
}

/** Cadastra (sem `id`) ou atualiza (com `id`) uma restrição de atividade. */
export async function salvarRestricaoAtividade(obraId, dados) {
  const { data } = await api.post(`/obras/${obraId}/lookahead/restricoes`, dados);
  return data;
}

/** Baixa o .xlsx do RDO e dispara o download no navegador. */
export async function baixarPlanilhaRdo(obraId, params = {}) {
  const resposta = await api.get(`/obras/${obraId}/exportar-rdo`, {
    params,
    responseType: 'blob',
    timeout: 120000,
    // Erros chegam como Blob JSON: tratados aqui para exibir a mensagem da API.
    validateStatus: () => true,
  });
  if (resposta.status !== 200) {
    let mensagem = 'Não foi possível gerar a planilha do RDO.';
    try {
      mensagem = JSON.parse(await resposta.data.text()).erro || mensagem;
    } catch {
      // Corpo não é JSON.
    }
    throw new Error(mensagem);
  }
  const cabecalho = resposta.headers['content-disposition'] || '';
  const nome = /filename\*=UTF-8''([^;]+)/.exec(cabecalho)?.[1] || /filename="([^"]+)"/.exec(cabecalho)?.[1] || 'RDO.xlsx';
  const url = URL.createObjectURL(resposta.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = decodeURIComponent(nome);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { nome: link.download, linhas: Number(resposta.headers['x-linhas-exportadas'] || 0) };
}

import api from './api.js';

/**
 * Chamadas do módulo de cronogramas: ingestão/versionamento, Curva S, caminho
 * crítico, lookahead 6WLA, carga de trabalho e exportação do RDO.
 */

/** Envia a planilha do modelo padrão e cria uma nova revisão do cronograma. */
export async function enviarCronograma(obraId, arquivo, { observacao, dataSnapshot, forcar = false, onProgresso } = {}) {
  const formulario = new FormData();
  formulario.append('obra_id', String(obraId));
  formulario.append('arquivo', arquivo);
  if (observacao) formulario.append('observacao', observacao);
  // Data de corte/publicação no formato AAAA-MM-DD.
  if (dataSnapshot) formulario.append('data_snapshot', dataSnapshot);
  // Confirma a reimportação de uma planilha idêntica (a API responde 409 sem isso).
  if (forcar) formulario.append('forcar', 'true');
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

/** Histórico de importações, recusas e exclusões de revisões da obra. */
export async function listarHistoricoCronograma(obraId) {
  const { data } = await api.get(`/cronogramas/obra/${obraId}/historico`);
  return data;
}

/** Exclui um registro do histórico de importação (somente ADMIN). */
export async function excluirRegistroHistorico(registroId) {
  const { data } = await api.delete(`/cronogramas/historico/${registroId}`);
  return data;
}

/** Exclui uma revisão do cronograma (fica registrada no histórico). */
export async function excluirVersaoCronograma(versaoId, motivo) {
  const { data } = await api.delete(`/cronogramas/${versaoId}`, { data: { motivo: motivo || null } });
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

/**
 * Baixa um arquivo gerado pela API (xlsx, pdf…) e dispara o download no
 * navegador. Erros chegam como Blob JSON: a mensagem da API é repassada.
 */
async function baixarArquivo(caminho, params, { mensagemErro, nomePadrao }) {
  const resposta = await api.get(caminho, { params, responseType: 'blob', timeout: 120000, validateStatus: () => true });
  if (resposta.status !== 200) {
    let mensagem = mensagemErro;
    try {
      mensagem = JSON.parse(await resposta.data.text()).erro || mensagem;
    } catch {
      // Corpo não é JSON.
    }
    throw new Error(mensagem);
  }
  const cabecalho = resposta.headers['content-disposition'] || '';
  const nome = /filename\*=UTF-8''([^;]+)/.exec(cabecalho)?.[1] || /filename="([^"]+)"/.exec(cabecalho)?.[1] || nomePadrao;
  const url = URL.createObjectURL(resposta.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = decodeURIComponent(nome);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { nome: link.download, cabecalhos: resposta.headers };
}

/** Baixa o .xlsx do RDO. */
export async function baixarPlanilhaRdo(obraId, params = {}) {
  const { nome, cabecalhos } = await baixarArquivo(`/obras/${obraId}/exportar-rdo`, params, {
    mensagemErro: 'Não foi possível gerar a planilha do RDO.',
    nomePadrao: 'RDO.xlsx',
  });
  return { nome, linhas: Number(cabecalhos['x-linhas-exportadas'] || 0) };
}

/** Baixa o relatório executivo (PDF) das restrições do lookahead. */
export async function baixarRestricoesPdf(obraId, params = {}) {
  const { nome, cabecalhos } = await baixarArquivo(`/obras/${obraId}/exportar-restricoes-pdf`, params, {
    mensagemErro: 'Não foi possível gerar o relatório de restrições.',
    nomePadrao: 'Restricoes.pdf',
  });
  return { nome, atividades: Number(cabecalhos['x-atividades-listadas'] || 0), restricoes: Number(cabecalhos['x-restricoes-listadas'] || 0) };
}

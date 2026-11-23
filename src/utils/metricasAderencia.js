'use strict';

const { calcularAderencia } = require('./aderenciaDemanda');

/**
 * Indicadores de aderência (funções puras sobre tarefas concluídas).
 *
 * - "No prazo": concluída até o vencimento. "Com atraso": concluída depois.
 * - Aderência média: média da aderência de cada entrega (gravada na conclusão;
 *   recalculada pela mesma regra quando ainda não existe).
 */

const SEM_CATEGORIA = 'SEM_CATEGORIA';

const arredondar = (valor) => Math.round(valor * 100) / 100;

function aderenciaDaEntrega(tarefa) {
  if (typeof tarefa.aderencia === 'number') return tarefa.aderencia;
  return calcularAderencia(tarefa.data_vencimento, tarefa.concluido_em);
}

function noPrazo(tarefa) {
  return new Date(tarefa.concluido_em).getTime() <= new Date(tarefa.data_vencimento).getTime();
}

/** Resumo de um conjunto de entregas. */
function resumir(tarefas) {
  const concluidas = tarefas.length;
  const prazo = tarefas.filter(noPrazo).length;
  const soma = tarefas.reduce((total, tarefa) => total + aderenciaDaEntrega(tarefa), 0);
  return {
    concluidas,
    no_prazo: prazo,
    com_atraso: concluidas - prazo,
    aderencia_media: concluidas > 0 ? arredondar(soma / concluidas) : null,
    pontualidade: concluidas > 0 ? arredondar((prazo / concluidas) * 100) : null,
  };
}

/** Atrasos por categoria de justificativa, do mais frequente ao menos. */
function distribuirPorCategoria(tarefas) {
  const contagem = new Map();
  for (const tarefa of tarefas) {
    if (noPrazo(tarefa)) continue;
    const categoria = tarefa.justificativa_categoria || SEM_CATEGORIA;
    contagem.set(categoria, (contagem.get(categoria) || 0) + 1);
  }
  return [...contagem.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria));
}

/** Comparativo de pontualidade por colaborador (melhor aderência primeiro). */
function montarRanking(tarefas) {
  const grupos = new Map();
  for (const tarefa of tarefas) {
    if (!grupos.has(tarefa.usuario_id)) {
      grupos.set(tarefa.usuario_id, { nome: tarefa.usuario?.nome || `Usuário ${tarefa.usuario_id}`, itens: [] });
    }
    grupos.get(tarefa.usuario_id).itens.push(tarefa);
  }
  return [...grupos.entries()]
    .map(([usuarioId, { nome, itens }]) => ({ usuario_id: usuarioId, nome, ...resumir(itens) }))
    .sort(
      (a, b) =>
        b.aderencia_media - a.aderencia_media ||
        b.concluidas - a.concluidas ||
        a.nome.localeCompare(b.nome, 'pt-BR')
    );
}

/**
 * @param {object[]} tarefas concluídas (usuario_id, usuario.nome, aderencia, data_vencimento,
 *   concluido_em, justificativa_categoria)
 * @param {{incluirRanking?: boolean}} opcoes `incluirRanking` só para gestores
 */
function calcularMetricas(tarefas, { incluirRanking = false } = {}) {
  const metricas = {
    resumo: resumir(tarefas),
    por_categoria: distribuirPorCategoria(tarefas),
  };
  if (incluirRanking) metricas.ranking = montarRanking(tarefas);
  return metricas;
}

module.exports = { calcularMetricas, resumir, distribuirPorCategoria, montarRanking, SEM_CATEGORIA };

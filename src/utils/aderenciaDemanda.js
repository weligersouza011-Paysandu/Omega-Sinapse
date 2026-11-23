'use strict';

/**
 * Aderência de uma demanda por pontualidade (função pura, sem I/O).
 *
 * - Entrega até o prazo combinado: 100%.
 * - Cada bloco COMPLETO de 30 minutos de atraso desconta 0,5 ponto percentual
 *   (30 min → 99,5%; 1h → 99%; 1h29 → 99%). Piso em 0%.
 */

const ADERENCIA_MAXIMA = 100;
const ADERENCIA_MINIMA = 0;
const BLOCO_ATRASO_MINUTOS = 30;
const DESCONTO_POR_BLOCO = 0.5;
const MINUTO_MS = 60 * 1000;

function paraTempo(valor, rotulo) {
  const tempo = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
  if (Number.isNaN(tempo)) {
    throw new TypeError(`${rotulo} inválido para o cálculo de aderência.`);
  }
  return tempo;
}

/** Minutos de atraso (inteiros, truncados); 0 quando entregue no prazo. */
function minutosDeAtraso(vencimento, entrega) {
  const diferenca = paraTempo(entrega, 'Data de entrega') - paraTempo(vencimento, 'Vencimento');
  return diferenca > 0 ? Math.floor(diferenca / MINUTO_MS) : 0;
}

/**
 * @param {Date|string|number} vencimento prazo combinado (data e hora)
 * @param {Date|string|number} entrega    momento da entrega
 * @returns {number} aderência em % (0–100), em passos de 0,5
 */
function calcularAderencia(vencimento, entrega) {
  const blocos = Math.floor(minutosDeAtraso(vencimento, entrega) / BLOCO_ATRASO_MINUTOS);
  const aderencia = ADERENCIA_MAXIMA - blocos * DESCONTO_POR_BLOCO;
  return Math.max(ADERENCIA_MINIMA, aderencia);
}

module.exports = {
  calcularAderencia,
  minutosDeAtraso,
  ADERENCIA_MAXIMA,
  ADERENCIA_MINIMA,
  BLOCO_ATRASO_MINUTOS,
  DESCONTO_POR_BLOCO,
};

'use strict';

/**
 * OSI das obras importadas da pasta 13.
 *
 * A planilha de avanço físico identifica a obra pela OSI, enquanto a tabela
 * `obras` é vinculada pelo orçamento (SS/PEP). Este mapa foi conferido
 * manualmente e é a fonte única usada tanto pela importação quanto pelo
 * dashboard executivo — assim a coluna OSI aparece mesmo em registros
 * históricos cuja emissão formal da OSI ainda não foi registrada no sistema.
 */
const OSI_POR_OBRA = Object.freeze({
  2: 'OSI-002/26',
  3: 'OSI-004/26',
  4: 'OSI-014/26',
  5: 'OSI-005/26',
  6: 'OSI-001/26',
  8: 'OSI-010/25',
  9: 'OSI-009/25',
  13: 'OSI-008/24',
  14: 'OSI-012/26',
  15: 'OSI-002/25',
  20: 'OSI-019/25',
  21: 'OSI-018/25',
  22: 'OSI-017/25',
  23: 'OSI-011/25',
  24: 'OSI-015/25',
  28: 'OSI-013/25',
  29: 'OSI-003/26',
});

/** Devolve a OSI histórica de uma obra (ou null quando não mapeada). */
function obterOsiImportada(obraId) {
  return OSI_POR_OBRA[Number(obraId)] || null;
}

module.exports = { OSI_POR_OBRA, obterOsiImportada };

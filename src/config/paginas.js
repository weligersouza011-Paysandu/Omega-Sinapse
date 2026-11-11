'use strict';

const AppError = require('../errors/AppError');

/**
 * Páginas que podem ser liberadas para um usuário do perfil CLIENTE.
 * Os ids espelham os módulos do front-end (frontend/src/config/modulos.js).
 */
const PAGINAS_CLIENTE = [
  { id: 'orcamentos', label: 'Orçamentos' },
  { id: 'obras', label: 'Obras' },
  { id: 'planejamento', label: 'Dashboard de Planejamento' },
  { id: 'demandas', label: 'Gestão de Demandas' },
  { id: 'medicao', label: 'Medição' },
];

const IDS_PAGINAS = PAGINAS_CLIENTE.map((pagina) => pagina.id);

/** Valida e normaliza a lista de páginas (sem repetições, na ordem do menu). */
function normalizarPaginas(valor) {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) {
    throw new AppError(400, 'O campo "paginas_permitidas" deve ser uma lista.');
  }
  const informadas = valor.map((item) => String(item).trim().toLowerCase());
  const invalidas = informadas.filter((item) => !IDS_PAGINAS.includes(item));
  if (invalidas.length > 0) {
    throw new AppError(400, `Página(s) inválida(s): ${invalidas.join(', ')}. Valores aceitos: ${IDS_PAGINAS.join(', ')}.`);
  }
  return IDS_PAGINAS.filter((id) => informadas.includes(id));
}

module.exports = { PAGINAS_CLIENTE, IDS_PAGINAS, normalizarPaginas };

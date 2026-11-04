'use strict';

const curvaSService = require('../services/curvaSService');
const caminhoCriticoService = require('../services/caminhoCriticoService');

/** GET /api/obras/:id/curva-s — séries da Curva S e indicadores de desempenho. */
async function obterCurvaS(req, res, next) {
  try {
    return res.status(200).json(await curvaSService.obterCurvaS(req.params.id, req.query || {}));
  } catch (err) {
    return next(err);
  }
}

/** GET /api/obras/:id/caminho-critico — atividades com folga total ≤ 0 (CPM). */
async function obterCaminhoCritico(req, res, next) {
  try {
    return res.status(200).json(await caminhoCriticoService.obterCaminhoCritico(req.params.id, req.query || {}));
  } catch (err) {
    return next(err);
  }
}

module.exports = { obterCurvaS, obterCaminhoCritico };

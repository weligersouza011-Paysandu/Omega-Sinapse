'use strict';

const cronogramaService = require('../services/cronogramaService');

/** Envolve um caso de uso assíncrono no contrato de resposta do Express. */
function acao(metodo, status = 200) {
  return async (req, res, next) => {
    try {
      return res.status(status).json(await metodo(req));
    } catch (err) {
      return next(err);
    }
  };
}

/** POST /api/cronogramas/upload (multipart: arquivo, obra_id, observacao?, data_snapshot?) */
const enviarCronograma = acao(
  (req) => cronogramaService.enviarCronograma(req.file, req.body || {}, req.user),
  201
);

/** GET /api/cronogramas/obra/:obraId */
const listarPorObra = acao((req) => cronogramaService.listarPorObra(req.params.obraId));

/** GET /api/cronogramas/:id */
const obterVersao = acao((req) => cronogramaService.obterVersao(req.params.id));

/** GET /api/cronogramas/obra/:obraId/historico */
const listarHistorico = acao((req) => cronogramaService.listarHistorico(req.params.obraId));

/** DELETE /api/cronogramas/:id (motivo opcional no corpo ou na query) */
const excluirVersao = acao((req) =>
  cronogramaService.excluirVersao(req.params.id, { ...(req.query || {}), ...(req.body || {}) }, req.user)
);

module.exports = { enviarCronograma, listarPorObra, listarHistorico, obterVersao, excluirVersao };

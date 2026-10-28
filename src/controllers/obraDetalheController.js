'use strict';

const obraDetalheService = require('../services/obraDetalheService');

/** Envolve um caso de uso assíncrono no contrato de resposta do Express. */
function acao(metodo, status = 200) {
  return async (req, res, next) => {
    try {
      const resultado = await metodo(req);
      return res.status(status).json(resultado);
    } catch (err) {
      return next(err);
    }
  };
}

/* ------------------------------- Localizações ----------------------------- */

const criarLocalizacao = acao(
  (req) => obraDetalheService.criarLocalizacao(req.params.id, req.body || {}, req.user),
  201
);

const atualizarLocalizacao = acao((req) =>
  obraDetalheService.atualizarLocalizacao(
    req.params.id,
    req.params.localizacaoId,
    req.body || {},
    req.user
  )
);

const removerLocalizacao = acao((req) =>
  obraDetalheService.removerLocalizacao(req.params.id, req.params.localizacaoId, req.user)
);

/* ------------------------------- Avanço físico ---------------------------- */

const criarAvanco = acao(
  (req) => obraDetalheService.criarAvanco(req.params.id, req.body || {}, req.user),
  201
);

const atualizarAvanco = acao((req) =>
  obraDetalheService.atualizarAvanco(req.params.id, req.params.avancoId, req.body || {}, req.user)
);

const removerAvanco = acao((req) =>
  obraDetalheService.removerAvanco(req.params.id, req.params.avancoId, req.user)
);

/* -------------------------------- Relatórios ------------------------------ */

const criarRelatorio = acao(
  (req) => obraDetalheService.criarRelatorio(req.params.id, req.body || {}, req.user),
  201
);

const atualizarRelatorio = acao((req) =>
  obraDetalheService.atualizarRelatorio(
    req.params.id,
    req.params.relatorioId,
    req.body || {},
    req.user
  )
);

const removerRelatorio = acao((req) =>
  obraDetalheService.removerRelatorio(req.params.id, req.params.relatorioId, req.user)
);

/* -------------------------------- Atividades ------------------------------ */

const criarAtividade = acao(
  (req) => obraDetalheService.criarAtividade(req.params.id, req.body || {}, req.user),
  201
);

const atualizarAtividade = acao((req) =>
  obraDetalheService.atualizarAtividade(
    req.params.id,
    req.params.atividadeId,
    req.body || {},
    req.user
  )
);

const removerAtividade = acao((req) =>
  obraDetalheService.removerAtividade(req.params.id, req.params.atividadeId, req.user)
);

/* -------------------------------- Ocorrências ----------------------------- */

const criarOcorrencia = acao(
  (req) => obraDetalheService.criarOcorrencia(req.params.id, req.body || {}, req.user),
  201
);

const removerOcorrencia = acao((req) =>
  obraDetalheService.removerOcorrencia(req.params.id, req.params.ocorrenciaId, req.user)
);

/* -------------------------------- Comentários ----------------------------- */

const criarComentario = acao(
  (req) => obraDetalheService.criarComentario(req.params.id, req.body || {}, req.user),
  201
);

const removerComentario = acao((req) =>
  obraDetalheService.removerComentario(req.params.id, req.params.comentarioId, req.user)
);

/* ---------------------------------- Mídias -------------------------------- */

const criarMidia = acao(
  (req) => obraDetalheService.criarMidia(req.params.id, req.body || {}, req.user),
  201
);

const removerMidia = acao((req) =>
  obraDetalheService.removerMidia(req.params.id, req.params.midiaId, req.user)
);

module.exports = {
  criarLocalizacao,
  atualizarLocalizacao,
  removerLocalizacao,
  criarAvanco,
  atualizarAvanco,
  removerAvanco,
  criarRelatorio,
  atualizarRelatorio,
  removerRelatorio,
  criarAtividade,
  atualizarAtividade,
  removerAtividade,
  criarOcorrencia,
  removerOcorrencia,
  criarComentario,
  removerComentario,
  criarMidia,
  removerMidia,
};

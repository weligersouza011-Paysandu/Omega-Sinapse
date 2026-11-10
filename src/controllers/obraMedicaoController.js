'use strict';

const projecaoService = require('../services/projecaoFinanceiraService');
const qqpService = require('../services/qqpService');

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

/** GET /api/obras/:id/medicao */
const obterMedicao = acao((req) => projecaoService.obterMedicaoDaObra(req.params.id, req.user));

/** GET /api/obras/:id/projecao-financeira */
const obterProjecaoFinanceira = acao((req) => projecaoService.obterProjecaoFinanceira(req.params.id, req.user));

/** GET /api/obras/:id/recursos-qqp */
const listarRecursos = acao((req) => qqpService.listarRecursos(req.params.id, req.user));

/** POST /api/obras/:id/recursos-qqp */
const criarRecurso = acao((req) => qqpService.criarRecurso(req.params.id, req.body || {}, req.user), 201);

/** PUT /api/obras/:id/recursos-qqp/:recursoId */
const atualizarRecurso = acao((req) =>
  qqpService.atualizarRecurso(req.params.id, req.params.recursoId, req.body || {}, req.user)
);

/** DELETE /api/obras/:id/recursos-qqp/:recursoId */
const excluirRecurso = acao((req) => qqpService.excluirRecurso(req.params.id, req.params.recursoId, req.user));

/* ----------------------------- Itens do QQP (contrato) ----------------------------- */

const listarItensQqp = acao((req) => qqpService.listarItens(req.params.id, req.user));
const criarItemQqp = acao((req) => qqpService.criarItem(req.params.id, req.body || {}, req.user), 201);
const atualizarItemQqp = acao((req) =>
  qqpService.atualizarItem(req.params.id, req.params.itemId, req.body || {}, req.user)
);
const excluirItemQqp = acao((req) => qqpService.excluirItem(req.params.id, req.params.itemId, req.user));

module.exports = {
  obterMedicao,
  obterProjecaoFinanceira,
  listarRecursos,
  criarRecurso,
  atualizarRecurso,
  excluirRecurso,
  listarItensQqp,
  criarItemQqp,
  atualizarItemQqp,
  excluirItemQqp,
};

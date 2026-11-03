'use strict';

const tarefaService = require('../services/tarefaService');

/** Envolve um caso de uso assíncrono no contrato de resposta do Express. */
function acao(metodo, status = 200) {
  return async (req, res, next) => {
    try {
      const resultado = await metodo(req);
      if (status === 204) return res.status(204).send();
      return res.status(status).json(resultado);
    } catch (err) {
      return next(err);
    }
  };
}

/** GET /api/tarefas — lista com filtros e paginação. */
const listarTarefas = acao((req) => tarefaService.listarTarefas(req.query || {}));

/** GET /api/tarefas/equipe — colaboradores ativos para filtro/atribuição. */
const listarEquipe = acao(async () => ({ data: await tarefaService.listarEquipe() }));

/** GET /api/tarefas/carga-equipe — resumo de carga por colaborador. */
const cargaEquipe = acao((req) => tarefaService.cargaEquipe(req.query || {}));

/** GET /api/tarefas/:id */
const obterTarefa = acao((req) => tarefaService.obterTarefa(req.params.id));

/** POST /api/tarefas */
const criarTarefa = acao((req) => tarefaService.criarTarefa(req.body || {}, req.user), 201);

/** PUT /api/tarefas/:id */
const atualizarTarefa = acao((req) =>
  tarefaService.atualizarTarefa(req.params.id, req.body || {}, req.user)
);

/** PATCH /api/tarefas/:id/status */
const alterarStatus = acao((req) =>
  tarefaService.alterarStatus(req.params.id, req.body || {}, req.user)
);

/** DELETE /api/tarefas/:id */
const removerTarefa = acao((req) => tarefaService.removerTarefa(req.params.id, req.user), 204);

module.exports = {
  listarTarefas,
  listarEquipe,
  cargaEquipe,
  obterTarefa,
  criarTarefa,
  atualizarTarefa,
  alterarStatus,
  removerTarefa,
};

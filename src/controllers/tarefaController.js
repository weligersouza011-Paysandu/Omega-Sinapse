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
const listarTarefas = acao((req) => tarefaService.listarTarefas(req.query || {}, req.user));

/** GET /api/tarefas/equipe — colaboradores ativos para filtro/atribuição. */
const listarEquipe = acao(async (req) => ({ data: await tarefaService.listarEquipe(req.user) }));

/** GET /api/tarefas/carga-equipe — resumo de carga por colaborador (Master). */
const cargaEquipe = acao((req) => tarefaService.cargaEquipe(req.query || {}, req.user));

/** GET /api/tarefas/aderencia — indicadores de aderência (escopo conforme o perfil). */
const aderencia = acao((req) => tarefaService.aderenciaEquipe(req.query || {}, req.user));

/** POST /api/tarefas/email-diario/teste — disparo manual do e-mail de pendências (Master). */
const dispararEmailDiario = acao((req) => tarefaService.dispararEmailDiario(req.body || {}, req.user));

/** GET /api/tarefas/:id */
const obterTarefa = acao((req) => tarefaService.obterTarefa(req.params.id, req.user));

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
  aderencia,
  dispararEmailDiario,
  obterTarefa,
  criarTarefa,
  atualizarTarefa,
  alterarStatus,
  removerTarefa,
};

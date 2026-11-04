'use strict';

const lookaheadService = require('../services/lookaheadService');
const dashboardController = require('./dashboardController');
const workloadService = require('../services/workloadService');
const exportRdoService = require('../services/exportRdoService');

/** GET /api/obras/:id/lookahead — atividades das próximas 6 semanas, liberação e PPC. */
async function obterLookahead(req, res, next) {
  try {
    return res.status(200).json(await lookaheadService.obterLookahead(req.params.id, req.query || {}));
  } catch (err) {
    return next(err);
  }
}

/** POST /api/obras/:id/lookahead/restricoes — cadastra (201) ou atualiza (200) uma restrição de atividade. */
async function salvarRestricao(req, res, next) {
  try {
    const { criada, restricao } = await lookaheadService.salvarRestricao(req.params.id, req.body || {}, req.user);
    return res.status(criada ? 201 : 200).json(restricao);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/obras/:id/restricoes — rota compartilhada:
 *  - corpo com `atividade_id`, `codigo_atividade` ou `id` (UUID) → restrição de
 *    atividade do cronograma (lookahead 6WLA);
 *  - demais corpos → restrição do painel de planejamento (comportamento anterior).
 */
function criarOuAtualizarRestricao(req, res, next) {
  if (lookaheadService.ehRestricaoDeAtividade(req.body || {})) {
    return salvarRestricao(req, res, next);
  }
  return dashboardController.criarRestricao(req, res, next);
}

/** GET /api/obras/:id/carga-trabalho — demanda × alocação por função (MOD, MOI, equipamentos). */
async function obterCargaTrabalho(req, res, next) {
  try {
    return res.status(200).json(await workloadService.obterCargaTrabalho(req.params.id, req.query || {}));
  } catch (err) {
    return next(err);
  }
}

/** GET /api/obras/:id/exportar-rdo — planilha .xlsx da programação para o RDO de campo. */
async function exportarRdo(req, res, next) {
  try {
    const { buffer, nomeArquivo, linhas } = await exportRdoService.gerarPlanilhaRdo(req.params.id, req.query || {}, req.user);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
      'X-Linhas-Exportadas': String(linhas),
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Linhas-Exportadas',
    });
    return res.status(200).send(buffer);
  } catch (err) {
    return next(err);
  }
}

module.exports = { obterLookahead, salvarRestricao, criarOuAtualizarRestricao, obterCargaTrabalho, exportarRdo };

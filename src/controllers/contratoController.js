'use strict';

const contratoService = require('../services/contratoService');
const medicaoService = require('../services/medicaoService');
const importacaoMedicaoDb = require('../services/importacaoMedicaoDb');

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

/** GET /api/contratos */
const listarContratos = acao((req) => contratoService.listarContratos(req.user));

/** GET /api/contratos/:id */
const obterContrato = acao((req) => contratoService.obterContrato(req.params.id, req.user));

/** POST /api/contratos */
const criarContrato = acao((req) => contratoService.criarContrato(req.body || {}, req.user), 201);

/** POST /api/contratos/:id/tac */
const registrarTac = acao((req) => contratoService.registrarTac(req.params.id, req.body || {}, req.user), 201);

/** POST /api/contratos/:id/obras */
const vincularObras = acao((req) => contratoService.vincularObras(req.params.id, req.body || {}, req.user));

/** GET /api/contratos/:id/dashboard-medicao */
const obterDashboardMedicao = acao((req) => medicaoService.obterDashboardMedicao(req.params.id, req.user));

/** POST /api/contratos/:id/boletins */
const criarBoletim = acao((req) => medicaoService.criarBoletim(req.params.id, req.body || {}, req.user), 201);

/** PATCH /api/contratos/:id/boletins/:boletimId */
const atualizarBoletim = acao((req) =>
  medicaoService.atualizarBoletim(req.params.id, req.params.boletimId, req.body || {}, req.user)
);

/** DELETE /api/contratos/:id/boletins/:boletimId */
const excluirBoletim = acao((req) => medicaoService.excluirBoletim(req.params.id, req.params.boletimId, req.user));

/** POST /api/contratos/importar-medicao (multipart: medicao, curva; aplicar?) — somente ADMIN */
const importarMedicao = acao((req) =>
  importacaoMedicaoDb.importarPlanilhas({ arquivos: req.files, campos: req.body || {}, usuario: req.user })
);

module.exports = {
  importarMedicao,
  listarContratos,
  obterContrato,
  criarContrato,
  registrarTac,
  vincularObras,
  obterDashboardMedicao,
  criarBoletim,
  atualizarBoletim,
  excluirBoletim,
};

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

/** PUT /api/contratos/:id */
const atualizarContrato = acao((req) => contratoService.atualizarContrato(req.params.id, req.body || {}, req.user));

/** DELETE /api/contratos/:id (somente ADMIN; com dados dependentes exige ?forcar=true) */
const excluirContrato = acao((req) => contratoService.excluirContrato(req.params.id, req.query, req.user));

/** PUT /api/contratos/:id/tac/:tacId */
const atualizarTac = acao((req) => contratoService.atualizarTac(req.params.id, req.params.tacId, req.body || {}, req.user));

/** DELETE /api/contratos/:id/tac/:tacId */
const excluirTac = acao((req) => contratoService.excluirTac(req.params.id, req.params.tacId, req.user));

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

/** POST /api/contratos/:id/boletins/:boletimId/itens */
const incluirItemBoletim = acao((req) => medicaoService.incluirItemBoletim(req.params.id, req.params.boletimId, req.body || {}, req.user), 201);

/** PUT /api/contratos/:id/boletins/:boletimId/itens/:itemId */
const atualizarItemBoletim = acao((req) =>
  medicaoService.atualizarItemBoletim(req.params.id, req.params.boletimId, req.params.itemId, req.body || {}, req.user)
);

/** DELETE /api/contratos/:id/boletins/:boletimId/itens/:itemId */
const removerItemBoletim = acao((req) =>
  medicaoService.removerItemBoletim(req.params.id, req.params.boletimId, req.params.itemId, req.user)
);

/** PUT /api/contratos/:id/curva/:referencia */
const atualizarPrevistoDaCurva = acao((req) =>
  medicaoService.atualizarPrevistoDaCurva(req.params.id, req.params.referencia, req.body || {}, req.user)
);

/** POST /api/contratos/:id/curva/historico/:historicoId/restaurar */
const restaurarAlteracaoDaCurva = acao((req) =>
  medicaoService.restaurarAlteracaoDaCurva(req.params.id, req.params.historicoId, req.user)
);

/** DELETE /api/contratos/:id/boletins/:boletimId */
const excluirBoletim = acao((req) => medicaoService.excluirBoletim(req.params.id, req.params.boletimId, req.user));

/** POST /api/contratos/importar-medicao (multipart: medicao, curva; aplicar?) — somente ADMIN */
const importarMedicao = acao((req) =>
  importacaoMedicaoDb.importarPlanilhas({ arquivos: req.files, campos: req.body || {}, usuario: req.user })
);

module.exports = {
  atualizarPrevistoDaCurva,
  restaurarAlteracaoDaCurva,
  incluirItemBoletim,
  atualizarItemBoletim,
  removerItemBoletim,
  atualizarTac,
  excluirTac,
  atualizarContrato,
  excluirContrato,
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

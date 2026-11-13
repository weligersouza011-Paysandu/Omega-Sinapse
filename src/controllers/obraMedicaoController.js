'use strict';

const projecaoService = require('../services/projecaoFinanceiraService');
const qqpService = require('../services/qqpService');
const qqpPlanilhaService = require('../services/qqpPlanilhaService');

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

/** Revisão do QQP: corpo, query ou cabeçalho If-Match (nessa ordem). */
function revisaoDe(req) {
  return req.body?.qqp_revisao ?? req.query?.qqp_revisao ?? req.get('If-Match');
}
const comRevisao = (req) => ({ ...(req.body || {}), qqp_revisao: revisaoDe(req) });

const listarItensQqp = acao((req) => qqpService.listarItens(req.params.id, req.user, req.query || {}));
const criarItemQqp = acao((req) => qqpService.criarItem(req.params.id, comRevisao(req), req.user), 201);
const atualizarItemQqp = acao((req) => qqpService.atualizarItem(req.params.id, req.params.itemId, comRevisao(req), req.user));
const excluirItemQqp = acao((req) => qqpService.excluirItem(req.params.id, req.params.itemId, req.user, revisaoDe(req)));
const salvarOrdemQqp = acao((req) => qqpService.salvarOrdem(req.params.id, comRevisao(req), req.user));
const importarQqp = acao((req) =>
  qqpPlanilhaService.importar(req.params.id, req.file, { ...(req.query || {}), ...(req.body || {}), qqp_revisao: revisaoDe(req) }, req.user)
);

/** Envia um arquivo gerado (XLSX/PDF) como download. */
function arquivo(metodo, tipo) {
  return async (req, res, next) => {
    try {
      const { buffer, nomeArquivo } = await metodo(req);
      res.set({
        'Content-Type': tipo,
        'Content-Disposition': `attachment; filename="${nomeArquivo.replace(/[^ -~]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-store',
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });
      return res.status(200).send(buffer);
    } catch (err) {
      return next(err);
    }
  };
}
const templateQqp = arquivo(
  (req) => qqpPlanilhaService.gerarTemplate(req.params.id, req.query || {}, req.user),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
);
const pdfQqp = arquivo((req) => qqpPlanilhaService.gerarPdf(req.params.id, req.query || {}, req.user), 'application/pdf');

module.exports = {
  obterMedicao,
  obterProjecaoFinanceira,
  listarRecursos,
  criarRecurso,
  atualizarRecurso,
  excluirRecurso,
  listarItensQqp,
  salvarOrdemQqp,
  importarQqp,
  templateQqp,
  pdfQqp,
  criarItemQqp,
  atualizarItemQqp,
  excluirItemQqp,
};

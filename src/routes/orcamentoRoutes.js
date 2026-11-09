'use strict';

const { Router } = require('express');
const orcamentoController = require('../controllers/orcamentoController');
const {
  receberArquivos,
  processarFotosOrcamento,
  receberAnexoRevisao,
  processarAnexoRevisao,
} = require('../middlewares/uploadFotos');

const router = Router();

// POST   /api/orcamentos            -> cria orçamento
// Aceita JSON (URLs do Cloudinary em foto_1/foto_2/foto_3) ou multipart/form-data
// com os arquivos nos campos foto_1/foto_2/foto_3 (enviados automaticamente ao Cloudinary).
router.post('/', receberArquivos, processarFotosOrcamento, orcamentoController.criarOrcamento);

// GET    /api/orcamentos            -> lista com paginação/filtros
router.get('/', orcamentoController.listarOrcamentos);

// GET    /api/orcamentos/opcoes     -> PEPs e fiscais do histórico (dropdowns)
// Declarada antes de "/:id" para não ser capturada pelo parâmetro de rota.
router.get('/opcoes', orcamentoController.listarOpcoes);

// GET    /api/orcamentos/estatisticas -> KPIs do Dashboard BI (?de=&ate=&busca=)
// Também declarada antes de "/:id" pelo mesmo motivo.
router.get('/estatisticas', orcamentoController.obterEstatisticas);

// GET    /api/orcamentos/:id        -> detalhe com histórico de revisões
router.get('/:id', orcamentoController.obterOrcamentoPorId);

// PUT    /api/orcamentos/:id        -> atualiza orçamento (aceita JSON ou multipart com fotos)
router.put('/:id', receberArquivos, processarFotosOrcamento, orcamentoController.atualizarOrcamento);

// POST   /api/orcamentos/:id/revisoes -> registra revisão de valor
// Aceita JSON ou multipart/form-data com o documento comprobatório no campo "anexo".
router.post('/:id/revisoes', receberAnexoRevisao, processarAnexoRevisao, orcamentoController.adicionarRevisao);

// PATCH  /api/orcamentos/:id/revisoes/:revisaoId -> aprova/rejeita a revisão (recalcula o valor)
router.patch('/:id/revisoes/:revisaoId', orcamentoController.atualizarStatusRevisao);

// PUT    /api/orcamentos/:id/revisoes/:revisaoId -> edita tipo, valor, observação e/ou situação da revisão
router.put('/:id/revisoes/:revisaoId', orcamentoController.editarRevisao);

// GET    /api/orcamentos/:id/impacto-exclusao -> o que sai junto se o orçamento for excluído
router.get('/:id/impacto-exclusao', orcamentoController.obterImpactoExclusao);

// DELETE /api/orcamentos/:id -> exclui o orçamento (somente ADMIN; obra com execução exige ?forcar=true)
router.delete('/:id', orcamentoController.excluirOrcamento);

module.exports = router;

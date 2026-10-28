'use strict';

const { Router } = require('express');
const orcamentoController = require('../controllers/orcamentoController');
const { receberArquivos, processarFotosOrcamento } = require('../middlewares/uploadFotos');

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
router.post('/:id/revisoes', orcamentoController.adicionarRevisao);

module.exports = router;

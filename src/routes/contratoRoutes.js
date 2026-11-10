'use strict';

const { Router } = require('express');
const contratoController = require('../controllers/contratoController');
const { autorizar } = require('../middlewares/auth');
const { PERFIS_QUE_GEREM_CONTRATOS } = require('../services/contratoService');

const router = Router();

/**
 * Contratos com a Vale e Termos Aditivos (TAC) — base do Módulo de Medição e
 * Projeção Financeira. Leitura para qualquer perfil autenticado; cadastro,
 * aditivos e vínculo de obras só para SUPERVISOR/ADMIN.
 */

// GET  /api/contratos            -> contratos com aditivos, obras e saldo consolidado
router.get('/', contratoController.listarContratos);

// GET  /api/contratos/:id        -> um contrato com o mesmo consolidado
router.get('/:id', contratoController.obterContrato);

// POST /api/contratos            -> cadastra o contrato-mãe
// { id_vale, descricao, valor_inicial, data_inicio, data_fim }
router.post('/', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.criarContrato);

// POST /api/contratos/:id/tac    -> registra um Termo Aditivo e atualiza o teto
// { numero_tac, valor_aditivo, data_assinatura, motivo }
router.post('/:id/tac', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.registrarTac);

// POST /api/contratos/:id/obras  -> vincula obras ao contrato { obra_ids: [..] }
router.post('/:id/obras', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.vincularObras);

module.exports = router;

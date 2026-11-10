'use strict';

const { Router } = require('express');
const contratoController = require('../controllers/contratoController');
const { autorizar } = require('../middlewares/auth');
const { PERFIS_QUE_GEREM_CONTRATOS } = require('../services/contratoService');
const { PERFIS_QUE_GEREM_MEDICAO } = require('../services/medicaoService');

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

// GET  /api/contratos/:id/dashboard-medicao -> KPIs, aderência financeira, árvore BMM x SS e Curva S financeira
router.get('/:id/dashboard-medicao', contratoController.obterDashboardMedicao);

// POST /api/contratos            -> cadastra o contrato-mãe
// { id_vale, descricao, valor_inicial, data_inicio, data_fim }
router.post('/', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.criarContrato);

// POST /api/contratos/:id/tac    -> registra um Termo Aditivo e atualiza o teto
// { numero_tac, valor_aditivo, data_assinatura, motivo }
router.post('/:id/tac', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.registrarTac);

// POST /api/contratos/:id/obras  -> vincula obras ao contrato { obra_ids: [..] }
router.post('/:id/obras', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.vincularObras);

// Boletins de Medição (BMM) do contrato.
// POST   /api/contratos/:id/boletins -> { numero_bmm, mes_referencia | ciclo_inicio+ciclo_fim,
//                                         status?, observacao?, itens?: [{ obra_id, valor }], valor_medido? }
router.post('/:id/boletins', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.criarBoletim);
// PATCH  /api/contratos/:id/boletins/:boletimId -> aprova/rejeita ({ status }) ou ajusta a observação
router.patch('/:id/boletins/:boletimId', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.atualizarBoletim);
// DELETE /api/contratos/:id/boletins/:boletimId
router.delete('/:id/boletins/:boletimId', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.excluirBoletim);

module.exports = router;

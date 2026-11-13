'use strict';

const { Router } = require('express');
const contratoController = require('../controllers/contratoController');
const obraMedicaoController = require('../controllers/obraMedicaoController');
const projecaoBmmController = require('../controllers/projecaoBmmController');
const { autorizar } = require('../middlewares/auth');
const { uploadPlanilhasMedicao } = require('../config/multer');
const { PERFIS_QUE_GEREM_CONTRATOS } = require('../services/contratoService');
const { PERFIS_QUE_GEREM_MEDICAO } = require('../services/medicaoService');
const { PERFIS_QUE_GEREM_QQP } = require('../services/qqpService');
const { PERFIS_QUE_PROJETAM } = require('../services/projecaoBmmService');

const router = Router();

/**
 * Contratos com a Vale e Termos Aditivos (TAC) — base do Módulo de Medição e
 * Projeção Financeira. Leitura para qualquer perfil autenticado; cadastro,
 * aditivos e vínculo de obras só para SUPERVISOR/ADMIN.
 */

// POST /api/contratos/importar-medicao -> importa as planilhas do histórico de medição (pasta 13).
// multipart: medicao (medição bmm.csv), curva (Curva tendencia.csv); aplicar=true grava, senão só simula.
router.post('/importar-medicao', autorizar('ADMIN'), uploadPlanilhasMedicao, contratoController.importarMedicao);

// GET  /api/contratos            -> contratos com aditivos, obras e saldo consolidado
router.get('/', contratoController.listarContratos);

// GET  /api/contratos/:id        -> um contrato com o mesmo consolidado
router.get('/:id', contratoController.obterContrato);

// GET  /api/contratos/:id/dashboard-medicao -> KPIs, aderência financeira, árvore BMM x SS e Curva S financeira
router.get('/:id/dashboard-medicao', contratoController.obterDashboardMedicao);

// PUT    /api/contratos/:id -> corrige identificador, descrição, valor inicial e vigência
router.put('/:id', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.atualizarContrato);

// DELETE /api/contratos/:id -> exclui o contrato (ADMIN; com boletins/TACs exige ?forcar=true)
router.delete('/:id', autorizar('ADMIN'), contratoController.excluirContrato);

// POST /api/contratos            -> cadastra o contrato-mãe
// { id_vale, descricao, valor_inicial, data_inicio, data_fim }
router.post('/', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.criarContrato);

// POST /api/contratos/:id/tac    -> registra um Termo Aditivo e atualiza o teto
// { numero_tac, valor_aditivo, data_assinatura, motivo }
router.post('/:id/tac', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.registrarTac);

// PUT/DELETE /api/contratos/:id/tac/:tacId -> corrige ou remove um TAC (o teto é recalculado)
router.put('/:id/tac/:tacId', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.atualizarTac);
router.delete('/:id/tac/:tacId', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.excluirTac);

// POST /api/contratos/:id/obras  -> vincula obras ao contrato { obra_ids: [..] }
router.post('/:id/obras', autorizar(...PERFIS_QUE_GEREM_CONTRATOS), contratoController.vincularObras);

// QQP (Quadro de Quantidades e Preços) do contrato: itens com preço de HH, equipamentos e insumos.
// GET /api/contratos/:id/qqp | POST (codigo, descricao, categoria, unidade, preco_unitario)
// PUT/DELETE /api/contratos/:id/qqp/:itemId (item em uso só pode ser desativado)
router.get('/:id/qqp', obraMedicaoController.listarItensQqp);
router.post('/:id/qqp', autorizar(...PERFIS_QUE_GEREM_QQP), obraMedicaoController.criarItemQqp);
router.put('/:id/qqp/:itemId', autorizar(...PERFIS_QUE_GEREM_QQP), obraMedicaoController.atualizarItemQqp);
router.delete('/:id/qqp/:itemId', autorizar(...PERFIS_QUE_GEREM_QQP), obraMedicaoController.excluirItemQqp);

// Projeções de BMM (receita prevista por obra e ciclo 16→15, sobre os preços do QQP).
// GET  /api/contratos/:id/projecoes-bmm?referencia=AAAA-MM&obra=&tac=0|<id>|todos
// POST /api/contratos/:id/projecoes-bmm/calcular -> prévia (não grava)
// POST /api/contratos/:id/projecoes-bmm          -> { obra_id, termo_aditivo_id?, numero_bmm, referencia, observacao?,
//                                                    itens: [{ item_qqp_id, horas_dia?, semanas: [{ semana_inicio, dias, pessoas }] }] }
// GET  /api/contratos/:id/ciclos/:referencia/semanas -> semanas do ciclo e dias úteis
router.get('/:id/projecoes-bmm', projecaoBmmController.listar);
router.post('/:id/projecoes-bmm/calcular', projecaoBmmController.calcular);
router.post('/:id/projecoes-bmm', autorizar(...PERFIS_QUE_PROJETAM), projecaoBmmController.criar);
router.get('/:id/ciclos/:referencia/semanas', projecaoBmmController.semanasDoCiclo);

// Boletins de Medição (BMM) do contrato.
// POST   /api/contratos/:id/boletins -> { numero_bmm, mes_referencia | ciclo_inicio+ciclo_fim,
//                                         status?, observacao?, itens?: [{ obra_id, valor }], valor_medido? }
router.post('/:id/boletins', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.criarBoletim);
// PATCH  /api/contratos/:id/boletins/:boletimId -> aprova/rejeita ({ status }) ou ajusta a observação
router.patch('/:id/boletins/:boletimId', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.atualizarBoletim);
// Itens (SS) do boletim: incluir, corrigir o valor e remover; o valor medido do boletim acompanha.
router.post('/:id/boletins/:boletimId/itens', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.incluirItemBoletim);
router.put('/:id/boletins/:boletimId/itens/:itemId', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.atualizarItemBoletim);
router.delete('/:id/boletins/:boletimId/itens/:itemId', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.removerItemBoletim);
// Curva S do contrato: ajusta previsto, projetado ou tendência de um mês (PUT).
router.put('/:id/curva/:referencia', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.atualizarPrevistoDaCurva);
// Histórico da curva: volta um mês ao valor anterior a uma alteração.
router.post('/:id/curva/historico/:historicoId/restaurar', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.restaurarAlteracaoDaCurva);
// DELETE /api/contratos/:id/boletins/:boletimId
router.delete('/:id/boletins/:boletimId', autorizar(...PERFIS_QUE_GEREM_MEDICAO), contratoController.excluirBoletim);

module.exports = router;

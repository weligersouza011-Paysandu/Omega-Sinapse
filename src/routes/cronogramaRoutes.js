'use strict';

const { Router } = require('express');
const cronogramaController = require('../controllers/cronogramaController');
const { autorizar } = require('../middlewares/auth');
const { uploadCronograma } = require('../config/multer');
const { PERFIS_ENVIO } = require('../services/cronogramaService');

const router = Router();

/**
 * Ingestão e versionamento de cronogramas de obra (MS Project .mpp ou .xml).
 * Cada upload gera uma revisão imutável ("Rev 00", "Rev 01", ...).
 */

// POST /api/cronogramas/upload  (multipart/form-data: arquivo .mpp/.xml, obra_id, observacao?, data_snapshot?, forcar?)
// 409 ARQUIVO_DUPLICADO quando a mesma planilha já foi importada na obra (reenvie com forcar=true).
router.post(
  '/upload',
  autorizar(...PERFIS_ENVIO),
  uploadCronograma.single('arquivo'),
  cronogramaController.enviarCronograma
);

// GET  /api/cronogramas/obra/:obraId -> revisões da obra (sem atividades)
router.get('/obra/:obraId', cronogramaController.listarPorObra);

// GET  /api/cronogramas/obra/:obraId/historico -> importações, falhas e exclusões
router.get('/obra/:obraId/historico', cronogramaController.listarHistorico);

// GET  /api/cronogramas/:id          -> revisão completa (atividades, Curva S, histogramas)
router.get('/:id', cronogramaController.obterVersao);

// DELETE /api/cronogramas/:id        -> exclui a revisão (motivo opcional) e registra no histórico
router.delete('/:id', autorizar(...PERFIS_ENVIO), cronogramaController.excluirVersao);

module.exports = router;

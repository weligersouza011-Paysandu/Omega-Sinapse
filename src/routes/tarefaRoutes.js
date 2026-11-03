'use strict';

const { Router } = require('express');
const tarefaController = require('../controllers/tarefaController');

const router = Router();

/**
 * Gestão de demandas da equipe de planejamento.
 * Todos os perfis autenticados consultam; a escrita é permitida ao responsável
 * pela tarefa e aos perfis SUPERVISOR/ADMIN (validado no service).
 */

// GET    /api/tarefas?usuario_id=&status=&tipo=&obra_id=&de=&ate=&page=&limit=
router.get('/', tarefaController.listarTarefas);

// GET    /api/tarefas/carga-equipe?de=&ate=
// Declarada antes de "/:id" para não ser capturada pelo parâmetro de rota.
router.get('/carga-equipe', tarefaController.cargaEquipe);

// POST   /api/tarefas          -> cria (rotinas fixas calculam o próximo vencimento)
router.post('/', tarefaController.criarTarefa);

// GET    /api/tarefas/:id
router.get('/:id', tarefaController.obterTarefa);

// PUT    /api/tarefas/:id      -> edição parcial/total
router.put('/:id', tarefaController.atualizarTarefa);

// PATCH  /api/tarefas/:id/status -> { status, justificativa_atraso? }
router.patch('/:id/status', tarefaController.alterarStatus);

// DELETE /api/tarefas/:id
router.delete('/:id', tarefaController.removerTarefa);

module.exports = router;

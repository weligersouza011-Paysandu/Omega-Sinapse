'use strict';

const { Router } = require('express');
const obraController = require('../controllers/obraController');
const { autorizar } = require('../middlewares/auth');

const router = Router();

// GET    /api/obras            -> lista as obras (projetos em execução)
router.get('/', obraController.listarObras);

// GET    /api/obras/planejadores -> técnicos planejadores ativos (atribuição)
// Declarada antes de "/:id" para não ser capturada pelo parâmetro de rota.
router.get('/planejadores', autorizar('SUPERVISOR', 'ADMIN'), obraController.listarPlanejadores);

// GET    /api/obras/:id        -> detalhe da obra (projeto, fiscais e revisões)
router.get('/:id', obraController.obterObra);

// PUT    /api/obras/:id        -> status operacional, planejador, Ata e observações
// (o RBAC por campo é validado no service: planejador_id só para SUPERVISOR/ADMIN)
router.put('/:id', obraController.atualizarObra);

// POST   /api/obras/:id/osi    -> registra a emissão da OSI
router.post('/:id/osi', obraController.registrarOsi);

module.exports = router;

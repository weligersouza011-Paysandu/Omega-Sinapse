'use strict';

const { Router } = require('express');
const usuarioController = require('../controllers/usuarioController');
const { autorizar } = require('../middlewares/auth');

const router = Router();

/**
 * Gestão de Usuários (governança ISO 9001) — restrita ao perfil ADMIN.
 *
 * O middleware `autorizar('ADMIN')` é aplicado a todas as rotas abaixo; a
 * listagem de planejadores usada na atribuição de obras NÃO fica aqui (ela é
 * exposta em /api/obras/planejadores, acessível também ao Supervisor).
 */

// GET    /api/usuarios        -> lista com paginação e filtros
router.get('/', autorizar('ADMIN'), usuarioController.listarUsuarios);

// POST   /api/usuarios        -> cadastra colaborador (nome, matrícula, e-mail, senha, perfil)
router.post('/', autorizar('ADMIN'), usuarioController.criarUsuario);

// PUT    /api/usuarios/:id    -> atualiza dados cadastrais e status (ativo)
router.put('/:id', autorizar('ADMIN'), usuarioController.atualizarUsuario);

// PUT    /api/usuarios/:id/senha -> redefine a senha do colaborador
router.put('/:id/senha', autorizar('ADMIN'), usuarioController.atualizarSenha);

module.exports = router;

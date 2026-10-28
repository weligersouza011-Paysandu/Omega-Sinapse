'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');

const router = Router();

// POST /api/auth/login -> rota PÚBLICA (não exige token)
router.post('/login', authController.login);

// GET  /api/auth/me    -> rota PROTEGIDA (exige token válido)
router.get('/me', autenticar, authController.me);

module.exports = router;

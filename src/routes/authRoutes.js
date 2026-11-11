'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const meuPerfilService = require('../services/meuPerfilService');
const upload = require('../config/multer');
const { autenticar } = require('../middlewares/auth');

const router = Router();

/** Encapsula um caso de uso do Meu perfil (responde JSON e repassa erros). */
const acao = (executar, status = 200) => async (req, res, next) => {
  try {
    return res.status(status).json(await executar(req));
  } catch (err) {
    return next(err);
  }
};

// POST /api/auth/login -> rota PÚBLICA (não exige token)
router.post('/login', authController.login);

// GET  /api/auth/me    -> rota PROTEGIDA (exige token válido)
router.get('/me', autenticar, authController.me);

// Meu perfil (o próprio usuário, qualquer perfil — inclusive Cliente). Perfil de acesso, e-mail e
// páginas liberadas só mudam na Gestão de Usuários.
router.get('/perfil', autenticar, acao((req) => meuPerfilService.obterMeuPerfil(req.user)));
router.put('/perfil', autenticar, acao((req) => meuPerfilService.atualizarMeuPerfil(req.user, req.body || {})));
router.post(
  '/perfil/foto',
  autenticar,
  upload.single('foto'),
  acao((req) => meuPerfilService.definirMinhaFoto(req.user, req.file))
);
router.delete('/perfil/foto', autenticar, acao((req) => meuPerfilService.removerMinhaFoto(req.user)));
router.put('/perfil/senha', autenticar, acao((req) => meuPerfilService.alterarMinhaSenha(req.user, req.body || {})));

module.exports = router;

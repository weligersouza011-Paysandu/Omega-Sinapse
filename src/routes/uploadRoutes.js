'use strict';

const { Router } = require('express');
const upload = require('../config/multer');
const uploadController = require('../controllers/uploadController');

const router = Router();

// POST /api/uploads/fotos -> até 3 imagens no campo "fotos"
router.post('/fotos', upload.array('fotos', 3), uploadController.uploadFotos);

// POST /api/uploads/documento -> 1 documento (imagem ou PDF) no campo "documento"
router.post('/documento', upload.uploadDocumento.single('documento'), uploadController.uploadDocumento);

module.exports = router;

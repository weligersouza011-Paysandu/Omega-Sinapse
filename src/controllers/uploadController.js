'use strict';

const AppError = require('../errors/AppError');
const uploadService = require('../services/uploadService');

/**
 * POST /api/uploads/fotos
 * Recebe até 3 imagens no campo "fotos" (multipart/form-data), otimiza
 * (WebP + compressão) e envia ao Cloudinary.
 * Retorna as URLs prontas para uso nos campos foto_1 / foto_2 / foto_3.
 */
async function uploadFotos(req, res, next) {
  try {
    const arquivos = req.files || [];

    if (arquivos.length === 0) {
      throw new AppError(400, 'Nenhuma imagem enviada. Use o campo "fotos" no multipart/form-data (1 a 3 arquivos).');
    }

    const fotos = await uploadService.processarFotos(arquivos, {
      pasta: process.env.CLOUDINARY_FOLDER || uploadService.PASTA_PADRAO,
    });

    const resposta = {
      total: fotos.length,
      fotos,
      foto_1: fotos[0] ? fotos[0].url : null,
      foto_2: fotos[1] ? fotos[1].url : null,
      foto_3: fotos[2] ? fotos[2].url : null,
    };

    return res.status(201).json(resposta);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/uploads/documento
 * Recebe um documento comprobatório (imagem ou PDF) no campo "documento"
 * (multipart/form-data) e devolve a URL pública no Cloudinary.
 * Usado no anexo da Ata de Reunião de Partida (ISO 9001).
 */
async function uploadDocumento(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError(400, 'Nenhum arquivo enviado. Use o campo "documento" no multipart/form-data.');
    }

    const documento = await uploadService.processarDocumento(req.file, {
      pasta: process.env.CLOUDINARY_FOLDER_OBRAS || 'synapse/obras',
    });

    return res.status(201).json(documento);
  } catch (err) {
    return next(err);
  }
}

module.exports = { uploadFotos, uploadDocumento };

'use strict';

const AppError = require('../errors/AppError');
const upload = require('../config/multer');
const uploadService = require('../services/uploadService');

/** Campos de foto aceitos na criação/edição de orçamentos. */
const CAMPOS_FOTO = ['foto_1', 'foto_2', 'foto_3'];

/**
 * Middleware de integração: permite criar/editar orçamentos enviando as fotos
 * diretamente como arquivos (multipart/form-data) nos campos foto_1, foto_2 e foto_3.
 *
 * Regras:
 *  - As fotos são otimizadas (WebP) e enviadas ao Cloudinary;
 *  - As URLs geradas substituem os valores correspondentes em req.body;
 *  - Se nenhum arquivo for enviado, a requisição segue normalmente com as URLs
 *    enviadas em JSON (compatível com upload prévio via POST /api/uploads/fotos);
 *  - Quando há arquivos, a "foto_1" é obrigatória.
 */
const receberArquivos = upload.fields([
  { name: 'foto_1', maxCount: 1 },
  { name: 'foto_2', maxCount: 1 },
  { name: 'foto_3', maxCount: 1 },
]);

async function processarFotosOrcamento(req, res, next) {
  try {
    const arquivos = req.files || {};

    const temArquivo = CAMPOS_FOTO.some((campo) => arquivos[campo] && arquivos[campo].length > 0);
    if (!temArquivo) {
      return next();
    }

    if (!arquivos.foto_1 || arquivos.foto_1.length === 0) {
      throw new AppError(400, 'A "foto_1" é obrigatória quando as imagens são enviadas como arquivo.');
    }

    const pasta = process.env.CLOUDINARY_FOLDER || uploadService.PASTA_PADRAO;
    const urls = {};

    for (const campo of CAMPOS_FOTO) {
      if (arquivos[campo] && arquivos[campo].length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const enviado = await uploadService.processarFoto(arquivos[campo][0], { pasta });
        urls[campo] = enviado.url;
      }
    }

    req.body = { ...req.body, ...urls };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { receberArquivos, processarFotosOrcamento, CAMPOS_FOTO };

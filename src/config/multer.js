'use strict';

const multer = require('multer');
const AppError = require('../errors/AppError');

/** Tipos MIME de imagem aceitos no upload. */
const MIME_TIPOS_ACEITOS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const TAMANHO_MAXIMO_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024); // 10 MB

/** Tipos MIME aceitos em documentos (Ata de Reunião de Partida): imagens + PDF. */
const MIME_DOCUMENTOS = [...MIME_TIPOS_ACEITOS, 'application/pdf'];

/**
 * Armazenamento em memória: o buffer é processado com sharp (WebP/compressão)
 * e enviado ao Cloudinary via stream, sem gravar arquivos temporários no disco.
 */
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (MIME_TIPOS_ACEITOS.includes(file.mimetype)) {
    return cb(null, true);
  }
  return cb(
    new AppError(400, `Formato de arquivo não suportado (${file.mimetype}). Envie imagens JPG, PNG, WEBP ou HEIC.`)
  );
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: TAMANHO_MAXIMO_BYTES,
    files: 3,
  },
});

/**
 * Upload de documentos comprobatórios (Ata de Reunião de Partida).
 * Aceita imagens e PDF; um único arquivo por requisição.
 */
const uploadDocumento = multer({
  storage,
  fileFilter(req, file, cb) {
    if (MIME_DOCUMENTOS.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(
      new AppError(400, `Formato não suportado (${file.mimetype}). Envie uma imagem (JPG, PNG, WEBP) ou um PDF.`)
    );
  },
  limits: {
    fileSize: TAMANHO_MAXIMO_BYTES,
    files: 1,
  },
});

/** Planilhas do cronograma (modelo padrão): .xlsx, .xlsm e .xls. */
const MIME_PLANILHAS = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel',
];
const EXTENSOES_PLANILHA = /\.(xlsx|xlsm|xls)$/i;
const TAMANHO_MAXIMO_PLANILHA = Number(process.env.CRONOGRAMA_MAX_BYTES || 25 * 1024 * 1024); // 25 MB

const uploadPlanilha = multer({
  storage,
  fileFilter(req, file, cb) {
    // Alguns navegadores enviam .xlsx como application/octet-stream: vale a extensão.
    if (MIME_PLANILHAS.includes(file.mimetype) || EXTENSOES_PLANILHA.test(file.originalname || '')) {
      return cb(null, true);
    }
    return cb(
      new AppError(400, `Formato não suportado (${file.mimetype}). Envie a planilha do cronograma em Excel (.xlsx).`)
    );
  },
  limits: {
    fileSize: TAMANHO_MAXIMO_PLANILHA,
    files: 1,
  },
});

module.exports = upload;
module.exports.upload = upload;
module.exports.uploadPlanilha = uploadPlanilha;
module.exports.MIME_PLANILHAS = MIME_PLANILHAS;
module.exports.uploadDocumento = uploadDocumento;
module.exports.MIME_TIPOS_ACEITOS = MIME_TIPOS_ACEITOS;
module.exports.MIME_DOCUMENTOS = MIME_DOCUMENTOS;
module.exports.TAMANHO_MAXIMO_BYTES = TAMANHO_MAXIMO_BYTES;

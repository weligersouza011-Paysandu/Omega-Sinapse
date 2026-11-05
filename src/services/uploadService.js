'use strict';

const sharp = require('sharp');
const cloudinary = require('../config/cloudinary');
const { estadoCloudinary } = require('../config/cloudinary');
const AppError = require('../errors/AppError');

/** Falha antes de chamar o Cloudinary quando as credenciais estão inválidas. */
function garantirConfigurado() {
  if (!estadoCloudinary.configurado) {
    throw new AppError(
      503,
      `Armazenamento de arquivos (Cloudinary) indisponível: ${estadoCloudinary.problemas.join(' ')} Avise o administrador do sistema.`
    );
  }
}

/** Traduz erros do Cloudinary em mensagens úteis (sem expor credenciais). */
function erroCloudinary(err, oQue) {
  const mensagem = String(err?.message || err || '');
  if (/cloud_name|api_key|api_secret|signature|unknown api key|invalid credentials/i.test(mensagem) || err?.http_code === 401) {
    return new AppError(
      503,
      `Falha de credenciais do Cloudinary ao enviar ${oQue} (${mensagem}). Verifique CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no servidor.`
    );
  }
  return new AppError(502, `Falha ao enviar ${oQue} para o Cloudinary: ${mensagem}`);
}

const LARGURA_MAXIMA = Number(process.env.UPLOAD_MAX_WIDTH || 1920);
const QUALIDADE_WEBP = Number(process.env.UPLOAD_WEBP_QUALITY || 80);
const PASTA_PADRAO = process.env.CLOUDINARY_FOLDER || 'synapse/orcamentos';

/**
 * Comprime e converte a imagem para WebP em memória.
 * Redimensiona proporcionalmente respeitando a largura máxima (sem ampliar imagens menores).
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function otimizarParaWebp(buffer) {
  try {
    return await sharp(buffer)
      .rotate() // corrige orientação EXIF
      .resize({
        width: LARGURA_MAXIMA,
        height: LARGURA_MAXIMA,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: QUALIDADE_WEBP })
      .toBuffer();
  } catch (err) {
    throw new AppError(400, 'Não foi possível processar a imagem enviada. Verifique se o arquivo é uma imagem válida.');
  }
}

/**
 * Envia um buffer para o Cloudinary via upload_stream.
 * @param {Buffer} buffer
 * @param {{pasta?:string, publicId?:string}} opcoes
 * @returns {Promise<{url:string, public_id:string, bytes:number, width:number, height:number}>}
 */
function enviarParaCloudinary(buffer, { pasta = PASTA_PADRAO, publicId } = {}) {
  garantirConfigurado();
  return new Promise((resolve, reject) => {
    const opcoes = {
      folder: pasta,
      resource_type: 'image',
      format: 'webp',
      overwrite: true,
      invalidate: true,
    };
    if (publicId) {
      opcoes.public_id = publicId;
    }

    const stream = cloudinary.uploader.upload_stream(opcoes, (err, result) => {
      if (err) {
        return reject(erroCloudinary(err, 'a imagem'));
      }
      return resolve({
        url: result.secure_url,
        public_id: result.public_id,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
      });
    });

    stream.end(buffer);
  });
}

/**
 * Processa um único arquivo (multer memoryStorage): otimiza para WebP e envia ao Cloudinary.
 * @param {{buffer:Buffer, originalname:string, mimetype:string, size:number}} file
 * @param {{pasta?:string, publicId?:string}} opcoes
 */
async function processarFoto(file, opcoes = {}) {
  if (!file || !file.buffer) {
    throw new AppError(400, 'Arquivo de imagem inválido ou vazio.');
  }

  const bufferOtimizado = await otimizarParaWebp(file.buffer);
  const enviado = await enviarParaCloudinary(bufferOtimizado, opcoes);

  return {
    ...enviado,
    original: file.originalname,
    tamanho_original_bytes: file.size,
  };
}

/**
 * Processa uma lista de arquivos mantendo a ordem de envio.
 * @param {Array} files
 * @param {{pasta?:string}} opcoes
 */
async function processarFotos(files = [], opcoes = {}) {
  const resultados = [];
  for (const file of files) {
    // Processamento sequencial para não estourar CPU/memória com muitos uploads simultâneos.
    // eslint-disable-next-line no-await-in-loop
    resultados.push(await processarFoto(file, opcoes));
  }
  return resultados;
}

/** Tipos MIME tratados como imagem (passam por sharp antes do upload). */
const MIMES_IMAGEM = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

/** Validade do link de PDF: o documento precisa continuar acessível na obra. */
const VALIDADE_LINK_PDF_SEGUNDOS = 10 * 365 * 24 * 60 * 60;

/**
 * URL para abrir o arquivo enviado. A conta do Cloudinary bloqueia a entrega
 * direta de PDF (401 "deny or ACL failure", mesmo com URL assinada), então o PDF
 * é servido pela API de download, que não depende dessa restrição.
 */
function urlDeAcesso(result) {
  if (result.format !== 'pdf') return result.secure_url;
  return cloudinary.utils.private_download_url(result.public_id, 'pdf', {
    resource_type: result.resource_type,
    type: result.type,
    expires_at: Math.floor(Date.now() / 1000) + VALIDADE_LINK_PDF_SEGUNDOS,
  });
}

/**
 * Envia um buffer sem conversão (ex.: PDF) ao Cloudinary.
 * @param {Buffer} buffer
 * @param {{pasta?:string}} opcoes
 */
function enviarDocumento(buffer, { pasta = PASTA_PADRAO } = {}) {
  garantirConfigurado();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: pasta, resource_type: 'auto' },
      (err, result) => {
        if (err) {
          return reject(erroCloudinary(err, 'o documento'));
        }
        return resolve({
          url: urlDeAcesso(result),
          public_id: result.public_id,
          bytes: result.bytes,
          formato: result.format,
        });
      }
    );

    stream.end(buffer);
  });
}

/**
 * Processa um documento comprobatório (Ata de Reunião de Partida).
 * Imagens são otimizadas (WebP); PDFs são enviados na íntegra.
 * @param {{buffer:Buffer, originalname:string, mimetype:string, size:number}} file
 * @param {{pasta?:string}} opcoes
 */
async function processarDocumento(file, opcoes = {}) {
  if (!file || !file.buffer) {
    throw new AppError(400, 'Arquivo de documento inválido ou vazio.');
  }

  const ehImagem = MIMES_IMAGEM.includes(file.mimetype);
  const enviado = ehImagem
    ? await enviarParaCloudinary(await otimizarParaWebp(file.buffer), opcoes)
    : await enviarDocumento(file.buffer, opcoes);

  return {
    ...enviado,
    original: file.originalname,
    tipo: ehImagem ? 'imagem' : 'documento',
    tamanho_original_bytes: file.size,
  };
}

module.exports = {
  garantirConfigurado,
  otimizarParaWebp,
  enviarParaCloudinary,
  processarFoto,
  processarFotos,
  processarDocumento,
  PASTA_PADRAO,
};

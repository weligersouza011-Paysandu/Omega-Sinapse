'use strict';

const { v2: cloudinary } = require('cloudinary');

/**
 * Configuração do Cloudinary a partir do ambiente.
 *
 * Aceita as variáveis separadas (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 * CLOUDINARY_API_SECRET) ou a URL única do painel do Cloudinary
 * (CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>).
 *
 * Os valores são saneados antes do uso: espaços, aspas e o "@" que sobra ao
 * copiar o final da CLOUDINARY_URL (ex.: "@jwgicw54" → "jwgicw54"). Problemas
 * de configuração não derrubam a aplicação: ficam em `estadoCloudinary` e cada
 * upload responde com uma mensagem clara (ver uploadService.garantirConfigurado).
 * Nenhum segredo é registrado nos logs.
 */

/** Remove espaços, aspas envolventes e quebras de linha coladas por engano. */
function limpar(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

/** "cloudinary://chave:segredo@nuvem" → { cloud_name, api_key, api_secret }. */
function lerUrl(url) {
  const match = limpar(url).match(/^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([^/?\s]+)/i);
  if (!match) return null;
  return { api_key: match[1], api_secret: match[2], cloud_name: match[3] };
}

/** Nome de nuvem: aceita também uma URL colada inteira ou "@nome". */
function sanearCloudName(valor, ajustes) {
  let nome = limpar(valor);
  if (!nome) return '';
  const daUrl = lerUrl(nome);
  if (daUrl) {
    ajustes.push('CLOUDINARY_CLOUD_NAME continha a CLOUDINARY_URL inteira; usado apenas o nome da nuvem.');
    return daUrl.cloud_name;
  }
  if (nome.includes('@')) {
    nome = nome.slice(nome.lastIndexOf('@') + 1);
    ajustes.push('CLOUDINARY_CLOUD_NAME continha "@"; o caractere foi removido.');
  }
  return nome.trim();
}

function montarConfiguracao(ambiente = process.env) {
  const ajustes = [];
  const problemas = [];
  const daUrl = ambiente.CLOUDINARY_URL ? lerUrl(ambiente.CLOUDINARY_URL) : null;
  if (ambiente.CLOUDINARY_URL && !daUrl) {
    problemas.push('CLOUDINARY_URL fora do formato cloudinary://<api_key>:<api_secret>@<cloud_name>.');
  }

  const config = {
    cloud_name: sanearCloudName(ambiente.CLOUDINARY_CLOUD_NAME, ajustes) || daUrl?.cloud_name || '',
    api_key: limpar(ambiente.CLOUDINARY_API_KEY) || daUrl?.api_key || '',
    api_secret: limpar(ambiente.CLOUDINARY_API_SECRET) || daUrl?.api_secret || '',
  };

  if (!config.cloud_name) problemas.push('CLOUDINARY_CLOUD_NAME ausente.');
  else if (!/^[a-z0-9_-]+$/i.test(config.cloud_name)) {
    problemas.push(`CLOUDINARY_CLOUD_NAME inválido ("${config.cloud_name}"): use apenas letras, números, "-" ou "_".`);
  }
  if (!config.api_key) problemas.push('CLOUDINARY_API_KEY ausente.');
  else if (!/^\d+$/.test(config.api_key)) problemas.push('CLOUDINARY_API_KEY deve conter apenas números.');
  if (!config.api_secret) problemas.push('CLOUDINARY_API_SECRET ausente.');

  return { config, ajustes, problemas };
}

const { config, ajustes, problemas } = montarConfiguracao();

ajustes.forEach((ajuste) => console.warn(`[cloudinary] ⚠️ ${ajuste} Corrija a variável no ambiente (Render/.env).`));
if (problemas.length) {
  console.warn(`[cloudinary] ⚠️ Configuração inválida — uploads ficarão indisponíveis: ${problemas.join(' ')}`);
} else {
  console.log(`[cloudinary] Configurado para a nuvem "${config.cloud_name}".`);
}

cloudinary.config({ ...config, secure: true });

/** Estado da configuração (sem segredos), usado pelos uploads e pelo /health. */
const estadoCloudinary = Object.freeze({
  configurado: problemas.length === 0,
  cloud_name: config.cloud_name || null,
  ajustes: Object.freeze([...ajustes]),
  problemas: Object.freeze([...problemas]),
});

module.exports = cloudinary;
module.exports.estadoCloudinary = estadoCloudinary;
module.exports.montarConfiguracao = montarConfiguracao;

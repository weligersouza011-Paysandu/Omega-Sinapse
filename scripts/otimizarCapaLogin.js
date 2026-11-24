'use strict';

/**
 * Otimiza os quadros da capa animada do login.
 *
 * Lê `Omega LOGO/CAPA Login/*.jpg` (quadros originais, ~450 KB cada) e grava versões WebP leves em
 * `frontend/public/brand/capa/quadro-01.webp ...` (largura 1280 px). A tela de login reproduz a sequência
 * em loop (frontend/src/components/CapaLoginAnimada.jsx).
 *
 *   node scripts/otimizarCapaLogin.js
 *
 * Para trocar a capa: substitua os quadros na pasta de origem (ordem alfabética = ordem da animação)
 * e rode o script de novo. O número de quadros é lido de `quadros.json`, gerado junto.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'Omega LOGO', 'CAPA Login');
const DESTINO = path.join(RAIZ, 'frontend', 'public', 'brand', 'capa');
const LARGURA = Number(process.env.CAPA_LARGURA || 1280);
const QUALIDADE = Number(process.env.CAPA_QUALIDADE || 72);

async function main() {
  if (!fs.existsSync(ORIGEM)) {
    console.error(`Pasta de origem não encontrada: ${ORIGEM}`);
    process.exit(1);
  }
  const arquivos = fs
    .readdirSync(ORIGEM)
    .filter((nome) => /\.(jpe?g|png)$/i.test(nome))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!arquivos.length) {
    console.error('Nenhum quadro (.jpg/.png) encontrado na pasta de origem.');
    process.exit(1);
  }

  fs.rmSync(DESTINO, { recursive: true, force: true });
  fs.mkdirSync(DESTINO, { recursive: true });

  let bytesOriginais = 0;
  let bytesFinais = 0;
  for (let i = 0; i < arquivos.length; i += 1) {
    const entrada = path.join(ORIGEM, arquivos[i]);
    const saida = path.join(DESTINO, `quadro-${String(i + 1).padStart(2, '0')}.webp`);
    // eslint-disable-next-line no-await-in-loop
    const info = await sharp(entrada).resize({ width: LARGURA, withoutEnlargement: true }).webp({ quality: QUALIDADE }).toFile(saida);
    bytesOriginais += fs.statSync(entrada).size;
    bytesFinais += info.size;
  }

  fs.writeFileSync(path.join(DESTINO, 'quadros.json'), JSON.stringify({ quadros: arquivos.length }, null, 2));
  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(`${arquivos.length} quadros: ${mb(bytesOriginais)} MB → ${mb(bytesFinais)} MB em ${path.relative(RAIZ, DESTINO)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

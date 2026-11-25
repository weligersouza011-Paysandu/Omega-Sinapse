'use strict';

/**
 * Gera o vídeo da capa animada do login.
 *
 * Lê `Omega LOGO/CAPA Login/*.jpg` (quadros originais, ordem alfabética = ordem da animação) e grava em
 * `frontend/public/brand/capa/`:
 *   - capa.mp4 (H.264): vídeo em loop, sem áudio, com interpolação de movimento
 *     entre os quadros (fica fluido mesmo com poucos quadros por segundo na origem);
 *   - capa-poster.webp: primeiro quadro, exibido enquanto o vídeo carrega.
 *
 * O loop é "sem emenda": os últimos quadros se dissolvem nos primeiros já no arquivo, então o fim do
 * vídeo encaixa no começo. A tela de login só reproduz (frontend/src/components/CapaLoginAnimada.jsx).
 *
 *   npm i --no-save ffmpeg-static   (uma vez; ou aponte FFMPEG=/caminho/do/ffmpeg)
 *   node scripts/otimizarCapaLogin.js
 *
 * Ajustes por variável de ambiente: CAPA_LARGURA (1280), CAPA_FPS_ORIGEM (10 quadros/s da sequência),
 * CAPA_FPS (30 do vídeo final), CAPA_EMENDA (8 quadros de dissolução no fechamento do loop).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'Omega LOGO', 'CAPA Login');
const DESTINO = path.join(RAIZ, 'frontend', 'public', 'brand', 'capa');
const LARGURA = Number(process.env.CAPA_LARGURA || 1280);
const FPS_ORIGEM = Number(process.env.CAPA_FPS_ORIGEM || 10);
const FPS = Number(process.env.CAPA_FPS || 30);
const EMENDA = Number(process.env.CAPA_EMENDA || 8);

function localizarFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    // eslint-disable-next-line global-require
    return require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
}

/** Lê um quadro redimensionado como pixels RGB crus. */
function lerQuadro(arquivo) {
  return sharp(path.join(ORIGEM, arquivo))
    .resize({ width: LARGURA, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/** Mistura dois quadros: (1 - alfa) * a + alfa * b. */
function misturar(a, b, alfa) {
  const saida = Buffer.allocUnsafe(a.length);
  for (let i = 0; i < a.length; i += 1) saida[i] = Math.round(a[i] * (1 - alfa) + b[i] * alfa);
  return saida;
}

async function main() {
  if (!fs.existsSync(ORIGEM)) {
    console.error(`Pasta de origem não encontrada: ${ORIGEM}`);
    process.exit(1);
  }
  const arquivos = fs
    .readdirSync(ORIGEM)
    .filter((nome) => /\.(jpe?g|png)$/i.test(nome))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (arquivos.length < EMENDA * 2 + 2) {
    console.error(`Poucos quadros na pasta de origem (${arquivos.length}).`);
    process.exit(1);
  }

  const ffmpeg = localizarFfmpeg();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-login-'));
  try {
    // 1) Sequência com emenda: começa no quadro EMENDA e, nos últimos EMENDA quadros, dissolve
    //    progressivamente nos quadros 0..EMENDA-1. Assim o último quadro "anda" para o primeiro.
    const n = arquivos.length;
    const saidaTotal = n - EMENDA;
    let info = null;
    for (let j = 0; j < saidaTotal; j += 1) {
      // eslint-disable-next-line no-await-in-loop
      const atual = await lerQuadro(arquivos[EMENDA + j]);
      info = atual.info;
      let pixels = atual.data;
      const k = j - (saidaTotal - EMENDA);
      if (k >= 0) {
        // eslint-disable-next-line no-await-in-loop
        const inicio = await lerQuadro(arquivos[k]);
        pixels = misturar(pixels, inicio.data, (k + 1) / (EMENDA + 1));
      }
      // eslint-disable-next-line no-await-in-loop
      await sharp(pixels, { raw: info }).jpeg({ quality: 94 }).toFile(path.join(temp, `q${String(j).padStart(4, '0')}.jpg`));
    }
    // Repete o primeiro quadro no fim só para a interpolação ligar o fim ao começo; ele é descartado.
    fs.copyFileSync(path.join(temp, 'q0000.jpg'), path.join(temp, `q${String(saidaTotal).padStart(4, '0')}.jpg`));

    // 2) Interpolação de movimento até FPS, já cortando o quadro repetido do fim.
    const quadrosFinais = Math.round((saidaTotal * FPS) / FPS_ORIGEM);
    const filtro = [
      `minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=fdiff:scd_threshold=12`,
      'format=yuv420p',
    ].join(',');
    const entrada = ['-y', '-loglevel', 'error', '-framerate', String(FPS_ORIGEM), '-i', path.join(temp, 'q%04d.jpg')];
    const intermediario = path.join(temp, 'interpolado.mkv');
    console.log(`Interpolando ${saidaTotal} quadros → ${quadrosFinais} a ${FPS} fps (pode levar alguns minutos)...`);
    execFileSync(ffmpeg, [...entrada, '-vf', filtro, '-frames:v', String(quadrosFinais), '-c:v', 'ffv1', intermediario], { stdio: 'inherit' });

    fs.rmSync(DESTINO, { recursive: true, force: true });
    fs.mkdirSync(DESTINO, { recursive: true });

    // 3) Codificação final em H.264 (toca em qualquer navegador). Nas imagens aéreas o VP9 saiu maior
    //    que o H.264 com qualidade parecida, por isso não geramos WebM. CRF 32 basta: o vídeo fica sob o
    //    véu vinho do painel.
    const mp4 = path.join(DESTINO, 'capa.mp4');
    console.log('Codificando MP4...');
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', intermediario, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '32', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });

    await sharp(path.join(temp, 'q0000.jpg')).webp({ quality: 72 }).toFile(path.join(DESTINO, 'capa-poster.webp'));

    const mb = (arquivo) => (fs.statSync(arquivo).size / 1024 / 1024).toFixed(2);
    const segundos = (quadrosFinais / FPS).toFixed(1);
    console.log(`${n} quadros → vídeo de ${segundos}s: capa.mp4 ${mb(mp4)} MB em ${path.relative(RAIZ, DESTINO)}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

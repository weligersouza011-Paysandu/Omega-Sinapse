import { useEffect, useRef, useState } from 'react';

/** Quadros por segundo da sequência original (a transição entre quadros é suavizada). */
const QUADROS_POR_SEGUNDO = 10;
/** Quantos "passos" dura a dissolução do último quadro para o primeiro, no fechamento do loop. */
const PASSOS_DA_EMENDA = 6;
/** Ponto de foco horizontal do enquadramento (0 = esquerda). Mantém a marca d'água do vídeo fora de cena. */
const FOCO_X = 0.3;

const caminho = (n) => `/brand/capa/quadro-${String(n).padStart(2, '0')}.webp`;

/** Carrega uma imagem e resolve com ela (ou null em caso de falha). */
function carregar(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Desenha a imagem preenchendo o canvas (equivalente a object-fit: cover, com foco horizontal). */
function desenhar(ctx, img, largura, altura) {
  const escala = Math.max(largura / img.naturalWidth, altura / img.naturalHeight);
  const w = img.naturalWidth * escala;
  const h = img.naturalHeight * escala;
  ctx.drawImage(img, -(w - largura) * FOCO_X, (altura - h) / 2, w, h);
}

/**
 * Capa animada da tela de login: os quadros de `public/brand/capa` (gerados por
 * `scripts/otimizarCapaLogin.js`) rodam em loop contínuo, com interpolação entre quadros e uma
 * dissolução no fechamento do ciclo. Só carrega em telas largas, respeita "reduzir movimento" e
 * mostra a foto estática enquanto os quadros baixam.
 */
export default function CapaLoginAnimada({ estatica = '/brand/campo-painel.jpg' }) {
  const canvasRef = useRef(null);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    // No celular o painel nem aparece: não gasta dados baixando os quadros.
    if (!window.matchMedia('(min-width: 1024px)').matches) return undefined;
    const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let ativo = true;
    let frameId = 0;
    const ctx = canvas.getContext('2d');

    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(canvas);

    (async () => {
      let total = 25;
      try {
        const resposta = await fetch('/brand/capa/quadros.json');
        if (resposta.ok) total = (await resposta.json()).quadros || total;
      } catch {
        /* usa o padrão */
      }

      // O primeiro quadro entra logo; os demais baixam em paralelo.
      const primeiro = await carregar(caminho(1));
      if (!ativo || !primeiro) return;
      desenhar(ctx, primeiro, canvas.width, canvas.height);
      setPronta(true);
      if (reduzirMovimento) return;

      const restantes = await Promise.all(Array.from({ length: total - 1 }, (_, i) => carregar(caminho(i + 2))));
      if (!ativo || restantes.some((img) => !img)) return;
      const quadros = [primeiro, ...restantes];

      const ciclo = total - 1 + PASSOS_DA_EMENDA;
      const inicio = performance.now();

      const passo = (agora) => {
        if (!ativo) return;
        const t = (((agora - inicio) / 1000) * QUADROS_POR_SEGUNDO) % ciclo;
        const { width, height } = canvas;
        ctx.globalAlpha = 1;
        if (t < total - 1) {
          // Movimento normal: mistura o quadro atual com o próximo conforme a fração do tempo.
          const i = Math.floor(t);
          desenhar(ctx, quadros[i], width, height);
          ctx.globalAlpha = t - i;
          desenhar(ctx, quadros[i + 1], width, height);
        } else {
          // Emenda do loop: o último quadro se dissolve no primeiro.
          desenhar(ctx, quadros[total - 1], width, height);
          ctx.globalAlpha = (t - (total - 1)) / PASSOS_DA_EMENDA;
          desenhar(ctx, quadros[0], width, height);
        }
        frameId = requestAnimationFrame(passo);
      };
      frameId = requestAnimationFrame(passo);
    })();

    return () => {
      ativo = false;
      cancelAnimationFrame(frameId);
      observador.disconnect();
    };
  }, []);

  return (
    <>
      <img src={estatica} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[18%_50%]" />
      <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${pronta ? 'opacity-100' : 'opacity-0'}`} />
    </>
  );
}

import { useEffect, useRef, useState } from 'react';

const VIDEO = '/brand/capa/capa.mp4';
const POSTER = '/brand/capa/capa-poster.webp';

/**
 * Capa animada da tela de login: vídeo aéreo das obras em loop (gerado por
 * `scripts/otimizarCapaLogin.js`, já com interpolação de movimento e loop sem emenda).
 *
 * O primeiro quadro (poster) entra com um zoom lento; o vídeo só é baixado em telas largas, entra
 * em dissolução quando começa a tocar e fica parado em quem pede "reduzir movimento".
 */
export default function CapaLoginAnimada() {
  const videoRef = useRef(null);
  const [tocando, setTocando] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    // No celular o painel nem aparece: não gasta dados baixando o vídeo.
    if (!window.matchMedia('(min-width: 1024px)').matches) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const aoTocar = () => setTocando(true);
    video.addEventListener('playing', aoTocar);
    video.src = VIDEO;
    video.play().catch(() => {
      /* autoplay bloqueado: fica o poster */
    });
    return () => {
      video.removeEventListener('playing', aoTocar);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  return (
    <div aria-hidden="true" className="login-capa absolute inset-0">
      <img src={POSTER} alt="" className="absolute inset-0 h-full w-full object-cover object-[30%_50%]" />
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        poster={POSTER}
        className={`absolute inset-0 h-full w-full object-cover object-[30%_50%] transition-opacity duration-1000 ease-out ${
          tocando ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

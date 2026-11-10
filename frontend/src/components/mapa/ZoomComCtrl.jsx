import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Evita a "armadilha de rolagem" do mapa: a roda do mouse só dá zoom no mapa
 * com Ctrl (ou Cmd no Mac) pressionado. Sem a tecla, a página rola normalmente
 * e um aviso discreto explica como usar o zoom.
 *
 * Deve ser filho de <MapContainer>.
 */
export default function ZoomComCtrl() {
  const mapa = useMap();
  const [aviso, setAviso] = useState(false);
  const temporizador = useRef(null);

  useEffect(() => {
    const container = mapa.getContainer();
    mapa.scrollWheelZoom.enable();

    function aoRolar(evento) {
      if (evento.ctrlKey || evento.metaKey) return; // deixa o Leaflet aplicar o zoom

      // Impede o zoom do Leaflet sem cancelar a rolagem da página.
      evento.stopPropagation();
      setAviso(true);
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setAviso(false), 1400);
    }

    container.addEventListener('wheel', aoRolar, { capture: true, passive: true });
    return () => {
      container.removeEventListener('wheel', aoRolar, { capture: true });
      clearTimeout(temporizador.current);
    };
  }, [mapa]);

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-slate-900/45 transition-opacity duration-200 ${
        aviso ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <p className="rounded-md bg-slate-900/85 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        Use Ctrl + rolagem para dar zoom no mapa
      </p>
    </div>
  );
}

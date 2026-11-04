/**
 * Endereços do Google Maps incorporado (iframe) em imagem de satélite.
 *
 * Com `VITE_GOOGLE_MAPS_KEY` usa a Maps Embed API oficial (gratuita); sem ela,
 * usa a incorporação pública do Google Maps (não exige chave).
 */

const CHAVE = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

/** Mapa com pino no ponto [lat, lng]. */
export function urlGoogleComPino([lat, lng], zoom) {
  const ponto = `${lat},${lng}`;
  if (CHAVE) {
    const params = new URLSearchParams({ key: CHAVE, q: ponto, zoom: String(zoom), maptype: 'satellite', language: 'pt-BR' });
    return `https://www.google.com/maps/embed/v1/place?${params}`;
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(ponto)}&t=k&z=${zoom}&hl=pt-BR&output=embed`;
}

/** Mapa centrado em [lat, lng], sem pino (visão de região). */
export function urlGoogleRegiao([lat, lng], zoom) {
  if (CHAVE) {
    const params = new URLSearchParams({ key: CHAVE, center: `${lat},${lng}`, zoom: String(zoom), maptype: 'satellite', language: 'pt-BR' });
    return `https://www.google.com/maps/embed/v1/view?${params}`;
  }
  return `https://maps.google.com/maps?ll=${encodeURIComponent(`${lat},${lng}`)}&t=k&z=${zoom}&hl=pt-BR&output=embed`;
}

/** Link para abrir o ponto no Google Maps (nova aba). */
export function urlAbrirGoogle([lat, lng]) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/**
 * Zoom que enquadra os limites [[latSul, lngOeste], [latNorte, lngLeste]] numa
 * área de `largura` × `altura` pixels (projeção Web Mercator).
 */
export function zoomParaLimites(limites, largura = 900, altura = 480, { minimo = 4, maximo = 16 } = {}) {
  if (!limites || limites.length !== 2) return 11;
  const [[latA, lngA], [latB, lngB]] = limites;
  const latRad = (lat) => {
    const seno = Math.sin((lat * Math.PI) / 180);
    const raio = Math.log((1 + seno) / (1 - seno)) / 2;
    return Math.max(Math.min(raio, Math.PI), -Math.PI) / 2;
  };
  const fracaoLat = Math.abs(latRad(latB) - latRad(latA)) / Math.PI;
  const fracaoLng = Math.abs(lngB - lngA) / 360;
  if (fracaoLat === 0 && fracaoLng === 0) return maximo - 1;
  const zoomLat = fracaoLat ? Math.log2(altura / 256 / fracaoLat) : maximo;
  const zoomLng = fracaoLng ? Math.log2(largura / 256 / fracaoLng) : maximo;
  return Math.max(Math.min(Math.floor(Math.min(zoomLat, zoomLng)), maximo), minimo);
}

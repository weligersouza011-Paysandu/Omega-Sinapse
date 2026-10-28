/** Utilitários de coordenadas compartilhados entre o mapa e a lista. */

export function paraNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Normaliza as coordenadas de uma localização para [lat, lon] ou null. */
export function coordenadasDe(localizacao) {
  if (!localizacao) return null;

  const latitude = paraNumero(localizacao.latitude);
  const longitude = paraNumero(localizacao.longitude);
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return [latitude, longitude];
}

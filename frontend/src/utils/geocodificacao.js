/**
 * Geocodificação reversa via Nominatim (OpenStreetMap), sem chave de API.
 *
 * O serviço público pede no máximo uma requisição por segundo; por isso as
 * consultas são espaçadas e podem ser canceladas com AbortController quando o
 * usuário clica em outro ponto do mapa.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const INTERVALO_MINIMO_MS = 1100;

let ultimaConsulta = 0;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Monta um endereço curto e legível a partir do retorno do Nominatim.
 * Cai para o `display_name` completo quando as partes não estão disponíveis.
 */
export function resumirEndereco(dados) {
  if (!dados) return '';

  const endereco = dados.address || {};
  const logradouro =
    endereco.road ||
    endereco.pedestrian ||
    endereco.footway ||
    endereco.path ||
    endereco.cycleway ||
    '';
  const numero = endereco.house_number || '';
  const bairro =
    endereco.suburb ||
    endereco.neighbourhood ||
    endereco.village ||
    endereco.hamlet ||
    endereco.quarter ||
    '';
  const cidade =
    endereco.city ||
    endereco.town ||
    endereco.municipality ||
    endereco.county ||
    '';
  const estado = endereco.state_code || endereco.state || '';

  const partes = [
    [logradouro, numero].filter(Boolean).join(', '),
    bairro,
    cidade,
    estado,
  ].filter(Boolean);

  const curto = partes.join(' · ');
  return (curto || dados.display_name || '').slice(0, 180);
}

/**
 * Busca o endereço aproximado de uma coordenada.
 * @returns {Promise<{endereco: string, completo: string}>}
 */
export async function geocodificarReverso(latitude, longitude, { signal } = {}) {
  const espera = Math.max(0, INTERVALO_MINIMO_MS - (Date.now() - ultimaConsulta));
  if (espera > 0) await aguardar(espera);

  if (signal?.aborted) {
    throw new DOMException('Consulta de endereço cancelada.', 'AbortError');
  }

  const parametros = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'pt-BR',
  });

  ultimaConsulta = Date.now();

  const resposta = await fetch(`${NOMINATIM_URL}?${parametros}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!resposta.ok) {
    throw new Error('Não foi possível obter o endereço do ponto selecionado.');
  }

  const dados = await resposta.json();
  return {
    endereco: resumirEndereco(dados),
    completo: dados.display_name || '',
  };
}

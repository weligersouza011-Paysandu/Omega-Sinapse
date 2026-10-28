/** Formata um número como moeda brasileira (R$). */
export function formatarMoeda(valor) {
  const numero = Number(valor);
  const seguro = Number.isFinite(numero) ? numero : 0;
  return seguro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata um número como moeda compacta (ex.: "R$ 82,9 mi"), para eixos de gráfico. */
export function formatarMoedaCompacta(valor) {
  const numero = Number(valor);
  const seguro = Number.isFinite(numero) ? numero : 0;
  return seguro.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/** Formata uma data ISO como dd/mm/aaaa. */
export function formatarData(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Formata uma data ISO como dd/mm/aaaa hh:mm. */
export function formatarDataHora(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Retorna o rótulo da revisão: 0 -> "Rev 00". */
export function rotuloRevisao(numero) {
  return `Rev ${String(numero ?? 0).padStart(2, '0')}`;
}

/** Rótulos e formatação compartilhados pelas telas do QQP. */

export const CATEGORIAS = [
  ['HH', 'HH (mão de obra)'],
  ['EQUIPAMENTO', 'Equipamento'],
  ['INSUMO', 'Insumo'],
  ['OUTROS', 'Outros'],
];
export const UNIDADES = [
  ['HORA', 'Por hora'],
  ['DIA', 'Por dia útil'],
  ['MES', 'Por mês (rateado nos dias úteis)'],
  ['UNIDADE', 'Por unidade (lançamento único)'],
];
export const ROTULO_UNIDADE = { HORA: 'hora', DIA: 'dia útil', MES: 'mês', UNIDADE: 'unidade' };
export const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS);

/** "1234.5" (texto exato da API) -> "1.234,50"; preserva as casas além do mínimo. */
export function decimalBr(texto, minimoCasas = 2) {
  if (texto === null || texto === undefined || texto === '') return '—';
  const [inteiro, fracao = ''] = String(texto).split('.');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fracao.padEnd(minimoCasas, '0')}`;
}

/** Chave usada pela ordem personalizada dos subgrupos. */
export const chaveSubgrupos = (categoria, grupo) => `${categoria}›${grupo}`;

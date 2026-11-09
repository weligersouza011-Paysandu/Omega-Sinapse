/**
 * Categorias de obra (mesmos valores do back-end e do Dashboard de Planejamento).
 *
 *  - CARTEIRA_DA_COORDENACAO: obras principais, de alta relevância estratégica;
 *  - CADEIA_DE_AJUDA: obras de suporte rápido ou demandas pontuais de terceiros.
 */
export const CATEGORIAS_OBRA = [
  {
    value: 'CARTEIRA_DA_COORDENACAO',
    label: 'Carteira da Coordenação',
    descricao: 'Obras principais e de alta relevância estratégica, sob gestão direta da coordenação.',
  },
  {
    value: 'CADEIA_DE_AJUDA',
    label: 'Cadeia de Ajuda',
    descricao: 'Obras de suporte rápido ou demandas pontuais acionadas por terceiros.',
  },
];

export function rotuloCategoria(categoria) {
  return CATEGORIAS_OBRA.find((item) => item.value === categoria)?.label || null;
}

/**
 * Cores neutras e de série dos gráficos como variáveis CSS: acompanham o tema claro/escuro sem
 * re-renderizar (valem em `fill`/`stroke` de SVG e do Recharts). Definidas em theme/paleta.js.
 */
const v = (nome) => `rgb(var(${nome}))`;

export const CG = {
  /** Texto dos eixos e rótulos de apoio. */
  eixo: v('--c-slate-500'),
  /** Rótulo em destaque (ex.: valor nos pontos). */
  rotulo: v('--c-slate-700'),
  /** Número principal (ex.: centro do gauge). */
  titulo: v('--c-slate-900'),
  /** Texto muito suave (extremos de escala). */
  suave: v('--c-slate-400'),
  /** Linhas de grade e trilhos. */
  grade: v('--c-slate-200'),
  /** Contornos de elementos sólidos. */
  borda: v('--c-slate-300'),
  /** Fundo de cartões, nós e separadores de fatias. */
  superficie: v('--c-surface'),
  /** Um degrau acima da superfície. */
  superficieAlta: v('--c-slate-50'),
  /** Cor de texto padrão dentro de SVG. */
  texto: v('--c-slate-800'),
};

/** Séries com cor própria por tema (a do tema claro escurece, a do escuro clareia). */
export const GS = {
  previsto: v('--g-previsto'),
  real: v('--g-real'),
  mensal: v('--g-mensal'),
  previstoAcum: v('--g-prevacum'),
  tendencia: v('--g-tend'),
  marca: v('--g-marca'),
  linha: v('--g-linha'),
  azul: v('--g-azul'),
  verde: v('--g-verde'),
  neutro: v('--g-neutro'),
  teal: v('--g-teal'),
  critico: v('--g-critico'),
};

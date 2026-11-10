/**
 * Paleta do Synapse nos temas claro e escuro — fonte única das cores.
 *
 * O Tailwind lê estas escalas como variáveis CSS (`rgb(var(--c-slate-500) / <alpha-value>)`),
 * então toda classe existente (`text-slate-500`, `bg-red-50`, `border-emerald-200`…) troca de
 * valor sozinha ao ativar o tema escuro, sem reescrever as telas.
 *
 * Regras de design do tema escuro:
 *  - Superfícies sobem de luminosidade com a elevação: página (mais escura) < card < card em hover.
 *    O fundo é um azul-ardósia frio (matiz ~218°), nunca preto puro: preto puro "vibra" ao lado do
 *    texto claro e perde a hierarquia entre as camadas.
 *  - O texto principal NÃO é branco puro (#e2e8f2): reduz o halo e a fadiga, mantendo contraste > 12:1.
 *  - A escala de cinzas é invertida (slate-800 vira texto claro; slate-200 vira borda escura),
 *    preservando a relação de papéis que as telas já usam.
 *  - Cores de status (vermelho, verde, âmbar…) invertem o papel: tons 50–300 (fundos e bordas de
 *    alertas) viram tintas escuras e translúcidas da própria cor; tons 400–900 (texto) viram tons
 *    claros e dessaturados, todos com contraste ≥ 4.5:1 sobre a tinta do respectivo fundo.
 *  - Fundos sólidos (botão, barra de progresso, ponto de status) NÃO invertem: continuam vivos nos
 *    dois temas; só o azul da marca é um pouco mais claro no escuro para se destacar do fundo.
 */
import colors from 'tailwindcss/colors.js';

export const MATIZES = ['red', 'emerald', 'amber', 'violet', 'sky', 'blue', 'orange', 'cyan', 'rose', 'teal'];
export const TONS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Superfície do card no tema escuro; base das tintas translúcidas. */
export const SUPERFICIE_ESCURA = '#111a2a';

export const hexParaCanais = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

const mistura = (cor, base, peso) => {
  const a = hexParaCanais(cor).split(' ').map(Number);
  const b = hexParaCanais(base).split(' ').map(Number);
  return `#${a
    .map((v, i) => Math.round(v * peso + b[i] * (1 - peso)).toString(16).padStart(2, '0'))
    .join('')}`;
};

/* ------------------------------- Azul da marca (omega) ------------------------------- */

const OMEGA_CLARO = {
  50: '#f2f7fb', 100: '#e3eef7', 200: '#c8ddee', 300: '#9fc2e0', 400: '#5f9ccd',
  500: '#1c5d99', 600: '#164b7d', 700: '#123c65', 800: '#0e2f4f', 900: '#0a2138',
};

const OMEGA_ESCURO = {
  50: mistura('#3b8fd9', SUPERFICIE_ESCURA, 0.12),
  100: mistura('#3b8fd9', SUPERFICIE_ESCURA, 0.19),
  200: mistura('#3b8fd9', SUPERFICIE_ESCURA, 0.3),
  300: mistura('#3b8fd9', SUPERFICIE_ESCURA, 0.45),
  400: '#5aa9e6', 500: '#62abe6', 600: '#7ab8ea', 700: '#9acbf0', 800: '#bddcf6', 900: '#dcecfa',
};

/** Fundos sólidos do azul da marca (botão primário etc.): no escuro, um degrau mais claro. */
export const OMEGA_FUNDO_CLARO = { 500: '#1c5d99', 600: '#164b7d', 700: '#123c65', 800: '#0e2f4f', 900: '#0a2138' };
const OMEGA_FUNDO_ESCURO = { 500: '#3a86c9', 600: '#2c73b4', 700: '#25629c', 800: '#0e2f4f', 900: '#0a2138' };

/* ------------------------------------ Cinzas (slate) ------------------------------------ */

// slate-400 um pouco mais escuro que o padrão do Tailwind: ícones e placeholders mais legíveis no claro.
const SLATE_CLARO = { ...colors.slate, 400: '#7987a0' };

const SLATE_ESCURO = {
  50: '#17223a',   // hover e áreas rebaixadas dentro do card (um degrau acima do card)
  100: '#0c1321',  // fundo da página e trilhos de barras (o mais fundo)
  200: '#243249',  // bordas e divisores
  300: '#34465f',  // bordas de campos (precisam ser visíveis)
  400: '#7284a0',  // ícones, placeholder
  500: '#8d9cb7',  // texto de apoio
  600: '#a6b3ca',  // texto secundário
  700: '#c1cbdc',  // texto de rótulos e células
  800: '#e2e8f2',  // texto principal
  900: '#f1f5fa',  // títulos
};

/* ---------------------------- Cores de status (matizes) ---------------------------- */

function matizEscuro(matiz) {
  const P = colors[matiz];
  return {
    50: mistura(P[500], SUPERFICIE_ESCURA, 0.1),
    100: mistura(P[500], SUPERFICIE_ESCURA, 0.16),
    200: mistura(P[500], SUPERFICIE_ESCURA, 0.27),
    300: mistura(P[500], SUPERFICIE_ESCURA, 0.4),
    400: P[500],
    500: P[400],
    600: P[400],
    700: P[300],
    800: P[200],
    900: P[100],
  };
}

const LUMINOSOS = ['emerald', 'amber', 'sky', 'orange', 'cyan', 'teal'];

export const escalas = {
  claro: {
    slate: SLATE_CLARO,
    omega: OMEGA_CLARO,
    // No claro, o tom 600 de matizes luminosos (verde, âmbar, ciano…) não chega a 4.5:1 como texto
    // sobre branco; usamos o 700 nesse degrau. Fundos sólidos não são afetados (escalaFundo usa o Tailwind).
    ...Object.fromEntries(
      MATIZES.map((m) => [m, { ...colors[m], ...(LUMINOSOS.includes(m) ? { 600: colors[m][700] } : {}) }])
    ),
  },
  escuro: {
    slate: SLATE_ESCURO,
    omega: OMEGA_ESCURO,
    ...Object.fromEntries(MATIZES.map((m) => [m, matizEscuro(m)])),
  },
};

export const superficie = { claro: '#ffffff', escuro: SUPERFICIE_ESCURA };

/** Fundos "invertidos" (aba ativa, chip de perfil): escuros no claro, elevados no escuro, sempre com texto branco. */
export const invertido = {
  claro: { 800: '#1e293b', 900: '#0f172a' },
  escuro: { 800: '#3a4d6b', 900: '#2b3b57' },
};

/** Variáveis CSS de um tema. */
export function variaveis(tema) {
  const v = { '--c-surface': hexParaCanais(superficie[tema]) };
  Object.entries(escalas[tema]).forEach(([nome, escala]) => {
    TONS.forEach((tom) => {
      v[`--c-${nome}-${tom}`] = hexParaCanais(escala[tom]);
    });
  });
  const fundoOmega = tema === 'claro' ? OMEGA_FUNDO_CLARO : OMEGA_FUNDO_ESCURO;
  Object.entries(fundoOmega).forEach(([tom, hex]) => {
    v[`--b-omega-${tom}`] = hexParaCanais(hex);
  });
  v['--b-inv-800'] = hexParaCanais(invertido[tema][800]);
  v['--b-inv-900'] = hexParaCanais(invertido[tema][900]);
  const g = tema === 'claro'
    ? { previsto: '#4b5563', real: '#9f1239', mensal: '#4a8f5f', prevacum: '#b08900', tend: '#3f8f5f', marca: '#164b7d', linha: '#1e293b', azul: '#2563eb', verde: '#059669', neutro: '#475569', teal: '#0f766e', critico: '#dc2626' }
    : { previsto: '#9aa7bb', real: '#fb7185', mensal: '#5fb97e', prevacum: '#e0b43a', tend: '#5fc58a', marca: '#5aa9e6', linha: '#e2e8f2', azul: '#6ba6ff', verde: '#34d399', neutro: '#b4c0d4', teal: '#2dd4bf', critico: '#f87171' };
  Object.entries(g).forEach(([nome, hex]) => {
    v[`--g-${nome}`] = hexParaCanais(hex);
  });
  // Curva S financeira: o REAL é o único tom quente e forte (vermelho); previsto e previsto mensal ficam
  // em cinza-chumbo discreto, as linhas acumuladas são finas e a tendência é âmbar tracejado.
  const s = tema === 'claro'
    ? { previsto: ['#6b7280', 1], real: ['#dc2626', 1], mensal: ['#a3a9b5', 0.6], prevacum: ['#4b5563', 1], realacum: ['#ef4444', 1], tend: ['#c77d0a', 1], grade: ['#e2e8f0', 1] }
    : { previsto: ['#8b97ab', 0.38], real: ['#ef4444', 0.9], mensal: ['#6b778c', 0.3], prevacum: ['#aab4c5', 1], realacum: ['#f87171', 1], tend: ['#e2b04a', 1], grade: ['#2a3a55', 0.55] };
  Object.entries(s).forEach(([nome, [hex, op]]) => {
    v[`--s-${nome}`] = hexParaCanais(hex);
    v[`--s-${nome}-op`] = String(op);
  });
  // Superfícies de overlay/cartão flutuante (dropdowns, tooltips) e sombras.
  v['--c-sombra'] = tema === 'claro' ? '15 23 42' : '0 0 0';
  return v;
}

const rgbVar = (nome) => `rgb(var(${nome}) / <alpha-value>)`;

/** Escala Tailwind (50…900) apontando para variáveis. */
export const escalaVar = (nome) => Object.fromEntries(TONS.map((tom) => [tom, rgbVar(`--c-${nome}-${tom}`)]));

/** Escala para FUNDOS: tons 50–300 acompanham o tema; tons sólidos (≥400) ficam estáticos. */
export function escalaFundo(nome) {
  return Object.fromEntries(
    TONS.map((tom) => [tom, tom <= 300 ? rgbVar(`--c-${nome}-${tom}`) : colors[nome]?.[tom] || OMEGA_CLARO[tom]])
  );
}

export { rgbVar };

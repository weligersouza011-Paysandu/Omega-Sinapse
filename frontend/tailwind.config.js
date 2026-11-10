import plugin from 'tailwindcss/plugin';
import { MATIZES, OMEGA_FUNDO_CLARO, TONS, escalaFundo, escalaVar, rgbVar, variaveis } from './src/theme/paleta.js';

/**
 * Cores via variáveis CSS (ver src/theme/paleta.js): o tema claro/escuro troca os valores sem
 * mudar nenhuma classe das telas. Fundos sólidos (>= 400) são estáticos; só os tons 50–300 de
 * fundo, bordas, textos e demais utilitários acompanham o tema.
 */
const NOMES = ['slate', 'omega', ...MATIZES];

const cores = Object.fromEntries(NOMES.map((nome) => [nome, escalaVar(nome)]));

const fundos = {
  white: rgbVar('--c-surface'),
  ...Object.fromEntries(MATIZES.map((nome) => [nome, escalaFundo(nome)])),
  slate: {
    ...escalaFundo('slate'),
    800: rgbVar('--b-inv-800'),
    900: rgbVar('--b-inv-900'),
  },
  omega: Object.fromEntries(TONS.map((tom) => [tom, tom <= 400 ? rgbVar(`--c-omega-${tom}`) : rgbVar(`--b-omega-${tom}`)])),
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: cores,
      backgroundColor: fundos,
      // Degradês de painéis escuros por design (hero, login): mesmas cores nos dois temas.
      gradientColorStops: { omega: OMEGA_FUNDO_CLARO, slate: { 900: '#0f172a' } },
      boxShadowColor: { slate: { 900: rgbVar('--c-sombra') } },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const css = (tema) => ({ ...variaveis(tema), colorScheme: tema === 'claro' ? 'light' : 'dark' });
      addBase({
        ':root': css('claro'),
        '.dark': css('escuro'),
        // Escopo que mantém a paleta clara dentro do tema escuro: documento da OSI (folha branca
        // impressa) e painéis que já são escuros por design (menu lateral, hero).
        '.tema-claro': { ...css('claro'), color: 'rgb(var(--c-slate-800))' },
      });
    }),
  ],
};

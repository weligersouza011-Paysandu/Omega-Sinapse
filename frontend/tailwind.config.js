/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        omega: {
          50: '#f2f7fb',
          100: '#e3eef7',
          500: '#1c5d99',
          600: '#164b7d',
          700: '#123c65',
          800: '#0e2f4f',
          900: '#0a2138',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

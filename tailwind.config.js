/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Body neutral: zinc instead of gray — flatter, modern neutral that
        // layers well in dark mode and is near-identical in light mode. Every
        // gray-* class in the app resolves to zinc at build time; delete this
        // line to revert to Tailwind gray.
        gray: colors.zinc,
      },
    },
  },
  plugins: [],
}

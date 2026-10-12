/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./entrypoints/**/*.{html,ts,tsx}",
    "./components/**/*.{html,ts,tsx}",
    "./assets/**/*.{html,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
        }
      }
    },
  },
  plugins: [],
}

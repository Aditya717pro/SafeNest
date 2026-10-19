/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surf: {
          bg: '#090d16',
          card: '#0f172a',
          border: 'rgba(255, 255, 255, 0.08)',
          emerald: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b',
          cyan: '#06b6d4'
        }
      }
    },
  },
  plugins: [],
}

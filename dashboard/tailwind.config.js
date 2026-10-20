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
          bg: '#f0f9ff',
          card: '#ffffff',
          border: 'rgba(14, 165, 233, 0.18)',
          sky: '#0ea5e9',
          skysoft: '#38bdf8',
          blue: '#2563eb',
          navy: '#1e3a8a',
          deep: '#0c4a6e',
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

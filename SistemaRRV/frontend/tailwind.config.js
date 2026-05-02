/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Instrument Serif', 'Times New Roman', 'serif'],
        sans: ['Inter Tight', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      colors: {
        bg: {
          DEFAULT: '#0A0E1A',
          2: '#0F1524',
        },
        surface: {
          DEFAULT: '#161D30',
          2: '#1E2740',
        },
        accent: {
          DEFAULT: '#D4A574',
          blue: '#3B82F6',
        },
        live: '#10B981',
        party: {
          1: '#3B82F6',
          2: '#EA580C',
          3: '#8B5CF6',
          4: '#059669',
        },
      },
      borderRadius: {
        card: '24px',
        DEFAULT: '18px',
        sm: '10px',
      },
    },
  },
  plugins: [],
}

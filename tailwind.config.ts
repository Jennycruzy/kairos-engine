import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './ui/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        kairos: {
          bg:       '#080808',
          surface:  '#0a0a0a',
          elevated: '#0d0d0d',
          border:   '#1a1a1a',
          muted:    '#6b7280',
          green:    '#4ade80',
          blue:     '#60a5fa',
          purple:   '#c084fc',
          teal:     '#2dd4bf',
          amber:    '#fbbf24',
          orange:   '#fb923c',
          red:      '#f87171',
          gold:     '#fcd34d',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'type-in': {
          from: { opacity: '0', transform: 'translateX(-4px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config

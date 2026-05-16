import type { Config } from 'tailwindcss';

// Design system Nexus Editorial — palette Eclipse dark inspirée
// Henner Nexus. Couleurs custom exposées en classes Tailwind pour
// faciliter le port côté Lovable (pas besoin de regex find/replace).
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0f',
          secondary: '#161620',
          tertiary: '#1f1f2b',
        },
        border: {
          DEFAULT: '#2a2a35',
          strong: '#3a3a48',
        },
        ink: {
          primary: '#e5e5e5',
          secondary: '#8a8a95',
          muted: '#5a5a65',
        },
        accent: {
          violet: '#8b5cf6',
          'violet-bg': '#3b1e8a22',
          success: '#10b981',
          'success-bg': '#064e3b33',
          warning: '#f59e0b',
          'warning-bg': '#78350f33',
          danger: '#ef4444',
          'danger-bg': '#7f1d1d33',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      maxWidth: {
        prose: '68ch',
        post: '720px',
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens — see DESIGN.md
        bg: '#0A0B0D',
        surface: { DEFAULT: '#111316', 2: '#181B20' },
        line: { DEFAULT: 'rgba(255,255,255,0.08)', strong: 'rgba(255,255,255,0.16)' },
        fg: { DEFAULT: '#F2F3F5', muted: '#9AA0A9', subtle: '#858B95' },
        accent: { DEFAULT: '#0052FF', hover: '#2E6BFF', soft: 'rgba(0,82,255,0.12)' },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        attn: { DEFAULT: '#8B5CF6', soft: 'rgba(139,92,246,0.14)' },
        // Legacy aliases (kept so existing markup keeps working)
        base: {
          blue: '#0052FF',
          dark: '#0A0B0D',
          gray: '#111316',
          light: '#F7F7F8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Inter Fallback', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        display: ['clamp(2.25rem, 1.4rem + 3.6vw, 4.5rem)', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
        h1: ['clamp(1.875rem, 1.3rem + 2.2vw, 3rem)', { lineHeight: '1.08', letterSpacing: '-0.025em' }],
        h2: ['clamp(1.5rem, 1.2rem + 1.2vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        h3: ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
      },
      maxWidth: {
        '8xl': '88rem',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        fadeUp: 'fadeUp .5s ease-out both',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Light "shop-floor" remap. The JSX color utilities were authored for the
      // old dark theme; rather than rewrite every className, the underlying
      // tokens are repurposed so they read correctly on light surfaces. This
      // mirrors the mobile palette (packages/mobile/src/theme.ts).
      colors: {
        // text-white / bg-white\/x / border-white\/x → primary dark ink plus
        // subtle dark tints and borders on light panels.
        white: '#152d36',
        slate: {
          200: '#1f3a44', // prominent secondary text
          300: '#3a5a64', // body / dim text
          400: '#5f757b', // muted labels
          500: '#8a9c9c', // faint
          900: '#102b3a', // dark text that sits on bright/colored chips — stays dark
          950: '#0b1f2a',
        },
        emerald: { 200: '#3f9d63', 300: '#2f8f57' },
        rose: { 300: '#c44a45' },
        amber: { 100: '#9a6a16', 200: '#b27d1c', 300: '#e4c64b' },
        cyan: { 200: '#2f8198' },
      },
    },
  },
  plugins: [],
};

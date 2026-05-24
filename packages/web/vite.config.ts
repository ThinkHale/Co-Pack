import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/Co-Pack/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@copack/engine': path.resolve(__dirname, '../engine/src/index.ts'),
    },
  },
});

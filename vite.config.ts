import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5180,
    strictPort: false,
    proxy: { '/api': { target: 'http://127.0.0.1:4517', changeOrigin: true } },
  },
});

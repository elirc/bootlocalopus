import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** The API port; must match the server's `PORT` (server/index.ts). */
const apiPort = process.env.PORT ?? 4517;

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // CodeMirror is most of the bundle; it is served from localhost, so one ~800 KB chunk is fine.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5180,
    strictPort: false,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  },
});

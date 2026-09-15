import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Scan the application and foundations fixture entry graphs
  // together so its Base UI imports cannot replace React chunks during first render.
  optimizeDeps: { entries: ['index.html', 'dev/foundations/foundations.html'] },
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8790', ws: true },
      '/agents.md': { target: 'http://127.0.0.1:8790' },
    },
  },
});

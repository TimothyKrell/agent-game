import { mergeConfig } from 'vite';
import base from '../../vite.config';

const backend = process.env.LOCAL_GAME_URL ?? 'http://127.0.0.1:8807';

export default mergeConfig(base, {
  server: {
    host: '0.0.0.0',
    port: 5192,
    strictPort: true,
    proxy: {
      '/api': { target: backend, ws: true },
      '/agents.md': { target: backend },
    },
  },
});

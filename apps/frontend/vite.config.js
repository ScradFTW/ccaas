import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/ccaas/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8081',
      '/auth': 'http://localhost:8081',
      '/ws': { target: 'ws://localhost:8081', ws: true },
    },
  },
});

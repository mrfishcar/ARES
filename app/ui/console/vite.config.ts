import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    'global': 'globalThis'
  },
  server: {
    port: 3001,
    proxy: {
      '/graphql': process.env.VITE_API_URL || 'https://ares-production-72ea.up.railway.app',
      '/wiki-file': process.env.VITE_API_URL || 'https://ares-production-72ea.up.railway.app',
      '/download': process.env.VITE_API_URL || 'https://ares-production-72ea.up.railway.app',
      '/metrics': process.env.VITE_API_URL || 'https://ares-production-72ea.up.railway.app'
    }
  }
});

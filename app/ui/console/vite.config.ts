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
      '/graphql': 'http://localhost:4000',
      '/wiki-file': 'http://localhost:4000',
      '/download': 'http://localhost:4000',
      '/metrics': 'http://localhost:4100'
    }
  },
  build: {
    rollupOptions: {
      external: [
        // Exclude Node.js modules that shouldn't be in browser bundle
        'crypto',
        'http',
        'https',
        'fs',
        'path'
      ]
    }
  }
});

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
  resolve: {
    alias: {
      // Provide empty polyfills for Node.js built-ins that shouldn't be in browser
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer',
    }
  },
  build: {
    rollupOptions: {
      // Don't mark as external - use polyfills instead
    }
  }
});

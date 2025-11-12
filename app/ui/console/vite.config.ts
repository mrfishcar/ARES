import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Include specific polyfills
      include: ['crypto', 'stream', 'buffer'],
      // Enable polyfills for global objects
      globals: {
        Buffer: true,
        global: true,
        process: true
      }
    })
  ],
  server: {
    port: 3001,
    proxy: {
      '/graphql': 'http://localhost:4000',
      '/wiki-file': 'http://localhost:4000',
      '/download': 'http://localhost:4000',
      '/metrics': 'http://localhost:4100'
    }
  }
});

import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'path';

const require = createRequire(import.meta.url);
const reactPlugin = require('@vitejs/plugin-react');
const react = reactPlugin.default ?? reactPlugin;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/graphql': 'http://localhost:4000',
      '/wiki-file': 'http://localhost:4000',
      '/wiki-entity': 'http://localhost:4000',
      '/wiki-from-text': 'http://localhost:4000',
      '/download': 'http://localhost:4000',
      '/metrics': 'http://localhost:4100'
    }
  },
  resolve: {
    alias: {
      stream: path.resolve(__dirname, 'node_modules/stream-browserify'),
      crypto: path.resolve(__dirname, 'node_modules/crypto-browserify'),
      buffer: path.resolve(__dirname, 'node_modules/buffer/'),
      util: path.resolve(__dirname, 'node_modules/util/'),
      // Point to engine package (same path as tsconfig)
      '@engine': path.resolve(__dirname, '../../engine')
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
  },
  define: {
    global: 'globalThis',
    'process.env': {},
    'process.version': JSON.stringify('v18.0.0'),
    'process.versions': JSON.stringify({ node: '18.0.0' })
  },
  optimizeDeps: {
    include: ['buffer', 'crypto-browserify', 'stream-browserify']
  }
});

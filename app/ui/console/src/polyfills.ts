/**
 * Browser polyfills for Node.js compatibility
 * 
 * These polyfills are needed for libraries that expect Node.js globals.
 * They're loaded early in the app lifecycle via main.tsx.
 */

import { Buffer as BufferPolyfill } from 'buffer';

// Use type assertion for setting globals to avoid TypeScript conflicts
const g = globalThis as Record<string, unknown>;

// Polyfill Buffer (needed for some crypto/encoding libraries)
if (typeof g.Buffer === 'undefined') {
  g.Buffer = BufferPolyfill;
}

// Polyfill process.env (minimal shim for libraries checking environment)
if (typeof g.process === 'undefined') {
  g.process = { env: {} };
}

// Polyfill global (Node.js global reference)
if (typeof g.global === 'undefined') {
  g.global = globalThis;
}

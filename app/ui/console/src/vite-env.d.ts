/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SSR: boolean;
  readonly VITE_API_URL?: string;
  readonly VITE_ARES_PERF?: string;
  readonly ARES_PERF?: string;
  readonly VITE_DEBUG_EDITOR_FOCUS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global declarations for Node.js compatibility (guarded at runtime)
declare const process: {
  env: Record<string, string | undefined>;
} | undefined;

declare function require(module: string): any;

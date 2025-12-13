import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30000,
    reporters: (process.env.VITEST_REPORTER?.split(',') ?? ['basic']) as never,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});

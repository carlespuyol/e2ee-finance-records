import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // Run test files sequentially so they share predictable module state
    fileParallelism: false,
    // Set env vars HERE (before any module is imported) — not in setup.ts,
    // where import hoisting causes them to be set after db.ts initialises.
    env: {
      DATABASE_PATH: ':memory:',
      JWT_SECRET: 'test-secret-for-unit-tests',
      CLIENT_ORIGIN: 'http://0.0.0.0:5173',
    },
  },
});

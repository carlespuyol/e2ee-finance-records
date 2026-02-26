import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // crypto.test.ts and api.test.ts use Node env (Web Crypto available natively)
    // Component tests override to happy-dom via @vitest-environment docblock
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});

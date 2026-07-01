import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/temp/**'],
    setupFiles: ['./tests/setup.ts'],
  },
});

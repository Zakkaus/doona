import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tools/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['src/api/types.ts', 'src/**/messages.ts', 'src/api/mock/**'],
      thresholds: {lines: 15, statements: 15}
    }
  }
});

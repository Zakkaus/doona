import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tools/*.test.mjs'],
    setupFiles: ['src/i18n/setup.test-env.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['src/api/types.ts', 'src/**/messages.ts', 'src/i18n/locales/**', 'src/api/mock/**'],
      thresholds: {lines: 15, statements: 15}
    }
  }
});

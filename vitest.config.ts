import {defineConfig} from 'vitest/config';
import {startupTextPlugin} from './tools/startup-text.mjs';

export default defineConfig({
  plugins: [startupTextPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tools/*.test.mjs'],
    setupFiles: ['src/i18n/setup.test-env.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['src/api/types.ts', 'src/api/mock/**'],
      thresholds: {lines: 15, statements: 15}
    }
  }
});

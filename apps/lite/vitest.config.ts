import {defineConfig} from 'vitest/config';
export default defineConfig({
  cacheDir: process.env.LITE_TEST_CACHE,
  test: {environment: 'node', include: ['scripts/*.test.ts']}
});

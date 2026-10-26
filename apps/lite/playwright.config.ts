import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  testMatch: 'browser.spec.ts',
  // Each check drives its own browser for a whole flow, and the motion checks time frames, so they run one at a time.
  workers: 1,
  timeout: 5 * 60_000,
  reporter: 'list',
  outputDir: 'test-results',
  use: {baseURL: 'http://127.0.0.1:5198'},
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: false
  }
});

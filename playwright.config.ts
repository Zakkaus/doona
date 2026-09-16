import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce'
  },
  projects: [
    {name: 'chromium', testIgnore: 'subpath.spec.ts', use: {...devices['Desktop Chrome']}},
    {name: 'subpath', testMatch: 'subpath.spec.ts', use: {...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4186'}}
  ],
  webServer: [
    {
      command: 'pnpm exec vite preview --host 127.0.0.1 --port 4177 --strictPort',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: false
    },
    {
      command: 'python3 tools/serve.py 4186 dist --prefix /ui',
      url: 'http://127.0.0.1:4186/ui/',
      reuseExistingServer: false
    }
  ]
});

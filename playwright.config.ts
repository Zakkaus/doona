import {defineConfig, devices} from '@playwright/test';

// WebKit needs the Ubuntu libraries Playwright installs with --with-deps; CI sets this, and elsewhere the official
// Playwright image runs it.
const webkit = process.env.DOONA_E2E_WEBKIT === '1';

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
    {name: 'subpath', testMatch: 'subpath.spec.ts', use: {...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4186'}},
    ...(webkit
      ? [
          // Safari carries the installed iOS app: a smoke pass over navigation, drag and drop, dialogs and the keyboard.
          // WebKit's request interception does not see what a service worker fetches, so the mock backend needs it
          // blocked; the PWA spec, which is about the worker, runs with it.
          {
            name: 'webkit',
            testMatch: ['routes.spec.ts', 'arrange.spec.ts', 'keyboard.spec.ts', 'mobile.spec.ts', 'charts.spec.ts'],
            use: {...devices['Desktop Safari'], serviceWorkers: 'block'}
          },
          {name: 'webkit-pwa', testMatch: 'pwa.spec.ts', use: {...devices['Desktop Safari']}}
        ]
      : [])
  ],
  webServer: [
    {
      command: 'pnpm exec vite preview --host 127.0.0.1 --port 4177 --strictPort',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: false
    },
    {
      command: 'python3 tools/serve.py 4186 dist --prefix /ui --worker-update',
      url: 'http://127.0.0.1:4186/ui/',
      reuseExistingServer: false
    }
  ]
});

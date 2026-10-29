import {expect, test} from '@playwright/test';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The production build, which connects to a backend instead of opening the demo.
const production = 'http://127.0.0.1:5198';

const checks = [
  'mock-e2e',
  'page-tour-e2e',
  'search-edit-e2e',
  'layout-rhythm',
  'page-cache',
  'loading-layout',
  'nodes-e2e',
  'row-focus',
  'page-flash',
  'mode-switch',
  'mobile-sheet',
  'features-nodes',
  'dark-mode',
  'syntax-scan',
  'motion',
  'motion-replay',
  'motion-editors',
  'motion-groups',
  'stability',
  'scroll-stability'
];
// Long-task and layout-shift timings depend on the machine's load, so they only print a report (`pnpm test:timing`).
const timings = ['perf-switch', 'perf-click'];

const run = (name: string, url: string) =>
  new Promise<number | null>((resolve, reject) => {
    spawn(process.execPath, [fileURLToPath(new URL(`${name}.cjs`, import.meta.url))], {
      env: {...process.env, LITE_PREVIEW_URL: url, LITE_PRODUCTION_URL: production},
      stdio: 'inherit'
    })
      .on('error', reject)
      .on('close', resolve);
  });

for (const name of checks) test(name, async ({baseURL}) => expect(await run(name, baseURL!)).toBe(0));
for (const name of timings) test(`${name} @timing`, async ({baseURL}) => expect(await run(name, baseURL!)).toBe(0));

test.describe('backend', () => {
  test.use({baseURL: production});
  for (const name of ['login-e2e', 'features-routing', 'settings-restart']) test(name, async ({baseURL}) => expect(await run(name, baseURL!)).toBe(0));
});

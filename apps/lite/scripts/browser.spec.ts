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

test.describe('keyboard focus', () => {
  test.use({locale: 'zh-TW'});

  test('skip link preserves the route and focuses main content', async ({page}) => {
    for (const [route, heading] of [
      ['dns', 'DNS'],
      ['routing', '路由']
    ]) {
      await page.goto(`/#${route}`);
      await expect(page.locator(route === 'dns' ? '[data-editor-content="dns"]' : '[data-rule-list="routing"]')).toBeVisible();
      await expect(page.getByRole('heading', {name: heading, exact: true, level: 1})).toBeFocused();
      if (route === 'routing') await page.getByRole('radio', {name: '全部直連', exact: true}).click();
      await page.getByRole('link', {name: '跳至內容', exact: true}).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(page.getByRole('heading', {name: heading, exact: true, level: 1})).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (route === 'routing') await expect(page.getByRole('button', {name: '檢視並套用', exact: true})).toBeVisible();
    }
  });

  test('keyboard dialogs return focus to their trigger', async ({page}) => {
    await page.goto('/#routing');
    await expect(page.locator('[data-rule-list="routing"]')).toBeVisible();
    await expect(page.getByRole('heading', {name: '路由', exact: true, level: 1})).toBeFocused();
    for (const name of ['測試規則', '設定', '測試規則', '設定']) {
      const trigger = page.getByRole('button', {name, exact: true});
      await expect(trigger).toBeEnabled();
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('dialog[open]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
});

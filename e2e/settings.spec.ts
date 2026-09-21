import {test as browserTest} from '@playwright/test';
import {expect, test} from './fixtures';
import {translate} from '../src/i18n';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

test('first run opens settings and preserves explicit deep links', async ({page}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('.rp-nav[href="#/settings"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.rp-content .rp-card')).toHaveCount(5);
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goto('/#/connections?src=192.168.1.2');
  await expect(page).toHaveURL(/#\/connections\?src=192\.168\.1\.2$/);
  // The source filter is a server-side scope, shown as an active filter rather than search text.
  await expect(page.getByRole('button', {name: 'Clear filters', exact: true})).toBeVisible();
});

test('a pairing link fills the backend draft and removes credentials from the address bar', async ({page}) => {
  await page.goto('/#/settings?api=http://router:9527&token=x');
  await expect(page.locator('[name=api]')).toHaveValue('http://router:9527');
  await expect(page.locator('[name=token]')).toHaveValue('x');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.reload();
  await expect(page.locator('[name=api]')).toHaveValue('');
  await expect(page.locator('[name=token]')).toHaveValue('');
});

browserTest('paints a frame during discovery, then selects the hosted backend and asks for its token', async ({page}) => {
  const challenge = {
    status: 401,
    headers: {'www-authenticate': 'Bearer'},
    json: {error: {code: 'authentication_required', message: 'Valid bearer credentials are required.', details: null}, request_id: 'first-visit'}
  };
  let release!: () => void;
  const discovery = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api', async route => {
    await discovery;
    await route.fulfill(challenge);
  });
  let backendRequests = 0;
  await page.route('**/api/v1/**', route => {
    backendRequests++;
    return route.fulfill(challenge);
  });
  await page.goto('/');
  await expect(page.locator('.rp-top .rp-brand')).toBeVisible();
  await expect(page.locator('.rp-nav')).toHaveCount(0);
  expect(backendRequests).toBe(0);
  release();
  await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.rp-login')).toContainText(new URL(page.url()).host);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('doona-profiles') ?? '[]').map((item: {api: string}) => item.api))).toEqual([
    new URL(page.url()).origin
  ]);
});

test('saving mock and a token reloads and restores the default activity route', async ({page}) => {
  await page.goto('/#/settings');
  await page.locator('[name=api]').fill(' mock ');
  await page.locator('[name=token]').fill('test-secret');
  await expect(page.locator('[name=token]')).toHaveAttribute('type', 'password');
  await page.getByRole('button', {name: t('settings.showToken'), exact: true}).click();
  await expect(page.locator('[name=token]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', {name: t('settings.hideToken'), exact: true}).click();
  await expect(page.locator('.rp-content')).not.toContainText('test-secret');
  await Promise.all([page.waitForEvent('load'), page.locator('form button[type=submit]').click()]);
  await expect(page.locator('.rp-toast.positive')).toContainText('Settings saved.');
  await expect(page.locator('[name=api]')).toHaveValue('mock');
  await expect(page.locator('[name=token]')).toHaveValue('test-secret');
  await expect(page.locator('[name=token]')).toHaveAttribute('type', 'password');
  await page.goto('/#/');
  await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
});

test('an invalid URL is identified and cannot overwrite saved settings', async ({page}) => {
  await page.goto('/#/settings');
  await page.locator('[name=api]').fill('ftp://honk.example');
  await page.locator('[name=token]').fill('not-saved');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('[name=api]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('form').getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('doona-api'), localStorage.getItem('doona-api-token')])).toEqual([null, null]);
});

test('connection testing uses the unsaved prefix and token for native discovery', async ({page}) => {
  await page.route('**/settings-backend/api', async route => {
    if (route.request().headers().authorization !== 'Bearer test-token') return route.fulfill({status: 401});
    await route.fulfill({json: {name: 'dae/honk-native', status: 'draft', api_major: 1, base_path: '/api/v1', links: {version: '/api/v1/version'}}});
  });
  await page.goto('/#/settings');
  const origin = new URL(page.url()).origin;
  await page.locator('[name=api]').fill(origin + '/settings-backend/');
  await page.locator('[name=token]').fill('test-token');
  await page.getByRole('button', {name: t('settings.test'), exact: true}).click();
  await expect(page.locator('form').getByRole('status')).toContainText('API v1');
  expect(await page.evaluate(() => localStorage.getItem('doona-api'))).toBeNull();
});

test('navigation cancels a connection probe without a timeout toast', async ({page}) => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  await page.route('**/slow-backend/api', async route => {
    await promise;
    await route.fulfill({json: {api_major: 1}});
  });
  await page.goto('/#/settings');
  await page.locator('[name=api]').fill(new URL(page.url()).origin + '/slow-backend');
  const request = page.waitForRequest('**/slow-backend/api');
  await page.getByRole('button', {name: t('settings.test'), exact: true}).click();
  await request;
  await page.locator('.rp-nav[href="#/connections"]').click();
  await page.getByRole('alertdialog', {name: 'Discard unsaved changes?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Connections', exact: true})).toBeVisible();
  resolve();
  await expect(page.locator('.rp-toast')).toHaveCount(0);
});

test('a pairing link cancels the old probe and clears its result', async ({page}) => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  await page.route('**/old-backend/api', async route => {
    await promise;
    await route.fulfill({json: {api_major: 1}});
  });
  await page.route('**/new-backend/api', route => route.fulfill({json: {api_major: 2}}));
  await page.goto('/#/settings');
  const origin = new URL(page.url()).origin;
  await page.locator('[name=api]').fill(origin + '/old-backend');
  const request = page.waitForRequest('**/old-backend/api');
  const probe = page.getByRole('button', {name: t('settings.test'), exact: true});
  await probe.click();
  await request;
  await page.evaluate(api => {
    location.hash = '#/settings?api=' + encodeURIComponent(api) + '&token=paired';
  }, origin + '/new-backend');
  await page.getByRole('alertdialog', {name: 'Discard unsaved changes?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('[name=api]')).toHaveValue(origin + '/new-backend');
  await expect(probe).toBeEnabled();
  resolve();
  await expect(page.locator('form').getByRole('status')).toHaveCount(0);
  await probe.click();
  await expect(page.locator('form').getByRole('status')).toContainText('API v2');
  await page.evaluate(() => {
    location.hash = '#/settings?api=mock';
  });
  await page.getByRole('alertdialog', {name: 'Discard unsaved changes?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('[name=api]')).toHaveValue('mock');
  await expect(page.locator('form').getByRole('status')).toHaveCount(0);
});

// A raw browser test: 401 and 404 responses log console errors by design here.
browserTest('a backend that answers 401 gets a token form instead of the page', async ({page}) => {
  let authorization: string | null = null;
  await page.route('**/api/v1/**', async route => {
    authorization = route.request().headers()['authorization'] ?? null;
    if (!authorization)
      return route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Token required', details: null}, request_id: 'r1'}});
    return route.fulfill({status: 404, json: {error: {code: 'resource_not_found', message: 'nope', details: null}, request_id: 'r2'}});
  });
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
  await page.goto('/#/activity');
  await expect(page.getByRole('heading', {name: 'Token required'})).toBeVisible();
  await page.getByLabel('Token', {exact: true}).fill('secret-1');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Connect', exact: true}).click()]);
  await expect.poll(() => authorization).toBe('Bearer secret-1');
  await expect(page.getByRole('heading', {name: 'Token required'})).toHaveCount(0);
});

test('five taps on the duck honk, and the header wears the long name for the session', async ({page}) => {
  await page.goto('/#/activity');
  const brand = page.locator('.rp-brand .rp-brand-text > span').first();
  await expect(brand).toHaveText('doona');
  await page.locator('.rp-brand').click();
  const duck = page.getByRole('dialog', {name: 'About doona', exact: true}).getByRole('button', {name: 'Pet me', exact: true});
  for (let i = 0; i < 4; i++) await duck.click();
  await expect(brand).toHaveText('doona');
  await duck.click();
  await expect(page.getByText('Honk!', {exact: true})).toBeVisible();
  await expect(brand).toHaveText('doooooona');
  await page.getByRole('dialog').getByRole('button', {name: 'Close', exact: true}).click();
  await expect(brand).toHaveText('doooooona');
});

test('an unknown stored palette falls back to the supported moon palette', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-palette', 'unknown/palette'));
  await page.goto('/#/settings');
  await expect(page.locator('html')).toHaveAttribute('data-family', 'rose-pine');
  await expect(page.locator('html')).toHaveAttribute('data-flavour', 'moon');
  await page.getByRole('button', {name: 'Palette', exact: true}).first().click();
  await expect(page.getByRole('menuitemradio', {name: /Moon/})).toHaveAttribute('aria-checked', 'true');
});

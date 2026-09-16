import {expect, test} from './fixtures';
import {translate} from '../src/i18n';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

test('first run opens settings and preserves explicit deep links', async ({page}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('.rp-nav[href="#/settings"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.rp-content .rp-card')).toHaveCount(3);
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goto('/#/connections?src=192.168.1.2');
  await expect(page).toHaveURL(/#\/connections\?src=192\.168\.1\.2$/);
  await expect(page.locator('.rp-toolbar input')).toHaveValue('192.168.1.2');
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

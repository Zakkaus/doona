import {expect, mockBackend, test} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';

test.use({storage: {'doona-mock-profile': 'base'}});

test('unavailable capabilities mark navigation without breaking deep links', async ({page}) => {
  await page.goto('/#/rules');
  for (const route of ['events', 'rules']) {
    await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('data-unavailable', '');
  }
  await expect(page.locator('.rp-nav[href="#/settings"]')).not.toHaveAttribute('data-unavailable', '');
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  await expect(page.locator('.rp-content')).toBeVisible();
  await expect(page).toHaveURL(/#\/rules$/);
});

test('a non-auth discovery failure stays visible until Retry refreshes capabilities', async ({browser}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const responses: Record<string, unknown> = {
    '/version': await api.version(),
    '/config': await api.config()
  };
  let failed = true;
  let requests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/capabilities') {
      requests++;
      return route.fulfill(
        failed ? {status: 503, json: {error: {code: 'unavailable', message: 'Discovery unavailable'}, request_id: 'capability-failure'}} : {json: capabilities}
      );
    }
    return route.fulfill({json: responses[path]});
  });
  try {
    await page.goto('/#/config?tab=source');
    const alert = page.locator('.rp-content > .rp-alert');
    await expect(alert).toContainText('Discovery unavailable');
    await expect(page.locator('.cm-content')).toBeVisible();
    failed = false;
    await alert.getByRole('button', {name: 'Retry'}).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
    expect(requests).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
  }
});

test('a login draft cannot be saved after another tab changes the challenged endpoint', async ({page, context}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET capabilities'] = async () => {
    throw new ApiError(401, 'authentication_required', 'Token required');
  };
  await page.goto('/#/activity');
  const token = page.getByRole('textbox', {name: 'Token', exact: true});
  await expect(page.getByRole('heading', {name: 'Token required'})).toBeVisible();
  await page.getByLabel('Token', {exact: true}).fill('challenge-secret');
  const other = await context.newPage();
  await other.route('**/*', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Profile storage</title>'}));
  await other.goto('/');
  const saved = await other.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('doona-profiles')!);
    profiles[0].api = location.origin + '/different-backend';
    profiles[0].token = 'replacement-secret';
    const raw = JSON.stringify(profiles);
    localStorage.setItem('doona-profiles', raw);
    return raw;
  });
  await other.close();
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('The backend settings changed');
  await page.getByRole('button', {name: 'Show token'}).click();
  await expect(token).toHaveValue('challenge-secret');
  expect(await page.evaluate(() => localStorage.getItem('doona-profiles'))).toBe(saved);
  expect(backend.requests.some(request => request.headers().authorization === 'Bearer challenge-secret')).toBe(false);
});

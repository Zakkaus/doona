import {expect, mockBackend, routes, test} from './fixtures';
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
  await expect(page.getByRole('alert')).toContainText('The profile changed');
  await page.getByRole('button', {name: 'Show token'}).click();
  await expect(token).toHaveValue('challenge-secret');
  expect(await page.evaluate(() => localStorage.getItem('doona-profiles'))).toBe(saved);
  expect(backend.requests.some(request => request.headers().authorization === 'Bearer challenge-secret')).toBe(false);
});

test('without discovery, the nodes page reads its nodes but not the groups it only sorts by', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET capabilities'] = async () => {
    throw new ApiError(503, 'temporarily_unavailable', 'Discovery unavailable');
  };
  const nodesRead = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/api/v1/nodes'));
  await page.goto('/#/nodes?tab=latency');
  await expect(page.locator('.rp-content > .rp-alert')).toContainText('Discovery unavailable');
  await nodesRead;
  await expect(page.getByRole('tab', {name: 'Latency'})).toHaveAttribute('aria-selected', 'true');
  // The chart has drawn from the nodes, long after the page asked for everything it reads.
  await expect(page.getByRole('tabpanel', {name: 'Latency'}).getByRole('region', {name: 'Node latency'})).toBeVisible();
  expect(backend.requests.filter(request => new URL(request.url()).pathname.endsWith('/api/v1/groups'))).toHaveLength(0);
});

test('a failed discovery is reported once, by the shell, on the activity and DNS pages', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET capabilities'] = async () => {
    throw new ApiError(500, 'internal_error', 'Discovery failed');
  };
  for (const route of ['activity', 'dns']) {
    await page.goto('/#/' + route);
    await expect(page.locator('.rp-content > .rp-alert').first()).toContainText('Discovery failed');
    await expect(page.locator('.rp-alert', {hasText: 'Discovery failed'})).toHaveCount(1);
    await expect(page.locator('.rp-content [role=status]')).toHaveCount(0);
  }
});

// The first honk-native profile exposes only runtime and userspace-observed connections.
test.describe('first-release backend', () => {
  test.use({storage: {'doona-mock-profile': 'm1'}});

  test('the shell marks what the backend lacks and every offered page loads clean', async ({page}) => {
    await page.goto('/#/activity');
    await expect(page.locator('.rp-strip')).toBeVisible();
    await expect(page.locator('.rp-nav')).toHaveCount(routes.length);
    await expect(page.locator('.rp-nav:not([data-unavailable])')).toHaveText(['Activity', 'Overview', 'Connections', 'Settings']);
    for (const route of ['overview', 'connections', 'settings'] as const) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-nav[href="#/' + route + '"]')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.rp-content')).toBeVisible();
    }
    for (const route of routes.filter(r => !['activity', 'overview', 'connections', 'settings'].includes(r))) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content')).toBeVisible();
    }
    await page.goto('/#/connections?tab=list');
    await expect(page.locator('.rp-table [role=row][data-key]').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'Close all', exact: true})).toHaveCount(0);
    await expect(page.getByText('Partial connection visibility', {exact: true})).toBeVisible();
    await page.keyboard.press('Control+K');
    await page.locator('.rp-dialog input').fill('telegram');
    await expect(page.getByRole('option', {name: /api\.telegram\.org/})).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

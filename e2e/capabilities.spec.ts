import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

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

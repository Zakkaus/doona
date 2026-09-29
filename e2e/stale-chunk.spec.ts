import {expect, expectLoadFailures, test} from './fixtures';

// Keep install-time precaching out of the requests the specs count.
test.use({serviceWorkers: 'block', storage: {'doona-api': 'mock'}, signedIn: 'legacy'});

const CONFIG_CHUNK = '**/assets/Config-*.js';

test.beforeEach(async ({page}) => {
  expectLoadFailures(page, /\/Config-[^/]+\.js$/);
  // Without idle-time warming, the Settings-to-Config navigation is the first request for the chunk.
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
  });
});

test('a lazy page whose chunk is gone reloads once and loads the new build', async ({page}) => {
  let requests = 0;
  await page.route(CONFIG_CHUNK, route => {
    requests += 1;
    return requests === 1 ? route.fulfill({status: 404}) : route.continue();
  });
  await page.goto('/#/activity');
  await expect(page.locator('.rp-strip')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as {survivesReload: boolean}).survivesReload = true;
    location.hash = '#/config';
  });
  await expect(page.locator('.rp-content > .rp-page')).toBeVisible();
  expect(await page.evaluate(() => 'survivesReload' in window), 'the page reloaded').toBe(false);
  expect(requests).toBe(2);
  await expect(page.locator('.rp-alert')).toHaveCount(0);
});

test('a reload that just happened is not repeated: the page says doona was updated', async ({page}) => {
  await page.addInitScript(() => sessionStorage.setItem('doona-stale-reload', String(Date.now())));
  let missing = true;
  await page.route(CONFIG_CHUNK, route => (missing ? route.fulfill({status: 404}) : route.continue()));
  await page.goto('/#/activity');
  await expect(page.locator('.rp-strip')).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/config';
  });
  const alert = page.locator('.rp-content .rp-alert');
  await expect(alert).toContainText('doona has been updated. Reload to load the new version.');
  await expect(alert).not.toContainText('dynamically imported');
  const reload = alert.getByRole('button', {name: 'Reload'});
  await expect(reload).toBeVisible();

  missing = false;
  await reload.click();
  await expect(page.locator('.rp-content > .rp-page')).toBeVisible();
  await expect(page.locator('.rp-alert')).toHaveCount(0);
});

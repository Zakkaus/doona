import {expect, routes, test} from './fixtures';

// Keep install-time precaching out of the navigation request log.
test.use({serviceWorkers: 'block', storage: {'doona-api': 'mock'}});

for (const route of routes) {
  test(`cold navigation to ${route} loads its chunks`, async ({page}) => {
    const scripts = new Set<string>();
    const failedResponses: string[] = [];
    const failedRequests: string[] = [];
    page.on('request', request => {
      if (/\/assets\/[^/]+\.js$/.test(new URL(request.url()).pathname)) scripts.add(request.url());
    });
    page.on('response', response => {
      if (!response.ok()) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => failedRequests.push(request.url()));

    await page.goto('/#/activity');
    await expect(page.locator('.rp-strip')).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.evaluate(route => {
      location.hash = `#/${route}`;
    }, route);
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
    const content = route === 'activity' ? '.rp-strip' : route === 'settings' ? '#settings-backend' : '.rp-content > .rp-page';
    await expect(page.locator(content)).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Each page is its own chunk, fetched during idle time after the first page or on navigation.
    if (route !== 'activity') {
      const chunk = route[0].toUpperCase() + route.slice(1);
      expect(
        [...scripts].some(url => new RegExp(`/${chunk}-[^/]+\\.js$`).test(url)),
        `${chunk} chunk requested`
      ).toBe(true);
    }
    expect(failedResponses, 'Non-2xx responses').toHaveLength(0);
    expect(failedRequests, 'Failed requests').toHaveLength(0);
  });
}

test('slow page chunks delay the loading treatment without hiding the frame', async ({page}) => {
  // The gate is up before the shell warms the page chunks, so the policies chunk stays in flight.
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/Policies-*.js', async route => {
    await gate;
    await route.continue();
  });
  const requested = page.waitForRequest('**/assets/Policies-*.js');
  await page.goto('/#/activity');
  await expect(page.locator('.rp-strip')).toBeVisible();
  await requested;
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  const frame = page.locator('.rp-top, .rp-side, .rp-head');
  const bounds = () => frame.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  const before = await bounds();
  try {
    await page.evaluate(() => {
      location.hash = '#/policies';
    });
    await expect(page.locator('.rp-nav[href="#/policies"]')).toHaveAttribute('aria-current', 'page');
    const fallback = page.locator('.rp-content > .rp-empty');
    await page.clock.runFor(149);
    await expect(fallback).toHaveCount(0);
    await expect(page.locator('.rp-content')).toBeVisible();
    await page.clock.runFor(1);
    await expect(fallback).toBeVisible();
    expect(await bounds()).toEqual(before);
  } finally {
    release();
    await page.clock.resume();
  }
  await expect(page.locator('.rp-content > .rp-page')).toBeVisible();
  expect(await bounds()).toEqual(before);
});

test('activity keeps card geometry while its charts load', async ({page}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/vendor-charts-*.js', async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#/activity', {waitUntil: 'domcontentloaded'});
    await expect(page.locator('.rp-donut .center')).toBeVisible();
    await expect(page.locator('.rp-legend').first()).toBeVisible();
    const cards = page.locator('.rp-content .rp-card');
    const before = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    await expect(page.locator('.recharts-surface')).toHaveCount(0);
    release();
    await expect(page.locator('.recharts-surface')).toHaveCount(6);
    expect(await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()))).toEqual(before);
  } finally {
    release();
  }
});

for (const chunk of ['Policies', 'vendor-charts']) {
  test(`a rejected ${chunk} import preserves navigation and recovers after retry`, async ({browser}) => {
    const context = await browser.newContext({serviceWorkers: 'block'});
    const page = await context.newPage();
    const uncaught: string[] = [];
    page.on('pageerror', error => uncaught.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('doona-api', 'mock');
      localStorage.setItem('doona-lang', 'en');
    });
    let reject = true;
    await page.route(`**/assets/${chunk}-*.js`, route => (reject ? route.abort() : route.continue()));
    try {
      await page.goto(chunk === 'Policies' ? '/#/policies' : '/#/activity');
      const alert = page.locator('.rp-content .rp-alert').first();
      await expect(alert).toBeVisible();
      await expect(alert.getByRole('button', {name: 'Retry'})).toBeVisible();
      await page.locator('.rp-nav[href="#/settings"]').click();
      await expect(page.locator('#settings-backend')).toBeVisible();
      await page.locator(`.rp-nav[href="#/${chunk === 'Policies' ? 'policies' : 'activity'}"]`).click();
      await expect(alert).toBeVisible();
      reject = false;
      await alert.getByRole('button', {name: 'Retry'}).click();
      await expect(page.locator(chunk === 'Policies' ? '.rp-content > .rp-page' : '.rp-strip')).toBeVisible();
      await expect(page.locator('.rp-content .rp-alert')).toHaveCount(0);
      if (chunk === 'vendor-charts') await expect(page.locator('.recharts-surface')).toHaveCount(6);
      expect(uncaught).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

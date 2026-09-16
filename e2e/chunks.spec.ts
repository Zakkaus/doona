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

    await page.goto('/#/overview');
    await expect(page.locator('.rp-strip')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const initialScripts = new Set(scripts);

    await page.evaluate(route => {
      location.hash = `#/${route}`;
    }, route);
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
    const content = route === 'overview' ? '.rp-strip' : route === 'settings' ? '#settings-backend' : '.rp-content > .rp-page';
    await expect(page.locator(content)).toBeVisible();
    await page.waitForLoadState('networkidle');

    if (route !== 'overview' && route !== 'settings') {
      expect([...scripts].filter(url => !initialScripts.has(url)).length, 'New lazy-route JS requests').toBeGreaterThanOrEqual(1);
    }
    expect(failedResponses, 'Non-2xx responses').toHaveLength(0);
    expect(failedRequests, 'Failed requests').toHaveLength(0);
  });
}

test('slow page chunks delay the loading treatment without hiding the frame', async ({page}) => {
  await page.goto('/#/overview');
  await page.waitForLoadState('networkidle');
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/Policies-*.js', async route => {
    await gate;
    await route.continue();
  });
  const frame = page.locator('.rp-top, .rp-side, .rp-head');
  const bounds = () => frame.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  const before = await bounds();
  try {
    const requested = page.waitForRequest('**/assets/Policies-*.js');
    await page.evaluate(() => {
      location.hash = '#/policies';
    });
    await requested;
    await expect(page.locator('.rp-nav[href=\"#/policies\"]')).toHaveAttribute('aria-current', 'page');
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

test('overview keeps card geometry while its charts load', async ({page}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/vendor-charts-*.js', async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#/overview', {waitUntil: 'domcontentloaded'});
    await expect(page.locator('.rp-donut .center')).toBeVisible();
    await expect(page.locator('.rp-legend')).toBeVisible();
    const cards = page.locator('.rp-content .rp-card');
    const before = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    await expect(page.locator('.recharts-surface')).toHaveCount(0);
    release();
    await expect(page.locator('.recharts-surface')).toHaveCount(5);
    expect(await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()))).toEqual(before);
  } finally {
    release();
  }
});

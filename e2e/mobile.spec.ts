import {expect, mockBackend, routes, test} from './fixtures';

test.use({viewport: {width: 390, height: 844}});

test('the bottom bar opens its four pages and marks the open one', async ({page}) => {
  await page.goto('/#/activity');
  const bar = page.getByRole('navigation', {name: 'Pages'});
  await expect(bar.locator('[aria-current]')).toHaveCount(0);
  for (const [route, label] of [
    ['overview', 'Overview'],
    ['connections', 'Connections'],
    ['nodes', 'Nodes'],
    ['rules', 'Rules']
  ]) {
    const link = bar.getByRole('link', {name: label});
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(bar.locator('[aria-current]')).toHaveCount(1);
  }
  for (const box of await bar.locator('a, button').evaluateAll(items => items.map(item => item.getBoundingClientRect())))
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
});

test('More lists every page in a drawer that traps focus and gives it back', async ({page}) => {
  await page.goto('/#/activity');
  const more = page.getByRole('button', {name: 'More'});
  const drawer = page.getByRole('dialog', {name: 'Pages'});
  await more.click();
  await expect(drawer.locator('.rp-nav')).toHaveCount(routes.length);
  for (const route of routes) await expect(drawer.locator(`.rp-nav[href="#/${route}"]`)).toBeVisible();
  for (let index = 0; index < routes.length + 3; index++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(more).toBeFocused();

  // A tap on the underlay closes it, and so does following a link; a page outside the bar marks More.
  await more.click();
  expect((await page.locator('.rp-navdrawer').boundingBox())!.x).toBeGreaterThanOrEqual(48);
  await page.mouse.click(8, 400);
  await expect(drawer).toHaveCount(0);
  await more.click();
  await drawer.getByRole('link', {name: 'DNS'}).click();
  await expect(page).toHaveURL(/#\/dns$/);
  await expect(drawer).toHaveCount(0);
  await expect(more).toHaveAttribute('data-current', '');
});

test('the bottom bar leaves the end of the page uncovered', async ({page}) => {
  await page.goto('/#/overview');
  await expect(page.locator('.rp-content > *').first()).toBeVisible();
  await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
  // Long enough to scroll, so the bar would sit over the end of the page without the reserved space.
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const {content, bar} = await page.evaluate(() => ({
    content: document.querySelector('.rp-content')!.getBoundingClientRect().bottom,
    bar: document.querySelector('.rp-bottomnav')!.getBoundingClientRect().top
  }));
  expect(content).toBeLessThanOrEqual(bar);
});

test.describe('desktop', () => {
  test.use({viewport: {width: 1280, height: 900}});
  test('keeps the side navigation and hides the bottom bar', async ({page}) => {
    await page.goto('/#/overview');
    await expect(page.locator('.rp-side')).toBeVisible();
    await expect(page.locator('.rp-bottomnav')).toBeHidden();
  });
});

for (const [scheme, palette] of [
  ['light', 'rose-pine/main'],
  ['dark', 'rose-pine/main'],
  ['dark', 'glass/glass']
]) {
  test.describe(`${scheme} ${palette}`, () => {
    test.use({storage: {'doona-scheme': scheme, 'doona-palette': palette}});
    test('tabs contain wrapped labels and their selection marker at phone width', async ({page}) => {
      for (const route of ['rules', 'config?tab=setup']) {
        await page.goto('/#/' + route);
        const bar = page.locator('.rp-tabbar').first();
        await expect(bar.getByRole('tab').first()).toBeVisible();
        const bounds = await bar.getByRole('tab').evaluateAll(tabs =>
          tabs.map(tab => {
            const box = tab.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(tab);
            const text = range.getBoundingClientRect();
            return {top: text.top - box.top, bottom: box.bottom - text.bottom};
          })
        );
        for (const boundsOfTab of bounds) {
          expect(boundsOfTab.top).toBeGreaterThanOrEqual(0);
          expect(boundsOfTab.bottom).toBeGreaterThanOrEqual(0);
        }
        const selected = await bar.locator('[data-selected]').boundingBox();
        const marker = await bar.locator('.rp-slider').boundingBox();
        expect(marker!.height).toBeGreaterThanOrEqual(selected!.height - 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      }
    });

    test('diagnostic prose wraps and empty tables stay centered while scrolled', async ({page}) => {
      const backend = await mockBackend(page);
      const config = await backend.api.config();
      const message = 'duplicate endpoint identity; retaining the first usable entry';
      config.diagnostics = [
        {level: 'warning', message, source_id: config.sources[0].id, line: null, column: null, span: null, code: 'duplicate-subscription-entry'}
      ];
      backend.handlers['GET config'] = async () => config;
      const cache = await backend.api.dnsCache();
      backend.handlers['GET dns/cache'] = async () => ({...cache, total: 0, entries: []});
      await page.goto('/#/config?tab=source');
      const light = page.locator('.rp-light', {hasText: message}).first();
      await expect(light).toBeVisible();
      const prose = await light.evaluate(el => {
        const text = el.querySelector('span')!;
        const range = document.createRange();
        range.selectNodeContents(text);
        const box = el.closest('.rp-card')!.getBoundingClientRect();
        return {lines: range.getClientRects().length, contained: [...range.getClientRects()].every(rect => rect.left >= box.left && rect.right <= box.right)};
      });
      expect(prose.lines).toBeGreaterThan(1);
      expect(prose.contained).toBe(true);
      await page.goto('/#/dns?tab=cache');
      const table = page.locator('.rp-table');
      const empty = table.getByText('No cache entries', {exact: true});
      await expect(empty).toBeVisible();
      for (const scroll of [false, true]) {
        if (scroll)
          await table.evaluate(el => {
            el.scrollLeft = el.scrollWidth;
          });
        const offset = await empty.evaluate(el => {
          const viewport = el.closest('.rp-table')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          return Math.abs((text.left + text.right) / 2 - (viewport.left + viewport.right) / 2);
        });
        expect(offset).toBeLessThanOrEqual(2);
      }
    });
  });
}

// The narrowest supported phone: every page fits without scrolling sideways.
test.describe('320px', () => {
  test.use({viewport: {width: 320, height: 640}});
  for (const route of [...routes, 'flows']) {
    test(`no horizontal overflow on ${route}`, async ({page}) => {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content > *').first()).toBeVisible();
      // WebKit's per-page load check: the page is the current one and has finished loading.
      if (route !== 'flows') await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});

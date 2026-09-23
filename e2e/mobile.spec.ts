import {expect, mockBackend, routes, test} from './fixtures';

test.use({viewport: {width: 390, height: 844}});

test('mobile page select exposes and opens every page without horizontal overflow', async ({page}) => {
  await page.goto('/#/activity');
  const select = page.locator('.rp-mobile-nav').getByRole('button');
  // The mock offers every route, so the select should preserve registry order.
  await select.click();
  const listed = await page.getByRole('option').evaluateAll(items => items.map(item => item.getAttribute('data-key')));
  await page.keyboard.press('Escape');
  const shown = routes.filter(route => listed.includes(route));
  expect(shown.length).toBe(listed.length);
  for (const [index, route] of shown.entries()) {
    await select.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(shown.length);
    await options.nth(index).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
  }
  await page.goto('/#/activity');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
      await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});

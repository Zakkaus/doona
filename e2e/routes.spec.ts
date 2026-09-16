import {expect, routes, test} from './fixtures';

for (const scheme of ['light', 'dark']) {
  test.describe(scheme, () => {
    test.use({storage: {'doona-scheme': scheme}});
    for (const route of routes) {
      test(route, async ({page}) => {
        await page.goto(`/#/${route}`);
        await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);
        await expect(page.locator('.rp-content')).toBeVisible();
        const nav = page.locator(`.rp-nav[href="#/${route}"]`);
        await expect(nav).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
      });
    }
  });
}

for (const width of [1024, 1280, 1440]) {
  test(`desktop tables fit their scrollports at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1400});
    for (const route of ['dns', 'flows', 'rules', 'connections', 'clients', 'events', 'overview']) {
      await page.goto(`/#/${route}`);
      await expect(page.getByRole('grid').first()).toBeVisible();
      if (route === 'rules') {
        await page.getByRole('button', {name: 'Trace', exact: true}).click();
        await expect(page.getByRole('grid', {name: 'Rule evaluation 1'})).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const tables = page.locator('.rp-table');
      for (const table of await tables.all()) {
        await expect.poll(() => table.evaluate(el => el.scrollWidth - el.clientWidth), `${route}: table overflow`).toBe(0);
        for (const grid of await table.locator('table').all()) {
          await expect
            .poll(() => grid.evaluate(el => el.getBoundingClientRect().width - el.parentElement!.clientWidth), `${route}: table fills container`)
            .toBe(0);
        }
      }
      if (route === 'dns') {
        expect(
          await tables
            .getByRole('rowheader')
            .first()
            .evaluate(el => el.getBoundingClientRect().width)
        ).toBeGreaterThanOrEqual(160);
      }
      if (route === 'rules') {
        const split = page.locator('.rp-split');
        const table = await split.locator('.rp-table').boundingBox();
        const detail = await split.locator('.rp-card').boundingBox();
        expect(table).not.toBeNull();
        expect(detail).not.toBeNull();
        if (width < 1440) expect(detail!.y).toBeGreaterThanOrEqual(table!.y + table!.height);
        else {
          expect(table!.width).toBeGreaterThanOrEqual(720);
          expect(detail!.x).toBeGreaterThanOrEqual(table!.x + table!.width);
        }
      }
    }
  });
}

test('narrow tables retain readable columns and stop scrolling after a desktop resize', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/dns');
  const table = page.locator('.rp-table');
  const domain = table.getByRole('rowheader').first();
  await expect(domain).toBeVisible();
  await expect.poll(() => table.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
  expect(await domain.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(160);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({width: 1024, height: 1400});
  await expect.poll(() => table.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  expect(await domain.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(160);
});

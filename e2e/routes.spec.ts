import {expect, isLive, offered, routes, test} from './fixtures';

for (const scheme of ['light', 'dark']) {
  test.describe(scheme, () => {
    test.use({storage: {'doona-scheme': scheme}});
    for (const route of routes) {
      test(route, async ({page}) => {
        await page.goto(`/#/${route}`);
        test.skip(!(await offered(page, route)), 'not offered by this backend');
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
    for (const route of ['dns', 'rules', 'connections', 'events', 'overview']) {
      await page.goto(`/#/${route}`);
      if (!(await offered(page, route))) continue;
      // Tables that sit behind a tab or a fold are opened first; the fit rule applies to all of them.
      if (route === 'dns') await page.getByRole('tab', {name: 'Cache', exact: true}).click();
      if (route === 'rules') {
        await page.getByRole('tab', {name: 'Trace simulation', exact: true}).click();
        await page.getByRole('button', {name: 'Run trace', exact: true}).click();
        await expect(page.getByRole('grid', {name: 'Rule evaluation 1'})).toBeVisible();
      }
      const grids = page.getByRole('grid').or(page.getByRole('treegrid'));
      await expect(page.locator('.rp-content > .rp-page')).toBeVisible();
      await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
      // A live backend with nothing to list shows an empty state instead of a table.
      if (isLive && !(await grids.count())) continue;
      await expect(grids.first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const tables = page.locator('.rp-table');
      for (const table of await tables.all()) {
        await expect.poll(() => table.evaluate(el => el.scrollWidth - el.clientWidth), `${route}: table overflow`).toBe(0);
        for (const grid of await table.locator('table').all()) {
          // Fractional grid tracks can leave a sub-pixel gap; anything visible is a real misfit.
          await expect
            .poll(() => grid.evaluate(el => Math.abs(el.getBoundingClientRect().width - el.parentElement!.clientWidth)), `${route}: table fills container`)
            .toBeLessThan(1);
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
    }
  });
}

test('narrow tables retain readable columns and stop scrolling after a desktop resize', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/dns?tab=cache');
  test.skip(!(await offered(page, 'dns')), 'not offered by this backend');
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

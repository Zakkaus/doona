import {expect, isLive, offered, routes, test} from './fixtures';
import type {RoutePath} from '../src/shell/routes';

for (const width of [1024, 1280, 1440]) {
  test(`desktop tables fit their scrollports at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1400});
    for (const route of ['dns', 'rules', 'connections', 'events', 'overview']) {
      // The connections table sits behind the traffic tab.
      await page.goto(`/#/${route}${route === 'connections' ? '?tab=list' : ''}`);
      if (!(await offered(page, route))) continue;
      await expect(page.locator('.rp-content > .rp-page')).toBeVisible();
      await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
      // Tables that sit behind a tab or a fold are opened first; the fit rule applies to all of them.
      if (route === 'dns') await page.getByRole('tab', {name: 'Cache', exact: true}).click();
      // A live backend may offer the rules page without the trace simulation.
      if (route === 'rules' && (await page.getByRole('tab', {name: 'Trace simulation', exact: true}).count())) {
        await page.getByRole('tab', {name: 'Trace simulation', exact: true}).click();
        // A name the demo DNS cache answers, so the evaluation table renders.
        await page.getByLabel('Domain', {exact: true}).fill('api.telegram.org');
        await page.getByLabel('Destination port', {exact: true}).fill('443');
        await page.getByRole('button', {name: 'Run trace', exact: true}).click();
        await expect(page.getByRole('grid', {name: 'Rule evaluation 1'})).toBeVisible();
      }
      const grids = page.getByRole('grid').or(page.getByRole('treegrid'));
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

// A scroll container that overflows by a pixel grows a scrollbar; every palette family is held to zero overflow.
// Pages whose default tab holds no table are checked on the tab that does.
const tableTab: Partial<Record<RoutePath, string>> = {dns: 'cache', rules: 'list'};
for (const palette of ['glass/glass', 'rose-pine/moon', 'catppuccin/mocha']) {
  test.describe(`${palette} scroll containers`, () => {
    test.use({storage: {'doona-palette': palette}});
    test('no scroll container overflows sideways without content that needs it', async ({page}) => {
      for (const route of routes) {
        await page.goto(`/#/${route}${tableTab[route] ? `?tab=${tableTab[route]}` : ''}`);
        await expect(page.locator('.rp-content').getByRole('heading').first()).toBeVisible();
        await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
        const spurious = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.rp-content *')]
            .filter(el => {
              const overflow = getComputedStyle(el).overflowX;
              return (overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth && el.scrollWidth - el.clientWidth < 4;
            })
            .map(el => `${route}: ${el.className}`)
        );
        expect(spurious).toEqual([]);
      }
    });
  });
}

test('an unknown history entry is replaced so Back can reach the preceding page', async ({page}) => {
  await page.goto('/#/settings');
  await expect(page.locator('#settings-backend')).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/oldpage';
  });
  await expect(page).toHaveURL(/#\/activity$/);
  const length = await page.evaluate(() => history.length);
  await page.goBack();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/activity$/);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack();
  await expect(page).toHaveURL(/#\/settings$/);
});

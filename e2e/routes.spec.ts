import {expect, isLive, loadingState, mockBackend, offered, routes, test} from './fixtures';
import type {RoutePath} from '../src/shell/routes';

for (const width of [1024, 1280, 1440]) {
  test(`desktop tables fit their scrollports at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1400});
    for (const route of ['dns', 'rules', 'connections', 'events', 'overview']) {
      // The connections table sits behind the traffic tab.
      await page.goto(`/#/${route}${route === 'connections' ? '?tab=list' : ''}`);
      if (!(await offered(page, route))) continue;
      await expect(page.locator('.rp-content > .rp-page')).toBeVisible();
      await expect(page.locator(`.rp-content ${loadingState}`)).toHaveCount(0);
      // Tables that sit behind a tab or a fold are opened first; the fit rule applies to all of them.
      if (route === 'dns') await page.getByRole('tab', {name: 'Cache', exact: true}).click();
      // A live backend may offer the rules page without the trace simulation.
      if (route === 'rules' && (await page.getByRole('tab', {name: 'Trace simulation', exact: true}).count())) {
        await page.getByRole('tab', {name: 'Trace simulation', exact: true}).click();
        // A name the demo DNS cache answers, so the evaluation table renders.
        await page.getByLabel('Domain', {exact: true}).fill('api.telegram.org');
        await page.getByRole('textbox', {name: 'Destination port', exact: true}).fill('443');
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
  // Once virtualised, the grid scrolls itself rather than its container.
  const overflow = () =>
    table.evaluate(el => {
      const scroller = el.querySelector<HTMLElement>(':scope > div[role=grid]') ?? el;
      return scroller.scrollWidth - scroller.clientWidth;
    });
  await expect.poll(overflow).toBeGreaterThan(0);
  expect(await domain.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(160);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({width: 1024, height: 1400});
  await expect.poll(overflow).toBe(0);
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
        await page.waitForFunction(selector => !document.querySelector(selector), `.rp-content ${loadingState}`);
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

// A first load whose shape is known draws Skeletons, not the progress circle (CONTRIBUTING, Loading states), and
// their shimmer stands still under reduced motion.
test('first loads draw skeletons on every page', async ({page}) => {
  test.skip(isLive, 'holds the mock backend');
  await mockBackend(page);
  let hold = true;
  await page.route(/\/api\/v1\/(?!capabilities|version)/, async route => {
    if (hold) await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fallback();
  });
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const route of ['activity', 'policies', 'nodes', 'dns?tab=stats', 'settings', 'config']) {
    hold = true;
    await page.goto(`/#/${route}`);
    await page.reload();
    const skeleton = page.locator(`.rp-content ${loadingState}`).first();
    await expect(skeleton, route).toBeVisible();
    await expect(page.locator('.rp-content .rp-empty[role=status]'), route).toHaveCount(0);
    const shimmer = await page.evaluate(() => {
      const bar = document.querySelector('.rp-content .rp-skeleton-text');
      const card = document.querySelector('.rp-content .rp-skeleton-cards > .rp-card');
      return bar ? getComputedStyle(bar).animationName : card && getComputedStyle(card, '::after').animationName;
    });
    expect(shimmer, route).toBe('none');
    hold = false;
    await expect(page.locator(`.rp-content ${loadingState}`), route).toHaveCount(0, {timeout: 10_000});
  }
});

// The Skeletons take the boxes the content will: each box's top and height before the first reads arrive match
// within 1px once they have. A box whose height follows the data it draws keeps its top only: the topology tree,
// the source editor (the file's length), the node latency chart (one row per node), and on Activity the control row,
// whose cards share the row by their text, and the latency list. DNS chart cards, whose height follows the records,
// are left out.
const steadyBoxes: Array<{route: string; before: string; after: string; heights: (i: number) => boolean}> = [
  {route: 'activity', before: '.rp-dashboard-cell', after: '.rp-dashboard-cell', heights: i => i >= 3 && i <= 12},
  {route: 'policies', before: '.rp-policy-list .rp-page-skeleton .rp-card', after: '.rp-policy-list > .rp-col > .rp-card', heights: () => true},
  // The provider line's group takes no box of its own, so its bar stands in for the line.
  {
    route: 'nodes?tab=list',
    before: '.rp-tabpanel[data-shown] > *, .rp-tabpanel[data-shown] > .rp-skeleton-group > :not([role=status])',
    after: '.rp-tabpanel[data-shown] > *',
    heights: () => true
  },
  {
    route: 'nodes?tab=latency',
    before: '.rp-tabpanel[data-shown] .rp-chart-page > *',
    after: '.rp-tabpanel[data-shown] .rp-chart-page > *',
    heights: i => i === 0
  },
  {route: 'settings', before: '.rp-content section.rp-card', after: '.rp-content section.rp-card', heights: () => true},
  {
    route: 'config?tab=modules',
    before: '.rp-content .rp-tabbar, .rp-tabpanel[data-shown] .rp-card',
    after: '.rp-content .rp-tabbar, .rp-tabpanel[data-shown] .rp-card',
    heights: () => true
  },
  {
    route: 'config?tab=source',
    before: '.rp-content .rp-tabbar, .rp-tabpanel[data-shown] .rp-skeleton-body',
    after: '.rp-content .rp-tabbar, .rp-tabpanel[data-shown] .rp-card',
    heights: i => i === 0
  },
  {
    route: 'flows',
    before: '.rp-content .rp-tabbar, .rp-tabpanel[data-shown] .rp-card',
    after: '.rp-content .rp-tabbar, .rp-tabpanel[data-shown] .rp-card',
    heights: i => i === 0
  }
];
for (const {route, before, after, heights} of steadyBoxes)
  test(`the first-load Skeletons of ${route} take the content's boxes`, async ({page}) => {
    test.skip(isLive, 'holds the mock backend');
    await mockBackend(page);
    // Getting started settled, as for anyone past the first run, so Activity draws its cards at once.
    await page.addInitScript(() => localStorage.setItem('doona-getting-started', 'complete'));
    let release!: () => void;
    const held = new Promise<void>(resolve => (release = resolve));
    await page.route(/\/api\/v1\/(?!capabilities|version)/, async route => {
      await held;
      await route.fallback();
    });
    await page.setViewportSize({width: 1440, height: 920});
    await page.goto(`/#/${route}`);
    // The page's own Skeletons, once its code has arrived.
    await expect(page.locator(before).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const boxes = (selector: string) =>
      page.evaluate(
        s =>
          [...document.querySelectorAll(s)]
            .map(element => element.getBoundingClientRect())
            .filter(box => box.height > 0)
            .map(box => ({top: box.top + scrollY, height: box.height})),
        selector
      );
    const waiting = await boxes(before);
    release();
    await expect(page.locator(`.rp-content ${loadingState}`)).toHaveCount(0, {timeout: 10_000});
    const loaded = (await boxes(after)).slice(0, waiting.length);
    expect(loaded).toHaveLength(waiting.length);
    waiting.forEach((box, i) => {
      // Activity's control row is checked by height only below it: the rows after it move with it.
      if (!(route === 'activity')) expect(Math.abs(loaded[i].top - box.top), `${route} box ${i} top`).toBeLessThanOrEqual(1);
      if (heights(i)) expect(Math.abs(loaded[i].height - box.height), `${route} box ${i} height`).toBeLessThanOrEqual(1);
    });
  });

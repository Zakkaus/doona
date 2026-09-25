import {expect, test} from './fixtures';

// Headless Chromium hides scrollbars by default; with classic scrollbars shown, as in Chromium on Linux and Windows,
// a table whose scroller gains a scrollbar after load, or switches from a native to a virtualised grid, used to slide
// every column sideways a moment after the rows arrived (tables-forms.css explains the gutter that prevents it).
test.use({viewport: {width: 1440, height: 900}, launchOptions: {ignoreDefaultArgs: ['--hide-scrollbars']}});
test.skip(({browserName}) => browserName !== 'chromium', 'classic scrollbars are a Chromium launch option');

const pages = ['rules?tab=flows', 'rules?tab=list', 'connections?tab=list', 'nodes', 'logs', 'events', 'dns', 'config', 'settings', 'policies'];

for (const path of pages) {
  test(`${path}: table columns hold still while the page loads`, async ({page}) => {
    // Every frame, note each table's column edges; a change while the table and its header stay the same size is a slide.
    await page.addInitScript(() => {
      const seen = new Map<number, string>();
      const slides: string[] = [];
      Object.assign(window, {slides});
      const look = () => {
        document.querySelectorAll<HTMLElement>('.rp-table').forEach((table, index) => {
          const heads = [...table.querySelectorAll('[role=columnheader]')].map(head => Math.round(head.getBoundingClientRect().left));
          if (!heads.length) return;
          const key = `${table.offsetWidth}:${heads.length}`;
          const now = `${key}|${heads.join(',')}`;
          const before = seen.get(index);
          if (before && before.split('|')[0] === key && before !== now) slides.push(`table ${index}: ${before} -> ${now}`);
          seen.set(index, now);
        });
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    for (const load of ['first', 'reload']) {
      if (load === 'first') await page.goto(`/#/${path}`);
      else await page.reload();
      await expect(page.getByRole('heading', {level: 1})).toBeVisible();
      await page.waitForTimeout(2500);
      expect(await page.evaluate(() => (window as unknown as {slides: string[]}).slides), `${load} load`).toEqual([]);
    }
  });
}

test('the page keeps its width while a short page gives way to a long one', async ({page}) => {
  // Every frame, note the root's width and whether the page is taller than the window. A root scrollbar that comes and
  // goes with the page's height moves every table sideways by its width.
  await page.addInitScript(() => {
    const widths = new Set<number>();
    const heights = new Set<boolean>();
    Object.assign(window, {widths, heights});
    const look = () => {
      widths.add(document.documentElement.clientWidth);
      heights.add(document.documentElement.scrollHeight > innerHeight);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.goto('/#/events');
  await expect(page.getByRole('heading', {level: 1, name: 'Events'})).toBeVisible();
  await page.locator('.rp-side').getByRole('link', {name: 'Settings'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Settings'})).toBeVisible();
  await page.waitForTimeout(1000);
  const seen = await page.evaluate(() => {
    const w = window as unknown as {widths: Set<number>; heights: Set<boolean>};
    return {widths: [...w.widths], heights: [...w.heights].sort()};
  });
  expect(seen.heights, 'the route change goes from a short page to a long one').toEqual([false, true]);
  expect(seen.widths).toHaveLength(1);
});

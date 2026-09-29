import type {Page} from '@playwright/test';
import {expect, test} from './fixtures';

// Headless Chromium hides scrollbars by default; classic scrollbars, as in Chromium on Linux and Windows, give the
// table scroller its gutter. A table in a kept tab panel measures zero while hidden; the first frame it is shown again
// used to lay its rows out with every column at its minimum width, and the next frame at the width the header had.
test.use({viewport: {width: 1920, height: 1080}, launchOptions: {ignoreDefaultArgs: ['--hide-scrollbars']}});
test.skip(({browserName}) => browserName !== 'chromium', 'classic scrollbars are a Chromium launch option');

// Every frame, note the cell boxes of the first rows of each table in the shown panel. A resize observer made last,
// on a probe resized every frame, runs after the page's own observers and before the paint, so it sees what the frame
// shows rather than what a render those observers scheduled makes of it a moment later.
async function watchFrames(page: Page) {
  await page.evaluate(() => {
    const frames: string[] = [];
    Object.assign(window, {frames});
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.cssText = 'position: fixed; top: 0; left: 0; height: 1px; visibility: hidden';
    new ResizeObserver(() => {
      const grids = document.querySelectorAll('.rp-tabpanel[data-shown] .rp-table :is([role=grid], [role=treegrid])');
      const rows = [...grids].flatMap(grid => [...grid.querySelectorAll('[role=row]:has([role=gridcell], [role=rowheader])')].slice(0, 3));
      const cells = rows.map(row =>
        [...row.querySelectorAll('[role=gridcell], [role=rowheader]')]
          .map(cell => {
            const box = cell.getBoundingClientRect();
            return `${Math.round(box.left)}+${Math.round(box.width)}`;
          })
          .join(' ')
      );
      if (cells.length) frames.push(cells.join('\n'));
    }).observe(probe);
    const tick = () => {
      probe.style.width = probe.style.width === '1px' ? '2px' : '1px';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// Leave the tab the page opened on for another, come back, and compare the first frame that shows its rows with one
// half a second later. `resize` changes the window while the table is hidden.
async function switchBack(page: Page, path: string, resize?: {width: number; height: number}) {
  await page.goto(`/#/${path}`);
  const tabs = page.getByRole('tablist').first().getByRole('tab');
  const table = page.locator('.rp-tabpanel[data-shown] .rp-table');
  await expect(table.first().locator('[role=row]:has([role=gridcell])').first()).toBeVisible();
  const home = tabs.and(page.locator('[data-selected]'));
  const label = (await home.textContent())!;
  await tabs.filter({hasNotText: label}).first().click();
  await expect(table).toHaveCount(0);
  if (resize) await page.setViewportSize(resize);
  await page.waitForTimeout(300);
  await watchFrames(page);
  await tabs.filter({hasText: label}).click();
  await page.waitForTimeout(500);
  const frames = await page.evaluate(() => (window as unknown as {frames: string[]}).frames);
  expect(frames.length).toBeGreaterThan(1);
  expect(frames[0], 'first frame after the switch').toBe(frames.at(-1));
}

// The owner's screen, and a laptop's at 125%.
for (const view of [
  {width: 1920, height: 1080, deviceScaleFactor: 1},
  {width: 1536, height: 864, deviceScaleFactor: 1.25}
])
  test.describe(`${view.width}x${view.height}@${view.deviceScaleFactor}`, () => {
    test.use({
      viewport: {width: view.width, height: view.height},
      deviceScaleFactor: view.deviceScaleFactor,
      storage: {'doona-lang': 'zh-TW', 'doona-scheme': 'dark'}
    });
    test('connections: the list comes back from 流量 at its final column widths', async ({page}) => {
      await switchBack(page, 'connections?tab=list');
    });
    test('connections: the list comes back at the width of a window resized while it was hidden', async ({page}) => {
      await switchBack(page, 'connections?tab=list', {width: view.width - 320, height: view.height - 80});
    });
  });

// The other tabbed tables: kept panels come back the same way, and flow records remount.
for (const path of ['dns?tab=cache', 'dns?tab=log', 'nodes?tab=list', 'flows?tab=records'])
  test(`${path}: a table comes back from another tab at its final column widths`, async ({page}) => {
    await switchBack(page, path);
  });

// The bar is as wide as its tabs, not the row the panels share.
test('a tab bar keeps the width of its tabs', async ({page}) => {
  await page.goto('/#/dns?tab=stats');
  const bar = page.locator('.rp-tabbar').first();
  await expect(bar).toBeVisible();
  const [barWidth, rowWidth] = await bar.evaluate(el => [el.getBoundingClientRect().width, el.parentElement!.getBoundingClientRect().width]);
  expect(barWidth).toBeLessThan(rowWidth / 2);
});

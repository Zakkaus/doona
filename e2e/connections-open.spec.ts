import type {Page} from '@playwright/test';
import {expect, test} from './fixtures';

// The connections list appears at its final place and size. React Aria commits a tab list empty and fills it on a
// second pass; a table that sized itself to the window against the empty bar came up a tab's height too tall and
// shrank a frame later, re-laying its rows (src/ui/styles/tabs-panels.css).
function watchOpening() {
  const start = performance.now();
  const seen: {frames: number[][]; shift: number} = {frames: [], shift: 0};
  (window as unknown as {opening: typeof seen}).opening = seen;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries() as unknown as Array<{startTime: number; value: number; hadRecentInput: boolean}>)
      if (entry.startTime >= start && !entry.hadRecentInput) seen.shift += entry.value;
  }).observe({type: 'layout-shift', buffered: true});
  const sample = () => {
    const table = document.querySelector('.rp-table');
    if (table?.querySelector('[role="row"][data-key]')) {
      const box = table.getBoundingClientRect();
      seen.frames.push([box.y, box.height, box.width].map(Math.round));
    }
    if (seen.frames.length < 20) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

async function expectSteadyOpening(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as {opening: {frames: unknown[]}}).opening.frames.length)).toBe(20);
  const {frames, shift} = await page.evaluate(() => (window as unknown as {opening: {frames: number[][]; shift: number}}).opening);
  // Every frame from the first with rows shows the table where and as large as it settles.
  expect(new Set(frames.map(frame => frame.join()))).toEqual(new Set([frames.at(-1)!.join()]));
  expect(shift).toBeLessThan(0.02);
}

for (const viewport of [
  {width: 1440, height: 900},
  {width: 390, height: 844}
])
  test.describe(`${viewport.width}px`, () => {
    test.use({viewport});

    test('the list opened by its link appears at its final size', async ({page}) => {
      await page.addInitScript(watchOpening);
      await page.goto('/#/connections?tab=list');
      await expectSteadyOpening(page);
    });

    test('the list opened from another page appears at its final size', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('.rp-activity-surface').first()).toBeVisible();
      await page.evaluate(watchOpening);
      await page.evaluate(() => (location.hash = '#/connections?tab=list'));
      await expectSteadyOpening(page);
    });
  });

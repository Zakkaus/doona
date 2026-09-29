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

// Samples what reaches the screen: a message posted from an animation frame runs after that frame paints, before
// the work a ResizeObserver schedules in it. Sampling inside the animation frame would read layouts never painted.
function watchPainted() {
  const seen: {frames: number[][]} = {frames: []};
  (window as unknown as {painted: typeof seen}).painted = seen;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    // A kept tab panel hides its table laid out at its width, so only the shown panel's table counts.
    const box = document.querySelector('.rp-tabpanel[data-shown] .rp-table')?.getBoundingClientRect();
    if (box?.height && seen.frames.length < 20) seen.frames.push([box.y, box.height, box.width].map(Math.round));
  };
  const tick = () => {
    channel.port2.postMessage(0);
    if (seen.frames.length < 20) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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

    // While the other tab shows, the kept list is hidden; a table that sized itself then came back a window's height
    // tall and shrank a frame later (src/ui/hooks.ts).
    test('the list shown again from the other tab keeps its size', async ({page}) => {
      await page.goto('/#/connections?tab=list');
      await expect(page.locator('.rp-table [role="row"][data-key]').first()).toBeVisible();
      await page.getByRole('tab', {name: 'Traffic'}).click();
      await expect(page.locator('.rp-table')).toBeHidden();
      await page.evaluate(watchPainted);
      await page.getByRole('tab', {name: 'Connections'}).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as {painted: {frames: unknown[]}}).painted.frames.length)).toBe(20);
      const {frames} = await page.evaluate(() => (window as unknown as {painted: {frames: number[][]}}).painted);
      expect(new Set(frames.map(frame => frame.join()))).toEqual(new Set([frames.at(-1)!.join()]));
    });
  });

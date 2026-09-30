import type {Locator} from '@playwright/test';
import {expect, scrollTableToEnd, test} from './fixtures';

// A virtualised grid draws only the columns in view, so the headers are gathered while scrolling across it.
const columnNames = (grid: Locator) =>
  grid.evaluate(async el => {
    const scroller = el.tagName === 'TABLE' ? el.parentElement! : el;
    const names = new Set<string>();
    for (let x = 0; ; x += scroller.clientWidth / 2) {
      scroller.scrollLeft = x;
      await new Promise(resolve => setTimeout(resolve, 100));
      for (const header of el.querySelectorAll('[role=columnheader]')) names.add(header.textContent!.trim());
      if (x >= scroller.scrollWidth - scroller.clientWidth) return [...names];
    }
  });

// A phone keeps every column at its minimum width and scrolls the table sideways, so row actions sit at the end of the
// row rather than taking the place of other columns (src/ui/Table.tsx). ProviderTable sits inside the Nodes page's
// "Nodes" tab, above the node list, so its own `.rp-table` is the first one there.
for (const [width, url, heading, columns] of [
  [320, '/#/nodes?tab=list', 'Nodes', ['Source', 'Kind', 'Nodes', 'Usage', 'Updated', 'Auto-refresh', 'Expires', 'State', 'Actions']],
  [360, '/#/nodes?tab=list', 'Nodes', ['Source', 'Kind', 'Nodes', 'Usage', 'Updated', 'Auto-refresh', 'Expires', 'State', 'Actions']],
  [320, '/#/rules?tab=list&view=advanced', 'Routing rules', ['#', 'Expression', 'Outbound', 'Where', 'Hits', 'Actions']],
  [360, '/#/rules?by=client&tab=list&view=advanced', 'Routing rules', ['#', 'Expression', 'Outbound', 'Where', 'Hits', 'Actions']]
] as const) {
  test.describe(`${width}px`, () => {
    test.use({viewport: {width, height: 800}});

    test(`${url}: every column stays and the Actions column scrolls into the table`, async ({page}) => {
      await page.goto(url);
      const panel = page.getByRole('tabpanel', {name: heading});
      const table = panel.locator('.rp-table').first();
      await expect(table.locator('[role=row][data-key]').first()).toBeVisible();
      expect((await columnNames(table.locator('[role=grid]'))).sort()).toEqual([...columns].sort());
      await scrollTableToEnd(table.locator('[role=grid]'));
      const actions = table.getByRole('columnheader', {name: 'Actions'});
      await expect(actions).toBeInViewport({ratio: 1});
      const tableBox = await table.boundingBox();
      const actionsBox = await actions.boundingBox();
      expect(actionsBox!.x + actionsBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width + 1);
    });
  });
}

// The DNS cache keeps every column on the narrowest phone and scrolls to its Delete column.
test('the DNS cache table keeps every column at 320px and scrolls to Delete', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/#/dns?tab=cache');
  const panel = page.getByRole('tabpanel', {name: 'Cache'});
  const table = panel.locator('.rp-table').first();
  await expect(table.locator('[role=row][data-key]').first()).toBeVisible();
  expect((await columnNames(table.locator('[role=grid]'))).sort()).toEqual(['Delete', 'Domain', 'Expires', 'Stale until', 'State', 'Type']);
  await scrollTableToEnd(table.locator('[role=grid]'));
  await expect(table.getByRole('columnheader', {name: 'Delete'})).toBeInViewport({ratio: 1});
});

// A finger needs a bigger hit target on the column resizer than a mouse does, without moving the visible line at the
// column edge (src/ui/styles/tables-forms.css).
test.describe('column resizer touch target', () => {
  test.use({viewport: {width: 1280, height: 900}, hasTouch: true});

  test('the resizer hit area is at least 24px wide under a coarse pointer, with the line still at the column edge', async ({page}) => {
    await page.goto('/#/rules?tab=list&view=advanced');
    const header = page.getByRole('tabpanel', {name: 'Routing rules'}).locator('[role=columnheader]').first();
    await expect(header).toBeVisible();
    const resizer = header.locator('.rp-resizer');
    const headerBox = await header.boundingBox();
    const resizerBox = await resizer.boundingBox();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(resizerBox!.width).toBeGreaterThanOrEqual(24);
    // The visible border sits on the column's trailing edge regardless of how far the hit area grows inward.
    expect(Math.round(resizerBox!.x + resizerBox!.width)).toBe(Math.round(headerBox!.x + headerBox!.width));
  });
});

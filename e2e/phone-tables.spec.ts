import {expect, test} from './fixtures';

// A table's row actions must stay reachable at 320px: lower-priority columns give way before Actions does, per the
// DataTable's drop-priority mechanism (see fitColumns in src/ui/Table.tsx). ProviderTable sits inside the Nodes page's
// "Nodes" tab, above the node list, so its own `.rp-table` is the first one there.
for (const [width, url, heading, actionName] of [
  [320, '/#/nodes?tab=list', 'Nodes', 'Actions'],
  [360, '/#/nodes?tab=list', 'Nodes', 'Actions'],
  [320, '/#/rules?tab=list', 'Rule list', 'Actions'],
  [360, '/#/rules?tab=list', 'Rule list', 'Actions']
] as const) {
  test.describe(`${width}px`, () => {
    test.use({viewport: {width, height: 800}});

    test(`${url}: the ${actionName} column stays inside the table`, async ({page}) => {
      await page.goto(url);
      const panel = page.getByRole('tabpanel', {name: heading});
      const grid = panel.locator('.rp-table').first();
      // Columns fit to the container's measured width once a ResizeObserver callback runs after mount; a row
      // rendering means the (slower) data fetch has already resolved well after that settles.
      await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
      const actions = grid.getByRole('columnheader', {name: actionName});
      await expect(actions).toBeVisible();
      const gridBox = await grid.boundingBox();
      const actionsBox = await actions.boundingBox();
      expect(gridBox && actionsBox && actionsBox.x + actionsBox.width).toBeLessThanOrEqual(gridBox!.x + gridBox!.width + 1);
    });
  });
}

// DNS cache keeps its domain, its resolved state and the delete action; the columns between them give way first.
test('the DNS cache table drops Type, Expires and Stale until before Domain, State or Delete at 320px', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/#/dns?tab=cache');
  const panel = page.getByRole('tabpanel', {name: 'Cache'});
  const grid = panel.locator('.rp-table').first();
  await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
  await expect(grid.getByRole('columnheader', {name: 'Domain'})).toBeVisible();
  await expect(grid.getByRole('columnheader', {name: 'State'})).toBeVisible();
  await expect(grid.getByRole('columnheader', {name: 'Delete'})).toBeVisible();
  for (const dropped of ['Type', 'Expires', 'Stale until']) await expect(grid.getByRole('columnheader', {name: dropped})).toHaveCount(0);
});

// A finger needs a bigger hit target on the column resizer than a mouse does, without moving the visible line at the
// column edge (src/ui/styles/tables-forms.css).
test.describe('column resizer touch target', () => {
  test.use({viewport: {width: 1280, height: 900}, hasTouch: true});

  test('the resizer hit area is at least 24px wide under a coarse pointer, with the line still at the column edge', async ({page}) => {
    await page.goto('/#/rules?tab=list');
    const header = page.getByRole('tabpanel', {name: 'Rule list'}).locator('[role=columnheader]').first();
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

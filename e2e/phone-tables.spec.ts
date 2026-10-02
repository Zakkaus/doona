import type {Locator} from '@playwright/test';
import {expect, scrollTableToEnd, test, settleFrames} from './fixtures';

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

// A phone keeps every column at its minimum width and scrolls the table sideways (src/ui/Table.tsx).
// ProviderTable prioritises the source, count and actions before optional columns. It sits inside the Nodes page's
// "Nodes" tab, above the node list, so its own `.rp-table` is the first one there.
for (const [width, url, heading, columns] of [
  [320, '/#/nodes?tab=list', 'Nodes', ['Node source', 'Kind', 'Nodes', 'Usage', 'Updated', 'Auto-update', 'Expires', 'State', 'Actions']],
  [360, '/#/nodes?tab=list', 'Nodes', ['Node source', 'Kind', 'Nodes', 'Usage', 'Updated', 'Auto-update', 'Expires', 'State', 'Actions']],
  [320, '/#/rules?tab=list&view=advanced', 'Routing rules', ['#', 'Expression', 'Outbound', 'Where', 'Hits', 'Actions']],
  [360, '/#/rules?by=client&tab=list&view=advanced', 'Routing rules', ['#', 'Expression', 'Outbound', 'Where', 'Hits', 'Actions']]
] as const) {
  test.describe(`${width}px`, () => {
    test.use({viewport: {width, height: 800}});

    test(`${url}: every column stays and the Actions column can be revealed`, async ({page}) => {
      await page.goto(url);
      const panel = page.getByRole('tabpanel', {name: heading});
      const table = panel.locator('.rp-table').first();
      await expect(table.locator('[role=row][data-key]').first()).toBeVisible();
      expect((await columnNames(table.locator('[role=grid]'))).sort()).toEqual([...columns].sort());
      await scrollTableToEnd(table.locator('[role=grid]'));
      const actions = table.getByRole('columnheader', {name: 'Actions'});
      await actions.scrollIntoViewIfNeeded();
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

for (const width of [320, 360, 390]) {
  for (const [lang, configFiles, nodeSource] of [
    ['en', 'Config files', 'Node source'],
    ['zh-CN', '配置文件', '节点来源'],
    ['zh-TW', '設定檔', '節點來源']
  ]) {
    for (const scheme of ['light', 'dark']) {
      test.describe(`${width}px ${lang} ${scheme} terminology`, () => {
        test.use({
          viewport: {width, height: 900},
          storage: {
            'doona-lang': lang,
            'doona-scheme': scheme,
            'doona-profiles': JSON.stringify([{id: 'demo', name: 'Demo', api: 'mock', token: ''}]),
            'doona-profile': 'demo'
          },
          signedIn: 'demo'
        });

        test('config-file tabs and node-source headers fit their labels', async ({page}) => {
          const fits = async (label: Locator) => {
            await expect(label).toBeVisible();
            await page.evaluate(() => document.fonts.ready);
            await settleFrames(page);
            const geometry = await label.evaluate(el => {
              const text = document.createRange();
              text.selectNodeContents(el);
              const bounds = el.getBoundingClientRect();
              return {
                lines: new Set([...text.getClientRects()].map(rect => Math.round(rect.top))).size,
                fits: [...text.getClientRects()].every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1),
                overflow: el.scrollWidth > el.clientWidth
              };
            });
            expect(geometry).toEqual({lines: 1, fits: true, overflow: false});
          };
          await page.goto('/#/config?tab=source');
          await expect(page.locator('.cm-content')).toBeVisible();
          // Optional fonts can keep the fallback on a cold load; also check with the face cached.
          await page.evaluate(() => document.fonts.ready);
          await page.reload();
          await expect(page.locator('.cm-content')).toBeVisible();
          await fits(page.getByRole('tab', {name: configFiles, exact: true}));
          await fits(page.locator('.rp-source-pick label'));
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.goto('/#/nodes?tab=list');
          await expect(page.locator('.rp-table [role=row][data-key]').first()).toBeVisible();
          const header = page
            .locator('.rp-table')
            .first()
            .getByRole('columnheader', {name: new RegExp(`^${nodeSource}`)});
          await fits(header.locator('.rp-th'));
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        });
      });
    }
  }
}

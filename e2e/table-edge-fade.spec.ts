import type {Locator} from '@playwright/test';
import {expect, scrollTableToEnd, test, box} from './fixtures';

const edges = (table: Locator) =>
  table.evaluate(el => {
    const frame = el.parentElement!;
    return ['::before', '::after'].map(side => {
      const style = getComputedStyle(frame, side);
      return style.content !== 'none' && style.opacity === '1' && style.backgroundImage.includes('linear-gradient') && style.pointerEvents === 'none';
    });
  });

for (const scheme of ['light', 'dark'])
  test.describe(`${scheme} table edges`, () => {
    test.use({viewport: {width: 390, height: 900}, storage: {'doona-scheme': scheme}});

    for (const [url, virtual] of [
      ['/#/nodes?tab=list', false],
      ['/#/logs', true]
    ] as const)
      test(`${virtual ? 'virtual' : 'native'} table fades only toward hidden columns`, async ({page}) => {
        await page.goto(url);
        const table = page.locator('.rp-content .rp-table').first();
        const grid = table.locator('[role=grid]');
        await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
        const scroller = virtual ? grid : table;
        await expect.poll(() => scroller.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
        await expect.poll(() => edges(table)).toEqual([false, true]);
        await expect(page.locator('.rp-table-pan')).toHaveCount(0);
        const before = await table.boundingBox();
        await scroller.evaluate(el => (el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2));
        await expect.poll(() => edges(table)).toEqual([true, true]);
        await scrollTableToEnd(grid);
        await expect.poll(() => edges(table)).toEqual([true, false]);
        await scroller.evaluate(el => (el.scrollLeft = 0));
        await expect.poll(() => edges(table)).toEqual([false, true]);
        expect(await table.boundingBox()).toEqual(before);
      });

    test('a fitting phone table and desktop tables have no fade', async ({page}) => {
      await page.setViewportSize({width: 599, height: 900});
      await page.goto('/#/overview');
      const table = page.locator('.rp-content .rp-table').first();
      await expect(table.locator('[role=row][data-key]').first()).toBeVisible();
      await expect.poll(() => table.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
      await expect(table.locator('..')).toHaveClass('rp-table-scroll');
      await expect.poll(() => edges(table)).toEqual([false, false]);
      await page.setViewportSize({width: 320, height: 900});
      await expect.poll(() => table.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
      await expect.poll(() => edges(table)).toEqual([false, true]);
      await page.setViewportSize({width: 599, height: 900});
      await expect.poll(() => edges(table)).toEqual([false, false]);
      await page.setViewportSize({width: 1440, height: 900});
      await expect(page.locator('.rp-table-scroll')).toHaveCount(0);
      await expect.poll(() => edges(table)).toEqual([false, false]);
    });

    // Restoring the Actions icon or visible label must fail even though its accessible name remains.
    test('phone Actions headers have a name and width without visible glyphs', async ({page}) => {
      await page.goto('/#/nodes?tab=list');
      const tables = page.locator('.rp-content .rp-table');
      await expect(tables.first().locator('[role=row][data-key]').first()).toBeVisible();
      for (const table of await tables.all()) {
        const grid = table.locator('[role=grid]');
        await scrollTableToEnd(grid);
        const header = grid.getByRole('columnheader', {name: /Actions/});
        await header.scrollIntoViewIfNeeded();
        await expect(header).toHaveAccessibleName(/Actions/);
        await expect(header.locator('svg')).toHaveCount(0);
        expect((await box(header)).width).toBeGreaterThanOrEqual(72);
        const label = header.locator('.rp-th');
        await expect(label).toHaveText('Actions');
        expect((await box(label)).width).toBeLessThanOrEqual(1);
        expect((await box(label)).height).toBeLessThanOrEqual(1);
      }
      await page.setViewportSize({width: 1440, height: 900});
      const label = tables
        .first()
        .getByRole('columnheader', {name: /Actions/})
        .locator('.rp-th');
      await expect.poll(async () => (await label.boundingBox())?.width ?? 0).toBeGreaterThan(1);
    });
  });

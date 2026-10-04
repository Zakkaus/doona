import {expect, routes, test, settleFrames} from './fixtures';
import type {Page} from '@playwright/test';

for (const width of [1280, 390]) {
  test.describe(`uniform page controls ${width}`, () => {
    test.use({viewport: {width, height: 900}, storage: {'doona-lang': 'zh-TW'}});
    // Page rows are M; a page's tab row is the segmented control at L (40px), and so is the Policies kind switch, the top
    // switch of a page without tabs, with the button on its row. No other page-row control is L.
    test('every route and tab keeps M page rows, L tab rows and uniform geometry', async ({page}) => {
      test.setTimeout(120000);
      for (const route of routes) {
        await page.goto(`/#/${route}`);
        await expect(page.locator('.rp-content h1')).toBeVisible();
        await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        const tabs = page.locator('.rp-content [data-page-tabrow] [role=tab]');
        const count = await tabs.count();
        for (let index = -1; index < count; index++) {
          if (index >= 0) await tabs.nth(index).click();
          await settleFrames(page);
          await expect
            .poll(async () => {
              const failures: string[] = [];
              for (const row of await toolbarGeometry(page)) {
                const {controls} = row;
                if (row.pageRow && controls.some(control => Math.abs(control.height - control.expected) > 0.5))
                  failures.push(`${route}/${index}: ${row.row}: not the expected size ${JSON.stringify(controls)}`);
                if (row.pageRow && route !== 'policies' && controls.some(control => control.size === 'L' && !control.tab))
                  failures.push(`${route}/${index}: ${row.row}: L outside the tabs ${JSON.stringify(controls)}`);
                if (row.pageRow && Math.max(...controls.map(control => control.height)) - Math.min(...controls.map(control => control.height)) > 0.5)
                  failures.push(`${route}/${index}: unequal heights`);
                if (row.pageRow && Math.max(...controls.map(control => control.centre)) - Math.min(...controls.map(control => control.centre)) > 1)
                  failures.push(`${route}/${index}: unequal vertical centres ${JSON.stringify(controls)}`);
                if (!row.pageRow && controls.some(control => control.size === 'M') && controls.some(control => control.size === 'L'))
                  failures.push(`${route}/${index}: mixed M/L local row`);
              }
              return failures;
            })
            .toEqual([]);
        }
      }
    });
  });
}

// Hover and press box an item with the radius of the slider that marks the selection, in tabs and segmented controls alike.
test.describe('tab and segment hover and press', () => {
  test.use({viewport: {width: 1280, height: 900}});
  test('an unselected item keeps the slider radius, hovered and pressed', async ({page}) => {
    const radius = (locator: ReturnType<Page['locator']>) => locator.evaluate(el => getComputedStyle(el).borderTopLeftRadius);
    for (const [route, bar, item] of [
      ['config', '.rp-content .rp-tabbar', '[role=tab]'],
      ['rules', '.rp-content .rp-seg[data-size=M]', '.rp-btn']
    ]) {
      await page.goto(`/#/${route}`);
      const group = page.locator(bar).first();
      await expect(group).toBeVisible();
      // A pinned item: a press selects it, so a locator on "not selected" would move to another one.
      const items = group.locator(item);
      const target = items.nth(await items.evaluateAll(all => all.findIndex(el => !el.hasAttribute('data-selected'))));
      const sliderRadius = await radius(group.locator('.rp-slider'));
      await target.hover();
      await expect(target).toHaveAttribute('data-hovered');
      expect(await radius(target), `${route} hovered`).toBe(sliderRadius);
      await page.mouse.down();
      await expect(target).toHaveAttribute('data-pressed');
      expect(await radius(target), `${route} pressed`).toBe(sliderRadius);
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
  });
});

// On a phone the page rows take the touch height and still lay out on as few lines as before.
test.describe('page rows on a phone', () => {
  test.use({viewport: {width: 390, height: 900}, storage: {'doona-lang': 'zh-TW'}});
  test('page links and tab rows stay on one line, and the connections toolbar is no taller than before', async ({page}) => {
    test.setTimeout(120000);
    for (const route of routes) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content h1')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await settleFrames(page);
      for (const scope of ['.rp-content .rp-page-links', '.rp-content [data-page-tabrow] .rp-tablist'])
        expect(await lineCount(page, scope, '.rp-btn, [role=tab]'), `${route} ${scope}`).toBeLessThanOrEqual(1);
    }
    await page.goto('/#/connections');
    await page.locator('.rp-content [role=tab]').nth(1).click();
    await expect(page.locator('.rp-content .rp-toolbar').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await settleFrames(page);
    expect(await lineCount(page, '.rp-content .rp-toolbar', '.rp-btn, .rp-input, .rp-selectbtn, .rp-select, .rp-seg, .rp-switch')).toBeLessThanOrEqual(
      connectionsToolbarLinesBefore
    );
  });
});

// The lines the Connections toolbar took at 390px with its controls at M.
const connectionsToolbarLinesBefore = 3;

// How many lines the visible items inside the matching containers fill; items on one line share a top.
async function lineCount(page: Page, scope: string, items: string) {
  return page.locator('body').evaluate(
    (root, [scope, items]) => {
      const tops: {top: number; height: number}[] = [];
      for (const container of root.querySelectorAll<HTMLElement>(scope))
        for (const item of container.querySelectorAll<HTMLElement>(items)) {
          if (
            !item.checkVisibility({visibilityProperty: true}) ||
            item.matches('.rp-help') ||
            item.closest('.rp-seg') !== (item.matches('.rp-seg') ? item : null)
          )
            continue;
          const box = item.getBoundingClientRect();
          if (box.height > 0) tops.push({top: box.top, height: box.height});
        }
      tops.sort((a, b) => a.top - b.top);
      let lines = 0;
      let last = -Infinity;
      for (const {top, height} of tops)
        if (top - last > height / 2) {
          lines++;
          last = top;
        }
      return lines;
    },
    [scope, items]
  );
}

// Each visible control row's lines of controls, and whether the row is a page row (toolbar, tab row, page actions). A
// control's expected page-row height is M, or L for a tab or a control that asks for L.
async function toolbarGeometry(page: Page) {
  return page.locator('body').evaluate(root => {
    const rows = '.rp-toolbar, .rp-tabhead, .rp-tabbar, .rp-page-actions, .rp-page-links';
    const localRows = '.rp-row, .rp-cluster, .rp-field-row';
    const sizes = getComputedStyle(document.documentElement);
    const mHeight = parseFloat(sizes.getPropertyValue('--rp-control'));
    const lHeight = parseFloat(sizes.getPropertyValue('--rp-control-lg'));
    const controls = '.rp-btn, .rp-input, .rp-selectbtn, .rp-select, .rp-seg, .rp-switch, .rp-tab, .rp-tabbar';
    return [...root.querySelectorAll<HTMLElement>(`${rows}, ${localRows}`)]
      .filter(row => row.checkVisibility({visibilityProperty: true}))
      .flatMap(row => {
        const boxes = [...row.querySelectorAll<HTMLElement>(controls)]
          .filter(control => {
            // A help trigger is inline with its label at S2 size XS, not a control of the row.
            if (control.matches('.rp-help')) return false;
            if (!control.checkVisibility({visibilityProperty: true}) || control.closest('.rp-seg') !== (control.matches('.rp-seg') ? control : null))
              return false;
            const scopes = row.matches(localRows) ? localRows : rows;
            return (control.matches('.rp-tabbar') ? control.parentElement?.closest(scopes) : control.closest(scopes)) === row;
          })
          .map(control => {
            const box = control.getBoundingClientRect();
            const tab = control.matches('.rp-tab, .rp-tabbar');
            return {
              expected: tab || control.dataset.size === 'L' ? lHeight : mHeight,
              tab,
              name: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.className,
              height: box.height,
              top: box.top,
              bottom: box.bottom,
              centre: box.top + box.height / 2,
              size: control.dataset.size
            };
          })
          .filter(box => box.height > 0);
        const lines: (typeof boxes)[] = [];
        for (const box of boxes) {
          const line = lines.find(line => Math.min(line[0].bottom, box.bottom) - Math.max(line[0].top, box.top) > Math.min(line[0].height, box.height) / 2);
          if (line) line.push(box);
          else lines.push([box]);
        }
        const localSurface = row.closest(
          '.rp-card, .rp-dialog, .rp-popover, .rp-panel, .rp-floating-panel, .rp-widget-panel, .rp-sidebar, .rp-table, .rp-widget-inspector, .rp-module-inspector'
        );
        const pageRow =
          row.matches('[data-page-toolbar], [data-page-tabrow], .rp-page-actions, .rp-page-links') ||
          !!row.closest('[data-page-toolbar], .rp-page-actions, .rp-page-links') ||
          (!localSurface && !!row.closest(rows));
        return lines.map(line => ({row: row.className, pageRow, controls: line}));
      });
  });
}

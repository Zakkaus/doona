import {expect, expectFittedGroupTags, scrollTableToEnd, test, box} from './fixtures';

for (const width of [320, 360, 390])
  for (const lang of ['en', 'zh-CN', 'zh-TW'])
    test.describe(`${width}px ${lang} nodes`, () => {
      test.use({viewport: {width, height: 900}, storage: {'doona-lang': lang}});

      test('actions share a kit size and primary columns fit inside scrolling cards', async ({page}) => {
        await page.goto('/#/nodes?tab=list');
        const content = page.locator('.rp-content');
        const tables = content.locator('.rp-table');
        await expect(tables.first().locator('[role=row][data-key]').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const toolbar = content.locator('.rp-toolbar').first();
        const more = toolbar.locator('.rp-narrow-only button');
        await expect(more).toBeVisible();
        const refresh = toolbar.locator('button').first();
        const paste = content.locator('.rp-toolbar').last().locator('button.rp-btn').last();
        const size = async (button: typeof refresh) =>
          button.evaluate(el => {
            const style = getComputedStyle(el);
            return {height: el.getBoundingClientRect().height, fontSize: style.fontSize, weight: style.fontWeight};
          });
        expect(await size(refresh)).toEqual(await size(more));
        expect(await size(paste)).toEqual(await size(refresh));
        for (const button of [refresh, more, paste]) {
          await expect(button).toHaveAttribute('data-size', 'L');
          expect((await size(button)).height).toBe(40);
        }
        // L keeps M's text size on a phone.
        const controlFont = await refresh.evaluate(el => getComputedStyle(el).getPropertyValue('--rp-text-md').trim());
        expect((await size(refresh)).fontSize).toBe(controlFont);
        const boxes = await Promise.all([refresh.boundingBox(), more.boundingBox()]);
        expect(boxes[0]!.y).toBe(boxes[1]!.y);
        expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(width - 16);
        await more.click();
        const add = page.getByRole('menuitem');
        await expect(add).toHaveCount(1);
        const addLabel = (await add.locator('[slot=label]').textContent())!;
        await add.click();
        await expect(page.getByRole('dialog', {name: addLabel, exact: true})).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(more).toBeFocused();

        await expect(content.locator('.rp-table-pan')).toHaveCount(0);
        for (const table of await tables.all()) {
          const grid = table.locator('[role=grid]');
          const primary = grid.getByRole('columnheader').nth(1);
          await expect(primary).toHaveAttribute('data-key', /count|latency/);
          const fits = (header: typeof primary) =>
            header.evaluate(el => {
              const box = el.getBoundingClientRect();
              const card = el.closest('.rp-table')!.getBoundingClientRect();
              return box.left >= card.left && box.right <= card.right;
            });
          expect(await fits(primary)).toBe(true);
          // Optional text starts beyond the scrollport, rather than showing part of a word at its edge.
          const optional = grid.locator('[role=columnheader][data-key="kind"], [role=columnheader][data-key="protocol"]');
          for (const header of await optional.all()) {
            const rect = await box(header);
            const card = await box(table);
            expect(rect.x).toBeGreaterThanOrEqual(card.x + card.width - 1);
          }
          for (const heading of await grid.locator('.rp-th').all()) {
            const geometry = await heading.evaluate(el => {
              const range = document.createRange();
              range.selectNodeContents(el);
              const text = range.getBoundingClientRect();
              const card = el.closest('.rp-table')!.getBoundingClientRect();
              return {hasText: !!el.textContent?.trim() && el.clientWidth > 1, left: text.left, right: text.right, cardLeft: card.left, cardRight: card.right};
            });
            if (geometry.hasText && geometry.left < geometry.cardRight && geometry.right > geometry.cardLeft) {
              expect(geometry.left).toBeGreaterThanOrEqual(geometry.cardLeft);
              expect(geometry.right).toBeLessThanOrEqual(geometry.cardRight);
            }
          }
          await scrollTableToEnd(grid);
          const header = grid.locator('[role=columnheader][data-key="kind"], [role=columnheader][data-key="protocol"]');
          // Native source columns stay mounted; virtual node columns materialise as they scroll into view.
          if (await grid.locator('[role=columnheader][data-key="kind"]').count()) {
            await grid.locator('[role=columnheader][data-key="kind"]').scrollIntoViewIfNeeded();
          } else {
            await expect(header).toHaveCount(1);
            await header.scrollIntoViewIfNeeded();
          }
          await expect.poll(() => fits(header)).toBe(true);
          // Source pills and protocol values must fit both the cell and the visible scrollport.
          const text = (await grid.locator('.rp-badge').count()) ? grid.locator('.rp-badge') : grid.getByText('shadowsocks', {exact: true});
          await expect(text.first()).toBeVisible();
          for (const value of await text.all()) {
            const geometry = await value.evaluate(el => {
              const range = document.createRange();
              range.selectNodeContents(el);
              const text = range.getBoundingClientRect();
              const cell = el.closest('[role=gridcell]')!.getBoundingClientRect();
              const card = el.closest('.rp-table')!.getBoundingClientRect();
              return {left: text.left, right: text.right, cellLeft: cell.left, cellRight: cell.right, cardLeft: card.left, cardRight: card.right};
            });
            expect(geometry.left).toBeGreaterThanOrEqual(Math.max(geometry.cellLeft, geometry.cardLeft));
            expect(geometry.right).toBeLessThanOrEqual(Math.min(geometry.cellRight, geometry.cardRight));
          }
        }
        if (width === 390 && lang === 'zh-CN') {
          for (const table of await tables.all())
            await table.locator('[role=grid]').evaluate(el => {
              (el.tagName === 'TABLE' ? el.parentElement! : el).scrollLeft = 0;
            });
          const source = tables.first().getByRole('row').filter({hasText: 'harbor'});
          await source.getByRole('gridcell').nth(1).getByRole('button').last().click();
          const positions = () =>
            tables.evaluateAll(els =>
              els.map(el => {
                const scroller = el.querySelector<HTMLElement>('[role=grid]')!;
                const box = el.getBoundingClientRect();
                return {
                  left: box.left,
                  width: box.width,
                  scroll: (scroller.tagName === 'TABLE' ? el : scroller).scrollLeft,
                  // A virtual grid may reorder its header nodes on re-render; compare the geometry, not the DOM order.
                  columns: [...el.querySelectorAll('[role=columnheader]')]
                    .map(col => ({
                      key: col.getAttribute('data-key'),
                      left: col.getBoundingClientRect().left,
                      width: col.getBoundingClientRect().width
                    }))
                    .sort((a, b) => a.left - b.left)
                };
              })
            );
          const before = await positions();
          await page.getByRole('menuitem').last().click();
          await expect(page.getByRole('alertdialog')).toBeVisible();
          expect(await positions()).toEqual(before);
          await page.keyboard.press('Escape');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      });
    });

test('desktop subscription and node actions use the kit control text role', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?tab=list');
  for (const name of [/^Update \d+ subscriptions?$/, 'Add subscription', 'Paste node link']) {
    const button = page.getByRole('button', {name, exact: true});
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('data-size', 'L');
    const type = await button.evaluate(el => {
      const style = getComputedStyle(el);
      return {
        size: style.fontSize,
        control: style.getPropertyValue('--rp-text-lg').trim(),
        weight: style.fontWeight,
        height: el.getBoundingClientRect().height
      };
    });
    expect(type.size).toBe(type.control);
    expect(type.weight).toBe('500');
    expect(type.height).toBe(40);
  }
});

test.describe('node group submenu on touch', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true});

  test('opens, returns and joins through the shared menu', async ({page}) => {
    await page.goto('/#/nodes?provider=inline');
    await page
      .getByRole('row')
      .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
      .getByRole('button', {name: 'Node actions', exact: true})
      .tap();
    await page.getByRole('menuitem', {name: 'Add to group', exact: true}).tap();
    await page.getByRole('button', {name: 'Back', exact: true}).tap();
    await page.getByRole('menuitem', {name: 'Add to group', exact: true}).tap();
    const submenu = page.getByRole('menu', {name: 'Add to group', exact: true});
    await expect(submenu.locator('[slot=description]')).toHaveCount(0);
    await submenu.getByRole('menuitem', {name: 'gaming', exact: true}).tap();
    const dialog = page.getByRole('dialog', {name: 'Edit group gaming', exact: true});
    await expect(dialog.getByRole('group', {name: 'Includes', exact: true})).toContainText('hk-01');
  });
});

test.describe('390px touch nodes', () => {
  test.use({hasTouch: true});
  test('group tags fit their column at 390 px, the rest behind a +N tag that a tap opens and closes', async ({page}) => {
    await page.setViewportSize({width: 390, height: 900});
    await page.goto('/#/nodes');
    await page.evaluate(() => document.fonts.ready);
    await scrollTableToEnd(page.locator('.rp-table').nth(1).locator('[role=grid]'));
    await expectFittedGroupTags(page);
    const more = page.locator('.rp-table').nth(1).locator('.rp-tag-more').first();
    const tip = page.getByRole('tooltip');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await more.tap();
    await expect(tip).toBeVisible();
    await more.tap();
    await expect(tip).toBeHidden();
  });
});

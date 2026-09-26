import type {Page} from '@playwright/test';
import {expect, test} from './fixtures';

// Where the selected tab sits in its bar, and whether the bar fades an edge.
const bar = (page: Page) =>
  page.locator('.rp-content .rp-tabbar').evaluate((el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const sel = el.querySelector<HTMLElement>('[role=tab][data-selected]')!.getBoundingClientRect();
    return {
      inView: sel.left >= box.left - 1 && sel.right <= box.right + 1,
      overflows: el.scrollWidth > el.clientWidth,
      mask: getComputedStyle(el).maskImage,
      pageScroll: window.scrollX + window.scrollY
    };
  });

for (const [width, url, last] of [
  [320, '/#/config?tab=validate', 'validate'],
  [320, '/#/rules?tab=trace', 'trace'],
  [390, '/#/rules?tab=trace', 'trace'],
  [430, '/#/rules?tab=trace', 'trace'],
  [320, '/#/dns?tab=cache', 'cache'],
  [360, '/#/dns?tab=cache', 'cache']
] as const) {
  test.describe(`${width}px`, () => {
    test.use({viewport: {width, height: 640}});

    test(`${url} scrolls the selected tab into view and fades the edge with more tabs`, async ({page}) => {
      await page.goto(url);
      const selected = page.locator(`.rp-content [role=tab][data-selected]`);
      await expect(selected).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`tab=${last}`));
      await expect.poll(async () => (await bar(page)).inView).toBe(true);
      const opened = await bar(page);
      expect(opened.pageScroll).toBe(0);
      // The last tab is selected, so only the start has more tabs.
      expect(opened.overflows).toBe(true);
      expect(opened.mask).not.toBe('none');

      const first = page.locator('.rp-content [role=tab]').first();
      await first.click();
      await expect(first).toHaveAttribute('data-selected', 'true');
      await expect.poll(async () => (await bar(page)).inView).toBe(true);
      expect((await bar(page)).pageScroll).toBe(0);
    });
  });
}

test.describe('1280px', () => {
  test.use({viewport: {width: 1280, height: 900}});

  test('a tab bar that fits has no fade', async ({page}) => {
    await page.goto('/#/rules?tab=trace');
    await expect(page.locator('.rp-content [role=tab][data-selected]')).toBeVisible();
    const state = await bar(page);
    expect(state.overflows).toBe(false);
    expect(state.mask).toBe('none');
  });
});

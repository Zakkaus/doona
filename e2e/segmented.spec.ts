import {expect, routes, test} from './fixtures';
import type {Locator, Page} from '@playwright/test';

const ranges = ['实时', '10 分钟', '1 小时', '6 小时', '24 小时', '7 天'];

// Scrollbars and anything drawn past the card's edge, which the card clips. The picker's native select is hidden.
const spill = (card: Locator) =>
  card.evaluate(root => {
    const edge = root.getBoundingClientRect();
    return [...root.querySelectorAll<HTMLElement>('*')]
      .filter(el => el.checkVisibility({visibilityProperty: true}) && !el.closest('[aria-hidden=true]'))
      .flatMap(el => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const found = [];
        if (/auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth) found.push(`scrollbar: ${el.className}`);
        if (box.width && (box.left < edge.left - 1 || box.right > edge.right + 1)) found.push(`past the edge: ${el.textContent}`);
        return found;
      });
  });

test.describe('360px', () => {
  test.use({viewport: {width: 360, height: 780}, storage: {'doona-lang': 'zh-CN', 'doona-scheme': 'dark'}});

  test('a range control too wide for the traffic card becomes a picker', async ({page}) => {
    await page.goto('/#/activity');
    const card = page.getByRole('region', {name: '流量'});
    const picker = card.getByRole('button', {name: /历史范围/});
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('实时');
    await expect(card.getByRole('radiogroup', {name: '历史范围'})).toHaveCount(0);
    await expect.poll(() => spill(card)).toEqual([]);

    await picker.click();
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options).toHaveText(ranges);
    await page.getByRole('option', {name: '24 小时'}).click();
    await expect(picker).toContainText('24 小时');
    await picker.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', {name: '24 小时'})).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(picker).toContainText('7 天');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

// Every radio group a user can see fits its own box and the viewport, and a collapsed control shows a picker that does.
// The track a collapsed control keeps as a hidden placeholder is not something a user sees, so it is not checked.
const clipped = (page: Page) =>
  page.evaluate(() => {
    const inside = (box: DOMRect, outer: {left: number; right: number}) => box.left >= outer.left - 1 && box.right <= outer.right + 1;
    const viewport = {left: 0, right: document.documentElement.clientWidth};
    const found: string[] = [];
    for (const group of document.querySelectorAll<HTMLElement>('[role=radiogroup]')) {
      if (!group.checkVisibility({visibilityProperty: true})) continue;
      const name = group.getAttribute('aria-label') ?? group.textContent;
      if (group.scrollWidth > group.clientWidth + 1) found.push(`${name}: overflows by ${group.scrollWidth - group.clientWidth}px`);
      const edge = group.getBoundingClientRect();
      for (const radio of group.querySelectorAll<HTMLElement>('[role=radio],input[type=radio]')) {
        const box = (radio.closest('label') ?? radio).getBoundingClientRect();
        if (!inside(box, edge) || !inside(box, viewport)) found.push(`${name}: ${radio.textContent || radio.closest('label')?.textContent} is clipped`);
      }
    }
    for (const fit of document.querySelectorAll<HTMLElement>('.rp-segfit[data-collapsed]')) {
      if (!fit.checkVisibility()) continue;
      const picker = fit.querySelector<HTMLElement>('.rp-selectbtn');
      if (!picker?.checkVisibility({visibilityProperty: true}) || !inside(picker.getBoundingClientRect(), viewport))
        found.push(`${fit.textContent}: collapsed without a visible picker`);
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) found.push('the page scrolls sideways');
    return found;
  });

for (const lang of ['zh-TW', 'en']) {
  test.describe(`360px ${lang}`, () => {
    test.use({viewport: {width: 360, height: 740}, storage: {'doona-lang': lang}});

    for (const route of routes) {
      test(`${route}: no radio group overflows or clips an option`, async ({page}) => {
        await page.goto(`/#/${route}`);
        await expect(page.locator('.rp-content > *').first()).toBeVisible();
        await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await expect.poll(() => clipped(page)).toEqual([]);
        const tabs = page.locator('.rp-content [role=tab]');
        for (let index = 0; index < (await tabs.count()); index++) {
          await tabs.nth(index).click();
          await expect.poll(() => clipped(page)).toEqual([]);
        }
      });
    }
  });
}

test.describe('1440px', () => {
  test.use({viewport: {width: 1440, height: 900}, storage: {'doona-lang': 'zh-CN'}});

  test('the range control follows its own width, not the viewport, and keeps its height', async ({page}) => {
    await page.goto('/#/activity');
    const card = page.getByRole('region', {name: '流量'});
    const group = card.getByRole('radiogroup', {name: '历史范围'});
    const picker = card.getByRole('button', {name: /历史范围/});
    await expect(group).toBeVisible();
    await expect(group.getByRole('radio')).toHaveText(ranges);
    await expect(picker).toHaveCount(0);
    const control = card.locator('.rp-segfit');
    const height = (await control.boundingBox())!.height;
    // An observer created after the control's own runs after it in the same pass, before the browser paints: at that
    // point the mode must already match the fit, so no frame shows the track spilling out or both modes at once.
    await card.evaluate(el => {
      const fit = el.querySelector<HTMLElement>('.rp-segfit')!;
      const seg = fit.querySelector<HTMLElement>('.rp-seg')!;
      const seen: string[] = [];
      (window as unknown as {seen: string[]}).seen = seen;
      new ResizeObserver(() => {
        const over = seg.scrollWidth > seg.clientWidth;
        if (over !== fit.hasAttribute('data-collapsed') || over !== !!fit.querySelector('.rp-segpick')) seen.push(`over ${over}`);
      }).observe(el);
    });

    await card.evaluate(el => (el.style.width = '300px'));
    await expect(picker).toBeVisible();
    await expect(group).toHaveCount(0);
    expect((await control.boundingBox())!.height).toBe(height);
    await expect.poll(() => spill(card.locator('.rp-row').first())).toEqual([]);

    await card.evaluate(el => (el.style.width = ''));
    await expect(group).toBeVisible();
    await expect(picker).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as {seen: string[]}).seen)).toEqual([]);
  });
});

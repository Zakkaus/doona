import {expect, test} from './fixtures';
import type {Locator} from '@playwright/test';

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
    expect(await spill(card)).toEqual([]);

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

    await card.evaluate(el => (el.style.width = '300px'));
    await expect(picker).toBeVisible();
    await expect(group).toHaveCount(0);
    expect((await control.boundingBox())!.height).toBe(height);
    expect(await spill(card)).toEqual([]);

    await card.evaluate(el => (el.style.width = ''));
    await expect(group).toBeVisible();
    await expect(picker).toHaveCount(0);
  });
});

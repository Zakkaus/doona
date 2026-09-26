import type {Locator, Page} from '@playwright/test';
import {expect, test} from './fixtures';

// The mirrored layout: Settings turns the page right to left while the language, here English, stays left to right.

const box = async (locator: Locator) => (await locator.boundingBox())!;
// The sine of an element's turn: the down chevron turned to the left has 1.
const turn = (locator: Locator) =>
  locator.evaluate(el => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return Math.round(m.b);
  });
const mirrorSwitch = (page: Page) => page.getByRole('switch', {name: 'Mirrored layout'});
// The input is hidden under its track, so a click goes to the switch as drawn.
const flip = (page: Page) => page.locator('.rp-switch').filter({hasText: 'Mirrored layout'}).click();

// The direction <html> has at the first frame, which the first-paint stamp sets before the stylesheet paints.
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      const d = document.documentElement;
      (window as unknown as {firstFrame: string}).firstFrame = `${d.dir} ${d.hasAttribute('data-mirror')}`;
    });
  });
});
const firstFrame = (page: Page) => page.waitForFunction(() => (window as unknown as {firstFrame?: string}).firstFrame).then(value => value.jsonValue());

async function expectMirrored(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('data-mirror', '');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal page overflow').toBeLessThanOrEqual(0);
  // The side navigation and the page title sit at the right.
  const width = page.viewportSize()!.width;
  const nav = await box(page.locator('nav.rp-side'));
  expect(nav.x + nav.width).toBeGreaterThan(width - 2);
  const main = await box(page.locator('.rp-main'));
  const title = await box(page.locator('.rp-h1'));
  expect(main.x + main.width - (title.x + title.width), 'title gap on the right').toBeLessThan(title.x - main.x);
}

// The characters of a text in the order they are drawn: left to right text draws each one right of the one before.
const drawnInOrder = (locator: Locator) =>
  locator.evaluate(el => {
    const text = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim()) as Text;
    const xs = [...text.textContent!].flatMap((char, at) => {
      if (!char.trim()) return [];
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      return [range.getBoundingClientRect().left];
    });
    return xs.every((x, at) => at === 0 || x > xs[at - 1]);
  });

test.describe('mirrored layout at 1280px', () => {
  test.use({viewport: {width: 1280, height: 900}});

  test('the setting mirrors the page before first paint and turns back', async ({page}) => {
    await page.goto('/#/settings');
    expect(await firstFrame(page)).toBe('ltr false');
    const toggle = mirrorSwitch(page);
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toHaveAccessibleDescription('Flips the layout left to right for left-handed use.');
    await flip(page);
    await expectMirrored(page);

    await page.reload();
    expect(await firstFrame(page)).toBe('rtl true');
    await expect(mirrorSwitch(page)).toBeChecked();
    await expectMirrored(page);

    await flip(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).not.toHaveAttribute('data-mirror');
    expect((await box(page.locator('nav.rp-side'))).x).toBeLessThan(2);
    await page.reload();
    expect(await firstFrame(page)).toBe('ltr false');
  });

  test.describe('mirrored', () => {
    test.use({storage: {'doona-mirror': 'on'}});

    test('labels with punctuation, times and parentheses keep their order', async ({page}) => {
      await page.goto('/#/overview');
      await expectMirrored(page);
      // "dae/honk-native v1 (draft)" and a time such as "9/26/26, 12:14:27 PM" start with a letter or digit and end
      // with punctuation or a Latin word, which a right-to-left line would move to the other end.
      const api = page.locator('.rp-kv .v').filter({hasText: /\(draft\)$/});
      await expect(api).toBeVisible();
      expect(await drawnInOrder(api)).toBe(true);
      const time = page
        .locator('.rp-kv .v')
        .filter({hasText: /^\d+\/\d+\/\d+, \d+:\d+:\d+ [AP]M$/})
        .first();
      await expect(time).toBeVisible();
      expect(await drawnInOrder(time)).toBe(true);
      // The value lines up with its label at the right.
      const [label, value] = [await box(api.locator('xpath=preceding-sibling::*[1]')), await box(api)];
      expect(Math.abs(label.x + label.width - (value.x + value.width))).toBeLessThanOrEqual(1);
    });

    // React Aria's keys follow the page: the next tab is on the left, so the right arrow goes back to the first.
    test('ArrowRight on a tab list moves to the tab on the right', async ({page}) => {
      await page.goto('/#/rules');
      const tabs = page.getByRole('tablist').first().getByRole('tab');
      await tabs.nth(1).focus();
      const from = await box(tabs.nth(1));
      await page.keyboard.press('ArrowRight');
      await expect(tabs.first()).toBeFocused();
      expect((await box(tabs.first())).x).toBeGreaterThan(from.x);
    });
  });
});

test.describe('mirrored layout at 390px', () => {
  test.use({viewport: {width: 390, height: 844}, storage: {'doona-mirror': 'on'}});

  test('the overflow menu mirrors its popover, rows, chevrons and arrow keys', async ({page}) => {
    await page.goto('/#/overview');
    await expect(page.locator('.rp-content > *').first()).toBeVisible();
    await page.locator('.rp-top').getByRole('button', {name: 'More options'}).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(page.locator('.rp-popover').filter({has: menu})).toHaveAttribute('dir', 'rtl');
    const rows = page.locator('.rp-subitem');
    // Four submenu rows and the Backend row, which opens a popover and has no chevron.
    await expect(rows).toHaveCount(5);
    for (const row of await rows.all()) {
      const {x, width} = await box(row);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(390);
      // The row reads from the right: its icon, then its label.
      expect((await box(row.locator('.ic'))).x).toBeGreaterThan((await box(row.locator('.rp-truncate'))).x);
    }
    // Each submenu's chevron points left.
    const chevrons = rows.locator('.rp-chev-end');
    await expect(chevrons).toHaveCount(4);
    for (const chevron of await chevrons.all()) expect(await turn(chevron)).toBe(1);
    await page.getByRole('menuitem', {name: 'Theme'}).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('menuitemradio', {name: 'Light'})).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitem', {name: 'Theme'})).toBeFocused();
  });
});

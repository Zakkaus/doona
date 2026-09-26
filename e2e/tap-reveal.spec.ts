import type {Page} from '@playwright/test';
import {detail, expect, test} from './fixtures';

// A finger cannot hover and a tap is not :focus-visible, so a truncated cell in a table whose rows open nothing shows
// its full text on a tap (TextTooltip in src/ui/Button.tsx). Where a row press opens a detail, the press wins.
const firstCut = (page: Page) => page.locator('.rp-table [role="row"]:not([data-disabled]) .rp-truncate[data-tip]').first();

test.describe('on a phone', () => {
  test.use({viewport: {width: 360, height: 780}, hasTouch: true, isMobile: true});

  test('a tap on a truncated log cell shows it whole until a tap elsewhere', async ({page}) => {
    await page.goto('/#/logs');
    const cell = firstCut(page);
    const full = (await cell.textContent())!.trim();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await cell.tap();
    await expect(page.getByRole('tooltip')).toContainText(full);
    // A second tap on the same cell leaves it open.
    await cell.tap();
    await expect(page.getByRole('tooltip')).toContainText(full);
    await page.getByRole('heading', {level: 1}).tap();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await cell.tap();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('a tap in a table whose rows open a detail opens the detail, not a tip', async ({page}) => {
    await page.goto('/#/dns?tab=log');
    await firstCut(page).tap();
    await expect(detail(page)).toBeVisible();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('a tap in a table whose row press does something else shows the tip and still presses the row', async ({page}) => {
    await page.goto('/#/rules?tab=list');
    const cell = firstCut(page);
    const row = cell.locator('xpath=ancestor::*[@role="row"][1]');
    await cell.tap();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(row).toHaveAttribute('data-selected');
  });

  test.describe('right to left', () => {
    test.beforeEach(async ({page}) => {
      await page.addInitScript(() => {
        Object.defineProperty(Intl.Locale.prototype, 'getTextInfo', {configurable: true, value: () => ({direction: 'rtl'})});
      });
    });

    test('the tip opens over the cell and stays on screen', async ({page}) => {
      await page.goto('/#/dns?tab=cache');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const cell = firstCut(page);
      await cell.tap();
      const tip = page.getByRole('tooltip');
      await expect(tip).toBeVisible();
      const [a, b] = [(await cell.boundingBox())!, (await tip.boundingBox())!];
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(360);
      expect(Math.abs(b.y + b.height - a.y)).toBeLessThan(24);
    });
  });
});

test('a mouse click on a truncated cell opens no tip at once', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/logs');
  await firstCut(page).click();
  await expect(page.getByRole('tooltip')).toHaveCount(0, {timeout: 300});
});

import {expect, test} from './fixtures';

test('search shortcut moves focus into a dismissible dialog', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  await page.keyboard.press('Control+K');
  const dialog = page.locator('.rp-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('tab order reaches the first navigation link', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  // Allow header controls, but fail if navigation is skipped or starts midway.
  for (let tabs = 0; tabs < 12; tabs++) {
    await page.keyboard.press('Tab');
    if (await page.locator('.rp-nav:focus').count()) break;
  }
  await expect(page.locator('.rp-nav').first()).toBeFocused();
});

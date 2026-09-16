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

test('shortcut help and page sequences respect focus and the sequence deadline', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', {name: 'Keyboard shortcuts'});
  await expect(help).toBeVisible();
  await expect(help).toContainText('g c');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('g');
  await page.clock.fastForward(801);
  await page.keyboard.press('c');
  await expect(page).toHaveURL(/#\/activity$/);
  await page.keyboard.press('g');
  await page.keyboard.press('c');
  await expect(page).toHaveURL(/#\/connections$/);
  const input = page.getByRole('searchbox', {name: 'Filter'});
  await input.focus();
  await page.keyboard.type('g a?');
  await expect(input).toHaveValue('g a?');
  await expect(page).toHaveURL(/#\/connections$/);
  await expect(help).toBeHidden();
});

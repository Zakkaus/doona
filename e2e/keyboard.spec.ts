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
  // The shortcut listener mounts with the shell; a key pressed before that is lost.
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
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

test('g r opens Rules instead of refreshing, while a lone r still refreshes', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-strip')).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/#\/rules$/);
  await expect(page.locator('.rp-toast')).toHaveCount(0);
  await page.keyboard.press('r');
  await expect(page.locator('.rp-toast.positive')).toContainText('Data refreshed');
  await expect(page).toHaveURL(/#\/rules$/);
});

test('chart data tooltips are reachable without pointer interaction', async ({page}) => {
  await page.goto('/#/activity');
  const traffic = page.getByRole('region', {name: 'Traffic', exact: true});
  const chart = traffic.getByRole('application');
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await expect(traffic.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await expect(traffic.locator('.recharts-tooltip-item').first()).toContainText(/\d/);
  const donut = page.locator('.rp-donut');
  await donut.getByRole('application').focus();
  await page.keyboard.press('ArrowRight');
  await expect(donut.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await expect(donut.locator('.recharts-tooltip-item')).toContainText(/\d/);
});

test('slash focuses the page filter and r refreshes everything', async ({page}) => {
  await page.goto('/#/connections');
  const filter = page.locator('.rp-content input[type="search"]').first();
  await expect(filter).toBeVisible();
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  await page.keyboard.press('/');
  await expect(filter).toBeFocused();
  await filter.fill('10.0');
  // Inside a field the keys type; nothing else fires.
  await page.keyboard.press('r');
  await expect(filter).toHaveValue('10.0r');
  await page.keyboard.press('Escape');
  await page.locator('body').click({position: {x: 5, y: 5}});
  await page.keyboard.press('r');
  await expect(page.locator('.rp-toast.positive')).toContainText('Data refreshed');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', {name: 'Keyboard shortcuts'})).toContainText('Tables and lists');
});

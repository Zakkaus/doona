import {expect, test} from './fixtures';

const open = async (page: import('@playwright/test').Page, text: string) => {
  await page.keyboard.press('Control+K');
  const dialog = page.locator('.rp-dialog');
  await dialog.locator('input').fill(text);
  return dialog;
};

test('search reaches tabs and cards, not only pages', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  let dialog = await open(page, 'valid');
  await dialog.getByRole('option', {name: /Validation/}).click();
  await expect(page).toHaveURL(/#\/config\?tab=validate$/);
  dialog = await open(page, 'geodata');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await dialog.locator('input').fill('actions');
  await dialog.getByRole('option', {name: /Backend actions/}).click();
  await expect(page).toHaveURL(/#\/settings\?card=actions$/);
  await expect(page.getByRole('region', {name: 'Backend actions'})).toBeInViewport();
});

test('search opens a node in its source, a group on its card, a subscription and a config source', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  let dialog = await open(page, 'jp-01');
  await dialog.getByRole('option', {name: /^jp-01/}).click();
  await expect(page).toHaveURL(/#\/nodes\?provider=inline&q=jp-01$/);
  await expect(page.getByLabel('Search nodes')).toHaveValue('jp-01');
  await expect(page.locator('.rp-table').nth(1).locator('[role=row][data-key]')).toHaveCount(1);
  dialog = await open(page, 'gaming');
  await dialog.getByRole('option', {name: /^gaming/}).click();
  await expect(page).toHaveURL(/#\/policies\?group=gaming$/);
  await expect(page.getByRole('region', {name: 'gaming'})).toBeInViewport();
  dialog = await open(page, 'sub-c');
  await dialog.getByRole('option', {name: /^sub-c/}).click();
  await expect(page).toHaveURL(/#\/nodes\?provider=sub-c$/);
  dialog = await open(page, 'rules.dae');
  await dialog.getByRole('option', {name: /rules\.dae/}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-rules$/);
});

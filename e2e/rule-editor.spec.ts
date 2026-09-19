import {expect, test} from './fixtures';

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('tabpanel', {name: 'Rule list'}).locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');

test('the rule list shows the dictionary in evaluation order with its source lines', async ({page}) => {
  await page.goto('/#/rules?tab=list');
  const list = rows(page);
  await expect(list).toHaveCount(9);
  await expect(list.first()).toContainText('domain(suffix: doubleclick.net)');
  await expect(list.first()).toContainText('config.dae:40');
  await expect(list.nth(5)).toContainText('rules.dae:3');
  await expect(list.last()).toContainText('fallback: resilient');
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('9 rules, generation 40');
  await list.first().getByRole('button', {name: 'Open source', exact: true}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-main&line=40$/);
});

test('a rule is added before the fallback and removed again through validate, save and reload', async ({page}) => {
  await page.goto('/#/rules?tab=list');
  const list = rows(page);
  await expect(list).toHaveCount(9);
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Condition').fill('domain(geosite:netflix)');
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule written'})).toBeVisible();
  await expect(list).toHaveCount(10);
  await expect(list.nth(8)).toContainText('domain(geosite:netflix)');
  await expect(list.nth(8)).toContainText('gaming');
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('generation 41');
  await list.nth(8).getByRole('button', {name: 'Remove rule', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule removed'})).toBeVisible();
  await expect(list).toHaveCount(9);
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('generation 42');
});

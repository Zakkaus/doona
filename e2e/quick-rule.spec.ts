import {detail, expect, test} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});
const dialogOf = (page: import('@playwright/test').Page) => page.getByRole('dialog', {name: 'Add rule', exact: true});

test('the connection list toolbar adds a rule for the selected row', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  const add = page.locator('.rp-toolbar').getByRole('button', {name: 'Add rule', exact: true});
  await expect(add).toBeDisabled();
  // Clicking a row selects the connection the toolbar acts on.
  await page.getByRole('rowheader', {name: 'cdn.bilibili.com', exact: true}).click();
  await expect(page.locator('.rp-panel .rp-h3')).toHaveText('cdn.bilibili.com');
  await add.click();
  await expect(dialogOf(page).locator('.rp-code')).toHaveText(/^domain\(full: cdn\.bilibili\.com\)/);
  await dialogOf(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialogOf(page)).toHaveCount(0);
  await page.goto('/#/connections?tab=list&id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await add.click();
  await expect(dialogOf(page).locator('.rp-code')).toContainText('domain(full: api.telegram.org)');
  await dialogOf(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialogOf(page)).toHaveCount(0);
});

test('a trace result adds a rule for the traced target', async ({page}) => {
  await page.goto('/#/rules?tab=trace');
  await page.getByLabel('Domain', {exact: true}).fill('api.telegram.org');
  await page.getByLabel('Destination IP', {exact: true}).fill('149.154.167.220');
  await page.getByLabel('Destination port', {exact: true}).fill('443');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  const card = page.locator('.rp-card').filter({has: page.getByRole('heading', {name: '149.154.167.220', exact: true})});
  await card.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(dialogOf(page).locator('.rp-code')).toContainText('domain(full: api.telegram.org)');
  await dialogOf(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=trace$/);
});

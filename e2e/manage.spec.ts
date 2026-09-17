import {expect, test} from './fixtures';

test('close all closes what the backend owns and skips the rest', async ({page}) => {
  await page.goto('/#/connections');
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast')).toContainText(/Closed \d+, skipped \d+/);
});

test('the backend actions card gathers reload, mode, DNS, subscriptions, connections and geodata', async ({page}) => {
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend actions'});
  await expect(card).toContainText('geosite');
  await expect(card).toContainText('geoip');
  await card.getByRole('button', {name: 'Update', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Geodata updated and reloaded'})).toBeVisible();
  await card.getByRole('radio', {name: 'Direct', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Outbound mode: Direct'})).toBeVisible();
  await card.getByRole('button', {name: /^Refresh all subscriptions/}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Refreshed 1 of 1'})).toBeVisible();
  await card.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Cache cleared'})).toBeVisible();
  await card.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast', {hasText: /Closed \d+, skipped \d+/})).toBeVisible();
  await card.getByRole('button', {name: 'Reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Reload: Completed'})).toBeVisible();
});

test('a pairing link fills the backend form and leaves the address bar clean', async ({page}) => {
  await page.goto('/#/settings?api=http://127.0.0.1:9527&token=secret-token');
  await expect(page.getByLabel('Server URL', {exact: true})).toHaveValue('http://127.0.0.1:9527');
  await expect(page.locator('.rp-content')).toContainText('filled in from the link');
  await expect(page).toHaveURL(/#\/settings$/);
});

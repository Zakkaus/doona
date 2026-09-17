import {expect, test} from './fixtures';

test('close all closes what the backend owns and skips the rest', async ({page}) => {
  await page.goto('/#/connections');
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast')).toContainText(/Closed \d+, skipped \d+/);
});

test('geodata lists the loaded files and updates them', async ({page}) => {
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Geodata'});
  await expect(card).toContainText('geosite');
  await expect(card).toContainText('geoip');
  await card.getByRole('button', {name: 'Update', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Geodata updated and reloaded');
});

test('a pairing link fills the backend form and leaves the address bar clean', async ({page}) => {
  await page.goto('/#/settings?api=http://127.0.0.1:9527&token=secret-token');
  await expect(page.getByLabel('Server URL', {exact: true})).toHaveValue('http://127.0.0.1:9527');
  await expect(page.locator('.rp-content')).toContainText('filled in from the link');
  await expect(page).toHaveURL(/#\/settings$/);
});

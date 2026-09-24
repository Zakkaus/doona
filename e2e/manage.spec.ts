import {expect, test} from './fixtures';

test('close all closes what the backend owns and skips the rest', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast')).toContainText(/Closed \d+, skipped \d+/);
});

test('the backend actions card gathers reload, DNS, subscriptions and connections', async ({page}) => {
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend actions'});
  // Geodata has its own card where the sources are configurable.
  await expect(card).not.toContainText('geosite');
  await card.getByRole('button', {name: 'Refresh subscription (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Subscriptions refreshed: 1 of 1'})).toBeVisible();
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
  await expect(page.getByLabel('Backend URL', {exact: true})).toHaveValue('http://127.0.0.1:9527');
  await expect(page.locator('.rp-content')).toContainText('filled in from the link');
  await expect(page).toHaveURL(/#\/settings$/);
});

test('policy editing discards a cancelled draft and saves filters through the main source', async ({page}) => {
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'gaming', exact: true});
  const edit = card.getByRole('button', {name: 'Edit', exact: true});
  await edit.click();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  const filter = dialog.getByRole('textbox', {name: 'Filter 1', exact: true});
  const original = await filter.inputValue();
  await filter.fill('name(hk-01)');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await edit.click();
  await expect(filter).toHaveValue(original);
  await filter.fill('name(hk-01)');
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await edit.click();
  await expect(filter).toHaveValue('name(hk-01)');
});

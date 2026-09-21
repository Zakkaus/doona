import {expect, test} from './fixtures';

test('same-route query changes selection through browser history', async ({page}) => {
  await page.goto('/#/rules?tab=flows&id=flow-1');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await expect(selected).toHaveAttribute('data-key', 'flow-1');
  await page.evaluate(() => {
    location.hash = '#/rules?tab=flows&id=flow-2';
  });
  await expect(selected).toHaveAttribute('data-key', 'flow-2');
  await page.goBack();
  await expect(selected).toHaveAttribute('data-key', 'flow-1');
  await page.goForward();
  await expect(selected).toHaveAttribute('data-key', 'flow-2');
});

test('discard resets a source draft even when the destination selects the same editor', async ({page}) => {
  await page.goto('/#/config?tab=source&source=src-main');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  await page.locator('.cm-content').fill('discard this draft');
  await page.locator('.rp-nav[href="#/config"]').click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/config$/);
  await expect(page.locator('.cm-content')).not.toContainText('discard this draft');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  await page.locator('.cm-content').fill('guard this new draft');
  await page.locator('.rp-nav[href="#/settings"]').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
});

test('cancelled Back and Forward restore the cursor without replacing history entries', async ({page}) => {
  await page.goto('/#/settings');
  await page.locator('.rp-nav[href="#/config"]').click();
  await page.locator('.rp-nav[href="#/connections"]').click();
  await page.goBack();
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  await page.locator('.cm-content').fill('keep until discarded');
  const dialog = page.getByRole('alertdialog');
  await page.goBack();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/#\/config$/);
  await page.goForward();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/#\/config$/);
  await page.goBack();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/config$/);
  await expect(page.locator('.cm-content')).not.toContainText('keep until discarded');
  await page.goForward();
  await expect(page).toHaveURL(/#\/connections$/);
});

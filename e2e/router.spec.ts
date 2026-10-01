import {expect, test} from './fixtures';
import type {Page} from '@playwright/test';

const appendDraft = async (page: Page, text: string) => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n# ' + text);
};

test('same-route query changes selection through browser history', async ({page}) => {
  await page.goto('/#/flows?tab=records&id=flow-1');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await expect(selected).toHaveAttribute('data-key', 'flow-1');
  await page.evaluate(() => {
    location.hash = '#/flows?tab=records&id=flow-2';
  });
  await expect(selected).toHaveAttribute('data-key', 'flow-2');
  await page.goBack();
  await expect(selected).toHaveAttribute('data-key', 'flow-1');
  await page.goForward();
  await expect(selected).toHaveAttribute('data-key', 'flow-2');
});

test('Back after direct hash navigation preserves the guarded history entry', async ({page}) => {
  await page.goto('/#/settings');
  await expect(page.locator('.rp-nav[href="#/config"]')).toBeVisible();
  const position = await page.evaluate(() => history.state.doonaPosition as number);
  await page.evaluate(() => {
    location.hash = '#/config?tab=source';
  });
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state.doonaPosition)).toBe(position + 1);
  await appendDraft(page, 'direct hash draft');
  await page.goBack();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
  await expect(page.locator('.cm-content')).toContainText('direct hash draft');
  await page.goBack();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
});

test('navigating to the current address keeps the history position', async ({page}) => {
  await page.goto('/#/settings');
  await expect(page.locator('.rp-nav[href="#/config"]')).toBeVisible();
  const position = await page.evaluate(() => history.state.doonaPosition as number);
  await page.evaluate(() => {
    // Firefox replaces the entry and drops its state when a link targets the current address.
    history.replaceState(null, '');
    dispatchEvent(new PopStateEvent('popstate', {state: null}));
  });
  await page.evaluate(() => {
    location.hash = '#/config';
  });
  await expect.poll(() => page.evaluate(() => history.state.doonaPosition)).toBe(position + 1);
});

test('discard resets a source draft even when the destination selects the same editor', async ({page}) => {
  await page.goto('/#/config?tab=source&source=src-main');
  await appendDraft(page, 'discard this draft');
  await page.locator('.rp-nav[href="#/config"]').click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/config$/);
  await page.getByRole('tab', {name: 'Config files', exact: true}).click();
  await expect(page.locator('.cm-content')).not.toContainText('discard this draft');
  await appendDraft(page, 'guard this new draft');
  await page.locator('.rp-nav[href="#/settings"]').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
});

test('cancelled Back and Forward restore the cursor without replacing history entries', async ({page}) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('region', {name: 'Backend', exact: true})).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/config?tab=source';
  });
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.rp-nav[href="#/connections"]').click();
  await expect(page).toHaveURL(/#\/connections$/);
  await page.goBack();
  await appendDraft(page, 'keep until discarded');
  const dialog = page.getByRole('alertdialog');
  await page.goBack();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
  await page.goForward();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
  await page.goBack();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
  await expect(page.locator('.cm-content')).not.toContainText('keep until discarded');
  await page.goForward();
  await expect(page).toHaveURL(/#\/connections$/);
});

test('Back to an unindexed entry keeps a guarded draft until discard', async ({page}) => {
  await page.goto('/#/settings');
  await page.evaluate(() => history.replaceState(null, '', location.href));
  await page.evaluate(() => {
    location.hash = '#/config?tab=source';
  });
  await appendDraft(page, 'unindexed history draft');
  await page.goBack();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('unindexed history draft');
  await page.locator('.rp-nav[href="#/settings"]').click();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/settings$/);
});

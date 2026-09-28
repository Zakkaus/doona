import {expect, test} from './fixtures';

test.use({viewport: {width: 1440, height: 1000}});

test('the editor toolbar opens find and replace and goes to a line', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await page.getByRole('button', {name: 'Find and replace', exact: true}).click();
  const search = page.locator('.cm-search');
  await expect(search.locator('input[name=search]')).toBeFocused();
  await expect(search.locator('input[name=replace]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await page.getByRole('button', {name: 'Go to line', exact: true}).click();
  const line = page.locator('.cm-goto-line input[name=line]');
  await expect(line).toBeFocused();
  await line.fill('3');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-goto-line')).toHaveCount(0);
  await expect(page.locator('.cm-activeLineGutter')).toHaveText('3');
});

test('a read-only source keeps Find and Go to line, and its editing commands are disabled', async ({page}) => {
  await page.goto('/#/config?source=src-sub-c');
  await expect(page.locator('.cm-content[aria-label="/var/lib/honk/subscriptions/sub-c.dae"]')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', {name: 'Editing commands', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Find', exact: true}).click();
  const search = page.locator('.cm-search');
  await expect(search.locator('input[name=search]')).toBeFocused();
  await expect(search.locator('input[name=replace]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Go to line', exact: true}).click();
  await expect(page.locator('.cm-goto-line input[name=line]')).toBeFocused();
});

test('the editing commands menu undoes an edit', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  const original = await editor.innerText();
  const unsaved = page.locator('.rp-badge', {hasText: 'Unsaved'});
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('# typed');
  await expect(unsaved).toBeVisible();
  await page.getByRole('button', {name: 'Editing commands', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Undo', exact: true}).click();
  await expect(editor).toHaveText(original, {useInnerText: true});
  await expect(unsaved).toHaveCount(0);
});

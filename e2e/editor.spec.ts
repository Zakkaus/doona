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
  await expect(page.locator('.cm-lineNumbers .cm-activeLineGutter')).toHaveText('3');
});

test('a read-only source keeps Find and Go to line, and its editing commands are disabled', async ({page}) => {
  await page.goto('/#/config?source=src-harbor');
  await expect(page.locator('.cm-content[aria-label="/var/lib/honk/subscriptions/harbor.dae"]')).toHaveAttribute('contenteditable', 'false');
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
  const unsaved = page.locator('.rp-badge', {hasText: 'Not applied'});
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('# typed');
  await expect(unsaved).toBeVisible();
  await page.getByRole('button', {name: 'Editing commands', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Undo', exact: true}).click();
  await expect(editor).toHaveText(original, {useInnerText: true});
  await expect(unsaved).toHaveCount(0);
  await page.getByRole('button', {name: 'Editing commands', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Redo', exact: true}).click();
  await expect(editor).toContainText('# typed');
  const first = editor.locator('.cm-line').first();
  await expect(first).toHaveText(/^#/);
  await first.click();
  await page.getByRole('button', {name: 'Editing commands', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Toggle comment', exact: true}).click();
  await expect(first).not.toHaveText(/^#/);
});

for (const source of ['src-main', 'src-generated'])
  test(`resizing ${source} across the tools threshold keeps a stable row and transfers tool focus`, async ({page}) => {
    await page.goto(`/#/config?tab=source&source=${source}`);
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const toolbar = page.locator('.rp-editor-toolbar');
    const more = toolbar.getByRole('button', {name: 'More actions', exact: true});
    const find = toolbar.getByRole('button', {name: source === 'src-main' ? 'Find and replace' : 'Find', exact: true});
    const resize = async (width: number) => {
      await page.setViewportSize({width, height: 900});
      const frames = await toolbar.evaluate(async el => {
        const samples: Array<{collapsed: boolean; width: number; height: number}> = [];
        for (let frame = 0; frame < 16; frame++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          const tools = el.querySelector('.rp-editor-actions')!;
          samples.push({
            collapsed: tools.hasAttribute('data-collapsed'),
            width: tools.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height
          });
        }
        return samples;
      });
      // A resize may settle in the first frame; subsequent paints must not alternate layouts.
      expect(frames.slice(1)).toEqual(Array.from({length: 15}, () => frames[15]));
      return frames[15].collapsed;
    };
    let narrow = 390;
    let wide = 768;
    expect(await resize(narrow)).toBe(true);
    expect(await resize(wide)).toBe(false);
    while (wide - narrow > 1) {
      const middle = Math.floor((narrow + wide) / 2);
      if (await resize(middle)) narrow = middle;
      else wide = middle;
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      expect(await resize(wide + 1)).toBe(false);
      expect(await resize(wide)).toBe(false);
      await find.focus();
      expect(await resize(narrow)).toBe(true);
      await expect(more).toBeFocused();
      expect(await resize(narrow - 1)).toBe(true);
      await expect(more).toBeFocused();
      if (source === 'src-generated') {
        await expect(toolbar.getByRole('button', {name: 'Validate', exact: true})).toHaveCount(0);
        await expect(toolbar.locator('.rp-editor-actions .rp-editor-overflow')).toBeVisible();
      }
    }
  });

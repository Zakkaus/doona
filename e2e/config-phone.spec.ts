import {ApiError} from '../src/api/error';
import {expect, mockBackend, moreAction, test} from './fixtures';

for (const scheme of ['light', 'dark'])
  test.describe(`390px ${scheme} config status`, () => {
    test.use({viewport: {width: 390, height: 900}, storage: {'doona-scheme': scheme}});

    test('the not-applied badge stays complete before and after a write refusal', async ({page}) => {
      const {handlers} = await mockBackend(page);
      handlers['PUT config/sources/src-main'] = async () => {
        throw new ApiError(412, 'stale_revision', 'Source changed on disk');
      };
      await page.goto('/#/config?tab=source');
      const editor = page.locator('.cm-content');
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type('\n# draft');
      await page.evaluate(() => document.fonts.ready);
      const card = page.getByRole('region', {name: '/etc/honk/config.dae', exact: true});
      const badge = card.locator('.rp-source-note .rp-badge');
      for (const refused of [false, true]) {
        if (refused) {
          const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
          const apply = card.getByRole('button', {name: 'Apply', exact: true});
          if (await apply.isVisible()) await apply.click();
          else await moreAction(card.locator('.rp-editor-toolbar'), 'Apply');
          await rejected;
          await expect(page.locator('.rp-toast.negative')).toContainText('changed');
        }
        await expect(badge).toHaveText('Not applied');
        const geometry = await badge.evaluate(el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          const badge = el.getBoundingClientRect();
          const note = el.closest('.rp-source-note')!.getBoundingClientRect();
          return {text, badge, note, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth};
        });
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
        expect(geometry.text.left).toBeGreaterThanOrEqual(geometry.badge.left);
        expect(geometry.text.right).toBeLessThanOrEqual(geometry.badge.right);
        expect(geometry.badge.left).toBeGreaterThanOrEqual(geometry.note.left);
        expect(geometry.badge.right).toBeLessThanOrEqual(geometry.note.right);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      }
    });
  });

for (const lang of ['en', 'zh-TW'])
  test.describe(`390px ${lang} path picker spacing`, () => {
    test.use({viewport: {width: 390, height: 900}, storage: {'doona-lang': lang}});

    for (const [source, basename] of [
      ['src-harbor', 'sub-c.dae'],
      ['src-generated', 'skylink.dae'],
      ['src-harbor', 'subscription-routing-backup.dae']
    ])
      test(`${basename} stays inside the picker and clear of file details`, async ({page}) => {
        const {api, handlers} = await mockBackend(page);
        const config = await api.config();
        const file = config.sources.find(item => item.id === source)!;
        file.path = file.path.slice(0, file.path.lastIndexOf('/') + 1) + basename;
        handlers['GET config'] = async () => config;
        await page.goto(`/#/config?tab=source&source=${source}`);
        await expect(page.locator('.cm-content')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const row = page.locator('.rp-source-pick');
        await expect(row.locator('.rp-path > bdi')).toHaveText(basename);
        const geometry = await row.evaluate(el => {
          const picker = el.querySelector('.rp-picker')!;
          const button = picker.querySelector('button')!;
          const filename = button.querySelector('.rp-path > bdi')!;
          const arrow = button.querySelector('svg')!;
          const box = (item: Element) => item.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(filename);
          return {
            parent: box(picker),
            button: box(button),
            filename: box(filename),
            textWidth: range.getBoundingClientRect().width,
            arrow: box(arrow),
            innerGap: parseFloat(getComputedStyle(button).columnGap),
            gap: parseFloat(getComputedStyle(el).columnGap),
            rowGap: parseFloat(getComputedStyle(el).rowGap),
            siblings: [...el.children].filter(item => item.matches('.rp-help-row, .rp-badge, .rp-label')).map(box)
          };
        });
        expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.parent.left);
        expect(geometry.button.right).toBeLessThanOrEqual(geometry.parent.right);
        expect(geometry.textWidth).toBeLessThanOrEqual(geometry.filename.width);
        expect(geometry.arrow.left - geometry.filename.right).toBeGreaterThanOrEqual(geometry.innerGap);
        expect(geometry.button.right).toBeLessThanOrEqual(390 - 16);
        expect(geometry.siblings).toHaveLength(2);
        for (const sibling of geometry.siblings) {
          const below = sibling.top >= geometry.parent.bottom;
          expect(below ? sibling.top - geometry.parent.bottom : sibling.left - geometry.parent.right).toBeGreaterThanOrEqual(
            below ? geometry.rowGap : geometry.gap
          );
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      });
  });

for (const width of [320, 360, 390])
  for (const lang of ['en', 'zh-CN', 'zh-TW'])
    test.describe(`${width}px ${lang} config files`, () => {
      test.use({viewport: {width, height: 900}, storage: {'doona-lang': lang}});

      test('the picker shows the complete basename and reveals its full path', async ({page}) => {
        const {api, handlers} = await mockBackend(page);
        const config = await api.config();
        const path = '/etc/honk/' + 'long-configuration-directory/'.repeat(8) + 'config.dae';
        config.sources[0].path = path;
        handlers['GET config'] = async () => config;
        await page.goto('/#/config?tab=source');
        await expect(page.locator('.cm-content')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const picker = page.locator('.rp-source-pick button');
        const filename = picker.locator('.rp-path > bdi');
        await expect(filename).toHaveText('config.dae');
        const geometry = await filename.evaluate(el => {
          const file = el.getBoundingClientRect();
          const clip = el.closest('.rp-path')!.getBoundingClientRect();
          const directory = el.previousElementSibling!;
          const style = getComputedStyle(directory);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const range = document.createRange();
          range.selectNodeContents(el);
          return {
            left: file.left - clip.left,
            right: file.right - clip.right,
            textWidth: range.getBoundingClientRect().width,
            fileWidth: file.width,
            directoryClipped: directory.scrollWidth > directory.clientWidth,
            directoryWidth: directory.getBoundingClientRect().width,
            ellipsisWidth: context.measureText('…').width,
            ellipsis: style.textOverflow,
            overflow: style.overflowX
          };
        });
        expect(geometry.directoryClipped).toBe(true);
        // Removing the directory minimum leaves no room to paint the ellipsis at 320px in English.
        expect(geometry.ellipsis).toBe('ellipsis');
        expect(geometry.overflow).toBe('hidden');
        expect(geometry.directoryWidth).toBeGreaterThanOrEqual(geometry.ellipsisWidth);
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(0);
        expect(geometry.textWidth).toBeLessThanOrEqual(geometry.fileWidth);
        const box = (await picker.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(16);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 16);
        await picker.focus();
        await expect(page.getByRole('tooltip')).toHaveText(path);
        await picker.click();
        await expect(page.getByRole('option', {name: path, exact: false})).toBeVisible();
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      });
    });

for (const width of [390, 768])
  for (const lang of ['en', 'zh-CN', 'zh-TW'])
    test.describe(`${width}px ${lang} editor toolbar`, () => {
      test.use({viewport: {width, height: 900}, storage: {'doona-lang': lang}});

      test('the actions occupy one row below the full-width note', async ({page}) => {
        await page.goto('/#/config?tab=source');
        await expect(page.locator('.cm-content')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const card = page.getByRole('region', {name: '/etc/honk/config.dae', exact: true});
        const geometry = async () =>
          card.evaluate(el => {
            const note = el.querySelector('.rp-source-note')!.getBoundingClientRect();
            const toolbar = (el.querySelector('.rp-editor-toolbar') ?? el.querySelector('.rp-toolbar'))!.getBoundingClientRect();
            const controls = [...el.querySelectorAll('.rp-source-note button, .rp-toolbar button')]
              .filter(button => getComputedStyle(button).visibility !== 'hidden')
              .map(button => {
                const box = button.getBoundingClientRect();
                return {top: box.top, bottom: box.bottom, height: box.height};
              });
            const box = el.getBoundingClientRect();
            return {note, toolbar, controls, left: toolbar.left - box.left, right: box.right - toolbar.right};
          });
        const note = card.locator('.rp-source-note');
        const lines = await note.evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el.querySelector('.rp-label')!).lineHeight));
        expect(lines).toBeLessThanOrEqual(2);
        await card.getByRole('button', {name: /Editor|编辑器|編輯器/}).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toContainText('honk');
        await page.keyboard.press('Escape');
        for (const dirty of [false, true]) {
          if (dirty) await page.locator('.cm-content').fill((await page.locator('.cm-content').innerText()) + '\n# draft');
          const boxes = await geometry();
          expect(boxes.controls.length).toBeGreaterThanOrEqual(2);
          expect(Math.max(...boxes.controls.map(box => box.top)) - Math.min(...boxes.controls.map(box => box.top))).toBeLessThanOrEqual(1);
          expect(Math.max(...boxes.controls.map(box => box.height)) - Math.min(...boxes.controls.map(box => box.height))).toBeLessThanOrEqual(1);
          expect(boxes.note.bottom).toBeLessThanOrEqual(boxes.toolbar.top);
          expect(Math.abs(boxes.note.width - boxes.toolbar.width)).toBeLessThanOrEqual(1);
          expect(Math.abs(boxes.left - boxes.right)).toBeLessThanOrEqual(1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
      });
    });

test.describe('phone editor keyboard', () => {
  test.use({viewport: {width: 390, height: 900}});

  test('the overflow opens search, line navigation and every edit command by keyboard', async ({page}) => {
    await page.goto('/#/config?tab=source');
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();
    const more = page.locator('.rp-editor-toolbar').getByRole('button', {name: 'More actions', exact: true});
    const open = async () => {
      await expect(page.locator('.rp-popover')).toHaveCount(0);
      await more.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menuitem')).toHaveText(['Find and replace', 'Go to line', 'Undo', 'Redo', 'Toggle comment']);
      await expect(page.getByRole('menuitem', {name: 'Find and replace', exact: true})).toBeFocused();
    };
    await open();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-search input').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await open();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-panel input')).toBeFocused();
    await page.keyboard.press('Escape');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n# keyboard draft');
    const dirtyMore = page.locator('.rp-editor-toolbar').getByRole('button', {name: 'More actions', exact: true});
    const command = async (name: string) => {
      await dirtyMore.focus();
      await page.keyboard.press('Enter');
      const item = page.getByRole('menuitem', {name, exact: true});
      await item.focus();
      await page.keyboard.press('Enter');
    };
    await command('Undo');
    await expect(editor).not.toContainText('keyboard draft');
    await command('Redo');
    await expect(editor).toContainText('keyboard draft');
    await command('Toggle comment');
    await expect(editor).not.toContainText('# keyboard draft');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+f');
    await expect(page.locator('.cm-search input').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+g');
    await expect(page.locator('.cm-panel input')).toBeFocused();
  });
});

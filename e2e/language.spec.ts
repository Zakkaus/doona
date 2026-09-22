import {expect, routes, test} from './fixtures';
import {LOCALE, translate} from '../src/i18n';
for (const lang of ['zh-TW', 'zh-CN', 'en'] as const) {
  test.describe(lang, () => {
    test.use({storage: {'doona-lang': lang}});
    test('renders navigation without browser errors', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('html')).toHaveAttribute('lang', LOCALE[lang]);
      for (const route of routes) {
        const nav = page.locator(`.rp-nav[href="#/${route}"]`);
        await expect(nav).toBeVisible();
      }
      await expect(page.locator('.rp-nav').first()).toBeVisible();
      await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
    });
    test('editor completion suggestions have a localized accessible name', async ({page}) => {
      await page.goto('/#/config?tab=source');
      await page.getByRole('button', {name: translate(lang, 'config.edit'), exact: true}).click();
      const editor = page.locator('.cm-content[contenteditable="true"]');
      await editor.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText('global {\n  log_l');
      await page.keyboard.press('Control+Space');
      const suggestions = page.getByRole('listbox', {name: translate(lang, 'cm.completions'), exact: true});
      await expect(suggestions).toBeVisible();
      await suggestions.getByRole('option', {name: 'log_level', exact: true}).click();
      await expect(editor).toContainText('log_level:');
    });
  });
}

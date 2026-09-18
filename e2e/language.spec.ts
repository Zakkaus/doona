import {expect, routes, test} from './fixtures';
import {LOCALE} from '../src/i18n';
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
  });
}

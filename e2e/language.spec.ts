import {expect, routes, test} from './fixtures';

const LOCALE: Record<string, string> = {'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', en: 'en-US'};
for (const lang of ['zh-TW', 'zh-CN', 'en']) {
  test.describe(lang, () => {
    test.use({storage: {'doona-lang': lang}});
    test('renders navigation without browser errors', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('html')).toHaveAttribute('lang', LOCALE[lang]);
      await expect(page.locator('.rp-nav')).toHaveCount(routes.length);
      await expect(page.locator('.rp-nav').first()).toBeVisible();
      await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
    });
  });
}

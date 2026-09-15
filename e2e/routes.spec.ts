import {expect, routes, test} from './fixtures';

for (const scheme of ['light', 'dark']) {
  test.describe(scheme, () => {
    test.use({storage: {'doona-scheme': scheme}});
    for (const route of routes) {
      test(route, async ({page}) => {
        await page.goto(`/#/${route}`);
        await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);
        await expect(page.locator('.rp-content')).toBeVisible();
        await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
      });
    }
  });
}

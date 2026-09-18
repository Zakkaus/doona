import {expect, test} from './fixtures';

test.use({storage: {'doona-mock-profile': 'base'}});

test('unavailable capabilities mark navigation without breaking deep links', async ({page}) => {
  await page.goto('/#/rules');
  for (const route of ['events', 'rules']) {
    await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('data-unavailable', '');
  }
  await expect(page.locator('.rp-nav[href="#/settings"]')).not.toHaveAttribute('data-unavailable', '');
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  await expect(page.locator('.rp-content')).toBeVisible();
  await expect(page).toHaveURL(/#\/rules$/);
});

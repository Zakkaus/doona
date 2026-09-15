import {expect, test} from './fixtures';

test.use({storage: {'doona-mock-profile': 'base'}});

test('unavailable capabilities hide navigation without breaking deep links', async ({page}) => {
  await page.goto('/#/flows');
  for (const route of ['flows', 'events', 'rules', 'resources', 'config', 'validate']) {
    await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveCount(0);
  }
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  await expect(page.locator('.rp-content')).toBeVisible();
  await expect(page).toHaveURL(/#\/flows$/);
});

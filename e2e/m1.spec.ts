import {expect, routes, test} from './fixtures';

// The first honk-native profile exposes only runtime and userspace-observed connections.
test.describe('first-release backend', () => {
  test.use({storage: {'doona-mock-profile': 'm1'}});

  test('the shell marks what the backend lacks and every offered page loads clean', async ({page}) => {
    await page.goto('/#/activity');
    await expect(page.locator('.rp-strip')).toBeVisible();
    await expect(page.locator('.rp-nav')).toHaveCount(routes.length);
    await expect(page.locator('.rp-nav:not([data-unavailable])')).toHaveText(['Activity', 'Overview', 'Connections', 'Settings']);
    for (const route of ['overview', 'connections', 'settings'] as const) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-nav[href="#/' + route + '"]')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.rp-content')).toBeVisible();
    }
    for (const route of routes.filter(r => !['activity', 'overview', 'connections', 'settings'].includes(r))) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content')).toBeVisible();
    }
    await page.goto('/#/connections');
    await expect(page.locator('.rp-table [role=row][data-key]').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'Close all', exact: true})).toHaveCount(0);
    await expect(page.getByText('Partial connection visibility', {exact: true})).toBeVisible();
    await page.keyboard.press('Control+K');
    await page.locator('.rp-dialog input').fill('telegram');
    await expect(page.getByRole('option', {name: /api\.telegram\.org/})).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

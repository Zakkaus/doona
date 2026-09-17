import {expect, routes, test} from './fixtures';

// honk's first native release offers runtime and connections only. Every page that stays must render without
// errors or stray requests; every page that needs more must leave the navigation.
test.describe('first-release backend', () => {
  test.use({storage: {'doona-mock-profile': 'm1'}});

  test('the shell shows only what the backend has and every remaining page loads clean', async ({page}) => {
    await page.goto('/#/activity');
    await expect(page.locator('.rp-strip')).toBeVisible();
    const nav = page.locator('.rp-nav');
    await expect(nav).toHaveText(['Activity', 'Overview', 'Connections', 'Settings']);
    // The quick row says the mode switch is not offered rather than pretending to switch.
    await expect(page.getByText('Not offered by the backend', {exact: true})).toBeVisible();
    for (const route of ['overview', 'connections', 'settings'] as const) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-nav[href="#/' + route + '"]')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.rp-content')).toBeVisible();
    }
    // Deep links to hidden pages fall back without a request for the missing resource.
    for (const route of routes.filter(r => !['activity', 'overview', 'connections', 'settings'].includes(r))) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content')).toBeVisible();
    }
    // The connections page lists what the backend observed and offers no closing.
    await page.goto('/#/connections');
    await expect(page.locator('.rp-table [role=row][data-key]').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'Close all', exact: true})).toHaveCount(0);
    await expect(page.getByText('Partial view', {exact: true})).toBeVisible();
    // Search finds pages and connections, and asks nothing else of the backend.
    await page.keyboard.press('Control+K');
    await page.locator('.rp-dialog input').fill('telegram');
    await expect(page.getByRole('option', {name: /api\.telegram\.org/})).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

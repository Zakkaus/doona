import {expect, mockBackend, routes, test} from './fixtures';

const demoProfile = {'doona-profiles': JSON.stringify([{id: 'demo', name: 'Demo', api: 'mock', token: ''}]), 'doona-profile': 'demo'};

test('a bare URL opens the chosen nav page at its default view; explicit routes win', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/settings');
  const picker = page.getByRole('button', {name: /Open at startup$/});
  await expect(picker).toContainText('Activity');
  await picker.click();
  // Its own list, not the palette boxes on the same page.
  const list = page.getByRole('listbox', {name: /Open at startup/});
  await expect(list.getByRole('option')).toHaveCount(routes.length);
  await expect(list.getByRole('option', {name: 'Last opened page', exact: true})).toHaveCount(0);
  await list.getByRole('option', {name: 'Rules', exact: true}).click();
  await expect(picker).toContainText('Rules');
  expect(await page.evaluate(() => localStorage.getItem('doona-start-page'))).toBe('rules');
  await page.goto('/');
  await expect(page).toHaveURL(/#\/rules$/);
  await expect(page.getByRole('tab', {name: 'Routing rules', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.goto('/#/rules?tab=dns');
  await expect(page.getByRole('tab', {name: 'DNS rules', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.goto('/#/nodes?tab=latency');
  await expect(page).toHaveURL(/#\/nodes\?tab=latency$/);
  await expect(page.getByRole('tab', {name: 'Latency', exact: true})).toHaveAttribute('aria-selected', 'true');
});

test('first-run setup opens Settings and connects to the currently chosen page', async ({page}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.getByRole('button', {name: /Open at startup$/}).click();
  await page.getByRole('option', {name: 'Rules', exact: true}).click();
  await page.locator('[name=api]').fill('mock');
  await Promise.all([page.waitForEvent('load'), page.getByRole('region', {name: 'Backend', exact: true}).locator('button[type=submit]').click()]);
  await expect(page).toHaveURL(/#\/rules$/);
  await expect(page.locator('.rp-login-page')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Sign in', exact: true}).click()]);
  await expect(page.locator('.rp-nav[href="#/rules"]')).toHaveAttribute('aria-current', 'page');
});

test.describe('saved startup choice', () => {
  test.use({storage: {...demoProfile, 'doona-start-page': 'rules'}});

  for (const [url, route] of [
    ['/', 'rules'],
    ['/#/nodes?tab=latency', 'nodes']
  ]) {
    test(`sign-in preserves the destination for ${url}`, async ({page}) => {
      await page.goto(url);
      await expect(page.locator('.rp-login-page')).toBeVisible();
      await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Sign in', exact: true}).click()]);
      await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
      if (route === 'nodes') await expect(page).toHaveURL(/#\/nodes\?tab=latency$/);
    });
  }
});

for (const value of ['', 'last', 'unknown', 'rules?tab=dns']) {
  test.describe(`invalid startup choice ${JSON.stringify(value)}`, () => {
    test.use({storage: {'doona-start-page': value, 'doona-last-page': JSON.stringify({route: 'rules', query: 'tab=dns'})}});

    test('falls back to Activity and ignores the old saved page', async ({page}) => {
      await mockBackend(page);
      await page.goto('/');
      await expect(page).toHaveURL(/#\/activity$/);
      await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
    });
  });
}

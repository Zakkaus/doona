import {expect, expectLoadFailures, test} from './fixtures';

// The public demo saves a profile on the mock; a saved demo profile signs in with the account it publishes.
const demoProfile = {'doona-profiles': JSON.stringify([{id: 'demo', name: 'Demo', api: 'mock', token: ''}]), 'doona-profile': 'demo'};

test.describe('the demo', () => {
  test.use({storage: demoProfile});

  test('shows the sign-in page first, filled with the demo account, and signing in enters it', async ({page}) => {
    await page.goto('/#/activity');
    const login = page.locator('.rp-login-page');
    await expect(login.getByRole('heading', {level: 1})).toHaveText('Sign in');
    await expect(login).toContainText('Connecting to Demo');
    await expect(login.locator('.rp-login-demo')).toHaveText('Demo account: demo  Password: demo');
    await expect(login.getByLabel('Username', {exact: true})).toHaveValue('demo');
    await expect(login.getByLabel('Password', {exact: true})).toHaveValue('demo');
    // Nothing of the shell is drawn before sign-in.
    await expect(page.locator('.rp-nav')).toHaveCount(0);
    await Promise.all([page.waitForEvent('load'), login.getByRole('button', {name: 'Sign in', exact: true}).click()]);
    await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.rp-login-page')).toHaveCount(0);
    // The session belongs to the tab and survives a reload.
    await page.reload();
    await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
  });

  test('refuses any other password as a password backend does', async ({page}) => {
    await page.goto('/#/activity');
    const login = page.locator('.rp-login-page');
    await login.getByLabel('Password', {exact: true}).fill('not-the-demo');
    await login.getByRole('button', {name: 'Sign in', exact: true}).click();
    await expect(login.locator('.rp-alert')).toHaveText('The username or password is incorrect.');
    await expect(page.locator('.rp-nav')).toHaveCount(0);
  });

  test('switches language and scheme from the sign-in page', async ({page}) => {
    await page.goto('/#/activity');
    const controls = page.locator('.rp-login-controls');
    await controls.getByRole('button', {name: 'Language', exact: true}).click();
    await page.getByRole('menuitemradio', {name: '繁體中文'}).click();
    const login = page.locator('.rp-login-page');
    await expect(login.getByRole('heading', {level: 1})).toHaveText('登入');
    await expect(login.locator('.rp-login-demo')).toHaveText('示範帳號：demo　密碼：demo');
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
    // The same toggle as the top bar: a saved scheme goes back to the system's, which then flips to its opposite.
    await controls.getByRole('button', {name: '主題：亮色', exact: true}).click();
    await controls.getByRole('button', {name: '主題：跟隨系統', exact: true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
    await expect(controls.getByRole('button', {name: '主題：暗色', exact: true})).toBeVisible();
  });

  test('fits a 360px screen without the showcase, and shows the showcase panel from 1024px', async ({page}) => {
    await page.setViewportSize({width: 360, height: 740});
    await page.goto('/#/activity');
    const login = page.locator('.rp-login-page');
    await expect(login.getByRole('button', {name: 'Sign in', exact: true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator('.rp-login-showcase')).toHaveCount(0);
    // The column is centred on a phone.
    const column = (await login.locator('.rp-login-column').boundingBox())!;
    expect(Math.abs(column.x + column.width / 2 - 180)).toBeLessThanOrEqual(1);
    await page.setViewportSize({width: 1280, height: 800});
    const showcase = page.locator('.rp-login-showcase');
    await expect(showcase).toHaveAttribute('aria-hidden', 'true');
    const pane = (await page.locator('.rp-login-pane').boundingBox())!;
    expect((await showcase.boundingBox())!.x).toBeGreaterThanOrEqual(pane.x + pane.width);
  });
});

test('a rejected saved token asks for a new one on the sign-in page', async ({page}) => {
  expectLoadFailures(page, /\/api(\/|$)/);
  await page.addInitScript(() => {
    if (localStorage.getItem('doona-profiles')) return;
    localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: 'stale-token'}]));
    localStorage.setItem('doona-profile', 'home');
  });
  let authorization: string | undefined;
  await page.route('**/api/v1/**', route => {
    authorization = route.request().headers()['authorization'];
    return route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Token required', details: null}, request_id: 'r'}});
  });
  await page.route(/\/api$/, route =>
    route.fulfill({status: 404, json: {error: {code: 'resource_not_found', message: 'nope', details: null}, request_id: 'd'}})
  );
  await page.goto('/#/activity');
  const login = page.locator('.rp-login-page');
  await expect(login.getByRole('heading', {level: 1})).toHaveText('Token required');
  await expect(login.locator('.rp-alert')).toHaveText('The backend rejected the saved token; enter a new one.');
  await expect(login.getByRole('button', {name: 'Language', exact: true})).toBeVisible();
  await expect(login.getByRole('link', {name: 'Change backend URL'})).toHaveAttribute('href', '#/settings');
  await login.getByLabel('Token', {exact: true}).fill('fresh-token');
  await Promise.all([page.waitForEvent('load'), login.getByRole('button', {name: 'Connect', exact: true}).click()]);
  await expect.poll(() => authorization).toBe('Bearer fresh-token');
});

// Settings works without a backend, so the link leaves the sign-in page for the backend editor while signed out.
test('changing the backend URL while signed out probes the new backend', async ({page}) => {
  expectLoadFailures(page, /\/(one|two)\/api/);
  const discovery = (setupRequired: boolean) => ({
    name: 'dae/honk-native',
    api_major: 1,
    links: {auth_setup: '/api/v1/auth/setup', auth_login: '/api/v1/auth/login'},
    auth: {mode: 'password', setup_required: setupRequired}
  });
  const probed: string[] = [];
  await page.route(/\/(one|two)\/api$/, route => {
    const backend = new URL(route.request().url()).pathname.split('/')[1];
    probed.push(backend);
    return route.fulfill({json: discovery(backend === 'two')});
  });
  await page.route(/\/(one|two)\/api\/v1\//, route =>
    route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Authentication required', details: null}, request_id: 'r'}})
  );
  await page.addInitScript(() => {
    if (localStorage.getItem('doona-profiles')) return;
    localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin + '/one', token: ''}]));
    localStorage.setItem('doona-profile', 'home');
  });
  await page.goto('/#/activity');
  const login = page.locator('.rp-login-page');
  await expect(login.getByRole('heading', {level: 1})).toHaveText('Sign in');
  await login.getByRole('link', {name: 'Change backend URL'}).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('.rp-login-page')).toHaveCount(0);
  const origin = new URL(page.url()).origin;
  await page.locator('[name=api]').fill(origin + '/two');
  await Promise.all([page.waitForEvent('load'), page.locator('form button[type=submit]').click()]);
  await page.goto('/#/activity');
  await expect(login.getByRole('heading', {level: 1})).toHaveText('Create the administrator');
  expect(probed.at(-1)).toBe('two');
});

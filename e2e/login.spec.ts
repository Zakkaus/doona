import {expect, expectLoadFailures, mockBackend, settle, test, box} from './fixtures';
import {ApiError} from '../src/api/error';

// The public demo saves a profile on the mock; a saved demo profile signs in with the account it publishes.
const demoProfile = {'doona-profiles': JSON.stringify([{id: 'demo', name: 'Demo', api: 'mock', token: ''}]), 'doona-profile': 'demo'};

test.describe('the demo', () => {
  test.use({storage: demoProfile});

  test('shows the sign-in page first, filled with the demo account, and signing in enters it', async ({page}) => {
    await page.goto('/#/activity');
    const login = page.locator('.rp-login-page');
    await expect(login.getByRole('heading', {level: 1})).toHaveText('Sign in');
    await expect(login).toContainText('Connecting to Demo');
    await expect(login.locator('.rp-login-account')).toHaveText('Demo account: demo  Password: demo');
    await expect(login.getByLabel('Username', {exact: true})).toHaveValue('demo');
    await expect(login.getByLabel('Password', {exact: true})).toHaveValue('demo');
    // Nothing of the shell is drawn before sign-in.
    await expect(page.locator('.rp-nav')).toHaveCount(0);
    await Promise.all([page.waitForEvent('load'), login.getByRole('button', {name: 'Sign in', exact: true}).click()]);
    await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.rp-login-page')).toHaveCount(0);
    // The session belongs to the tab and survives a reload.
    await settle(page);
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
    await expect(login.locator('.rp-login-account')).toHaveText('示範帳號：demo　密碼：demo');
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
    // The same toggle as the top bar: a saved scheme goes back to the system's, which then flips to its opposite.
    await controls.getByRole('button', {name: '主題：亮色', exact: true}).click();
    await controls.getByRole('button', {name: '主題：跟隨系統', exact: true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
    await expect(controls.getByRole('button', {name: '主題：暗色', exact: true})).toBeVisible();
  });

  // The three controls are the top bar's quiet icon buttons at the library's size, side by side on one row.
  test('lines up the sign-in controls at one size', async ({page}) => {
    await page.goto('/#/activity');
    const buttons = page.locator('.rp-login-controls').getByRole('button');
    await expect(buttons).toHaveCount(3);
    const boxes = await Promise.all((await buttons.all()).map(button => box(button)));
    for (const {y, height, width} of boxes) {
      expect(height).toBe(boxes[0]!.height);
      expect(y).toBe(boxes[0]!.y);
      expect(width).toBe(height);
    }
    for (const button of await buttons.all()) await expect(button).toHaveAttribute('data-size', 'M');
  });

  test('picks a palette from the sign-in page, and the page keeps it after a reload', async ({page}) => {
    await page.goto('/#/activity');
    const controls = page.locator('.rp-login-controls');
    await expect(page.locator('html')).not.toHaveAttribute('data-family', 'nord');
    await controls.getByRole('button', {name: 'Palette', exact: true}).click();
    await page.getByRole('menuitemradio', {name: /Nord/}).click();
    await expect(page.locator('html')).toHaveAttribute('data-family', 'nord');
    await settle(page);
    await page.reload();
    await expect(page.locator('.rp-login-page').getByRole('heading', {level: 1})).toHaveText('Sign in');
    await expect(page.locator('html')).toHaveAttribute('data-family', 'nord');
    // The backend settings reached before sign-in draw the top bar, which offers the same menu.
    await page.locator('.rp-login-page').getByRole('link', {name: 'Change backend URL'}).click();
    await expect(page.locator('.rp-top').getByRole('button', {name: 'Palette', exact: true})).toBeVisible();
  });

  // One card, centred both ways on a desktop and a phone, with its fields and its action at one height.
  for (const viewport of [
    {width: 1440, height: 920},
    {width: 390, height: 844}
  ]) {
    test(`centres the sign-in card at ${viewport.width}px`, async ({page}) => {
      await page.setViewportSize(viewport);
      await page.goto('/#/activity');
      const card = page.locator('.rp-login-card');
      const controls = card.locator('.rp-input, .rp-login-submit');
      await expect(controls).toHaveCount(3);
      const view = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth - innerWidth
      }));
      expect(view.overflow).toBeLessThanOrEqual(0);
      const {x, y, width, height} = await box(card);
      expect(Math.abs(x + width / 2 - view.width / 2)).toBeLessThanOrEqual(2);
      expect(Math.abs(y + height / 2 - view.height / 2)).toBeLessThanOrEqual(2);
      const heights = await Promise.all((await controls.all()).map(async control => (await box(control)).height));
      expect(new Set(heights).size).toBe(1);
      for (const control of await controls.all()) await expect(control).toHaveAttribute('data-size', 'M');
    });
  }
});

test('a rejected saved token takes a new one on the sign-in page', async ({page}) => {
  expectLoadFailures(page, /\/api(\/|$)/);
  await page.addInitScript(() => {
    if (localStorage.getItem('doona-profiles')) return;
    localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: 'stale-token'}]));
    localStorage.setItem('doona-profile', 'home');
  });
  let authorization: string | undefined;
  await page.route('**/api/v1/**', route => {
    // The sign-in page probes without a token, so only a request that carries one is kept.
    authorization = route.request().headers()['authorization'] ?? authorization;
    return route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Token required', details: null}, request_id: 'r'}});
  });
  await page.route(/\/api$/, route =>
    route.fulfill({status: 404, json: {error: {code: 'resource_not_found', message: 'nope', details: null}, request_id: 'd'}})
  );
  await page.goto('/#/activity');
  const login = page.locator('.rp-login-page');
  await expect(login.getByRole('heading', {level: 1})).toHaveText('Token required');
  await expect(login.locator('.rp-alert')).toHaveText('The backend rejected the token; enter a valid one.');
  await expect(login.getByRole('button', {name: 'Language', exact: true})).toBeVisible();
  await expect(login.getByRole('link', {name: 'Change backend URL'})).toHaveAttribute('href', '#/settings');
  await expect(login.getByRole('link', {name: 'Edit saved token'})).toHaveCount(0);
  const token = login.getByLabel('Token', {exact: true});
  const connect = login.getByRole('button', {name: 'Connect', exact: true});
  await expect(connect).toBeDisabled();
  await token.fill('  fresh-token  ');
  await expect(token).toHaveAttribute('type', 'password');
  await login.getByRole('button', {name: 'Show token'}).click();
  await expect(token).toHaveAttribute('type', 'text');
  await Promise.all([page.waitForEvent('load'), connect.click()]);
  await expect(page).toHaveURL(/#\/activity$/);
  await expect.poll(() => authorization).toBe('Bearer fresh-token');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('doona-profiles')))!)[0].token).toBe('fresh-token');
});

test('a token typed on the sign-in page signs in to a token backend', async ({page}) => {
  const backend = await mockBackend(page);
  expectLoadFailures(page, /\/api(\/|$)/);
  await page.addInitScript(() => {
    if (localStorage.getItem('doona-profiles')) return;
    localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: ''}]));
    localStorage.setItem('doona-profile', 'home');
  });
  backend.handlers['GET capabilities'] = async request => {
    if (request.headers()['authorization'] !== 'Bearer typed-token') throw new ApiError(401, 'authentication_required', 'Token required');
    return backend.capabilities;
  };
  await page.goto('/#/activity');
  const login = page.locator('.rp-login-page');
  await expect(login.getByRole('heading', {level: 1})).toHaveText('Token required');
  await login.getByLabel('Token', {exact: true}).fill('typed-token');
  await Promise.all([page.waitForEvent('load'), login.getByRole('button', {name: 'Connect', exact: true}).click()]);
  await expect(page.locator('.rp-nav[href="#/activity"]')).toBeVisible();
  await expect(login).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('doona-profiles')))!)[0].token).toBe('typed-token');
});

// A saved token is the backend's configured secret: signing out forgets it in this browser and revokes nothing.
test('signing out with a saved token forgets it and returns to the sign-in page', async ({page}) => {
  const backend = await mockBackend(page);
  expectLoadFailures(page, /\/api(\/|$)/);
  await page.addInitScript(() => {
    if (localStorage.getItem('doona-profiles')) return;
    localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: 'saved-token'}]));
    localStorage.setItem('doona-profile', 'home');
  });
  backend.handlers['GET capabilities'] = async request => {
    if (request.headers()['authorization'] !== 'Bearer saved-token') throw new ApiError(401, 'authentication_required', 'Token required');
    return backend.capabilities;
  };
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend', exact: true});
  await expect(card.getByText('Clears the token saved in this browser. The token stays valid on the backend.')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), card.getByRole('button', {name: 'Sign out', exact: true}).click()]);
  await expect(page).toHaveURL(/#\/activity$/);
  await expect(page.locator('.rp-login-page').getByLabel('Token', {exact: true})).toBeVisible();
  expect(backend.requests.some(request => request.method() !== 'GET')).toBe(false);
  await page.reload();
  await expect(page.locator('.rp-login-page').getByLabel('Token', {exact: true})).toBeVisible();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('doona-profiles')))!)).toEqual([
    {id: 'home', name: 'Home', api: 'http://127.0.0.1:4177', token: ''}
  ]);
});

// A honk build before the native API keeps its Clash API: with a secret it refuses the sign-in probes, which carry no
// credential, with a codeless 401, and answers the saved secret with a 404 for capabilities.
test('a Clash API with a saved secret explains that the native API is missing', async ({page}) => {
  expectLoadFailures(page, /\/api(\/|$)/);
  await page.addInitScript(() => {
    localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: 'clash-secret'}]));
    localStorage.setItem('doona-profile', 'home');
  });
  await page.route(/\/api(\/.*)?$/, route =>
    route.request().headers()['authorization']
      ? route.fulfill({status: 404, body: '404 page not found'})
      : route.fulfill({status: 401, json: {message: 'Unauthorized'}})
  );
  await page.goto('/#/activity');
  const login = page.locator('.rp-login-page');
  await expect(login.getByRole('heading', {level: 1})).toHaveText('This honk build has no native API');
  await expect(login.locator('.rp-alert')).toHaveCount(0);
  await expect(login.getByLabel('Token', {exact: true})).toHaveCount(0);
});

// Settings works without a backend, so the link leaves the sign-in page for the backend editor while signed out.
test('changing the backend URL while signed out probes the new backend', async ({page}) => {
  expectLoadFailures(page, /\/(one|two)\/api/);
  const discovery = (setupRequired: boolean) => ({
    name: 'daeuniverse/native',
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
  await Promise.all([page.waitForEvent('load'), page.getByRole('region', {name: 'Backend', exact: true}).locator('button[type=submit]').click()]);
  await page.goto('/#/activity');
  await expect(login.getByRole('heading', {level: 1})).toHaveText('Create the administrator');
  expect(probed.at(-1)).toBe('two');
});

test.describe('secret field geometry', () => {
  test.use({storage: demoProfile});
  for (const width of [1440, 390]) {
    test(`the reveal control stays inside its field at ${width}px`, async ({page}) => {
      await page.setViewportSize({width, height: 1000});
      await page.goto('/#/activity');
      const reveal = page.locator('.rp-input .reveal');
      await expect(reveal).toBeVisible();
      const geometry = await reveal.evaluate(el => {
        const r = el.getBoundingClientRect(),
          outer = el.closest('.rp-input')!.getBoundingClientRect(),
          style = getComputedStyle(el);
        return {left: r.left - outer.left, right: outer.right - r.right, margin: style.marginInlineEnd};
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeGreaterThanOrEqual(0);
      expect(geometry.margin).toBe('0px');
    });
  }
});
for (const when of ['before opening Settings', 'before saving'] as const) {
  test(`a challenged token cannot follow a changed API ${when}`, async ({page}) => {
    expectLoadFailures(page, /\/api(\/|$)/);
    await page.addInitScript(() => {
      if (localStorage.getItem('doona-profiles')) return;
      localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: 'old'}]));
      localStorage.setItem('doona-profile', 'home');
    });
    const sent: string[] = [];
    await page.route('**/api/v1/**', route => {
      sent.push(route.request().headers()['authorization'] ?? '');
      return route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Token required', details: null}, request_id: 'r'}});
    });
    await page.route(/\/api$/, route =>
      route.fulfill({status: 404, json: {error: {code: 'resource_not_found', message: 'nope', details: null}, request_id: 'd'}})
    );
    await page.goto('/#/activity');
    await expect(page.getByLabel('Token', {exact: true})).toBeVisible();
    const change = () =>
      page.evaluate(() => {
        const profiles = JSON.parse(localStorage.getItem('doona-profiles')!);
        profiles[0].api = location.origin + '/other';
        localStorage.setItem('doona-profiles', JSON.stringify(profiles));
      });
    if (when === 'before opening Settings') await change();
    // The Backend editor's sign-in link, which names the profile and endpoint the token is meant for.
    await page.evaluate(() => {
      const query = new URLSearchParams({card: 'backend', profile: 'home', endpoint: location.origin, reason: 'rejected', return: '#/activity'});
      location.hash = `#/settings?${query}`;
    });
    const card = page.getByRole('region', {name: 'Backend', exact: true});
    if (when === 'before saving') {
      await card.locator('[name=token]').fill('a-secret');
      await change();
      await card.getByRole('button', {name: 'Save', exact: true}).click();
    }
    await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeDisabled();
    await expect(card.getByRole('alert').filter({hasText: 'The profile changed'})).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('doona-profiles')))!)[0]).toMatchObject({token: 'old'});
    expect(sent).not.toContain('Bearer a-secret');
  });
}

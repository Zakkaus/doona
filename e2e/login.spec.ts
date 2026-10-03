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

  test.describe('in Chinese', () => {
    test.use({storage: {...demoProfile, 'doona-lang': 'zh-TW'}, reducedMotion: 'no-preference'});

    test('draws the link rate from the catalogue', async ({page}) => {
      await page.setViewportSize({width: 1440, height: 900});
      await page.addInitScript(() => {
        const drawn: string[] = [];
        (window as unknown as {drawnGameText: string[]}).drawnGameText = drawn;
        const fillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          drawn.push(text);
          return fillText.call(this, text, x, y, maxWidth);
        };
      });
      await page.goto('/#/activity');
      await page.locator('.rp-login-showcase button').click();
      await expect
        .poll(() => page.evaluate(() => ['0.0 MB', '100 Mbps'].every(text => (window as unknown as {drawnGameText: string[]}).drawnGameText.includes(text))))
        .toBe(true);
    });
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

  test('fits a 360px screen without the showcase, and shows the showcase panel from 1024px', async ({page}) => {
    await page.setViewportSize({width: 360, height: 740});
    await page.goto('/#/activity');
    const login = page.locator('.rp-login-page');
    await expect(login.getByRole('button', {name: 'Sign in', exact: true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator('.rp-login-showcase')).toHaveCount(0);
    // The column is centred on a phone.
    const column = await box(login.locator('.rp-login-column'));
    expect(Math.abs(column.x + column.width / 2 - 180)).toBeLessThanOrEqual(1);
    await page.setViewportSize({width: 1280, height: 800});
    const showcase = page.locator('.rp-login-showcase');
    await expect(showcase.locator('canvas')).toBeVisible();
    const pane = await box(page.locator('.rp-login-pane'));
    expect((await box(showcase)).x).toBeGreaterThanOrEqual(pane.x + pane.width);
  });

  test('shows a still scene that takes no presses under reduced motion, and plays once motion is allowed', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/#/activity');
    const showcase = page.locator('.rp-login-showcase');
    const button = showcase.locator('button');
    await expect(showcase.locator('canvas')).toBeVisible();
    // A picture, not a control: out of the tab order and unnamed, so nothing offers a game that cannot be played.
    await expect(button).toBeDisabled();
    await expect(showcase).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', {name: 'Mini game: press to make the duck flap'})).toHaveCount(0);
    // The preference is followed while the page stays open.
    await page.emulateMedia({reducedMotion: 'no-preference'});
    const game = page.getByRole('button', {name: 'Mini game: press to make the duck flap'});
    await expect(game).toBeEnabled();
    await game.click();
    await expect(showcase.locator('[aria-live]')).toHaveText(/^Link down, /);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await expect(button).toBeDisabled();
    await expect(showcase).toHaveAttribute('aria-hidden', 'true');
  });

  test.describe('with motion allowed', () => {
    test.use({reducedMotion: 'no-preference'});

    test('plays the mini game beside the form on a wide screen, and leaves it out on a phone', async ({page}) => {
      await page.setViewportSize({width: 1440, height: 900});
      await page.goto('/#/activity');
      const game = page.getByRole('button', {name: 'Mini game: press to make the duck flap'});
      await expect(game.locator('canvas')).toBeVisible();
      const result = page.locator('.rp-login-showcase [aria-live]');
      await expect(result).toHaveText('');
      // One flap and no more: the duck falls to the ground and the run ends with what it forwarded.
      await game.click();
      await expect(result).toHaveText(/^Link down, \d+\.\d MB forwarded, best \d+\.\d MB\. Click or press Space to restart\.$/);
      // Typing in the form never reaches the game.
      const username = page.getByLabel('Username', {exact: true});
      await username.fill('');
      await username.press('r');
      await expect(username).toHaveValue('r');
      await page.setViewportSize({width: 390, height: 844});
      await expect(page.locator('.rp-login-showcase')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
    });

    // The game sizes its canvas from its panel, so the panel takes the viewport's height and never the canvas's. At a
    // fractional pixel ratio, through the game, focus, wheel gestures and resizes, the page stays one viewport tall and
    // nothing on it scrolls, with the game loaded on a wide window and left out on a narrow one.
    test.describe('at a fractional pixel ratio', () => {
      test.use({deviceScaleFactor: 1.25});

      test('keeps the page one viewport tall and unscrolled', async ({page}) => {
        await page.clock.install();
        await page.addInitScript(() => {
          (window as {scrolls?: string[]}).scrolls = [];
          document.addEventListener('scroll', event => (window as {scrolls?: string[]}).scrolls!.push(String((event.target as Element).nodeName)), true);
        });
        let viewport = {width: 1572, height: 790};
        await page.setViewportSize(viewport);
        await page.goto('/#/activity');
        const game = page.getByRole('button', {name: 'Mini game: press to make the duck flap'});
        await expect(game.locator('canvas')).toBeVisible();
        const still = async (step: string) => {
          await page.clock.runFor(1000);
          const state = await page.evaluate(() => {
            const root = document.scrollingElement!;
            return {
              y: window.scrollY,
              top: root.scrollTop,
              height: root.scrollHeight,
              scrolled: [...document.querySelectorAll('*')].filter(element => element.scrollTop > 0).map(element => element.className),
              scrolls: (window as {scrolls?: string[]}).scrolls!
            };
          });
          expect(state, step).toEqual({y: 0, top: 0, height: viewport.height, scrolled: [], scrolls: []});
        };
        const wheel = async (x: number) => {
          await page.mouse.move(x, viewport.height / 2);
          for (let turn = 0; turn < 5; turn++) await page.mouse.wheel(0, 400);
        };
        await still('idle');
        await game.click();
        for (let second = 0; second < 5; second++) await still('playing');
        for (const key of ['Space', 'ArrowDown', 'PageDown', 'End']) await game.press(key);
        await still('keys on the game');
        await wheel(viewport.width * 0.75);
        await still('wheel over the game');
        await page.getByLabel('Username', {exact: true}).focus();
        await still('username focused');
        await wheel(viewport.width * 0.2);
        await still('wheel over the form');
        for (const size of [
          {width: 1572, height: 600},
          {width: 1965, height: 600},
          {width: 1965, height: 987},
          {width: 1280, height: 987},
          {width: 900, height: 987}
        ]) {
          viewport = size;
          await page.setViewportSize(viewport);
          await expect(page.locator('.rp-login-game canvas')).toHaveCount(viewport.width >= 1024 ? 1 : 0);
          await wheel(viewport.width / 2);
          await still(`resized to ${viewport.width}x${viewport.height}`);
        }
      });
    });
  });
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

import {test as browserTest, type Page} from '@playwright/test';
import {expect, expectLoadFailures, loadCatalogues, mockBackend, moreAction, test} from './fixtures';
import {translate} from '../src/i18n';
import {capabilities} from '../mock/fixtures';

// The specs read the catalogues the page loads on demand.
test.beforeAll(loadCatalogues);

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

test('first run opens settings and preserves explicit deep links', async ({page}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('.rp-nav[href="#/settings"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.rp-content .rp-card')).toHaveCount(6);
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goto('/#/connections?src=192.168.1.2');
  await expect(page).toHaveURL(/#\/connections\?src=192\.168\.1\.2$/);
  // The source filter is a server-side scope, shown as an active filter rather than search text.
  await expect(page.getByRole('button', {name: 'Clear filters', exact: true})).toBeVisible();
});

test('a pairing link fills the backend draft and removes credentials from the address bar', async ({page}) => {
  await page.goto('/#/settings?api=http://router:9527&token=x');
  await expect(page.locator('[name=api]')).toHaveValue('http://router:9527');
  await expect(page.locator('[name=token]')).toHaveValue('x');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.reload();
  await expect(page.locator('[name=api]')).toHaveValue('');
  await expect(page.locator('[name=token]')).toHaveCount(0);
});

test('leaving a paired draft and staying does not write the token back into the address bar', async ({page}) => {
  await page.goto('/#/settings?api=http://router:9527&token=secret-token');
  await expect(page.locator('[name=token]')).toHaveValue('secret-token');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.evaluate(() => {
    location.hash = '#/activity';
  });
  const dialog = page.getByRole('alertdialog', {name: t('config.discardTitle')});
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/settings$/);
  expect(page.url()).not.toContain('secret-token');
});

browserTest('paints a frame during discovery, then selects the hosted backend and asks for its token', async ({page}) => {
  const challenge = {
    status: 401,
    headers: {'www-authenticate': 'Bearer'},
    json: {error: {code: 'authentication_required', message: 'Valid bearer credentials are required.', details: null}, request_id: 'first-visit'}
  };
  let release!: () => void;
  const discovery = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api', async route => {
    await discovery;
    await route.fulfill(challenge);
  });
  let backendRequests = 0;
  await page.route('**/api/v1/**', route => {
    backendRequests++;
    return route.fulfill(challenge);
  });
  await page.goto('/');
  await expect(page.locator('.rp-top .rp-brand')).toBeVisible();
  await expect(page.locator('.rp-nav')).toHaveCount(0);
  expect(backendRequests).toBe(0);
  release();
  await expect(page.getByRole('heading', {name: 'Token required'})).toBeVisible();
  await expect(page.locator('.rp-login-page')).toContainText(new URL(page.url()).host);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('doona-profiles') ?? '[]').map((item: {api: string}) => item.api))).toEqual([
    new URL(page.url()).origin
  ]);
});

test('saving mock reloads and restores the default activity route', async ({page}) => {
  await page.goto('/#/settings');
  const token = page.locator('[name=token]');
  // A real address takes a token, revealed on request.
  await page.locator('[name=api]').fill('https://router.example');
  await token.fill('test-secret');
  await expect(token).toHaveAttribute('type', 'password');
  await page.getByRole('button', {name: t('settings.showToken'), exact: true}).click();
  await expect(token).toHaveAttribute('type', 'text');
  await page.getByRole('button', {name: t('settings.hideToken'), exact: true}).click();
  await expect(page.locator('.rp-content')).not.toContainText('test-secret');
  // The built-in demo ignores any token, so the field goes.
  await page.locator('[name=api]').fill(' mock ');
  await expect(token).toHaveCount(0);
  await Promise.all([page.waitForEvent('load'), page.getByRole('region', {name: 'Backend', exact: true}).locator('button[type=submit]').click()]);
  await expect(page).toHaveURL(/#\/activity$/);
  // A saved demo profile signs in with its published account, filled in, before the default route.
  await page.goto('/#/');
  await expect(page.locator('.rp-login-page')).toContainText('Demo account: demo');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Sign in', exact: true}).click()]);
  await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
});

test('an invalid URL is identified and cannot overwrite saved settings', async ({page}) => {
  await page.goto('/#/settings');
  await page.locator('[name=api]').fill('ftp://honk.example');
  await page.locator('[name=token]').fill('not-saved');
  await page.getByRole('region', {name: 'Backend', exact: true}).locator('button[type=submit]').click();
  await expect(page.locator('[name=api]')).toHaveAttribute('aria-invalid', 'true');
  // The error joins the hint in the field's description rather than replacing it.
  await expect(page.locator('[name=api]')).toHaveAccessibleDescription(/not \/api\/v1/);
  await expect(page.locator('[name=api]')).toHaveAccessibleDescription(/without credentials/);
  expect(await page.evaluate(() => [localStorage.getItem('doona-api'), localStorage.getItem('doona-api-token')])).toEqual([null, null]);
});

test('connection testing uses the unsaved prefix and token for native discovery', async ({page}) => {
  await page.route('**/settings-backend/api', async route => {
    if (route.request().headers().authorization !== 'Bearer test-token') return route.fulfill({status: 401});
    await route.fulfill({
      json: {
        name: 'daeuniverse/native',
        status: 'draft',
        api_major: 1,
        base_path: '/api/v1',
        links: {version: '/api/v1/version'},
        auth: {mode: 'token', setup_required: false, anonymous_loopback: false}
      }
    });
  });
  await page.goto('/#/settings');
  const origin = new URL(page.url()).origin;
  await page.locator('[name=api]').fill(origin + '/settings-backend/');
  // A token the backend refuses is named as rejected, not as missing.
  expectLoadFailures(page, /\/settings-backend\/api$/);
  await page.locator('[name=token]').fill('wrong-token');
  await page.getByRole('button', {name: t('settings.test'), exact: true}).click();
  await expect(page.getByRole('region', {name: 'Backend', exact: true}).locator('form')).toContainText(t('settings.tokenRejected'));
  await page.locator('[name=token]').fill('test-token');
  await page.getByRole('button', {name: t('settings.test'), exact: true}).click();
  await expect(page.getByRole('region', {name: 'Backend', exact: true}).locator('form').getByRole('status')).toContainText('API v1');
  expect(await page.evaluate(() => localStorage.getItem('doona-api'))).toBeNull();
});

test('navigation cancels a connection probe without a timeout toast', async ({page}) => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  await page.route('**/slow-backend/api', async route => {
    await promise;
    await route.fulfill({json: {api_major: 1, auth: {mode: 'token', setup_required: false}}});
  });
  await page.goto('/#/settings');
  await page.locator('[name=api]').fill(new URL(page.url()).origin + '/slow-backend');
  const request = page.waitForRequest('**/slow-backend/api');
  await page.getByRole('button', {name: t('settings.test'), exact: true}).click();
  await request;
  await page.locator('.rp-nav[href="#/connections"]').click();
  await page.getByRole('alertdialog', {name: 'Discard changes not applied?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Connections', exact: true})).toBeVisible();
  resolve();
  await expect(page.locator('.rp-toast')).toHaveCount(0);
});

test('a pairing link cancels the old probe and clears its result', async ({page}) => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  await page.route('**/old-backend/api', async route => {
    await promise;
    await route.fulfill({json: {api_major: 1, auth: {mode: 'token', setup_required: false}}});
  });
  await page.route('**/new-backend/api', route => route.fulfill({json: {api_major: 2, auth: {mode: 'token', setup_required: false}}}));
  await page.goto('/#/settings');
  const origin = new URL(page.url()).origin;
  await page.locator('[name=api]').fill(origin + '/old-backend');
  const request = page.waitForRequest('**/old-backend/api');
  const probe = page.getByRole('button', {name: t('settings.test'), exact: true});
  await probe.click();
  await request;
  await page.evaluate(api => {
    location.hash = '#/settings?api=' + encodeURIComponent(api) + '&token=paired';
  }, origin + '/new-backend');
  await page.getByRole('alertdialog', {name: 'Discard changes not applied?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('[name=api]')).toHaveValue(origin + '/new-backend');
  await expect(probe).toBeEnabled();
  resolve();
  await expect(page.getByRole('region', {name: 'Backend', exact: true}).locator('form').getByRole('status')).toHaveCount(0);
  await probe.click();
  await expect(page.getByRole('region', {name: 'Backend', exact: true}).locator('form').getByRole('status')).toContainText('API v2');
  await page.evaluate(() => {
    location.hash = '#/settings?api=mock';
  });
  await page.getByRole('alertdialog', {name: 'Discard changes not applied?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('[name=api]')).toHaveValue('mock');
  await expect(page.getByRole('region', {name: 'Backend', exact: true}).locator('form').getByRole('status')).toHaveCount(0);
});

// A raw browser test: 401 and 404 responses log console errors by design here.
browserTest('a backend that answers 401 takes its token on the sign-in page', async ({page}) => {
  let authorization: string | null = null;
  await page.route('**/api/v1/**', async route => {
    // The sign-in page probes without a token, so only a request that carries one is kept.
    const header = route.request().headers()['authorization'];
    if (!header)
      return route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Token required', details: null}, request_id: 'r1'}});
    authorization = header;
    if (route.request().url().endsWith('/api/v1/capabilities')) return route.fulfill({json: capabilities});
    return route.fulfill({status: 404, json: {error: {code: 'resource_not_found', message: 'nope', details: null}, request_id: 'r2'}});
  });
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
  await page.goto('/#/activity');
  await expect(page.getByRole('heading', {name: 'Token required'})).toBeVisible();
  await page.getByLabel('Token', {exact: true}).fill('secret-1');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Connect', exact: true}).click()]);
  await expect.poll(() => authorization).toBe('Bearer secret-1');
  await expect(page.getByRole('heading', {name: 'Token required'})).toHaveCount(0);
});

test('five taps on the duck honk, and the header wears the long name for the session', async ({page}) => {
  await page.goto('/#/activity');
  const brand = page.locator('.rp-brand .rp-brand-text > span').first();
  await expect(brand).toHaveText('doona');
  await page.locator('.rp-brand').click();
  const duck = page.getByRole('dialog', {name: 'About doona', exact: true}).getByRole('button', {name: 'Pet me', exact: true});
  const night = duck.locator('img.night');
  await expect(night).not.toHaveAttribute('src');
  const painting = page.waitForResponse(response => /duck-night.*\.webp$/.test(new URL(response.url()).pathname));
  await duck.click();
  await painting;
  await expect.poll(() => night.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  for (let i = 1; i < 4; i++) await duck.click();
  await expect(brand).toHaveText('doona');
  await duck.click();
  await expect(page.getByText('Honk!', {exact: true})).toBeVisible();
  await expect(brand).toHaveText('doooooona');
  await page.getByRole('dialog').getByRole('button', {name: 'Close', exact: true}).click();
  await expect(brand).toHaveText('doooooona');
});

test('an unknown stored palette falls back to the supported moon palette', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-palette', 'unknown/palette'));
  await page.goto('/#/settings');
  await expect(page.locator('html')).toHaveAttribute('data-family', 'rose-pine');
  await expect(page.locator('html')).toHaveAttribute('data-flavour', 'moon');
  await page
    .getByRole('region', {name: 'Appearance', exact: true})
    .getByRole('button', {name: /Palette$/})
    .click();
  await expect(page.getByRole('option', {name: /Moon/})).toHaveAttribute('aria-selected', 'true');
});

async function twoProfiles(page: Page) {
  await mockBackend(page);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const profiles = [
    {id: 'a', name: 'Backend A', api: origin, token: 'saved-a'},
    {id: 'b', name: 'Backend B', api: origin, token: 'saved-b'}
  ];
  await page.addInitScript(profiles => {
    if (localStorage.getItem('doona-profiles') !== null) return;
    localStorage.setItem('doona-profiles', JSON.stringify(profiles));
    localStorage.setItem('doona-profile', 'a');
  }, profiles);
  return profiles;
}

test('profile switching confirms draft loss without saving edits to the profile being left', async ({page}) => {
  const profiles = await twoProfiles(page);
  await page.goto('/#/settings');
  await page.getByLabel('Backend URL', {exact: true}).fill('https://unsaved.example');
  await page.locator('[name=token]').fill('unsaved-token');
  const picker = page.getByRole('button', {name: /Profile$/});
  await picker.click();
  await page.getByRole('option', {name: /Backend B/}).click();
  const confirm = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
  await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page.getByLabel('Backend URL', {exact: true})).toHaveValue('https://unsaved.example');
  expect(await page.evaluate(() => localStorage.getItem('doona-profile'))).toBe('a');
  await picker.click();
  await page.getByRole('option', {name: /Backend B/}).click();
  await Promise.all([page.waitForEvent('load'), confirm.getByRole('button', {name: 'Discard changes', exact: true}).click()]);
  await expect(page.locator('[name=token]')).toHaveValue('saved-b');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('doona-profiles')!))).toEqual(profiles);
  expect(await page.evaluate(() => localStorage.getItem('doona-profile'))).toBe('b');
  await picker.click();
  await page.getByRole('option', {name: /Backend A/}).click();
  await expect(page.locator('[name=token]')).toHaveValue('saved-a');
  await page.locator('[name=token]').fill('explicitly-saved');
  await Promise.all([page.waitForEvent('load'), page.getByRole('region', {name: 'Backend', exact: true}).locator('button[type=submit]').click()]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('doona-profiles')!))).toEqual([{...profiles[0], token: 'explicitly-saved'}, profiles[1]]);
});

test('a draft in another settings form is answered for before the saved profile changes', async ({page}) => {
  await twoProfiles(page);
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: t('settings.runtime')});
  await card
    .getByRole('group', {name: t('settings.recording')})
    .getByRole('button', {name: t('settings.recordFlows')})
    .click();
  await page.getByRole('option', {name: t('settings.record.off'), exact: true}).click();
  const picker = page.getByRole('button', {name: /Profile$/});
  await picker.click();
  await page.getByRole('option', {name: /Backend B/}).click();
  const confirm = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
  await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
  expect(await page.evaluate(() => localStorage.getItem('doona-profile'))).toBe('a');
  await expect(picker).toBeEnabled();
  await picker.click();
  await page.getByRole('option', {name: /Backend B/}).click();
  await Promise.all([page.waitForEvent('load'), confirm.getByRole('button', {name: 'Discard changes', exact: true}).click()]);
  expect(await page.evaluate(() => localStorage.getItem('doona-profile'))).toBe('b');
});

test('a recorder can be pinned on or off and the state light follows the backend', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: t('settings.runtime')});
  const recording = card.getByRole('group', {name: t('settings.recording')});
  await expect(card.getByRole('link', {name: t('settings.runtimePersistent')})).toHaveAttribute('href', '#/config?tab=global');
  await expect(recording.getByText(t('settings.recordingIdle'), {exact: true})).toHaveCount(3);
  const flows = recording.getByRole('button', {name: t('settings.recordFlows')});
  await flows.click();
  await page.getByRole('option', {name: t('settings.record.off'), exact: true}).click();
  const saving = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/runtime/settings'));
  await card.getByRole('button', {name: t('settings.apply'), exact: true}).click();
  expect((await saving).postDataJSON()).toEqual({record_flows: 'off'});
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.runtimeSaved')})).toBeVisible();
  await expect(recording.getByText(t('settings.recordingIdle'), {exact: true})).toHaveCount(3);
  expect((await api.runtimeSettings()).recording?.flows?.mode).toBe('off');
  await flows.click();
  await page.getByRole('option', {name: t('settings.record.on'), exact: true}).click();
  await card.getByRole('button', {name: t('settings.apply'), exact: true}).click();
  await expect(recording.getByText(t('settings.recordingActive'), {exact: true})).toHaveCount(1);
  await expect(recording.getByText(t('settings.recordingIdle'), {exact: true})).toHaveCount(2);
});

test('the About card opens the keyboard shortcuts and links the guide', async ({page}) => {
  await page.goto('/#/settings?card=about');
  await page.getByRole('button', {name: 'Keyboard shortcuts', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Keyboard shortcuts', exact: true});
  await expect(dialog).toContainText('Search');
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', {name: /^Guide/})).toHaveAttribute('href', /^https:\/\/zakkaus\.github\.io\/doona-docs\//);
});

test('About doona lists its links in full-width rows on a phone and keeps its footer clear of the screen edge', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/settings?card=about');
  await page.getByRole('button', {name: 'About doona', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'About doona', exact: true});
  await expect(dialog.getByRole('button', {name: 'Close', exact: true})).toBeInViewport();
  const rows = await dialog.locator('.rp-about-links a').evaluateAll(links =>
    links.map(link => {
      const {width, height, left} = link.getBoundingClientRect();
      return {width, height, left};
    })
  );
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row).toEqual(rows[0]);
  const modal = await dialog.locator('xpath=ancestor::*[contains(@class,"rp-modal")]').boundingBox();
  expect(844 - (modal!.y + modal!.height)).toBeGreaterThanOrEqual(24);
});

test('appearance uses labeled pickers with balanced insets and matching type', async ({page}) => {
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Appearance', exact: true});
  const palette = card.getByRole('button', {name: /Palette/});
  await expect(palette).toBeVisible();
  const controls = await card.locator('.rp-selectbtn').evaluateAll(elements =>
    elements.map(el => {
      const s = getComputedStyle(el);
      return {height: el.getBoundingClientRect().height, left: s.paddingLeft, right: s.paddingRight, font: s.fontSize, weight: s.fontWeight};
    })
  );
  expect(controls.length).toBeGreaterThan(3);
  for (const control of controls) {
    expect(control.left).toBe(control.right);
    expect(control.height).toBe(controls[0].height);
    expect(control.font).toBe(controls[0].font);
    expect(control.weight).toBe(controls[0].weight);
  }
  await card
    .locator('.lbl')
    .filter({hasText: /^Palette$/})
    .click();
  await expect(palette).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', {name: 'Backend', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Backend', exact: true})).toHaveCount(0);
});

test('latency probes have their own card, persist and shape node and group probes', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/settings?card=probes');
  const card = page.getByRole('region', {name: 'Latency probes', exact: true});
  const runtime = page.getByRole('region', {name: 'Temporary runtime overrides', exact: true});
  await expect(card).toContainText('Saved in this browser.');
  await expect(runtime.getByRole('button', {name: /Probe method/})).toHaveCount(0);
  for (const label of ['Probe method', 'IP family', 'Measurement', 'Group probes']) await expect(card.getByText(label, {exact: true})).toHaveCount(1);
  const choose = async (picker: string, option: string) => {
    await card.getByRole('button', {name: new RegExp(picker)}).click();
    await page.getByRole('option', {name: option, exact: true}).click();
  };
  await choose('Probe method', 'TCP connect');
  await choose('IP family', 'IPv6');
  await choose('Measurement', 'Cold (new connection)');
  await choose('Group probes', 'Every leaf node');
  await page.reload();
  await expect(card.getByRole('button', {name: /Probe method/})).toContainText('TCP connect');
  await expect(card.getByRole('button', {name: /IP family/})).toContainText('IPv6');
  await expect(card.getByRole('button', {name: /Measurement/})).toContainText('Cold (new connection)');
  await expect(card.getByRole('button', {name: /Group probes/})).toContainText('Every leaf node');
  await card.getByRole('link', {name: 'Edit health checks in Configuration', exact: true}).click();
  await expect(page).toHaveURL(/#\/config\?tab=global$/);
  const probes = () => requests.filter(request => request.method() === 'POST' && request.url().endsWith('/probes')).map(request => request.postDataJSON());
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Test hk-01', exact: true}).click();
  await expect
    .poll(probes)
    .toEqual([
      expect.objectContaining({target: expect.objectContaining({type: 'node'}), kind: 'tcp_connect', transport: ['tcp'], ip_version: 'ipv6', warmth: 'cold'})
    ]);
  expect(probes()[0]).not.toHaveProperty('members');
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'gaming', exact: true}), 'Test all');
  await expect
    .poll(() => probes().slice(1))
    .toEqual([expect.objectContaining({target: {type: 'group', group_id: 'gaming'}, ip_version: 'ipv6', warmth: 'cold', members: 'leaves'})]);
});

test('the latency probes card shows the unavailable note without probes', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.resources.probes.available = false;
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Latency probes', exact: true});
  await expect(card).toContainText('This backend does not provide latency probes');
  await expect(card.getByRole('button', {name: /Probe method/})).toHaveCount(0);
});

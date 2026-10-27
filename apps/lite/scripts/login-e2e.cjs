const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const backend = 'http://login.test';
const shots = process.env.LITE_LOGIN_SHOTS;
const standardKeys = [...fs.readFileSync(path.resolve(__dirname, '../../../src/api/storage.ts'), 'utf8').matchAll(/:\s*'(doona-[^']+)'/g)].map(
  match => match[1]
);
const labels = {
  'zh-CN': {
    backend: 'honk native API 根地址',
    next: '继续',
    username: '用户名',
    password: '密码',
    confirm: '确认密码',
    login: '登录',
    setup: '创建并登录',
    token: '令牌',
    connect: '连接后端',
    invalid: '用户名或密码错误。',
    short: '密码少于 8 个字符。',
    mismatch: '两次输入的密码不一致。',
    ended: '会话已结束，请重新登录。'
  },
  'zh-TW': {
    backend: 'honk native API 根網址',
    next: '繼續',
    username: '使用者名稱',
    password: '密碼',
    confirm: '確認密碼',
    login: '登入',
    setup: '建立並登入',
    token: '權杖',
    connect: '連線至後端'
  },
  en: {
    backend: 'honk native API root',
    next: 'Continue',
    username: 'Username',
    password: 'Password',
    confirm: 'Confirm password',
    login: 'Sign in',
    setup: 'Create and sign in',
    token: 'Token',
    connect: 'Connect'
  }
};
const capabilities = {
  profiles: ['base'],
  observed_at: '2026-10-25T00:00:00Z',
  limits: {},
  resources: {groups: {available: true, can_select: false}, config: {available: false}, runtime: {available: false}}
};
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(animation => animation.effect.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {}))
    );
  });
}
async function fixture(
  browser,
  kind,
  {locale = 'zh-CN', width = 1440, height = 900, theme = 'light', seeded = false, saved = false, hosted = false, refusal = 401} = {}
) {
  const target = hosted ? new URL(base).origin : backend;
  let releaseProbe;
  const probeGate = new Promise(resolve => {
    releaseProbe = resolve;
  });
  const page = await browser.newPage({locale, viewport: {width, height}, reducedMotion: 'reduce'});
  const errors = [];
  const state = {kind, expired: false, requests: [], auth: [], accesses: []};
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(
    ({locale, theme, seeded, saved, standardKeys, backend}) => {
      localStorage.setItem('doona-lite.locale', locale);
      localStorage.setItem('doona-lite.theme', theme);
      if (seeded) for (const key of standardKeys) localStorage.setItem(key, 'standard-app-sentinel');
      if (saved) localStorage.setItem('doona-lite.connection', JSON.stringify({address: backend, token: 'expired'}));
      window.addressShown = false;
      new MutationObserver(() => {
        if (document.querySelector('input[autocomplete="url"]')) window.addressShown = true;
      }).observe(document, {childList: true, subtree: true});
      window.storageAccesses = [];
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (key, ...args) {
          window.storageAccesses.push({store: this === localStorage ? 'local' : 'session', method, key});
          return original.call(this, key, ...args);
        };
      }
    },
    {locale, theme, seeded, saved, standardKeys, backend: target}
  );
  await page.route(
    url => url.origin === new URL(target).origin && (url.pathname === '/api' || url.pathname.startsWith('/api/')),
    async route => {
      const request = route.request();
      const url = new URL(request.url());
      state.requests.push(url.pathname);
      const json = (body, status = 200, headers = {}) => route.fulfill({status, contentType: 'application/json', headers, body: JSON.stringify(body)});
      if (state.kind === 'offline') return route.abort('connectionrefused');
      if (state.kind === 'no-api') return json({}, 404);
      if (url.pathname === '/api') {
        if (hosted) await probeGate;
        if (state.kind === 'clash') return json({}, 401);
        if (state.kind === 'legacy') return json({}, 404);
        return json({name: 'honk-native', api_major: 1, auth: {mode: state.kind === 'token' ? 'token' : 'password', setup_required: state.kind === 'setup'}});
      }
      if (url.pathname.startsWith('/api/v1/auth/')) {
        state.auth.push({path: url.pathname, body: request.postDataJSON(), authorization: request.headers().authorization});
        const {password} = request.postDataJSON();
        if (password === 'wrong') return json({error: {code: 'invalid_credentials', message: 'RAW SERVER ERROR'}}, 401);
        if (password === 'switch-kind') return json({error: {code: state.kind === 'setup' ? 'setup_already_completed' : 'setup_required'}}, 409);
        if (password === 'limited') return json({error: {code: 'rate_limited'}}, 429, {'Retry-After': '1'});
        return json({token: 'session-from-backend', expires_at: '2026-10-26T00:00:00Z'});
      }
      const authorization = request.headers().authorization;
      if (state.expired || authorization === 'Bearer expired' || authorization === 'Bearer rejected')
        return json({error: {code: 'invalid_token', message: 'RAW TOKEN ERROR'}}, 401);
      if (url.pathname === '/api/v1/capabilities') {
        if (state.kind === 'clash') return json({}, 404);
        if (hosted && state.kind !== 'anonymous' && !authorization) return json({error: {code: 'authentication_required'}}, refusal);
        if (state.kind === 'anonymous') expect(authorization).toBeUndefined();
        else if (state.kind !== 'legacy') expect(authorization).toBe(`Bearer ${state.kind === 'token' ? 'pasted-token' : 'session-from-backend'}`);
        return json(capabilities);
      }
      if (url.pathname === '/api/v1/groups') return json({groups: [], observed_at: '2026-10-25T00:00:00Z'});
      return json({}, 404);
    }
  );
  await page.goto(base);
  const l = labels[locale];
  const address = page.locator('input[autocomplete="url"]');
  const discover = async () => {
    await expect(address).toBeVisible();
    await expect(page.getByRole('button', {name: /^(Try the demo|试用演示|試用示範)$/})).toHaveCount(0);
    await address.fill(target);
    await page.getByRole('button', {name: l.next, exact: true}).click();
    await expect(page.getByRole('button', {name: /^(Try the demo|试用演示|試用示範)$/})).toHaveCount(0);
  };
  const checkStorage = async () => {
    await expect(page.getByRole('heading', {level: 1})).not.toHaveText(l.login);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('doona-lite.connection'))).not.toBeNull();
    const result = await page.evaluate(() => ({
      connection: JSON.parse(localStorage.getItem('doona-lite.connection')),
      keys: Object.keys(localStorage),
      accesses: window.storageAccesses,
      session: Object.keys(sessionStorage)
    }));
    expect(result.connection).toEqual({
      address: target,
      token: state.kind === 'anonymous' ? '' : state.kind === 'token' ? 'pasted-token' : 'session-from-backend'
    });
    expect(result.connection).not.toHaveProperty('password');
    expect(result.accesses.filter(item => standardKeys.some(key => item.key.startsWith(key)))).toEqual([]);
    if (!seeded) expect(result.keys.filter(key => standardKeys.includes(key))).toEqual([]);
    else for (const key of standardKeys) expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('standard-app-sentinel');
    expect(result.session).toEqual([]);
    expect(errors).toEqual([]);
    console.log(`STORAGE ${JSON.stringify([...new Set(result.accesses.map(item => `${item.store}:${item.key}`))])}`);
  };
  return {page, state, l, discover, address, checkStorage, errors, releaseProbe};
}
async function screenshot(page, name) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  if (!shots) return;
  fs.mkdirSync(shots, {recursive: true});
  await settle(page);
  await page.screenshot({path: path.join(shots, `${name}.png`), fullPage: true});
}
async function run() {
  const browser = await chromium.launch();
  try {
    for (const [kind, refusal] of [
      ['anonymous', 401],
      ['login', 401],
      ['setup', 403],
      ['token', 403]
    ]) {
      const {page, state, l, address, checkStorage, releaseProbe} = await fixture(browser, kind, {hosted: true, refusal, locale: 'zh-TW', seeded: true});
      await expect(page.getByRole('status')).toHaveText('正在載入…');
      await expect(address).toHaveCount(0);
      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.getByRole('button', {name: /^(Try the demo|试用演示|試用示範)$/})).toHaveCount(0);
      releaseProbe();
      if (kind !== 'anonymous') {
        await expect(page.getByRole('button', {name: '使用其他後端', exact: true})).toBeVisible();
        await expect(address).toHaveCount(0);
        await expect(page.getByRole('heading', {level: 1})).toHaveText(kind === 'setup' ? '設定管理員' : '登入');
        await expect(page.getByLabel(l.username, {exact: true})).toHaveCount(kind === 'token' ? 0 : 1);
        await expect(page.getByLabel(l.token, {exact: true})).toHaveCount(kind === 'token' ? 1 : 0);
        await expect(page.getByLabel(l.confirm, {exact: true})).toHaveCount(kind === 'setup' ? 1 : 0);
        await expect(page.getByRole('button', {name: '試用示範', exact: true})).toHaveCount(0);
        if (kind === 'token') await page.getByLabel(l.token, {exact: true}).fill('pasted-token');
        else {
          await page.getByLabel(l.username, {exact: true}).fill('admin');
          await page.getByLabel(l.password, {exact: true}).fill('valid-password');
          if (kind === 'setup') await page.getByLabel(l.confirm, {exact: true}).fill('valid-password');
        }
        await page.getByRole('button', {name: kind === 'token' ? l.connect : l[kind], exact: true}).click();
      }
      await checkStorage();
      await expect(page).toHaveURL(/#groups$/);
      expect(await page.evaluate(() => window.addressShown)).toBe(false);
      expect(state.auth).toHaveLength(kind === 'anonymous' || kind === 'token' ? 0 : 1);
      await page.close();
    }
    const alternate = await fixture(browser, 'login', {hosted: true, locale: 'en'});
    alternate.releaseProbe();
    await alternate.page.getByRole('button', {name: 'Use another backend', exact: true}).click();
    await expect(alternate.address).toBeVisible();
    await expect(alternate.address).toHaveValue('');
    await expect(alternate.page.getByLabel(alternate.l.username, {exact: true})).toHaveCount(0);
    await expect(alternate.page.getByRole('button', {name: alternate.l.next, exact: true})).toBeVisible();
    await expect(alternate.page.getByRole('button', {name: 'Try the demo', exact: true})).toHaveCount(0);
    await expect(alternate.page.getByText(/honk native API root, for example/)).toBeVisible();
    await alternate.page.close();
    console.log('PASS hosted anonymous access, auth steps, no form flash, alternate backend');
    for (const view of [
      {width: 1440, height: 900, theme: 'light'},
      {width: 390, height: 844, theme: 'light'},
      {width: 1440, height: 900, theme: 'dark'}
    ]) {
      for (const kind of ['login', 'setup', 'token']) {
        const {page, state, l, discover, checkStorage} = await fixture(browser, kind, view);
        await discover();
        if (kind === 'token') {
          await expect(page.getByLabel(l.username, {exact: true})).toHaveCount(0);
          await expect(page.getByLabel(l.token, {exact: true})).toBeVisible();
          await screenshot(page, `${kind}-${view.width}-${view.theme}`);
          await page.getByLabel(l.token, {exact: true}).fill('rejected');
          await page.getByRole('button', {name: l.connect, exact: true}).click();
          await expect(page.getByText('登录会话或令牌被拒绝，请重新登录或检查令牌。', {exact: true})).toBeVisible();
          await page.getByLabel(l.token, {exact: true}).fill('pasted-token');
        } else {
          await expect(page.getByLabel(l.username, {exact: true})).toBeVisible();
          await expect(page.getByLabel(l.password, {exact: true})).toHaveAttribute('type', 'password');
          await page.getByLabel(l.username, {exact: true}).fill('admin');
          if (kind === 'setup') {
            await page.getByLabel(l.password, {exact: true}).fill('short');
            await page.getByRole('button', {name: l.setup, exact: true}).click();
            await expect(page.getByText(l.short, {exact: true}).and(page.locator('.astryx-field-status'))).toBeVisible();
            expect(state.auth).toHaveLength(0);
            await screenshot(page, `${kind}-${view.width}-${view.theme}`);
            await page.getByLabel(l.password, {exact: true}).fill('valid-password');
            await page.getByLabel(l.confirm, {exact: true}).fill('different');
            await page.getByRole('button', {name: l.setup, exact: true}).click();
            await expect(page.getByText(l.mismatch, {exact: true}).and(page.locator('.astryx-field-status'))).toBeVisible();
            expect(state.auth).toHaveLength(0);
            await page.getByLabel(l.confirm, {exact: true}).fill('valid-password');
          } else {
            await expect(page.getByLabel(l.confirm, {exact: true})).toHaveCount(0);
            await screenshot(page, `${kind}-${view.width}-${view.theme}`);
            await page.getByLabel(l.password, {exact: true}).fill('wrong');
            await page.getByRole('button', {name: l.login, exact: true}).click();
            await expect(page.getByText(l.invalid, {exact: true})).toBeVisible();
            await expect(page.getByText('RAW SERVER ERROR', {exact: true})).toHaveCount(0);
          }
          await page.getByLabel(l.password, {exact: true}).fill('valid-password');
        }
        await page.getByRole('button', {name: kind === 'token' ? l.connect : l[kind], exact: true}).click();
        await checkStorage();
        if (kind !== 'token')
          expect(state.auth.at(-1)).toEqual({path: `/api/v1/auth/${kind}`, body: {username: 'admin', password: 'valid-password'}, authorization: undefined});
        console.log(`PASS ${kind} ${view.width} ${view.theme}: fields, refusal/validation, session token, isolated storage`);
        await page.close();
      }
    }
    for (const locale of ['en', 'zh-TW']) {
      for (const kind of ['login', 'setup', 'token']) {
        const {page, l, discover, checkStorage} = await fixture(browser, kind, {locale, width: 390, height: 844});
        await discover();
        if (kind === 'token') await page.getByLabel(l.token, {exact: true}).fill('pasted-token');
        else {
          await page.getByLabel(l.username, {exact: true}).fill('admin');
          await page.getByLabel(l.password, {exact: true}).fill('valid-password');
          if (kind === 'setup') await page.getByLabel(l.confirm, {exact: true}).fill('valid-password');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await page.getByRole('button', {name: kind === 'token' ? l.connect : l[kind], exact: true}).click();
        await checkStorage();
        console.log(`PASS ${locale} ${kind}`);
        await page.close();
      }
    }
    for (const kind of ['no-api', 'offline', 'legacy']) {
      const {page, discover, l} = await fixture(browser, kind);
      await discover();
      if (kind === 'legacy') await expect(page.getByLabel(l.token, {exact: true})).toBeVisible();
      else
        await expect(
          page.getByText(kind === 'no-api' ? '此后端未提供原生 API，请使用支持原生 API 的代理服务。' : '无法连接后端，请检查地址、网络和 CORS 设置。', {
            exact: true
          })
        ).toBeVisible();
      console.log(`PASS ${kind}`);
      await page.close();
    }
    const clash = await fixture(browser, 'clash');
    await clash.discover();
    await clash.page.getByLabel(clash.l.token, {exact: true}).fill('pasted-token');
    await clash.page.getByRole('button', {name: clash.l.connect, exact: true}).click();
    await expect(clash.page.getByText('此后端未提供原生 API，请使用支持原生 API 的代理服务。', {exact: true})).toBeVisible();
    expect(await clash.page.evaluate(() => localStorage.getItem('doona-lite.connection'))).toBeNull();
    await clash.page.close();
    console.log('PASS authenticated backend without native API');
    const restored = await fixture(browser, 'login', {saved: true});
    await expect(restored.page.getByText(restored.l.ended, {exact: true})).toBeVisible();
    await expect(restored.page.getByLabel(restored.l.username, {exact: true})).toBeVisible();
    expect(await restored.page.evaluate(() => localStorage.getItem('doona-lite.connection'))).toBeNull();
    await restored.page.close();
    console.log('PASS expired saved session is cleared');
    const active = await fixture(browser, 'login', {seeded: true});
    await active.discover();
    await active.page.getByLabel(active.l.username, {exact: true}).fill('admin');
    await active.page.getByLabel(active.l.password, {exact: true}).fill('valid-password');
    await active.page.getByRole('button', {name: active.l.login, exact: true}).click();
    await active.checkStorage();
    await active.page.reload();
    await expect(active.page.locator('input[autocomplete="url"]')).toHaveCount(0);
    active.state.expired = true;
    await active.page.evaluate(() => window.dispatchEvent(new Event('lite-data-changed')));
    await expect(active.page.getByText(active.l.ended, {exact: true})).toBeVisible();
    expect(await active.page.evaluate(() => localStorage.getItem('doona-lite.connection'))).toBeNull();
    await expect(active.address).toHaveValue(backend);
    await expect(active.page.getByLabel(active.l.username, {exact: true})).toBeVisible();
    await active.page.close();
    console.log('PASS saved session restore, runtime expiry, standard settings unchanged');
  } finally {
    await browser.close();
  }
}
module.exports = run();
if (require.main === module)
  module.exports.catch(error => {
    console.error(error);
    process.exitCode = 1;
  });

import {expect, loadCatalogues, test, settleFrames} from './fixtures';
import type {BrowserContext, Page} from '@playwright/test';
import {translate} from '../src/i18n';

test('manifest describes an installable app with relative URLs', async ({request}) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    id: './',
    name: 'doona',
    short_name: 'doona',
    start_url: './',
    scope: './',
    display: 'standalone',
    icons: expect.arrayContaining([
      expect.objectContaining({src: './icons/icon-192.png', sizes: '192x192', purpose: 'any'}),
      expect.objectContaining({src: './icons/icon-512.png', sizes: '512x512', purpose: 'any'}),
      expect.objectContaining({src: './icons/maskable-512.png', sizes: '512x512', purpose: 'maskable'})
    ])
  });
});

test('API requests bypass the worker even when a cached response exists', async ({context, request}) => {
  // Expected 404s and offline failures do not use the console-error fixture.
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.evaluate(async () => {
    const [name] = await caches.keys();
    await (await caches.open(name)).put('/api/v1/runtime', new Response('stale API data'));
  });
  const server = await request.get('/api/v1/runtime', {headers: {Accept: 'application/json'}});
  const responsePromise = page.waitForResponse('**/api/v1/runtime');
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/runtime', {headers: {Accept: 'application/json', Authorization: 'Bearer pwa-test'}});
    return {status: response.status, marker: response.headers.get('x-doona-sw'), body: await response.text()};
  });
  expect((await responsePromise).fromServiceWorker()).toBe(false);
  expect(result).toEqual({status: 404, marker: null, body: await server.text()});
  await context.setOffline(true);
  expect(
    await page.evaluate(() =>
      fetch('/api/v1/runtime').then(
        () => 'response',
        () => 'offline'
      )
    )
  ).toBe('offline');
});

test('shell reloads offline and fonts and icons are cached on first use', async ({context, browserName}) => {
  // Playwright's WebKit fails every navigation under setOffline, even one the service worker answers.
  test.skip(browserName === 'webkit', 'offline navigation cannot be emulated in WebKit');
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  const online = await page.reload();
  expect(online?.headers()['x-doona-sw']).toBeUndefined();
  const paths = ['./fonts/OFL.txt', './icons/icon-192.png'];
  for (const path of paths) {
    const first = await page.evaluate(async url => {
      const response = await fetch(url);
      return {status: response.status, marker: response.headers.get('x-doona-sw')};
    }, path);
    expect(first).toEqual({status: 200, marker: null});
  }
  const cachedFonts = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    return (await cache.keys()).filter(request => new URL(request.url).pathname.endsWith('.woff2')).length;
  });
  expect(cachedFonts).toBeLessThan(105);
  await context.setOffline(true);
  const offline = await page.reload();
  expect(offline?.headers()['x-doona-sw']).toBe('hit');
  await expect(page.locator('.rp-content')).toBeVisible();
  for (const path of paths) {
    const cached = await page.evaluate(async url => {
      const response = await fetch(url);
      return {status: response.status, marker: response.headers.get('x-doona-sw')};
    }, path);
    expect(cached).toEqual({status: 200, marker: 'hit'});
  }
});

// A list the build writes into the worker script its page is controlled by.
async function workerList(page: Page, name: string): Promise<string[]> {
  const url = await page.evaluate(async () => (await navigator.serviceWorker.ready).active!.scriptURL);
  const worker = await (await page.request.get(url)).text();
  return JSON.parse(worker.match(new RegExp(`const ${name} = (\\[.*?\\]);`))![1]);
}
const mockChunks = (page: Page) => workerList(page, 'MOCK');

test('the mock backend is cached on first use rather than installed up front', async ({context, browserName}) => {
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const mock = await mockChunks(page);
  expect(mock).toHaveLength(1);
  expect(await workerList(page, 'PRECACHE')).not.toContain(mock[0]);
  // The mock loaded before the worker took over, so the page reports it and the worker caches it.
  await expect.poll(() => page.evaluate(async url => (await caches.match(new URL(url, location.href).href)) !== undefined, mock[0])).toBe(true);
  // Playwright's WebKit fails every navigation under setOffline, even one the service worker answers.
  if (browserName === 'webkit') return;
  await context.setOffline(true);
  const offline = await page.reload();
  expect(offline?.headers()['x-doona-sw']).toBe('hit');
  // The shell renders only once its backend has loaded.
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
});

test('an English visit caches only English and starts offline in it', async ({context, browserName}) => {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('doona-lang', 'en'));
  const other = /\/assets\/(?:locale-zh-|fonts-[st]c-)/;
  const fetched: string[] = [];
  context.on('request', request => fetched.push(new URL(request.url()).pathname));
  await page.goto('/');
  const [mock] = await mockChunks(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const cached = () =>
    page.evaluate(async () => {
      const cache = await caches.open((await caches.keys())[0]);
      return (await cache.keys()).map(request => new URL(request.url).pathname);
    });
  // The catalogue loaded before the worker took over, so the page reports it and the worker caches it.
  await expect.poll(async () => (await cached()).some(path => path.includes('/assets/locale-en-'))).toBe(true);
  await expect.poll(async () => (await cached()).some(path => path.endsWith(mock))).toBe(true);
  expect((await cached()).filter(path => other.test(path))).toEqual([]);
  expect(fetched.filter(path => other.test(path))).toEqual([]);
  // Playwright's WebKit fails every navigation under setOffline, even one the service worker answers.
  if (browserName === 'webkit') return;
  await context.setOffline(true);
  const offline = await page.reload();
  expect(offline?.headers()['x-doona-sw']).toBe('hit');
  await expect(page.locator('.rp-nav[href="#/settings"]')).toContainText('Settings');
});

test('after an update the new build caches only the language in use and starts offline in it', async ({context, browserName}) => {
  test.skip(browserName === 'webkit', 'offline navigation cannot be emulated in WebKit');
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.getItem('doona-lang') ?? localStorage.setItem('doona-lang', 'en'));
  const paths = (name: string) => page.evaluate(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname), name);
  const holds = async (name: string, lang: string) => (await paths(name)).some(path => path.includes(`/assets/locale-${lang}-`));
  await page.goto('http://127.0.0.1:4186/ui/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const [first] = await page.evaluate(() => caches.keys());
  await expect.poll(() => holds(first, 'en')).toBe(true);
  // The reader switches to zh-TW, so the build being replaced holds both catalogues.
  await page.evaluate(() => localStorage.setItem('doona-lang', 'zh-TW'));
  await page.reload();
  await expect.poll(() => holds(first, 'zh-TW')).toBe(true);
  // Let the old build's resource requests settle before starting the update.
  await page.waitForLoadState('networkidle');
  const unused = /\/assets\/(?:locale-(?:en|zh-CN)-|fonts-sc-)/;
  const fetched: string[] = [];
  context.on('request', request => fetched.push(new URL(request.url()).pathname));
  // The test server serves changed bytes at the same worker URL once this context opts into the update.
  await page.evaluate(async () => {
    const taken = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
    document.cookie = 'doona-pwa-update=1; Path=/ui; SameSite=Lax';
    await (await navigator.serviceWorker.ready).update();
    await taken;
  });
  const update = first.replace(/[^:]+$/, 'update');
  await expect.poll(() => holds(update, 'zh-TW')).toBe(true);
  const [mock] = await mockChunks(page);
  await expect.poll(async () => (await paths(update)).some(path => path.endsWith(mock))).toBe(true);
  expect((await paths(update)).filter(path => unused.test(path))).toEqual([]);
  // Only the new build's cache is left to answer the offline start.
  await page.evaluate(first => caches.delete(first), first);
  await context.setOffline(true);
  const offline = await page.reload();
  expect(offline?.headers()['x-doona-sw']).toBe('hit');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  expect(fetched.filter(path => unused.test(path))).toEqual([]);
});

// Loads the app under a worker standing for an old build, then lets the real build take over. The page stands for the
// old build too, unless it is current: an online load fetches the new build's page while the old worker controls it.
async function takeOver(context: BrowserContext, page: Page, current: boolean) {
  // WebKit rechecks the worker a second after each navigation it serves, without the page's cookies. So the cookie's
  // changed worker is the old build here and the plain one the new build, which a late recheck cannot swap back.
  await context.addCookies([
    {name: 'doona-pwa-update', value: '1', domain: '127.0.0.1', path: '/ui/sw.js'},
    ...(current ? [] : [{name: 'doona-pwa-page', value: '1', domain: '127.0.0.1', path: '/ui/'}])
  ]);
  await page.goto('http://127.0.0.1:4186/ui/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // Only a page the old build already controls announces the new one.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  // A chunk request that restarts the old build while the new one swaps it out keeps it running: Chromium stops an
  // idle worker that DevTools is attached to, as Playwright's is, only while that swap is pending. So the new build
  // would wait minutes for it.
  await page.waitForLoadState('networkidle');
  await context.clearCookies({name: 'doona-pwa-update'});
  await context.clearCookies({name: 'doona-pwa-page'});
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    // The navigation's own recheck may have fetched the new build first, or already handed the page to it.
    if (registration.installing || registration.waiting)
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
  });
}

// The build the worker controlling the page installs, as the page asks it.
function controllerBuild(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => resolve(event.data);
        navigator.serviceWorker.controller!.postMessage({build: true}, [channel.port2]);
      })
  );
}

test('a new build taking over offers Reload, which loads it', async ({context, page}) => {
  await takeOver(context, page, false);
  const notice = page.locator('.rp-toast.info', {hasText: 'A new version is ready'});
  const reload = notice.getByRole('button', {name: 'Reload', exact: true});
  await expect(reload).toBeVisible();
  const loaded = page.waitForEvent('load');
  await reload.click();
  await loaded;
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test('a worker of the build the page already runs takes over without a notice', async ({context, page}) => {
  await takeOver(context, page, true);
  const build = await page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="doona-build"]')!.content);
  await expect.poll(() => controllerBuild(page)).toBe(build);
  // The page asks the new worker once it has activated, so once this answer is back so is the page's; a notice would
  // render by the next frame.
  await page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller!;
    if (controller.state !== 'activated') await new Promise(resolve => controller.addEventListener('statechange', resolve, {once: true}));
  });
  await controllerBuild(page);
  await settleFrames(page);
  await expect(page.locator('.rp-toast.info')).toHaveCount(0);
});

test('a worker that does not report its build is taken for a new one', async ({context, page, browserName}) => {
  // WebKit's late recheck fetches the worker without cookies, which would swap the legacy worker back.
  test.skip(browserName === 'webkit', 'WebKit rechecks the worker without the page’s cookies');
  await page.goto('http://127.0.0.1:4186/ui/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // A rollback to a release from before workers reported their build.
  await context.addCookies([{name: 'doona-pwa-legacy', value: '1', domain: '127.0.0.1', path: '/ui/sw.js'}]);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const taken = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
    await registration.update();
    await taken;
  });
  const notice = page.locator('.rp-toast.info', {hasText: 'A new version is ready'});
  await expect(notice.getByRole('button', {name: 'Reload', exact: true})).toBeVisible();
});

test('a new build taking over before the catalogue loads is announced in the reader’s language', async ({context, page, browserName}) => {
  test.skip(browserName === 'webkit', 'WebKit request interception does not see what the service worker fetches');
  // The page stands for an older build than the worker that controls it.
  await context.addCookies([{name: 'doona-pwa-page', value: '1', domain: '127.0.0.1', path: '/ui/'}]);
  await page.addInitScript(() => localStorage.setItem('doona-lang', 'zh-TW'));
  await page.goto('http://127.0.0.1:4186/ui/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.locator('.rp-nav[href="#/settings"]')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // A new deploy renames the catalogue, so the reloaded page fetches it past the old build's cache; it is held
  // there while the new build takes over.
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) if (/\/assets\/locale-zh-TW-/.test(request.url)) await cache.delete(request);
    }
  });
  let release!: () => void;
  const released = new Promise<void>(resolve => (release = resolve));
  let requested!: () => void;
  const catalogue = new Promise<void>(resolve => (requested = resolve));
  await context.route('**/assets/locale-zh-TW-*.js', async route => {
    requested();
    await released;
    await route.continue();
  });
  await page.reload({waitUntil: 'commit'});
  await catalogue;
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // What the browser fires when the new build claims the page; the real swap waits for the held request to finish.
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  release();
  await loadCatalogues();
  const notice = page.locator('.rp-toast.info', {hasText: translate('zh-TW', 'ui.newBuild')});
  await expect(notice.getByRole('button', {name: translate('zh-TW', 'ui.reloadPage'), exact: true})).toBeVisible();
  await expect(page.locator('.rp-toast', {hasText: 'ui.'})).toHaveCount(0);
});

test('an early install offer is consumed on dismissal and failures are reported', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', {cancelable: true});
    Object.assign(event, {prompt: async () => {}, userChoice: Promise.resolve({outcome: 'dismissed'})});
    dispatchEvent(event);
  });
  await page.locator('.rp-nav[href="#/settings"]').click();
  const install = page.getByRole('button', {name: 'Install as an app', exact: true});
  await install.click();
  await expect(install).toBeHidden();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', {cancelable: true});
    Object.assign(event, {
      prompt: async () => {
        throw new Error('Install prompt failed');
      },
      userChoice: Promise.resolve({outcome: 'dismissed'})
    });
    dispatchEvent(event);
  });
  await install.click();
  await expect(install).toBeHidden();
  await expect(page.locator('.rp-toast.negative')).toContainText('Install prompt failed');
});

const iosSafari = (standalone: boolean) => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
  Object.defineProperty(Navigator.prototype, 'userAgent', {get: () => ua});
  Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {get: () => 5});
  Object.defineProperty(Navigator.prototype, 'standalone', {get: () => standalone});
};

test('Safari on iOS without an install prompt is told how to add the app to the Home Screen', async ({page}) => {
  await page.addInitScript(iosSafari, false);
  await page.goto('/#/settings');
  await expect(page.getByText('To install, tap Share, then Add to Home Screen.', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Install as an app', exact: true})).toHaveCount(0);
});

test('Safari on iOS shows no install steps once it runs from the Home Screen', async ({page}) => {
  await page.addInitScript(iosSafari, true);
  await page.goto('/#/settings');
  await expect(page.getByRole('button', {name: 'About doona', exact: true})).toBeVisible();
  await expect(page.getByText('To install', {exact: false})).toHaveCount(0);
});

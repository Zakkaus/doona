import {expect, test} from './fixtures';

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

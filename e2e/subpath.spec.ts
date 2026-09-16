import {expect, test} from './fixtures';

// The icon pack is the one thing allowed off-origin; it stays off here so every request is the app's own.
test.use({storage: {'doona-api': 'mock', 'doona-lang': 'zh-TW', 'doona-icon-pack': 'off'}});

test('deep links, fonts and the installed app stay under /ui/', async ({page}) => {
  const responses: {path: string; status: number}[] = [];
  const failures: string[] = [];
  page.on('response', response => responses.push({path: new URL(response.url()).pathname, status: response.status()}));
  page.on('requestfailed', request => failures.push(request.url()));

  await page.goto('/ui/#/activity');
  await expect(page.locator('.rp-content')).toBeVisible();
  await expect(page.locator('.rp-nav[href="#/activity"]')).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => document.fonts.ready.then(() => true));
  expect(responses.filter(response => response.path.endsWith('.woff2')).length).toBeGreaterThan(0);

  const app = await page.evaluate(async () => {
    const manifestURL = (document.querySelector('link[rel="manifest"]') as HTMLLinkElement).href;
    const manifest = await (await fetch(manifestURL)).json();
    const icons = [
      ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]'), link => link.href),
      ...manifest.icons.map((icon: {src: string}) => new URL(icon.src, manifestURL).href)
    ];
    await Promise.all(icons.map(url => fetch(url)));
    const registration = await navigator.serviceWorker.ready;
    const script = registration.active!.scriptURL;
    await fetch(script);
    return {
      manifest: manifestURL,
      start: new URL(manifest.start_url, manifestURL).href,
      manifestScope: new URL(manifest.scope, manifestURL).href,
      scope: registration.scope,
      script,
      icons
    };
  });
  const root = new URL('/ui/', page.url()).href;
  expect(app.manifest).toBe(`${root}manifest.webmanifest`);
  expect(app.start).toBe(root);
  expect(app.manifestScope).toBe(root);
  expect(app.scope).toBe(root);
  expect(app.script).toBe(`${root}sw.js`);
  for (const icon of app.icons) expect(icon.startsWith(root)).toBe(true);

  await page.goto('/ui/#/flows?id=flow-2');
  await expect(page.locator('.rp-table [aria-selected="true"]')).toHaveAttribute('data-key', 'flow-2');
  await page.evaluate(() => document.fonts.ready.then(() => true));
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${root}sw.js`);
  expect(
    responses.filter(response => response.status < 200 || response.status >= 300),
    'Non-2xx responses'
  ).toEqual([]);
  expect(
    responses.filter(response => !response.path.startsWith('/ui/')),
    'Requests outside /ui/'
  ).toEqual([]);
  expect(failures, 'Failed requests').toEqual([]);
});

test('the prefix server rejects paths outside /ui/', async ({request}) => {
  for (const path of ['/', '/index.html', '/fonts/OFL.txt', '/logo.svg', '/manifest.webmanifest', '/sw.js', '/uix/', '/ui/../index.html']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  expect((await request.head('/index.html')).status()).toBe(404);
  const redirect = await request.get('/ui', {maxRedirects: 0});
  expect(redirect.status()).toBe(301);
  expect(redirect.headers().location).toBe('/ui/');
});

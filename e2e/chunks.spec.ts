import type {Page} from '@playwright/test';
import {demoSession, expect, expectLoadFailures, paletteBoxes, routes, test} from './fixtures';

// Keep install-time precaching out of the navigation request log.
test.use({serviceWorkers: 'block', storage: {'doona-api': 'mock'}, signedIn: 'legacy'});

for (const route of routes) {
  test(`cold navigation to ${route} loads its chunks`, async ({page}) => {
    const scripts = new Set<string>();
    const failedResponses: string[] = [];
    const failedRequests: string[] = [];
    page.on('request', request => {
      if (/\/assets\/[^/]+\.js$/.test(new URL(request.url()).pathname)) scripts.add(request.url());
    });
    page.on('response', response => {
      if (!response.ok()) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => failedRequests.push(request.url()));

    await page.goto('/#/activity');
    await expect(page.locator("[data-profile='metrics']")).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.evaluate(route => {
      location.hash = `#/${route}`;
    }, route);
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
    const content = route === 'activity' ? "[data-profile='metrics']" : route === 'settings' ? '#settings-backend' : '.rp-content > .rp-page';
    await expect(page.locator(content)).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Each page is its own chunk, fetched during idle time after the first page or on navigation.
    if (route !== 'activity') {
      const chunk = route[0].toUpperCase() + route.slice(1);
      expect(
        [...scripts].some(url => new RegExp(`/${chunk}-[^/]+\\.js$`).test(url)),
        `${chunk} chunk requested`
      ).toBe(true);
    }
    expect(failedResponses, 'Non-2xx responses').toHaveLength(0);
    expect(failedRequests, 'Failed requests').toHaveLength(0);
  });
}

test('slow page chunks delay the loading treatment without hiding the frame', async ({page}) => {
  // The gate is up before the shell warms the page chunks, so the policies chunk stays in flight.
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/Policies-*.js', async route => {
    await gate;
    await route.continue();
  });
  const requested = page.waitForRequest('**/assets/Policies-*.js');
  await page.goto('/#/activity');
  await expect(page.locator("[data-profile='metrics']")).toBeVisible();
  await requested;
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  const frame = page.locator('.rp-top, .rp-side, .rp-head');
  const bounds = () => frame.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  const before = await bounds();
  try {
    await page.evaluate(() => {
      location.hash = '#/policies';
    });
    await expect(page.locator('.rp-nav[href="#/policies"]')).toHaveAttribute('aria-current', 'page');
    const fallback = page.locator('.rp-content > .rp-page-skeleton');
    await page.clock.runFor(149);
    await expect(fallback).toBeHidden();
    await expect(page.locator('.rp-content')).toBeVisible();
    await page.clock.runFor(1);
    await expect(fallback).toBeVisible();
    expect(await bounds()).toEqual(before);
  } finally {
    release();
    await page.clock.resume();
  }
  await expect(page.locator('.rp-content > .rp-page')).toBeVisible();
  expect(await bounds()).toEqual(before);
});

// The CPU and latency lines wait for their second sample, so only these draw as the charts arrive.
const drawnAtLoad = ['download', 'upload', 'connections', 'history', 'outbounds', 'memory'];

test('activity keeps card geometry while its charts load', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1100});
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/{AreaChart,Sparkline,Donut}-*.js', async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#/activity', {waitUntil: 'domcontentloaded'});
    await expect(page.locator('[data-module=outbounds] .rp-donut .center')).toBeVisible();
    await expect(page.locator('.rp-legend').first()).toBeVisible();
    const cards = page.locator(".rp-dash-section:not([data-profile='extensions']) .rp-card");
    const before = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    await expect(page.locator('main .rp-activity-surface')).toHaveCount(0);
    release();
    for (const module of drawnAtLoad) await expect(page.locator(`[data-module=${module}] .rp-activity-surface`)).toHaveCount(1);
    expect(await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()))).toEqual(before);
  } finally {
    release();
  }
});

for (const chunk of ['Policies', 'AreaChart', 'Sparkline', 'Donut']) {
  test(`a rejected ${chunk} import preserves navigation and recovers after retry`, async ({browser}) => {
    const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 1100}});
    const page = await context.newPage();
    const uncaught: string[] = [];
    page.on('pageerror', error => uncaught.push(error.message));
    await page.addInitScript(session => {
      localStorage.setItem('doona-api', 'mock');
      localStorage.setItem('doona-lang', 'en');
      localStorage.setItem('doona-session', session);
      // A reload just happened, so the failed chunk shows its message instead of reloading the page by itself.
      sessionStorage.setItem('doona-stale-reload', String(Date.now()));
    }, demoSession('legacy'));
    let reject = true;
    await page.route(`**/assets/${chunk}-*.js`, route => (reject ? route.abort() : route.continue()));
    try {
      await page.goto(chunk === 'Policies' ? '/#/policies' : '/#/activity');
      const alert = page.locator('.rp-content .rp-alert').first();
      await expect(alert).toBeVisible();
      await expect(alert.getByRole('button', {name: 'Reload'})).toBeVisible();
      await page.locator('.rp-nav[href="#/settings"]').click();
      await expect(page.locator('#settings-backend')).toBeVisible();
      await page.locator(`.rp-nav[href="#/${chunk === 'Policies' ? 'policies' : 'activity'}"]`).click();
      await expect(alert).toBeVisible();
      reject = false;
      await alert.getByRole('button', {name: 'Reload'}).click();
      await expect(page.locator(chunk === 'Policies' ? '.rp-content > .rp-page' : "[data-profile='metrics']")).toBeVisible();
      await expect(page.locator('.rp-content .rp-alert')).toHaveCount(0);
      if (chunk !== 'Policies') for (const module of drawnAtLoad) await expect(page.locator(`[data-module=${module}] .rp-activity-surface`)).toHaveCount(1);
      expect(uncaught).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// The chunks a signed-in shell loads: the Activity chunk, which also carries the frame around the pages, and the page
// chunks it warms. A request for none of them means the sign-in page has not evaluated the frame either.
const signedInChunks = ['activity', 'SearchDialog', ...routes.filter(route => route !== 'activity').map(route => route[0].toUpperCase() + route.slice(1))];
const challenge = {
  status: 401,
  headers: {'www-authenticate': 'Bearer'},
  json: {error: {code: 'authentication_required', message: 'Valid bearer credentials are required.', details: null}}
};
const signInPages = [
  {
    name: 'a saved demo profile',
    pages: signedInChunks,
    viewport: {width: 1280, height: 800},
    ready: (page: Page) => page.locator('.rp-login-page').getByRole('button', {name: 'Sign in', exact: true}),
    async setup(page: Page) {
      await page.addInitScript(() => {
        localStorage.setItem('doona-profiles', JSON.stringify([{id: 'demo', name: 'Demo', api: 'mock', token: ''}]));
        localStorage.setItem('doona-profile', 'demo');
      });
    }
  },
  // The first visit to a password-protected honk: no profile until discovery saves one. From 1024 px the sidebar hosts
  // the widget panel, whose code shares the Activity chunk.
  ...[
    {width: 1280, height: 800},
    {width: 390, height: 844}
  ].map(viewport => ({
    name: `a hosted backend on first visit at ${viewport.width}`,
    pages: signedInChunks,
    viewport,
    ready: (page: Page) => page.getByRole('heading', {name: 'Token required'}),
    async setup(page: Page) {
      await page.route('**/api', route => route.fulfill(challenge));
      await page.route('**/api/v1/**', route => route.fulfill(challenge));
    }
  }))
];

for (const {name, pages, viewport, ready, setup} of signInPages) {
  test(`the sign-in page for ${name} requests neither the frame nor page chunks before sign-in`, async ({browser}) => {
    const context = await browser.newContext({serviceWorkers: 'block', viewport});
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('doona-lang', 'en'));
    await setup(page);
    const requested: string[] = [];
    page.on('request', request => {
      // Rollup names a chunk [name]-[hash].js with an eight-character base64url hash, which may itself contain '-'.
      const chunk = /\/assets\/([^/]+)-[\w-]{8}\.js$/.exec(new URL(request.url()).pathname)?.[1];
      if (chunk && pages.includes(chunk)) requested.push(chunk);
    });
    try {
      await page.goto('/#/activity');
      await expect(ready(page)).toBeVisible();
      await page.waitForLoadState('networkidle');
      // Past the idle warm-up's first two deadlines, which a signed-in shell would have used for search and Overview.
      await page.waitForTimeout(6500);
      expect(requested).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('a signed-in start requests the frame before the shell can render', async ({page}) => {
  // The shell renders only once a catalogue has loaded, so a request made while it is held comes from startup.
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/locale-*.js', async route => {
    await gate;
    await route.continue();
  });
  const requested = page.waitForRequest(/\/assets\/activity-[\w-]{8}\.js$/);
  await page.goto('/#/activity');
  await requested;
  release();
  await expect(page.locator("[data-profile='metrics']")).toBeVisible();
});

// Only the Glass palettes load Glass's stylesheet and wallpaper chunk: the stylesheet before the first paint when one is
// stored, and both before it applies when one is picked, so the look changes in one step.
test('only a Glass palette loads Glass, before its look shows', async ({page}) => {
  const glass: string[] = [];
  page.on('request', request => {
    if (/\/assets\/glass-[\w-]{8}\.(js|css)$/.test(new URL(request.url()).pathname)) glass.push(request.url());
  });
  const wall = () => page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
  await page.goto('/#/settings');
  await expect(page.locator('#settings-backend')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(glass).toEqual([]);
  expect(await wall()).toBe('none');

  // The wallpaper as it stood when the root took the Glass family.
  await page.evaluate(() => {
    new MutationObserver((_, observer) => {
      if (document.documentElement.dataset.family !== 'glass') return;
      observer.disconnect();
      document.documentElement.dataset.switchedWall = getComputedStyle(document.body, '::before').backgroundImage;
    }).observe(document.documentElement, {attributeFilter: ['data-family']});
  });
  await (await paletteBoxes(page)).getByRole('option', {name: 'Glass Frosted'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-flavour', 'frosted');
  await expect(page.locator('html')).toHaveAttribute('data-switched-wall', /radial-gradient/);
  expect(glass.map(url => url.split('.').pop()).sort()).toEqual(['css', 'js']);

  glass.length = 0;
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector('.rp-top')) return;
      observer.disconnect();
      document.documentElement.dataset.firstWall = getComputedStyle(document.body, '::before').backgroundImage;
    }).observe(document, {childList: true, subtree: true});
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-first-wall', /radial-gradient/);
  expect(glass.map(url => url.split('.').pop()).sort()).toEqual(['css', 'js']);
});

// While Glass loads, its pick shows selected and the page keeps its palette, so picking that palette again is a change,
// and it wins over the Glass still loading.
type PalettePicker = (page: Page) => Record<'glass' | 'moon' | 'shown', () => Promise<void>>;
const palettePickers: Record<string, PalettePicker> = {
  Settings: page => {
    const option = async (name: string) => (await paletteBoxes(page)).getByRole('option', {name});
    return {
      glass: async () => (await option('Glass Frosted')).click(),
      moon: async () => (await option('Rosé Pine Moon')).click(),
      shown: async () => expect(await option('Glass Frosted')).toHaveAttribute('aria-selected', 'true')
    };
  },
  'the top bar': page => {
    const item = (name: RegExp) => page.getByRole('menuitemradio', {name});
    const open = () => page.locator('.rp-top').getByRole('button', {name: 'Palette', exact: true}).click();
    return {
      glass: () => open().then(() => item(/^Frosted/).click()),
      moon: () => open().then(() => item(/^Moon/).click()),
      shown: () =>
        open()
          .then(() => expect(item(/^Frosted/)).toHaveAttribute('aria-checked', 'true'))
          .then(() => page.keyboard.press('Escape'))
    };
  }
};
for (const [where, picker] of Object.entries(palettePickers)) {
  test(`a palette picked again in ${where} while Glass loads stays applied`, async ({page}) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/assets/glass-*.{js,css}', async route => {
      await gate;
      await route.continue();
    });
    await page.goto('/#/settings');
    await expect(page.locator('#settings-backend')).toBeVisible();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-flavour', 'moon');
    const pick = picker(page);
    await pick.glass();
    await pick.shown();
    await expect(html).toHaveAttribute('data-family', 'rose-pine');
    await pick.moon();
    release();
    await page.waitForFunction(() => document.querySelector<HTMLLinkElement>('link[data-glass]')?.sheet);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await html.getAttribute('data-family')).toBe('rose-pine');
    expect(await html.getAttribute('data-flavour')).toBe('moon');
    expect(await page.evaluate(() => localStorage.getItem('doona-palette'))).toBe('rose-pine/moon');
  });
}

test('a frame chunk that fails to load says so with Reload, and the reload recovers once it loads', async ({page}) => {
  expectLoadFailures(page, /\/assets\/activity-[\w-]{8}\.js$/);
  const frame = '**/assets/activity-*.js';
  await page.route(frame, route => route.abort());
  await page.goto('/#/activity');
  // The first failure reloads the page once by itself; the second stays up with its Reload control.
  const reload = page.getByRole('button', {name: 'Reload', exact: true});
  await expect(reload).toBeVisible();
  await expect(page.locator("[data-profile='metrics']")).toHaveCount(0);
  await page.unroute(frame);
  await Promise.all([page.waitForEvent('load'), reload.click()]);
  await expect(page.locator("[data-profile='metrics']")).toBeVisible();
  await expect(reload).toHaveCount(0);
});

test('a stale chunk whose reload is cancelled says doona was updated, and so does the next one', async ({browser}) => {
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 1100}});
  const page = await context.newPage();
  await page.addInitScript(session => {
    localStorage.setItem('doona-api', 'mock');
    localStorage.setItem('doona-lang', 'en');
    localStorage.setItem('doona-session', session);
    // A draft on the page asks before it is left.
    addEventListener('beforeunload', event => event.preventDefault());
  }, demoSession('legacy'));
  const prompts: string[] = [];
  page.on('dialog', dialog => {
    prompts.push(dialog.type());
    void dialog.dismiss();
  });
  await page.route('**/assets/{Policies,Nodes}-*.js', route => route.abort());
  try {
    await page.goto('/#/settings');
    await expect(page.locator('#settings-backend')).toBeVisible();
    await page.locator('.rp-nav[href="#/policies"]').click();
    const alert = page.locator('.rp-content .rp-alert').first();
    await expect(alert.getByRole('button', {name: 'Reload'})).toBeVisible();
    expect(prompts).toEqual(['beforeunload']);
    await page.locator('.rp-nav[href="#/nodes"]').click();
    await expect(page.locator('.rp-nav[href="#/nodes"]')).toHaveAttribute('aria-current', 'page');
    await expect(alert.getByRole('button', {name: 'Reload'})).toBeVisible();
  } finally {
    await context.close();
  }
});

test('the idle warm-up loads the search dialog before any interaction', async ({page}) => {
  const requested = page.waitForRequest(/\/SearchDialog-[^/]+\.js$/);
  await page.goto('/#/activity');
  await requested;
});

for (const intent of ['hover', 'Control'] as const) {
  test(`with the warm-up held, ${intent === 'hover' ? 'hovering the search button' : 'pressing Control'} loads the search dialog`, async ({page}) => {
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0;
    });
    const scripts: string[] = [];
    page.on('request', request => {
      if (/\/assets\/[^/]+\.js$/.test(new URL(request.url()).pathname)) scripts.push(request.url());
    });
    await page.goto('/#/activity');
    await expect(page.locator("[data-profile='metrics']")).toBeVisible();
    await page.waitForLoadState('networkidle');
    const search = /\/SearchDialog-[^/]+\.js$/;
    expect(scripts.some(url => search.test(url))).toBe(false);
    const requested = page.waitForRequest(search);
    if (intent === 'hover') await page.locator('.rp-search').hover();
    else await page.keyboard.down('Control');
    await requested;
    if (intent === 'Control') await page.keyboard.up('Control');
    await page.locator('.rp-search').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('a search dialog that fails to load leaves nothing open and says so', async ({page}) => {
  expectLoadFailures(page, /\/SearchDialog-[^/]+\.js$/);
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
  });
  await page.route('**/assets/SearchDialog-*.js', route => route.abort());
  await page.goto('/#/activity');
  await expect(page.locator("[data-profile='metrics']")).toBeVisible();
  await page.keyboard.press('Control+K');
  await expect(page.locator('.rp-toast.negative')).toContainText('Could not open search');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.rp-alert')).toHaveCount(0);
});

test('pressing Control inside a field loads the search dialog', async ({page}) => {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
  });
  await page.goto('/#/settings');
  await page.locator('[name=api]').focus();
  const requested = page.waitForRequest(/\/SearchDialog-[^/]+\.js$/);
  await page.keyboard.down('Control');
  await requested;
  await page.keyboard.up('Control');
});

test('Escape while the search dialog loads keeps it from opening late', async ({page}) => {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/assets/SearchDialog-*.js', async route => {
    await gate;
    await route.fallback();
  });
  await page.goto('/#/activity');
  await expect(page.locator("[data-profile='metrics']")).toBeVisible();
  const loaded = page.waitForResponse(/\/SearchDialog-[^/]+\.js$/);
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Escape');
  release();
  // Once the chunk has run here too, the page has had its chance to open the dialog.
  const chunk = (await loaded).url();
  await page.evaluate(url => import(url).then(() => new Promise(requestAnimationFrame)), chunk);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Config loads CodeMirror only for the source editor', async ({page}) => {
  const editor = /\/assets\/(vendor-editor|CodeEditor)-[\w-]{8}\.js$/;
  const scripts: string[] = [];
  page.on('request', request => {
    if (editor.test(new URL(request.url()).pathname)) scripts.push(request.url());
  });
  await page.goto('/#/config?tab=modules');
  await expect(page.getByRole('tab', {name: 'Modules', selected: true})).toBeVisible();
  await expect(page.locator('.rp-content .rp-card').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(scripts).toEqual([]);
  await page.getByRole('tab', {name: /^Config files/}).click();
  await expect(page.locator('.rp-source-card .cm-editor')).toBeVisible();
  expect(scripts.length).toBeGreaterThan(0);
});

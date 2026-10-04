import type {Page} from '@playwright/test';
import {demoSession, expect, expectLoadFailures, routes, test} from './fixtures';

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
      sessionStorage.setItem('doona-session', session);
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

// The page chunks the shell warms once signed in. On the demo the Activity chunk also carries code the mock backend
// imports, so only a hosted backend leaves it out too.
const pageChunks = ['SearchDialog', ...routes.filter(route => route !== 'activity').map(route => route[0].toUpperCase() + route.slice(1))];
const challenge = {
  status: 401,
  headers: {'www-authenticate': 'Bearer'},
  json: {error: {code: 'authentication_required', message: 'Valid bearer credentials are required.', details: null}}
};
const signInPages = [
  {
    name: 'a saved demo profile',
    pages: pageChunks,
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
    pages: ['activity', ...pageChunks],
    viewport,
    ready: (page: Page) => page.getByRole('heading', {name: 'Token required'}),
    async setup(page: Page) {
      await page.route('**/api', route => route.fulfill(challenge));
      await page.route('**/api/v1/**', route => route.fulfill(challenge));
    }
  }))
];

for (const {name, pages, viewport, ready, setup} of signInPages) {
  test(`the sign-in page for ${name} requests no page chunks before sign-in`, async ({browser}) => {
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

test('a stale chunk whose reload is cancelled says doona was updated, and so does the next one', async ({browser}) => {
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 1100}});
  const page = await context.newPage();
  await page.addInitScript(session => {
    localStorage.setItem('doona-api', 'mock');
    localStorage.setItem('doona-lang', 'en');
    sessionStorage.setItem('doona-session', session);
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

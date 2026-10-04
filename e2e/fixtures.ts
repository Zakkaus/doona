import {test as base, expect, type Download, type Locator, type Page, type Request, type Route} from '@playwright/test';
import {createMockApi} from '../mock';
import {ApiError} from '../src/api/error';
import {sha256} from '../src/api/hash';
import type {OperationAccepted} from '../src/api/model';
import {languages, loadLanguage, type Catalogue} from '../src/i18n';

const expectedHttpErrors = new WeakMap<Page, Set<string>>();
const expectedLoadFailures = new WeakMap<Page, RegExp>();
// A spec that blocks a resource on purpose names it, so the refused load, and the failed import it causes, are not
// reported as browser errors.
export function expectLoadFailures(page: Page, url: RegExp) {
  expectedLoadFailures.set(page, url);
}

export {routePaths as routes} from '../src/shell/routes';

// Specs that name strings load every catalogue; Node imports JSON only with the type attribute, which Vite 6 does not
// expand in the app's own loader.
export const loadCatalogues = () =>
  Promise.all(
    languages.map(({id}) =>
      loadLanguage(id, async lang => ((await import(`../src/i18n/locales/${lang}.json`, {with: {type: 'json'}})) as {default: Catalogue}).default)
    )
  );

// DOONA_API and optional DOONA_TOKEN run read-only specs against a live backend; e2e has no Node globals.
// Example: DOONA_API=http://127.0.0.1:9527 DOONA_TOKEN=... pnpm e2e:live
const env = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env ?? {};
if (env.DOONA_API && env.DOONA_LIVE_OBSERVE !== '1') throw new Error('DOONA_API requires DOONA_LIVE_OBSERVE=1; use pnpm e2e:live');
if (env.DOONA_LIVE_OBSERVE && !env.DOONA_API) throw new Error('e2e:live requires DOONA_API');
const live = env.DOONA_API ? {'doona-api': env.DOONA_API, 'doona-api-token': env.DOONA_TOKEN ?? ''} : {};

// A live backend marks the pages it has no capability for unavailable and may have nothing to list; the mock offers every page.
export const isLive = !!env.DOONA_API;
export const offered = async (page: Page, route: string) => {
  if (!isLive) return true;
  // The navigation marks nothing until the capabilities arrive.
  await expect(page.locator('nav.rp-side')).not.toHaveAttribute('aria-busy', 'true');
  return (await page.locator(`.rp-nav[href="#/${route}"]:not([data-unavailable])`).count()) > 0;
};

// A saved demo profile signs in first, as a password backend does. A spec about something else names the profile to
// start with this tab already holding the demo's session.
export const demoSession = (profileId: string) =>
  JSON.stringify({profileId, api: 'mock', token: 'demo-session-e2e', expiresAt: new Date(Date.now() + 3600_000).toISOString()});

export const test = base.extend<{storage: Record<string, string>; signedIn: string | null; widgets: boolean}>({
  storage: [{}, {option: true}],
  signedIn: [null, {option: true}],
  // Page specs keep their content unobscured; widget specs opt into the floating default.
  widgets: [false, {option: true}],
  page: async ({page, storage, signedIn, widgets}, use) => {
    const errors: string[] = [];
    const controls: string[] = [];
    if (isLive) {
      for (const key of ['doona-api', 'doona-api-token', 'doona-profiles', 'doona-profile'])
        expect(storage[key], 'Live specs must not override the backend').toBeUndefined();
      await page.route('**/api{,/**}', async route => {
        const request = route.request();
        if (request.method() !== 'GET' || new URL(request.url()).pathname.endsWith('/dns/query')) {
          controls.push(`${request.method()} ${request.url()}`);
          await route.abort();
        } else await route.continue();
      });
    }
    page.on('console', message => {
      // The first-visit discovery request is expected to 404 on a static host.
      const discovery = /\/api$/.test(message.location().url) && message.text().includes('404');
      const failedLoad = /^Failed to load resource:/.test(message.text());
      const expectedHttp =
        failedLoad && (expectedHttpErrors.get(page)?.has(message.location().url) || expectedLoadFailures.get(page)?.test(message.location().url));
      // React logs the rejection of a blocked lazy chunk that a load boundary caught.
      const rejectedImport = /dynamically imported module/.test(message.text()) && expectedLoadFailures.get(page)?.test(message.text());
      if (message.type() === 'error' && !discovery && !expectedHttp && !rejectedImport) errors.push(`console: ${message.text()}`);
    });
    // A ResizeObserver whose callback changes layout defers the rest of its notifications to the next frame and the
    // browser reports that as an error; nothing is lost, and WebKit raises it at random under CI load.
    page.on('pageerror', error => {
      if (!/^ResizeObserver loop/.test(error.message)) errors.push(`pageerror: ${error.message}`);
    });
    // Seeds run on every navigation, so they only fill keys the page has not written itself:
    // a preference changed in the page must survive a reload the way it does for a user.
    await page.addInitScript(
      values => {
        for (const [key, value] of Object.entries(values)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      },
      {
        'doona-scheme': 'light',
        'doona-lang': 'en',
        ...(!widgets ? {'doona-widgets': JSON.stringify({version: 2, items: [], visible: false})} : {}),
        ...live,
        ...storage
      }
    );
    if (signedIn !== null)
      await page.addInitScript(session => {
        if (sessionStorage.getItem('doona-session') === null) sessionStorage.setItem('doona-session', session);
      }, demoSession(signedIn));
    await use(page);
    expect(controls, 'Live observation suite sent control requests').toEqual([]);
    expect(errors, 'Browser errors').toEqual([]);
  }
});

// The mock backend's faults scenario: every error state the UI can show from backend data, and actions that fail the
// way honk refuses them (a stale rules.dae, a failing subscription host, a rule the lite geodata files cannot serve).
// The default demo has none.
export const faults = {'doona-mock-scenario': 'faults'};

// A long menu is a virtual list, which turns pointer events off on its items until 300ms after its last scroll event.
// Playwright's own scroll into view can land the click in that window, where the list swallows it and the menu stays
// open. This scrolls the item into view and returns once the list takes pointer events again.
export async function scrollIntoList(item: Locator) {
  await item.evaluate(async el => {
    let scroller = el.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return;
    const before = scroller.scrollTop;
    const scrolled = new Promise<void>(resolve => scroller.addEventListener('scroll', () => resolve(), {once: true}));
    el.scrollIntoView({block: 'nearest'});
    if (scroller.scrollTop !== before) await scrolled;
  });
  await expect.poll(() => item.evaluate(el => getComputedStyle(el).pointerEvents)).not.toBe('none');
}

// Read the complete section in list order, not just the virtual rows mounted in one viewport.
export async function expectVirtualOptions(list: Locator, options: Locator, expected: string[]) {
  const seen = new Map<string, string>();
  await list.evaluate(el => {
    el.scrollTop = 0;
  });
  while (true) {
    await settleFrames(list.page());
    for (const [key, text] of await options.evaluateAll(elements => elements.map(el => [el.getAttribute('data-key')!, el.textContent!] as const)))
      if (!seen.has(key)) seen.set(key, text);
    const end = await list.evaluate(el => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) return true;
      el.scrollTop += el.clientHeight / 2;
      return false;
    });
    if (end) break;
  }
  expect([...seen.values()]).toEqual(expected);
}

// The selected item's detail: an aside beside the list on wide screens, a drawer below 1200px.
// A phone keeps every column and scrolls the table sideways, the container around a native table and the grid itself
// once virtualised; this brings the trailing columns into view. A virtualised grid turns pointer events off on its
// content until 300ms after its last scroll event, so this returns once that has passed: a click sooner finds the
// content unclickable, and Playwright scrolls again to retry and lets the click land among further scroll events,
// which close any popover it opens.
export async function scrollTableToEnd(grid: Locator) {
  await grid.evaluate(async el => {
    const scroller = el.tagName === 'TABLE' ? el.parentElement! : el;
    const before = scroller.scrollLeft;
    const scrolled = new Promise<void>(resolve => scroller.addEventListener('scroll', () => resolve(), {once: true}));
    scroller.scrollLeft = scroller.scrollWidth;
    if (scroller.scrollLeft !== before) await scrolled;
  });
  await expect
    .poll(() => grid.evaluate(el => getComputedStyle((el.tagName === 'TABLE' ? el.parentElement! : el).firstElementChild!).pointerEvents))
    .not.toBe('none');
}

export const detail = (page: Page) => page.locator('.rp-panel, .rp-drawer');
// A panel's secondary actions sit in its trailing More menu. Opens it and returns the item; the menu itself is
// portalled out of the panel.
export async function moreItem(scope: Locator, name: string | RegExp, menu = 'More actions') {
  await scope.scrollIntoViewIfNeeded();
  await scope.getByRole('button', {name: menu, exact: true}).click();
  return scope
    .page()
    .getByRole('menu', {name: menu})
    .getByRole('menuitem', {name, exact: typeof name === 'string'});
}
// Opens a panel's More menu and chooses an item.
export const moreAction = async (scope: Locator, name: string | RegExp, menu?: string) => (await moreItem(scope, name, menu)).click();
export async function editorText(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  return page.evaluate(() => navigator.clipboard.readText());
}
// The language and scheme the page takes from its next load.
export const setAppearance = (page: Page, lang: string, scheme: string) =>
  page.evaluate(
    ({lang, scheme}) => {
      localStorage.setItem('doona-lang', lang);
      localStorage.setItem('doona-scheme', scheme);
    },
    {lang, scheme}
  );
// A reload or offline switch while lazy chunks are still loading cancels them, and the browser logs the cancelled imports.
// A live backend streams events and logs for as long as the page is open, so the network never idles there; the load
// event stands in, since the app's chunks come with the pages it opens.
export const settle = (page: Page) => page.waitForLoadState(isLive ? 'load' : 'networkidle');
// Waits for painted frames, two unless a count says otherwise; a frame count does not shift with machine load as a sleep does.
export const settleFrames = (page: Page, count = 2) =>
  page.evaluate(
    frames =>
      new Promise<void>(resolve => {
        const next = (left: number) => (left ? requestAnimationFrame(() => next(left - 1)) : resolve());
        next(frames);
      }),
    count
  );
export const box = async (locator: Locator) => (await locator.boundingBox())!;
// The two elements' boxes share no area, measured once their arrival animations have finished.
export async function expectApart(a: Locator, b: Locator) {
  for (const locator of [a, b]) await locator.evaluate(el => Promise.all(el.getAnimations({subtree: true}).map(animation => animation.finished)));
  const [p, q] = [await box(a), await box(b)];
  expect(
    p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y,
    `${JSON.stringify(p)} overlaps ${JSON.stringify(q)}`
  ).toBe(true);
}
// The sine of an element's turn. The down chevron turned to the right has -1, turned to the left 1.
export const turn = (locator: Locator) =>
  locator.evaluate(el => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return Math.round(m.b);
  });

export {expect};

// One decoder across the whole stream, so a character split between chunks is not garbled.
export async function downloadText(download: Download) {
  const stream = await download.createReadStream();
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream as AsyncIterable<Uint8Array>) text += decoder.decode(chunk, {stream: true});
  return text + decoder.decode();
}

export async function fulfillStream(route: Route, events: Array<{event: string; id: string; data: unknown}>) {
  await route.fulfill({
    contentType: 'text/event-stream',
    headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
    body: events.map(event => `event: ${event.event}\nid: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`).join('')
  });
}
export async function fulfillAccepted(route: Route, accepted: OperationAccepted) {
  const {retryAfter, ...json} = accepted;
  await route.fulfill({
    status: 202,
    headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Location: accepted.href, 'Retry-After': String(retryAfter)},
    json
  });
}

type MockHandler = (request: Request) => Promise<unknown>;
// Wire parameters are strings; the in-process mock takes the typed query the client would send.
export const query = (request: Request) => {
  const params = Object.fromEntries(new URL(request.url()).searchParams) as Record<string, string | number>;
  for (const key of ['limit', 'window_seconds', 'max_points']) if (typeof params[key] === 'string') params[key] = Number(params[key]);
  return params as never;
};

export async function mockBackend(page: Page, options: {faults?: boolean; includedRule?: boolean} = {}) {
  if (isLive) throw new Error('mockBackend is forbidden in live mode; use the live backend or skip with a reason');
  const api = createMockApi(options);
  if (options.includedRule) {
    const sources = (await api.config()).sources;
    const main = sources.find(source => source.kind === 'main')!;
    const include = sources.find(source => source.id === 'src-rules')!;
    await api.pollOperation(await api.replaceConfigSource(main.id, main.content!.replace('  domain(geosite:openai) -> ai\n', ''), `"${main.content_sha256}"`));
    const content = '# Household exceptions.\n# Kept in a separate source.\n\n# AI\n# Service routing\ndomain(geosite:openai) -> ai\n';
    await api.pollOperation(await api.replaceConfigSource(include.id, content, `"${include.content_sha256}"`));
  }
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const requests: Request[] = [];
  const handlers: Record<string, MockHandler> = {};
  const errors = new Set<string>();
  expectedHttpErrors.set(page, errors);
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  const reads: Record<string, MockHandler> = {
    capabilities: async () => capabilities,
    version: () => api.version(),
    config: () => api.config(),
    rules: () => api.rules(),
    'dns/rules': () => api.dnsRules(),
    groups: () => api.groups(),
    nodes: request => api.nodes(query(request)),
    providers: request => api.providers(query(request)),
    flows: request => api.flows(query(request)),
    connections: request => api.connections(query(request)),
    runtime: () => api.runtime(),
    datapath: request => api.datapath(new URL(request.url()).searchParams.get('detail') === 'full' ? 'full' : 'summary'),
    geodata: () => api.geodata(),
    'dns/cache': request => api.dnsCache(query(request)),
    'dns/log': request => api.dnsLog(query(request)),
    'runtime/settings': () => api.runtimeSettings(),
    'runtime/memory': () => api.runtimeMemory(),
    'runtime/memory/history': request => api.memoryHistory(query(request)),
    'runtime/traffic/history': request => api.trafficHistory(query(request)),
    'runtime/outbounds': () => api.runtimeOutbounds()
  };
  await page.route('**/api{,/**}', async route => {
    const request = route.request();
    requests.push(request);
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1\//, '');
    const method = request.method();
    const parts = path.split('/').map(decodeURIComponent);
    try {
      let result: unknown;
      if (handlers[`${method} ${path}`]) result = await handlers[`${method} ${path}`](request);
      else if (path === '/api') result = await api.discovery();
      else if (method === 'GET' && reads[path]) result = await reads[path](request);
      else if (method === 'GET' && parts[0] === 'groups') result = await api.group(parts[1]);
      else if (method === 'GET' && parts[0] === 'operations') result = await api.operation(parts[1]);
      else if (method === 'GET' && parts[0] === 'config' && parts[1] === 'sources') {
        result = (await api.config()).sources.find(source => source.id === parts[2]);
        if (!result) throw new ApiError(404, 'resource_not_found', 'Source not found');
      } else if (method === 'POST' && path === 'config/validate') result = await api.validateConfig(request.postDataJSON());
      else if (method === 'PUT' && parts[0] === 'config' && parts[1] === 'sources')
        result = await api.replaceConfigSource(parts[2], request.postDataJSON().content, request.headers()['if-match']);
      else if (method === 'PUT' && parts[0] === 'groups' && parts[2] === 'selection') result = await api.selectGroup(parts[1], request.postDataJSON());
      else if (method === 'DELETE' && parts[0] === 'groups' && parts[2] === 'selection')
        result = await api.clearGroupOverride(parts[1], url.searchParams.get('network') as 'tcp' | 'udp' | 'both');
      else if (method === 'PATCH' && parts[0] === 'groups' && parts[2] === 'config' && parts.length === 3)
        result = await api.patchGroup(parts[1], request.postDataJSON(), request.headers()['if-match']);
      else if (method === 'POST' && path === 'probes') result = await api.startProbe(request.postDataJSON());
      else if (method === 'POST' && path === 'providers') result = await api.createProvider(request.postDataJSON());
      else if (method === 'POST' && parts[0] === 'providers' && parts[2] === 'refresh') result = await api.refreshProvider(parts[1]);
      else if (method === 'POST' && path === 'operations/reload') result = await api.startReload();
      else if (method === 'PATCH' && path === 'runtime/settings') result = await api.patchRuntimeSettings(request.postDataJSON());
      else if (method === 'POST' && path === 'operations/suspend') result = await api.startSuspend();
      else if (method === 'POST' && path === 'operations/resume') result = await api.startResume();
      else if (method === 'POST' && path === 'dns/cache/flush') result = await api.flushDnsCache();
      else if (method === 'POST' && path === 'geodata/update') result = await api.updateGeodata();
      else if (method === 'DELETE' && path === 'dns/cache') {
        const params = new URL(request.url()).searchParams;
        result = await api.deleteDnsCacheByName({name: params.get('name') ?? '', type: params.has('type') ? params.getAll('type') : undefined});
      } else if (method === 'DELETE' && parts[0] === 'dns' && parts[1] === 'cache') result = await api.deleteDnsEntry(parts[2]);
      else throw new Error(`Unexpected request: ${method} ${path}`);
      if (result && typeof result === 'object' && 'href' in result && 'operation_id' in result) return fulfillAccepted(route, result as OperationAccepted);
      const headers: Record<string, string> = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
      if (result && typeof result === 'object' && 'retryAfter' in result) {
        const {retryAfter, ...body} = result;
        headers['Retry-After'] = String(retryAfter);
        result = body;
      }
      await route.fulfill({json: result, headers});
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      errors.add(request.url());
      await route.fulfill({
        status: error.status,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...(error.retryAfter === null ? {} : {'Retry-After': String(error.retryAfter)})
        },
        json: {error: {code: error.code, message: error.message, details: error.details}, request_id: error.requestId ?? 'e2e-request'}
      });
    }
  });
  return {api, capabilities, handlers, requests};
}

// A backend whose connections come from fifty devices, more than a menu lists without a filter field. The first twelve
// have two connections each, so the rest rank below them; a source filter narrows the list as honk's does.
export async function manyDevices(page: Page) {
  const backend = await mockBackend(page);
  const list = await backend.api.connections({detail: 'full', limit: 1000});
  const template = list.tcp[0];
  const tcp = Array.from({length: 50}, (_, i) =>
    Array.from({length: i < 12 ? 2 : 1}, (_, n) => ({...template, id: `d${i}-${n}`, src: `10.0.0.${i}:${40000 + n}`, flow_id: null}))
  ).flat();
  backend.handlers['GET connections'] = async request => {
    const src = new URL(request.url()).searchParams.get('src');
    const rows = src ? tcp.filter(row => row.src.startsWith(`${src}:`)) : tcp;
    return {...list, tcp: rows, udp: [], total_tcp: rows.length, total_udp: 0, truncated: false};
  };
  return backend;
}

export async function expectTextInside(cell: Locator) {
  await expect(cell).toBeVisible();
  expect(
    await cell.evaluate(el => {
      const box = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) return false;
      }
      return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
    })
  ).toBe(true);
}

// The Nodes table's group tags: whole tags on one line inside each cell, nothing that scrolls, every row's line one
// height, and a "+N" tag whose tip names all of a node's groups without pressing the row.
export async function expectFittedGroupTags(page: Page) {
  const table = page.locator('.rp-table').first();
  const lines = table.locator('.rp-tags[data-fit]');
  await expect(lines.first()).toBeVisible();
  const cells = await lines.evaluateAll(els =>
    els.map(el => {
      const cell = el.closest('[role="gridcell"]')!;
      const style = getComputedStyle(cell);
      const end = cell.getBoundingClientRect().right - parseFloat(style.paddingRight);
      return {
        scrolls: [cell, ...cell.querySelectorAll('*')].filter(node => node.scrollWidth > node.clientWidth).length,
        beyond: [...el.children].filter(tag => tag.getBoundingClientRect().right > end + 0.01).length,
        height: el.getBoundingClientRect().height
      };
    })
  );
  expect(cells.filter(cell => cell.scrolls || cell.beyond)).toEqual([]);
  expect(new Set(cells.map(cell => cell.height)).size).toBe(1);
  const line = lines.filter({has: page.locator('.rp-tag-more')}).first();
  const more = line.locator('.rp-tag-more');
  const shown = await line.locator('.rp-tag-link').allTextContents();
  const hidden = Number((await more.textContent())!.slice(1));
  expect(hidden).toBeGreaterThan(0);
  await expect(more).toHaveAccessibleName(`${hidden} more group${hidden === 1 ? '' : 's'}`);
  const tip = page.getByRole('tooltip');
  const names = async () => (await tip.textContent())!.trim().split(', ');
  // A pointer move first puts react-aria in pointer modality, where hovering opens a tip.
  await page.mouse.move(0, 0);
  await more.hover();
  await expect(tip).toBeVisible();
  const all = await names();
  expect(all).toHaveLength(shown.length + hidden);
  expect(all.slice(0, shown.length)).toEqual(shown);
  expect(all.slice(shown.length).filter(name => shown.includes(name))).toEqual([]);
  // Pressing it neither follows a link nor opens the row's detail.
  const url = page.url();
  await more.click();
  await expect(tip).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(table.locator('[role=row][data-selected]')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await more.blur();
  await expect(tip).toBeHidden();
  // Focus lands on the row; the arrow keys walk its cells and their tags up to the overflow tag.
  await more.focus();
  for (let step = 0; step < 12 && !(await more.evaluate(el => el === document.activeElement)); step++) await page.keyboard.press('ArrowRight');
  await expect(more).toBeFocused();
  await expect(tip).toBeVisible();
  expect(await names()).toEqual(all);
}

// The dialog starts with no outbound, so a rule is written only after one is chosen.
export async function pickOutbound(dialog: Locator, name: string) {
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await dialog.page().getByRole('option', {name, exact: true}).click();
}

export const rejectedReload = () => ({
  operation_id: 'op-rejected',
  kind: 'reload',
  status: 'failed',
  created_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  result: null,
  error: {code: 'reload_rejected', message: 'Reload rejected', details: {written: true, committed: false}}
});

// Bare included rules need a routing section before doona can place new rules beside them.
export function setupIncludedRouting({api, handlers}: Pick<Awaited<ReturnType<typeof mockBackend>>, 'api' | 'handlers'>, {refuseWrite = false} = {}) {
  const wrap = (text: string) => 'routing {\n' + text + '}\n';
  handlers['GET config'] = async () => {
    const config = await api.config();
    const sources = config.sources.map(async source =>
      source.id === 'src-rules' ? {...source, content: wrap(source.content!), content_sha256: await sha256(wrap(source.content!))} : source
    );
    return {...config, sources: await Promise.all(sources)};
  };
  handlers['GET rules'] = async () => {
    const list = await api.rules();
    return {
      ...list,
      rules: list.rules.map(rule => (rule.source?.source_id === 'src-rules' ? {...rule, source: {...rule.source, line: rule.source.line + 1}} : rule))
    };
  };
  if (refuseWrite)
    handlers['PUT config/sources/src-rules'] = async () => {
      throw new ApiError(422, 'validation_failed', 'invalid', null, {
        diagnostics: [{level: 'error', source_id: 'src-rules', line: 7, column: 1, span: null, code: 'unknown-outbound', message: 'no group proxy'}]
      });
    };
}

// Every first-load state, the progress circle's and the skeletons', so a test can wait for a page's data to arrive.
export const loadingState =
  ':is(.rp-empty[role=status], .rp-skeleton, .rp-skeleton-body, .rp-skeleton-cards, .rp-page-skeleton, .rp-skeleton-group, .rp-table-skeleton, .rp-facts:has(> [role=status]))';

// The first table's header top and height, and the height of its first-load placeholder rows or else its first row.
export async function tableGeometry(page: Page) {
  return page
    .locator('.rp-table')
    .first()
    .evaluate(table => {
      const header = table.querySelector('[role="columnheader"]')!.getBoundingClientRect();
      const row = table.querySelector('.rp-table-skeleton [aria-hidden] > span, [role="row"][data-key]')!.getBoundingClientRect();
      return {header: header.top - table.getBoundingClientRect().top, top: header.top + scrollY, height: table.getBoundingClientRect().height, row: row.height};
    });
}

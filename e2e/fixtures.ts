import {test as base, expect, type Download, type Page, type Request, type Route} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import type {OperationAccepted} from '../src/api/model';

const expectedHttpErrors = new WeakMap<Page, Set<string>>();
const expectedLoadFailures = new WeakMap<Page, RegExp>();
// A spec that blocks a resource on purpose names it, so the refused load is not reported as a browser error.
export function expectLoadFailures(page: Page, url: RegExp) {
  expectedLoadFailures.set(page, url);
}

// Route IDs from src/shell/registry.ts; importing it would load page components.
export const routes = ['activity', 'overview', 'connections', 'dns', 'policies', 'rules', 'nodes', 'config', 'events', 'logs', 'settings'] as const;

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

export const test = base.extend<{storage: Record<string, string>}>({
  storage: [{}, {option: true}],
  page: async ({page, storage}, use) => {
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
      if (message.type() === 'error' && !discovery && !expectedHttp) errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    // Seeds run on every navigation, so they only fill keys the page has not written itself:
    // a preference changed in the page must survive a reload the way it does for a user.
    await page.addInitScript(
      values => {
        for (const [key, value] of Object.entries(values)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      },
      {'doona-scheme': 'light', 'doona-lang': 'en', ...live, ...storage}
    );
    await use(page);
    expect(controls, 'Live observation suite sent control requests').toEqual([]);
    expect(errors, 'Browser errors').toEqual([]);
  }
});

// The selected item's detail: an aside beside the list on wide screens, a drawer below 1200px.
export const detail = (page: Page) => page.locator('.rp-panel, .rp-drawer');

export {expect};

export async function downloadText(download: Download) {
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream!) text += chunk.toString();
  return text;
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
const query = (request: Request) => {
  const params = Object.fromEntries(new URL(request.url()).searchParams) as Record<string, string | number>;
  if (typeof params.limit === 'string') params.limit = Number(params.limit);
  return params as never;
};

export async function mockBackend(page: Page) {
  const api = createMockApi();
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
    groups: () => api.groups(),
    nodes: request => api.nodes(query(request)),
    providers: () => api.providers(),
    flows: () => api.flows(),
    connections: () => api.connections(),
    runtime: () => api.runtime(),
    datapath: () => api.datapath(),
    geodata: () => api.geodata(),
    'dns/cache': request => api.dnsCache(query(request)),
    'dns/log': request => api.dnsLog(query(request)),
    'runtime/settings': () => api.runtimeSettings(),
    'runtime/memory': () => api.runtimeMemory(),
    'runtime/memory/history': () => api.memoryHistory(),
    'runtime/traffic/history': () => api.trafficHistory(),
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
      else if (method === 'POST' && path === 'probes') result = await api.startProbe(request.postDataJSON());
      else if (method === 'POST' && path === 'operations/reload') result = await api.startReload();
      else if (method === 'PATCH' && path === 'runtime/settings') result = await api.patchRuntimeSettings(request.postDataJSON());
      else if (method === 'POST' && path === 'operations/suspend') result = await api.startSuspend();
      else if (method === 'POST' && path === 'operations/resume') result = await api.startResume();
      else if (method === 'POST' && path === 'dns/cache/flush') result = await api.flushDnsCache();
      else if (method === 'DELETE' && parts[0] === 'dns' && parts[1] === 'cache') result = await api.deleteDnsEntry(parts[2]);
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

import {test, type Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import {expect} from './fixtures';

test.use({viewport: {width: 1440, height: 1000}});

// The demo backend served over HTTP, so a spec can change its files as another client would.
async function backend(page: Page) {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
  const reads: Record<string, () => Promise<unknown>> = {
    capabilities: async () => capabilities,
    version: () => api.version(),
    config: () => api.config(),
    rules: () => api.rules(),
    'dns/rules': () => api.dnsRules(),
    groups: () => api.groups(),
    nodes: () => api.nodes({limit: 1000}),
    providers: () => api.providers({limit: 1000}),
    flows: () => api.flows({detail: 'full', limit: 1000}),
    connections: () => api.connections({detail: 'full', limit: 1000}),
    runtime: () => api.runtime(),
    geodata: () => api.geodata(),
    'runtime/settings': () => api.runtimeSettings(),
    'runtime/outbounds': () => api.runtimeOutbounds()
  };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    try {
      if (reads[path]) return await route.fulfill({json: await reads[path]()});
      if (path === 'config/validate') return await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
      if (path.startsWith('config/sources/'))
        return await route.fulfill({
          json: await api.replaceConfigSource(path.split('/').pop()!, route.request().postDataJSON().content, route.request().headers()['if-match'])
        });
      if (path.startsWith('operations/')) return await route.fulfill({json: await api.operation(path.split('/').pop()!)});
      throw new Error(`Unexpected request: ${route.request().method()} ${path}`);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      await route.fulfill({
        status: error.status,
        json: {request_id: 'templates-test', error: {code: error.code, message: error.message, details: error.details}}
      });
    }
  });
  const main = async () => (await api.config()).sources.find(source => source.kind === 'main')!;
  // Writes the main file as another client would and waits for the reload to take it in.
  const write = async (change: (text: string) => string) => {
    const source = await main();
    const next = change(source.content!);
    await api.replaceConfigSource(source.id, next, `"${source.content_sha256}"`);
    await expect.poll(async () => (await main()).content).toBe(next);
  };
  return {api, main, write};
}
const oneFile = (text: string) => text.replace('  include rules.dae\n', '');

test('a template replaces the routing of the one file that holds it', async ({page}) => {
  const {main, write} = await backend(page);
  await write(oneFile);
  await page.goto('/#/rules?tab=list&view=simple');
  await expect(page.getByText('Custom rules', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Apply Bypass mainland China'}).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Bypass mainland China?'});
  await expect(dialog).toContainText('Replaces the top-level routing in config.dae.');
  await dialog.getByRole('button', {name: 'Apply template', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Applied Bypass mainland China to config.dae');
  await expect(dialog).toHaveCount(0);
  const saved = (await main()).content!;
  expect(saved).toContain('dip(geoip:cn) -> direct');
  expect(saved).toContain('fallback: proxy');
  // DNS routing is nested and stays.
  expect(saved).toContain('qname(geosite: cn) -> alidns');
  expect(saved).not.toContain('domain(geosite: telegram) -> proxy');
  await expect(page.getByRole('region', {name: 'Current routing'})).toContainText('Bypass mainland China');
});

test('routing that pulls in or spreads over other files is refused and nothing is written', async ({page}) => {
  const {api} = await backend(page);
  let writes = 0;
  page.on('request', request => {
    if (request.method() !== 'GET') writes++;
  });
  await page.goto('/#/rules?tab=list&view=simple');
  await expect(page.getByRole('alert').or(page.locator('.rp-alert'))).toContainText('The routing in config.dae includes another file.');
  await expect(page.getByRole('button', {name: /^Apply /})).toHaveCount(0);
  const config = await api.config();
  for (const source of config.sources) {
    if (source.kind === 'main') source.content = oneFile(source.content!);
    if (source.id === 'src-rules') source.content = 'routing {\n  fallback: direct\n}\n';
  }
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.reload();
  await expect(page.locator('.rp-alert')).toContainText('Routing rules are spread over several files.');
  await expect(page.getByRole('button', {name: /^Apply /})).toHaveCount(0);
  expect(writes).toBe(0);
});

test('a file changed on disk after the dialog opened is refused rather than overwritten', async ({page}) => {
  const {main, write} = await backend(page);
  await write(oneFile);
  await page.goto('/#/rules?tab=list&view=simple');
  await page.getByRole('button', {name: 'Apply GFW list only'}).click();
  const dialog = page.getByRole('dialog', {name: 'Apply GFW list only?'});
  await expect(dialog).toBeVisible();
  await write(text => '# concurrent edit\n' + text);
  const refused = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await dialog.getByRole('button', {name: 'Apply template', exact: true}).click();
  await refused;
  await expect(page.locator('.rp-toast.negative')).toBeVisible();
  const saved = (await main()).content!;
  expect(saved).toContain('# concurrent edit');
  expect(saved).not.toContain('domain(geosite:gfw)');
});

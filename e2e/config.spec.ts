import {test as httpTest, type Locator, type Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import {downloadText, expect, expectLoadFailures, test} from './fixtures';
import {sha256} from '../src/api/hash';

test.use({viewport: {width: 1440, height: 1000}});

test('quick setup refuses an apostrophe without changing the subscription URL', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const url = page.getByLabel('Subscription URL', {exact: true});
  await url.fill("https://example.org/o'brien");
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Cannot write this value losslessly');
  await expect(url).toHaveValue("https://example.org/o'brien");
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  await url.fill('https://example.org/accepted');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  await expect(page.locator('.cm-content')).toContainText('https://example.org/accepted');
});

test('configuration sources list with the main source open, read-only ones cannot be edited', async ({page}) => {
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content[aria-label="/etc/honk/config.dae"]')).toContainText('tproxy_port: 12345');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  const picker = page.getByRole('button', {name: /Source/});
  await expect(picker).toContainText('/etc/honk/config.dae');
  await picker.click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await page.getByRole('option', {name: /sub-c\.dae/}).click();
  await expect(page).toHaveURL(/source=src-sub-c$/);
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
  await expect(page.locator('.cm-content[aria-label="/var/lib/honk/subscriptions/sub-c.dae"]')).toContainText('redacted');
});

test('switching sources discards the draft after confirmation', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toBeVisible();
  const original = await editor.innerText();
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('domain(example.org) -> proxy');
  await expect(editor).toContainText('domain(example.org) -> proxy');
  const picker = page.getByRole('button', {name: /Source/});
  await picker.click();
  await page.getByRole('option', {name: /\/etc\/honk\/config\.dae/}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('.cm-content[aria-label="/etc/honk/config.dae"]')).toBeVisible();
  await picker.click();
  await page.getByRole('option', {name: /\/etc\/honk\/rules\.dae/}).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(editor).toHaveText(original, {useInnerText: true});
  await expect(page.locator('.rp-badge', {hasText: 'Unsaved'})).toHaveCount(0);
});

test('editing validates, shows diagnostics on errors, and saves through a reload', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('domain(geosite: netflix) -> nowhere');
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  const diagnostics = page.getByRole('list', {name: 'Diagnostics'});
  await expect(diagnostics.getByRole('listitem')).toHaveCount(1);
  await expect(diagnostics).toContainText('No group named "nowhere"');
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  for (let i = 0; i < 'nowhere'.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('proxy');
  await expect(page.locator('.rp-badge', {hasText: 'Unsaved'})).toBeVisible();
  await expect(page.locator('.rp-card')).toContainText('Reloading or closing the page loses the changes');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toContainText('domain(geosite: netflix) -> proxy');
  await expect(page.locator('.rp-toolbar').first()).toContainText('41');
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('Lines: 8,');
});

test('the validation tab lists kept diagnostics and opens the source at the line', async ({page}) => {
  await page.goto('/#/config?tab=validate');
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('Passed with 2 warnings');
  const rows = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows).toHaveCount(3);
  await page.getByRole('radio', {name: 'Info 1', exact: true}).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('radio', {name: 'All 3', exact: true}).click();
  await page.getByRole('button', {name: 'Validate again', exact: true}).click();
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('Last validation');
  await expect(rows).toHaveCount(0);
  await page.reload();
  await rows.filter({hasText: 'rules.dae:3'}).click();
  await page.getByRole('button', {name: 'Open source: rules.dae:3', exact: true}).click();
  await expect(page).toHaveURL(/tab=source&source=src-rules&line=3$/);
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toBeVisible();
  await expect(page.locator('.cm-activeLine')).toContainText('mac(aa:bb:cc:dd:ee:ff)');
});

test.describe('without configuration readback', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('the page is hidden from navigation and says so when opened', async ({page}) => {
    await page.goto('/#/config');
    await expect(page.locator('.rp-nav[href="#/config"]')).toHaveAttribute('data-unavailable', '');
    await expect(page.locator('.rp-content')).toContainText('This backend does not provide this page');
  });
});

test('the quick setup rewrites subscriptions and keeps groups and rules', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  await expect(card.getByLabel('Subscription URL', {exact: true})).toHaveValue('https://sub.example.net/api/v1/client/subscribe?token=demo');
  const input = await card.getByLabel('Name', {exact: true}).boundingBox();
  const remove = await card.getByRole('button', {name: 'Remove sub-c', exact: true}).boundingBox();
  expect(Math.abs(input!.y + input!.height / 2 - (remove!.y + remove!.height / 2))).toBeLessThanOrEqual(2);
  await card.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/sub?token=abc&type=v2ray');
  await expect(card.locator('.cm-content')).toContainText("sub-c: 'https://example.org/sub?token=abc&type=v2ray'");
  await card.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toBeVisible();
  await expect(page).toHaveURL(/tab=source&source=src-main$/);
  const main = page.locator('.cm-content[aria-label="/etc/honk/config.dae"]');
  await expect(main).toContainText('resilient { filter: name(hk-01, sg-01, us-01) policy: min_avg10 }');
  await expect(main).toContainText('gaming { filter: name(jp-01, hk-02) policy: min_last_delay }');
  await expect(page.locator('.rp-toolbar').first()).toContainText('41');
});

for (const width of [320, 360])
  test(`at ${width}px a subscription row keeps its remove button beside the name field`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/config?tab=setup');
    const card = page.getByRole('region', {name: 'Quick setup'});
    const name = card.getByLabel('Name', {exact: true});
    const url = card.getByLabel('Subscription URL', {exact: true});
    const remove = card.getByRole('button', {name: 'Remove sub-c', exact: true});
    const [nameBox, urlBox, removeBox] = await Promise.all([name.boundingBox(), url.boundingBox(), remove.boundingBox()]);
    // The name field and the remove button share a row; the URL field, always too wide for a phone, wraps below it.
    expect(Math.abs(nameBox!.y - removeBox!.y)).toBeLessThanOrEqual(2);
    expect(urlBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height);
    expect(removeBox!.width).toBeGreaterThanOrEqual(44);
    expect(removeBox!.height).toBeGreaterThanOrEqual(44);
  });

test('the quick setup guards unsaved changes like the editor', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^GFW list only/}).click();
  await page.getByRole('tab', {name: 'Sources'}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/tab=setup$/);
  await page.getByRole('tab', {name: 'Sources'}).click();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/tab=source$/);
});

test('the quick setup writes a rule template into routing', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^Standard groups/}).click();
  const preview = card.locator('.cm-content');
  await expect(preview).toContainText('domain(geosite:category-ads-all) -> block');
  await expect(preview).toContainText('geosite:category-games@cn) -> direct');
  await expect(preview).toContainText('domain(geosite:telegram) -> telegram');
  await expect(preview).toContainText('telegram {');
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^GFW list only/}).click();
  await expect(preview).toContainText('domain(geosite:gfw) -> proxy');
  await expect(preview).toContainText('fallback: direct');
});

async function configBackend(page: Page) {
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
    groups: () => api.groups(),
    nodes: () => api.nodes(),
    providers: () => api.providers(),
    flows: () => api.flows(),
    connections: () => api.connections(),
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
      await route.fulfill({status: error.status, json: {request_id: 'config-test', error: {code: error.code, message: error.message, details: error.details}}});
    }
  });
  return {api, capabilities};
}

// An include is validated by the replacement itself, in its full source set; a refusal writes nothing.
httpTest('validation refusal keeps the draft and never replaces the source', async ({page}) => {
  const {api} = await configBackend(page);
  const original = (await api.config()).sources.find(source => source.id === 'src-rules')!.content;
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill(original + '\ndomain(example.org) -> nowhere\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toContainText('domain(example.org) -> nowhere');
  expect((await api.config()).sources.find(source => source.id === 'src-rules')!.content).toBe(original);
});

test('a source over the advertised body limit is refused before anything is sent, naming the limit', async ({page}) => {
  const {capabilities} = await configBackend(page);
  capabilities.limits.max_json_body_bytes = 200;
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# grown past the limit\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('larger than the backend accepts. Limit: 200 bytes');
  expect(writes).toEqual([]);
});

test('a 413 on a config write names the tighter advertised limit', async ({page}) => {
  await configBackend(page);
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({
      status: 413,
      json: {request_id: 'config-test', error: {code: 'request_too_large', message: 'Request body exceeds its limit', details: null}}
    })
  );
  expectLoadFailures(page, /\/config\/sources\//);
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# refused by the backend\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Limit: 65,536 bytes');
});

test('source application works without the optional full validation endpoint', async ({page}) => {
  const {capabilities} = await configBackend(page);
  capabilities.resources.config_validate.available = false;
  let validations = 0;
  page.on('request', request => {
    if (request.url().endsWith('/config/validate')) validations++;
  });
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# without dry run\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  await expect(editor).toContainText('# without dry run');
  expect(validations).toBe(0);
});

test('incomplete sources cannot be transformed by rule edits or quick setup', async ({page}) => {
  const {api} = await configBackend(page);
  const config = await api.config();
  for (const source of config.sources) if (source.content !== undefined) source.content = source.content.replace('direct', 'redacted');
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  let mutations = 0;
  page.on('request', request => {
    if (request.method() !== 'GET') mutations++;
  });
  await page.goto('/#/config?tab=source');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeDisabled();
  await page.getByRole('tab', {name: 'Quick setup'}).click();
  await page.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/new');
  await expect(page.getByRole('button', {name: 'Apply and reload', exact: true})).toBeDisabled();
  await page.goto('/#/rules?tab=list');
  await page.getByRole('button', {name: 'Remove rule', exact: true}).first().click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('incomplete');
  expect(mutations).toBe(0);
});

// The main source is checked before replacement; a discarded draft must not turn into a write afterwards.
test('leaving the editor aborts validation before any replacement', async ({page}) => {
  const {api} = await configBackend(page);
  let release!: () => void;
  const hold = new Promise<void>(resolve => {
    release = resolve;
  });
  let settled!: () => void;
  const handled = new Promise<void>(resolve => {
    settled = resolve;
  });
  await page.route('**/api/v1/config/validate', async route => {
    await hold;
    await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
    settled();
  });
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'PUT') writes++;
  });
  await page.goto('/#/config?source=src-main');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# cancelled draft\n');
  const validating = page.waitForRequest('**/config/validate');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await validating;
  await page.locator('.rp-nav[href="#/settings"]').click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('.rp-nav[href="#/settings"]')).toHaveAttribute('aria-current', 'page');
  release();
  await handled;
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  expect(writes).toBe(0);
});

httpTest('a stale original digest refuses replacement and retains the draft', async ({page}) => {
  const {api} = await configBackend(page);
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# local draft\n');
  const source = (await api.config()).sources.find(source => source.id === 'src-rules')!;
  await api.replaceConfigSource(source.id, source.content + '\n# concurrent edit\n', `\"${source.content_sha256}\"`);
  const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await rejected;
  await expect(page.locator('.rp-toast.negative')).toContainText('changed');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toContainText('# local draft');
  // The concurrent edit becomes the accepted text once its reload completes.
  await expect.poll(async () => (await api.config()).sources.find(item => item.id === source.id)!.content).toContain('# concurrent edit');
});

test('rule writes require a stable source ID even when the display path matches', async ({page}) => {
  const {api} = await configBackend(page);
  const rules = await api.rules();
  for (const rule of rules.rules) if (rule.source) rule.source.source_id = 'unknown-source';
  await page.route('**/api/v1/rules', route => route.fulfill({json: rules}));
  await page.goto('/#/rules?tab=list');
  await expect(page.getByRole('button', {name: 'Add rule', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Remove rule', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Open source', exact: true})).toHaveCount(0);
});

test('modules list top-level counts and edit only routing through reload', async ({page}) => {
  const {api} = await configBackend(page);
  const original = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  await page.goto('/#/config');
  await expect(page.getByRole('tab', {name: 'Modules', exact: true})).toHaveAttribute('aria-selected', 'true');
  const modules = page.getByRole('tabpanel', {name: 'Modules'});
  await expect(modules.getByRole('heading', {level: 3})).toHaveText(['global', 'subscription', 'node', 'group', 'dns', 'routing']);
  await expect(modules.getByRole('region', {name: 'global', exact: true})).toContainText('6 settings');
  await expect(modules.getByRole('region', {name: 'subscription', exact: true})).toContainText('1 subscription');
  await expect(modules.getByRole('region', {name: 'node', exact: true})).toContainText('5 nodes');
  await expect(modules.getByRole('region', {name: 'group', exact: true})).toContainText(
    '4 groups: proxy: Manual, resilient: Fastest on average, gaming: Fastest on average, skylink: Fastest on average'
  );
  await expect(modules.getByRole('region', {name: 'dns', exact: true})).toContainText('2 upstreams, 1 request rule, 0 response rules');
  const routing = modules.getByRole('region', {name: 'routing', exact: true});
  await expect(routing).toContainText('5 rules, fallback: resilient');
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = routing.locator('.cm-content');
  const section = await editor.innerText();
  const edited = section.replace('  fallback:', '  domain(example.org) -> proxy\n  fallback:');
  await editor.fill(edited);
  await expect(modules.getByRole('region', {name: 'global', exact: true}).getByRole('button', {name: 'Edit', exact: true})).toBeDisabled();
  await routing.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  await expect(routing).toContainText('6 rules, fallback: resilient');
  const expected = original.replace(section, edited);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(expected);
  await page.getByRole('tab', {name: 'Sources', exact: true}).click();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
});

test('a module card opens its section in the Sources tab for editing by hand', async ({page}) => {
  await configBackend(page);
  await page.goto('/#/config');
  const modules = page.getByRole('tabpanel', {name: 'Modules'});
  const routing = modules.getByRole('region', {name: 'routing', exact: true});
  // The card's actions share one size; editing by hand differs only in being quiet.
  const manual = routing.getByRole('button', {name: 'Edit by hand', exact: true});
  const size = (button: Locator) => button.evaluate(element => getComputedStyle(element).fontSize);
  expect(await size(manual)).toBe(await size(routing.locator('.rp-cluster > .rp-btn:not(.quiet)').first()));
  await manual.click();
  await expect(page.getByRole('tab', {name: 'Sources', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=source&source=src-main&line=\d+$/);
  await expect(page.locator('.cm-activeLine')).toContainText('routing {');
});

test('cancelling a module discards its draft and navigation uses the draft guard', async ({page}) => {
  await page.goto('/#/config');
  const routing = page.getByRole('region', {name: 'routing', exact: true});
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = routing.locator('.cm-content');
  const original = await editor.innerText();
  await editor.fill(original.replace('fallback: resilient', 'fallback: direct'));
  await page.getByRole('tab', {name: 'Sources', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await routing.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(editor).toHaveCount(0);
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  await expect(editor).toHaveText(original, {useInnerText: true});
  await expect(routing.getByRole('button', {name: 'Apply and reload', exact: true})).toBeDisabled();
});

test('module validation maps whole-file errors onto section lines and refuses an invalid save', async ({page}) => {
  const {api} = await configBackend(page);
  const original = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await page.goto('/#/config');
  const routing = page.getByRole('region', {name: 'routing', exact: true});
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = routing.locator('.cm-content');
  await editor.fill('routing {\n  domain(example.org) -> nowhere\n  fallback: resilient\n}');
  await expect(routing.locator('.cm-diag-line-error')).toContainText('domain(example.org) -> nowhere');
  await routing.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(original);
});

test("opening another section of the same file places that section's diagnostics, not the previous one's", async ({page}) => {
  const {api} = await configBackend(page);
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  const line = main.content!.split('\n').findIndex(text => /^routing\s*\{/.test(text)) + 2;
  config.diagnostics = [{level: 'error', source_id: main.id, line, column: null, span: null, code: 'invalid', message: 'Routing problem'}];
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  // Validation never answers, so only the diagnostics already loaded can place marks.
  await page.route('**/api/v1/config/validate', () => {});
  await page.goto('/#/config');
  const routing = page.getByRole('region', {name: 'routing', exact: true});
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  await expect(routing.locator('.cm-diag-line-error')).toHaveCount(1);
  const dns = page.getByRole('region', {name: 'dns', exact: true});
  await dns.getByRole('button', {name: 'Edit', exact: true}).click();
  await expect(dns.locator('.cm-content')).toBeVisible();
  await expect(routing.locator('.cm-content')).toHaveCount(0);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(dns.locator('.cm-diag-line-error')).toHaveCount(0);
});

test('typing in a module keeps its diagnostics and layout until the next validation', async ({page}) => {
  await page.goto('/#/config');
  const routing = page.getByRole('region', {name: 'routing', exact: true});
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = routing.locator('.cm-content');
  await editor.fill('routing {\n  # note\n  domain(example.org) -> nowhere\n  domain(example.com) -> elsewhere\n  fallback: resilient\n}');
  const list = routing.getByRole('list', {name: 'Diagnostics'});
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('elsewhere');
  // Every frame while typing: where the card's parts sit, and which lines carry the error tint.
  const record = () =>
    page.evaluate(() => {
      const card = document.querySelector('section[aria-label="routing"]')!;
      const box = (selector: string) => {
        const rect = card.querySelector(selector)?.getBoundingClientRect();
        return rect ? `${Math.round(rect.top)}+${Math.round(rect.height)}` : 'none';
      };
      const frames = new Set<string>();
      (window as unknown as {frames: Set<string>}).frames = frames;
      const tick = () => {
        const errors = [...card.querySelectorAll('.cm-diag-line-error')].map(line => line.textContent);
        frames.add(JSON.stringify({editor: box('.rp-editor'), list: box('.rp-config-diagnostics'), actions: box(':scope > .rp-cluster'), errors}));
        requestAnimationFrame(tick);
      };
      tick();
    });
  const frames = () => page.evaluate(() => [...(window as unknown as {frames: Set<string>}).frames].map(frame => JSON.parse(frame)));
  const pause = () => page.waitForTimeout(900);
  await editor.getByText('# note').click();
  await page.keyboard.press('End');
  await pause();
  await record();
  for (const key of 'abcd') {
    await page.keyboard.type(key);
    if (key < 'c') await pause();
  }
  await pause();
  expect(await frames()).toHaveLength(1);
  // A line inserted above the error carries the tint along with it until the next validation places it again.
  await editor.getByText('routing {').click();
  await page.keyboard.press('End');
  await record();
  await page.keyboard.press('Enter');
  await pause();
  expect(new Set((await frames()).map(frame => frame.errors.join('\n')))).toEqual(
    new Set(['  domain(example.org) -> nowhere\n  domain(example.com) -> elsewhere'])
  );
});

test('code scrolled sideways passes under the line numbers', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/config');
  const routing = page.getByRole('region', {name: 'routing', exact: true});
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  await routing.locator('.cm-content').fill(`routing {\n  domain(${'long.'.repeat(40)}example.org) -> proxy\n  fallback: resilient\n}`);
  const gutter = routing.locator('.cm-gutters');
  const before = await gutter.screenshot();
  await routing.locator('.cm-scroller').evaluate(scroller => (scroller.scrollLeft = 120));
  expect(await gutter.screenshot()).toEqual(before);
});

test('quick setup preserves dotted tags and rejects duplicate subscription names', async ({page}) => {
  const {api} = await configBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.replaceConfigSource(main.id, main.content!.replace('sub-c:', 'sub.eu:'), `"${main.content_sha256}"`);
  await expect.poll(async () => (await api.config()).sources.find(source => source.kind === 'main')!.content).toContain('sub.eu:');
  await page.goto('/#/config?tab=setup');
  await expect(page.getByLabel('Name', {exact: true})).toHaveValue('sub.eu');
  await page.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/new');
  await expect(page.locator('.cm-content')).toContainText("sub.eu: 'https://example.org/new'");
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  await page.getByLabel('Name', {exact: true}).last().fill('sub.eu');
  await page.getByLabel('Subscription URL', {exact: true}).last().fill('https://duplicate.example/sub');
  await expect(page.getByRole('button', {name: 'Apply and reload', exact: true})).toBeDisabled();
});

test('opening untouched quick setup does not inject sections or guard navigation', async ({page}) => {
  const {api} = await configBackend(page);
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  main.content = 'global {\n  tproxy_port: 12345\n}\nrouting {\n  fallback: direct\n}\n';
  main.content_sha256 = await sha256(main.content);
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=setup');
  await expect(page.locator('.cm-content')).not.toContainText('subscription');
  await expect(page.locator('.cm-content')).not.toContainText('group');
  await expect(page.getByRole('button', {name: 'Apply and reload', exact: true})).toBeDisabled();
  await page.getByRole('tab', {name: 'Sources', exact: true}).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page).toHaveURL(/tab=source$/);
});

test('explicit include validation sends the main-first set with source paths', async ({page}) => {
  const {api} = await configBackend(page);
  const config = await api.config();
  config.sources.reverse();
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# candidate include\n');
  const request = page.waitForRequest('**/config/validate');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  const submitted = (await request).postDataJSON();
  expect(submitted.sources[0]).toMatchObject({id: 'src-main', path: '/etc/honk/config.dae'});
  expect(submitted.sources.find((source: {id: string}) => source.id === 'src-rules')).toMatchObject({
    path: '/etc/honk/rules.dae',
    content: expect.stringContaining('# candidate include')
  });
});

httpTest('rejected saves show cross-source diagnostics without marking the edited file', async ({page}) => {
  const {capabilities} = await configBackend(page);
  capabilities.resources.config_validate.available = false;
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({
      status: 422,
      json: {
        request_id: 'cross-source',
        error: {
          code: 'validation_failed',
          message: 'Invalid configuration',
          details: {
            diagnostics: [{level: 'error', source_id: 'src-main', line: 2, column: 1, span: null, code: 'invalid', message: 'Error in main source'}]
          }
        }
      }
    })
  );
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# rejected\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  const diagnostics = page.getByRole('list', {name: 'Diagnostics'});
  await expect(diagnostics).toContainText('config.dae');
  await expect(diagnostics).toContainText('Error in main source');
  await expect(editor.locator('.cm-diag-line-error')).toHaveCount(0);
  await diagnostics.getByRole('button', {name: /^Open source: config\.dae/}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/source=src-main.*line=2/);
});

test('withheld includes do not disable main validation or background diagnostics', async ({page}) => {
  const {api} = await configBackend(page);
  const config = await api.config();
  const include = config.sources.find(source => source.kind === 'include')!;
  delete include.content;
  include.path = '<redacted>';
  include.writable = false;
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=source');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Validation passed');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill(config.sources.find(source => source.kind === 'main')!.content + '\nrouting { domain(example.org) -> nowhere }\n');
  await expect(page.getByRole('list', {name: 'Diagnostics'})).toContainText('No group named "nowhere"');
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('tab', {name: 'Validation', exact: true}).click();
  await page.getByRole('button', {name: 'Validate again', exact: true}).click();
  await expect(page.getByRole('tabpanel', {name: 'Validation'})).toContainText('Last validation');
  await page.getByRole('tab', {name: 'Modules', exact: true}).click();
  const routing = page.getByRole('region', {name: 'routing', exact: true});
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  await routing.locator('.cm-content').fill('routing { domain(example.org) -> nowhere }');
  await expect(routing.getByRole('list', {name: 'Diagnostics'})).toContainText('No group named "nowhere"');
});

test('source withholding does not certify exports or diagnose the hidden include', async ({page}) => {
  const {api} = await configBackend(page);
  const config = await api.config();
  config.secrets_redacted = true;
  const main = config.sources.find(source => source.kind === 'main')!;
  main.path = '<redacted>';
  const include = config.sources.find(source => source.kind === 'include')!;
  include.path = '<redacted>';
  delete include.content;
  include.writable = false;
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.rp-content')).toContainText('Listener secret values are redacted');
  await expect(page.locator('.rp-content')).toContainText('may contain credentials');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export', exact: true}).click();
  expect(await downloadText(await downloading)).toBe(main.content);
  await page.getByRole('button', {name: /Source/}).click();
  await page.getByRole('option', {name: /Include/}).click();
  await expect(page.locator('.rp-content')).toContainText('The backend did not return this source');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Validate', exact: true})).toBeDisabled();
});

test('first-run setup writes the chosen listener and DNS endpoints', async ({page}) => {
  const {api} = await configBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.replaceConfigSource(main.id, '', `"${main.content_sha256}"`);
  await expect.poll(async () => (await api.config()).sources.find(source => source.id === main.id)!.content).toBe('');
  await page.goto('/#/config?tab=setup');
  await page.getByLabel('Transparent proxy port', {exact: true}).fill('23456');
  await page.getByLabel('Default DNS upstream', {exact: true}).fill('udp://192.0.2.1:53');
  await page.getByLabel('Mainland-China domain DNS upstream', {exact: true}).fill('tls://resolver.example:853');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  const accepted = (await api.config()).sources.find(source => source.id === main.id)!.content;
  expect(accepted).toContain('tproxy_port: 23456');
  expect(accepted).toContain("cloudflare: 'udp://192.0.2.1:53'");
  expect(accepted).toContain("alidns: 'tls://resolver.example:853'");
});

test('a chosen setup tab stays open when a refresh fills the main source', async ({page}) => {
  const {api} = await configBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const original = main.content!;
  const content = async () => (await api.config()).sources.find(source => source.id === main.id)!.content;
  await api.replaceConfigSource(main.id, '', `"${main.content_sha256}"`);
  await expect.poll(content).toBe('');
  await page.goto('/#/config');
  await expect(page.getByRole('tab', {name: 'Quick setup'})).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', {name: 'Modules'}).click();
  await page.getByRole('tab', {name: 'Quick setup'}).click();
  await page.getByLabel('Transparent proxy port', {exact: true}).fill('23456');
  const emptied = (await api.config()).sources.find(source => source.id === main.id)!;
  await api.replaceConfigSource(main.id, original, `"${emptied.content_sha256}"`);
  await expect.poll(content).toBe(original);
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/config');
  await page.locator('.rp-top').getByRole('button', {name: 'Refresh', exact: true}).click();
  await refreshed;
  await expect(page.getByRole('tab', {name: 'Quick setup'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Transparent proxy port', {exact: true})).toHaveValue('23456');
});

test('choosing a template removes all previous traffic routing but retains DNS routing', async ({page}) => {
  const {api} = await configBackend(page);
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  main.content = 'group { mix {} }\ndns { routing { request { fallback: asis } } }\nrouting { fallback: direct }\nrouting { domain(old.example) -> block }\n';
  main.content_sha256 = await sha256(main.content);
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^Global proxy/}).click();
  await expect(card).toContainText('This template uses mix');
  await expect(card).toContainText('block remaining UDP/443');
  const preview = card.locator('.cm-content');
  await expect(preview).toContainText('fallback: mix');
  await expect(preview).not.toContainText('old.example');
  await expect(preview).toContainText('dns { routing { request { fallback: asis } } }');
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^Standard groups/}).click();
  await expect(card).toContainText('named groups: proxy, auto, telegram, media, apple');
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^Keep the current rules/}).click();
  await expect(card).not.toContainText('This template uses');
  await expect(preview).toContainText('old.example');
});

for (const appearance of ['light', 'dark', 'glass'] as const) {
  test(`configuration details wrap on phones in ${appearance}`, async ({page}) => {
    const {api} = await configBackend(page);
    await page.setViewportSize({width: 390, height: 844});
    await page.addInitScript(appearance => {
      localStorage.setItem('doona-scheme', appearance === 'light' ? 'light' : 'dark');
      localStorage.setItem('doona-palette', appearance === 'glass' ? 'glass/glass' : 'rose-pine/moon');
    }, appearance);
    const config = await api.config();
    const main = config.sources.find(source => source.kind === 'main')!;
    main.content += "\nsubscription { preserved: { url: 'https://example.org/" + 'longtoken'.repeat(20) + "' } }\n";
    main.content_sha256 = await sha256(main.content!);
    const message = 'duplicate endpoint identity; retaining the first usable entry ' + 'identifier'.repeat(20);
    config.diagnostics = [{level: 'warning', source_id: main.id, line: null, column: null, span: null, code: 'duplicate', message}];
    await page.route('**/api/v1/config', route => route.fulfill({json: config}));
    await page.goto('/#/config?tab=source');
    const diagnostic = page.getByRole('list', {name: 'Diagnostics'}).getByText(`Backend message: ${message}`, {exact: true});
    await expect(diagnostic).toBeVisible();
    expect(await diagnostic.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole('tab', {name: 'Quick setup', exact: true}).click();
    const raw = page.locator('.rp-config-raw');
    await expect(raw).toContainText('longtoken'.repeat(20));
    expect(await raw.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

httpTest('a module draft refused with 412 is rebased and saves on the next attempt', async ({page}) => {
  const {api} = await configBackend(page);
  await page.goto('/#/config');
  const routing = page.getByRole('tabpanel', {name: 'Modules'}).getByRole('region', {name: 'routing', exact: true});
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = routing.locator('.cm-content');
  const section = await editor.innerText();
  await editor.fill(section.replace('  fallback:', '  domain(example.org) -> proxy\n  fallback:'));
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.replaceConfigSource(main.id, '# concurrent edit\n' + main.content, `"${main.content_sha256}"`);
  const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await routing.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await rejected;
  await expect(editor).toContainText('domain(example.org) -> proxy');
  // The second attempt carries the refetched digest; the concurrent edit outside the section is kept.
  await expect(async () => {
    await routing.getByRole('button', {name: 'Apply and reload', exact: true}).click();
    await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded', {timeout: 2000});
  }).toPass({timeout: 15000});
  const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(saved).toContain('# concurrent edit');
  expect(saved).toContain('domain(example.org) -> proxy');
});

const restartRefusal = {
  request_id: 'restart',
  error: {
    code: 'unsupported_value',
    message: 'Configuration validation failed',
    details: {
      diagnostics: [
        {
          level: 'error',
          source_id: 'src-rules',
          line: null,
          column: null,
          span: null,
          code: 'restart-required',
          message: 'Changing global.log_level requires restarting honk'
        }
      ]
    }
  }
};

httpTest('a restart-only change is refused with the setting named, and the next write goes through', async ({page}) => {
  await configBackend(page);
  let refused = false;
  await page.route('**/api/v1/config/sources/*', route => {
    if (refused) return route.fallback();
    refused = true;
    return route.fulfill({status: 422, json: restartRefusal});
  });
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# restart draft\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('1 setting takes effect only after a restart; nothing written');
  await expect(page.getByRole('list', {name: 'Diagnostics'})).toContainText('global.log_level');
  await expect(editor).toContainText('# restart draft');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
});

httpTest('a file ahead of the running configuration is explained when the refusal repeats', async ({page}) => {
  await configBackend(page);
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({status: 412, json: {request_id: 'ahead', error: {code: 'stale_revision', message: 'Source changed on disk', details: null}}})
  );
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# ahead draft\n');
  const apply = page.getByRole('button', {name: 'Apply and reload', exact: true});
  await apply.click();
  await expect(page.locator('.rp-toast.negative')).toContainText('changed');
  await apply.click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'not the running configuration'})).toContainText('Reload honk to apply the file');
  await expect(editor).toContainText('# ahead draft');
});

httpTest('a reload refused after the write says the file was written but not applied', async ({page}) => {
  await configBackend(page);
  const href = '/api/v1/operations/op-rejected';
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({
      status: 202,
      headers: {'Retry-After': '1', Location: href},
      json: {operation_id: 'op-rejected', kind: 'reload', status: 'queued', href}
    })
  );
  await page.route('**' + href, route =>
    route.fulfill({
      json: {
        operation_id: 'op-rejected',
        kind: 'reload',
        status: 'failed',
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        result: null,
        error: {code: 'reload_rejected', message: 'Reload rejected', details: {written: true, committed: false}}
      }
    })
  );
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# rejected reload\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Written to the configuration file but not applied');
});

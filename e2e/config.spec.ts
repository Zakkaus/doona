import {test as httpTest, type Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import {expect, test} from './fixtures';

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
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('Line count: 8,');
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
  await page.getByRole('button', {name: 'Open source', exact: true}).click();
  await expect(page).toHaveURL(/tab=source&source=src-rules&line=3$/);
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toBeVisible();
  await expect(page.locator('.cm-activeLine')).toContainText('mac(aa:bb:cc:dd:ee:ff)');
});

test.describe('without configuration readback', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('the page is hidden from navigation and says so when opened', async ({page}) => {
    await page.goto('/#/config');
    await expect(page.locator('.rp-nav[href="#/config"]')).toHaveAttribute('data-unavailable', '');
    await expect(page.locator('.rp-content')).toContainText('The backend does not offer this page.');
  });
});

test('the quick setup rewrites subscriptions and keeps groups and rules', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  await expect(card.getByLabel('Subscription URL', {exact: true})).toHaveValue('https://sub.example.net/api/v1/client/subscribe?token=demo');
  await expect(card).toContainText('Templates route to proxy');
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
    localStorage.setItem('doona-scheme', 'light');
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

test('validation refusal keeps the draft and never replaces the source', async ({page}) => {
  const {api} = await configBackend(page);
  const original = (await api.config()).sources.find(source => source.id === 'src-rules')!.content;
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'PUT') writes++;
  });
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  await editor.fill(original + '\ndomain(example.org) -> nowhere\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toContainText('domain(example.org) -> nowhere');
  expect(writes).toBe(0);
  expect((await api.config()).sources.find(source => source.id === 'src-rules')!.content).toBe(original);
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
  await page.goto('/#/config?source=src-rules');
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
  expect((await api.config()).sources.find(item => item.id === source.id)!.content).toContain('# concurrent edit');
});

test('rule writes require a stable source ID even when the display path matches', async ({page}) => {
  const {api} = await configBackend(page);
  const rules = await api.rules();
  for (const rule of rules.rules) if (rule.source && 'source_id' in rule.source) delete rule.source.source_id;
  await page.route('**/api/v1/rules', route => route.fulfill({json: rules}));
  await page.goto('/#/rules?tab=list');
  await expect(page.getByRole('button', {name: 'Add rule', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Remove rule', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Open source', exact: true}).first()).toBeVisible();
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
    '4 groups: proxy: fixed(0), resilient: min_avg10, gaming: min_last_delay, skylink: min_moving_avg'
  );
  await expect(modules.getByRole('region', {name: 'dns', exact: true})).toContainText('2 upstreams, 1 request rules, 0 response rules');
  const routing = modules.getByRole('region', {name: 'routing', exact: true});
  await expect(routing).toContainText('5 rules · fallback: resilient');
  await routing.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = routing.locator('.cm-content');
  const section = await editor.innerText();
  const edited = section.replace('  fallback:', '  domain(example.org) -> proxy\n  fallback:');
  await editor.fill(edited);
  await expect(modules.getByRole('region', {name: 'global', exact: true}).getByRole('button', {name: 'Edit', exact: true})).toBeDisabled();
  await routing.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  await expect(routing).toContainText('6 rules · fallback: resilient');
  const expected = original.replace(section, edited);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(expected);
  await page.getByRole('tab', {name: 'Sources', exact: true}).click();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
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

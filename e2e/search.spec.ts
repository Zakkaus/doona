import {detail, expect, test} from './fixtures';
import {createMockApi} from '../mock';

const open = async (page: import('@playwright/test').Page, text: string) => {
  await page.keyboard.press('Control+K');
  const dialog = page.locator('.rp-dialog');
  await dialog.locator('input').fill(text);
  return dialog;
};

test('search reaches tabs and cards, not only pages', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  let dialog = await open(page, 'config files');
  await dialog.getByRole('option', {name: /Config files/}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
  dialog = await open(page, 'geodata');
  await dialog.getByRole('option', {name: /Geodata/}).click();
  await expect(page).toHaveURL(/#\/settings\?card=geodata$/);
  await expect(page.getByRole('region', {name: 'Geodata', exact: true})).toBeInViewport();
  dialog = await open(page, 'actions');
  await expect(dialog.getByRole('option', {name: /Backend actions/})).toHaveCount(0);
});

test('search opens a node in its source, a group on its card, a subscription and a config source', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  let dialog = await open(page, 'jp-01');
  await dialog.getByRole('option', {name: /^jp-01/}).click();
  await expect(page).toHaveURL(/#\/nodes\?provider=inline&q=jp-01&node=[^&]+$/);
  await expect(page.getByLabel('Search nodes')).toHaveValue('jp-01');
  await expect(page.locator('.rp-table').first().locator('[role=row][data-key]')).toHaveCount(1);
  dialog = await open(page, 'gaming');
  await dialog.getByRole('option', {name: /^gaming/}).click();
  await expect(page).toHaveURL(/#\/policies\?group=gaming$/);
  await expect(page.getByRole('region', {name: 'gaming'})).toBeInViewport();
  dialog = await open(page, 'harbor');
  await dialog.getByRole('option', {name: /^harbor/}).click();
  await expect(page).toHaveURL(/#\/nodes\?provider=harbor$/);
  dialog = await open(page, 'rules.dae');
  await dialog.getByRole('option', {name: /rules\.dae/}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-rules$/);
});

test('search finds a routing rule by its condition and lands on its row', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  const dialog = await open(page, 'telegram');
  // The connection to api.telegram.org is a hit too; the rule is the one that names its outbound in its description.
  const hit = dialog.getByRole('option', {name: /domain\(geosite:telegram\)/}).filter({hasText: /→ telegram/});
  await expect(hit).toHaveCount(1);
  await hit.click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=/);
  const row = page.locator('[role="row"][aria-selected="true"]');
  await expect(row).toContainText('telegram');
  await expect(row).toBeInViewport();
});

test('search opens a connections tab, and a DNS rule condition on its marked row', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  let dialog = await open(page, 'traffic');
  await dialog.getByRole('option', {name: /^Traffic/}).click();
  await expect(page).toHaveURL(/#\/connections\?tab=traffic$/);
  await expect(page.getByRole('tab', {name: 'Traffic', exact: true})).toHaveAttribute('aria-selected', 'true');
  dialog = await open(page, 'home.arpa');
  const hit = dialog.getByRole('option', {name: /qname\(suffix: lan, home\.arpa\)/}).filter({hasText: /Request rules #2 → asis/});
  await expect(hit).toHaveCount(1);
  await hit.click();
  await expect(page).toHaveURL(/#\/rules\?tab=dns&list=request&rule=/);
  await expect(page.getByRole('tab', {name: 'DNS rules', exact: true})).toHaveAttribute('aria-selected', 'true');
  const row = page.locator('[role="row"][aria-selected="true"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('qname(suffix: lan, home.arpa)');
  await expect(row).toBeInViewport();
  await expect(row).toHaveAttribute('data-highlighted', 'true');
  await expect(row).not.toHaveAttribute('data-highlighted', 'true', {timeout: 5000});
  await expect(row).toHaveAttribute('aria-selected', 'true');
});

test("search finds a Settings field by another language's label and focuses it", async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  const dialog = await open(page, '配色');
  await dialog.getByRole('option', {name: /^Palette/}).click();
  await expect(page).toHaveURL(/#\/settings\?card=appearance&field=palette$/);
  await expect(page.locator('[data-setting="palette"]').getByRole('option', {selected: true})).toBeFocused();
  await expect(page.locator('[data-setting="palette"] .rp-select-box[data-selected]')).toBeInViewport();
});

test('search respects destination capabilities, preserves loose-node ownership and qualifies partial results', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  capabilities.resources.dns_query.available = false;
  capabilities.resources.dns_log.available = false;
  capabilities.resources.routing_trace.available = false;
  const nodes = await api.nodes({limit: 1000});
  nodes.nodes = [
    {...nodes.nodes[0], id: 'direct', name: 'direct', protocol: 'direct', provider_id: null},
    {...nodes.nodes[0], id: 'orphan-id', name: 'orphan', provider_id: null}
  ];
  const providers = await api.providers({limit: 1000});
  providers.providers = [{...providers.providers[0], id: 'unattributed'}];
  const connections = await api.connections({detail: 'full', limit: 1000});
  connections.truncated = true;
  const responses: Record<string, unknown> = {
    '/capabilities': capabilities,
    '/version': await api.version(),
    '/nodes': nodes,
    '/providers': providers,
    '/groups': await api.groups(),
    '/config': await api.config(),
    '/rules': await api.rules(),
    '/dns/rules': await api.dnsRules(),
    '/connections': connections
  };
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', route => route.fulfill({json: responses[new URL(route.request().url()).pathname.replace('/api/v1', '')]}));
  await page.goto('/#/nodes?tab=list');
  await expect(page.getByLabel('Search nodes')).toBeVisible();
  let dialog = await open(page, 'query');
  await expect(dialog.getByRole('option', {name: /Query/})).toHaveCount(0);
  await dialog.locator('input').fill('cache');
  await expect(dialog.getByRole('option', {name: /Cache/})).toBeVisible();
  await dialog.locator('input').fill('trace');
  await expect(dialog.getByRole('option', {name: /Trace simulation/})).toHaveCount(0);
  await dialog.locator('input').fill('orphan');
  await dialog.getByRole('option', {name: /^orphan/}).click();
  await expect(page).toHaveURL(/provider=unattributed-&q=orphan&node=orphan-id$/);
  await expect(page.getByRole('rowheader', {name: 'orphan', exact: true})).toBeVisible();
  dialog = await open(page, 'nothing-matches-this');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('truncated');
  await dialog.getByRole('button', {name: 'Connections', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections$/);
  await expect(page.getByRole('tab', {name: 'Traffic', exact: true})).toHaveAttribute('aria-selected', 'true');
});

test('search results are reached with arrow keys while the field keeps focus', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  const dialog = await open(page, 'config files');
  const field = dialog.locator('input');
  await expect(field).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(field).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/config\?tab=source$/);
});

test('search reads live connection addresses, node and group names, and available pages', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const connections = await api.connections({detail: 'full', limit: 1000});
  const connection = connections.tcp[0];
  connection.id = 'live/id:1';
  connection.domain = 'live-search.example';
  connection.dst = '198.51.100.42:443';
  connection.src = '192.0.2.42:3210';
  const nodes = await api.nodes({limit: 1000});
  nodes.nodes[0].name = 'Live node';
  const groups = await api.groups();
  groups[0].name = 'Live group';
  const responses: Record<string, unknown> = {
    '/capabilities': capabilities,
    '/version': await api.version(),
    '/connections': connections,
    '/nodes': nodes,
    '/groups': groups
  };
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    await route.fulfill({json: path.startsWith('/groups/') ? await api.group(decodeURIComponent(path.slice(8))) : responses[path]});
  });
  await page.goto('/#/connections?q=no-such-connection');
  // The shortcut only works once the shell has mounted its key handler.
  await expect(page.getByRole('button', {name: /^Search pages/})).toBeVisible();
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog');
  for (const query of ['live-search.example', '198.51.100.42', '192.0.2.42']) {
    await dialog.getByRole('searchbox').fill(query);
    await expect(dialog.getByRole('option', {name: /live-search.example/})).toBeVisible();
  }
  await dialog.getByRole('option', {name: /live-search.example/}).click();
  await expect(page).toHaveURL(/#\/connections\?id=live%2Fid%3A1$/);
  await expect(detail(page).getByRole('heading')).toHaveText('live-search.example');
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/id=/);
  await expect(detail(page)).toHaveCount(0);
  const targets: Array<[string, RegExp]> = [
    ['Live node', /#\/nodes\?provider=inline&q=Live\+node&node=[^&]+$/],
    ['Live group', /#\/policies\?group=proxy$/],
    ['Settings', /#\/settings$/]
  ];
  for (const [query, url] of targets) {
    await page.keyboard.press('Control+K');
    await dialog.getByRole('searchbox').fill(query);
    await dialog.getByRole('option', {name: new RegExp('^' + query)}).click();
    await expect(page).toHaveURL(url);
  }
});

test('an empty search says what it looked through, so a domain with no live connection is not read as absent', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  const dialog = await open(page, 'pixiv.net');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog.locator('.rp-empty')).toHaveText(
    'No matches. Search covers the names of pages, tabs, settings, features, nodes, groups and node sources, live connections, config file paths and sections, and routing and DNS rule expressions.'
  );
});

for (const width of [1440, 768, 390]) {
  test(`search controls and result insets match at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/#/activity');
    await page
      .locator('.rp-top')
      .getByRole('button', {name: /^Search/})
      .click();
    const dialog = page.locator('.rp-dialog');
    await dialog.locator('input').fill('proxy');
    await expect(dialog.getByRole('option').first()).toBeVisible();
    const sizes = await dialog.evaluate(el => {
      const input = el.querySelector('.rp-input')!.getBoundingClientRect();
      const close = el.querySelector('.rp-toolbar button.rp-btn')!.getBoundingClientRect();
      const result = el.querySelector('[role=option]')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {input: input.height, close: close.height, left: result.left - box.left, right: box.right - result.right};
    });
    expect(sizes.input).toBe(sizes.close);
    expect(Math.abs(sizes.left - sizes.right)).toBeLessThanOrEqual(1);
    await expect(dialog.locator('input')).toHaveAttribute('placeholder', 'Search');
    await page.keyboard.press('Escape');
    if (width === 1440) {
      const heights = await page
        .locator('.rp-top .rp-brand, .rp-top .rp-search, .rp-top .rp-btn')
        .evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().width).map(el => el.getBoundingClientRect().height));
      expect(new Set(heights).size).toBe(1);
    }
  });
}

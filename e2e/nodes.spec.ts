import type {Locator} from '@playwright/test';
import {expect, mockBackend, query, test, moreAction, moreItem} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import type {ProbeResult, Provider} from '../src/api/model';

type ProbeResultItem = ProbeResult['results'][number];

const rows = (table: Locator) => table.locator('[role=rowgroup]:last-child [role=row][data-key]');

test('nodes sort by name, latency and protocol, and filter by group and protocol', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  const table = page.locator('.rp-table').nth(1);
  const list = rows(table);
  await expect(list).toHaveCount(5);
  await expect(list.first()).toContainText('hk-01');
  await table.getByRole('columnheader', {name: /^Latency/}).click();
  await expect(list.first()).toContainText('sg-01');
  await expect(list.last()).toContainText('us-01');
  await table.getByRole('columnheader', {name: /^Latency/}).click();
  await expect(list.first()).toContainText('us-01');
  await table.getByRole('columnheader', {name: /^Node/}).click();
  await expect(list.first()).toContainText('hk-01');
  await page.getByRole('button', {name: /Group$/}).click();
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await expect(list).toHaveCount(2);
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('2 / 5');
  await page.getByLabel('Search nodes').fill('jp');
  await expect(list).toHaveCount(1);
});

test('a share link becomes an inline node and can be removed again', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  const table = page.locator('.rp-table').nth(1);
  const list = rows(table);
  await expect(list).toHaveCount(5);
  await page.getByRole('button', {name: 'Paste node link', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('hk-03');
  await dialog.getByLabel('Node link').fill('foo://nope');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Unsupported value');
  await expect(dialog.getByRole('alert')).toContainText('Unsupported share link scheme "foo"');
  await dialog.getByLabel('Node link').fill('vless://uuid@example.com:443?security=tls#hk-03');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'hk-03 added'})).toBeVisible();
  await expect(list).toHaveCount(6);
  await expect(list.filter({hasText: 'hk-03'})).toContainText('vless');
  await page.getByRole('button', {name: 'Remove hk-03', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove hk-03', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'hk-03 removed'})).toBeVisible();
  await expect(list).toHaveCount(5);
  // The management write landed in the main source as a new generation.
  await page.locator('.rp-nav[href="#/config"]').click();
  await expect(page.locator('.rp-toolbar').first()).toContainText('42');
});

// The contract creates a provider unfetched; the page refreshes it right away so the person sees nodes, not "stale".
test('a subscription is added, refreshed at once, and removed with its nodes', async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  const sources = rows(page.locator('.rp-table').first());
  await expect(sources).toHaveCount(2);
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('sub-d');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/sub?token=abc');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  const added = page.locator('.rp-toast.positive', {hasText: 'sub-d added and refreshed, 0 nodes'});
  await expect(added).toBeVisible();
  await expect(sources).toHaveCount(3);
  // The new row is selected without the toast's help.
  await expect(page).toHaveURL(/#\/nodes\?tab=list&provider=[^&]+$/);
  await expect(page.getByText(/Showing nodes from sub-d\./)).toBeVisible();
  // The toast opens the new subscription's nodes.
  await added.getByRole('button', {name: 'View nodes', exact: true}).click();
  await expect(page).toHaveURL(/#\/nodes\?provider=[^&]+$/);
  await expect(page.getByText(/Showing nodes from sub-d\./)).toBeVisible();
  await expect(sources.filter({hasText: 'sub-d'})).toContainText('OK');
  await moreAction(page.locator('body'), 'Remove sub-c', 'More actions for sub-c');
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove sub-c', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-c removed'})).toBeVisible();
  await expect(sources).toHaveCount(2);
  await expect(sources.first()).toContainText('config.dae');
});

test('a new subscription is selected even when its first refresh fails', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['POST providers'] = async request => {
    const created = (await backend.api.createProvider(request.postDataJSON())) as Provider;
    backend.handlers[`POST providers/${created.id}/refresh`] = async () => {
      throw new ApiError(502, 'upstream_unavailable', 'Subscription server unreachable');
    };
    return created;
  };
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('sub-f');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/sub');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'sub-f was written to the configuration, but could not be refreshed'})).toBeVisible();
  await expect(page).toHaveURL(/#\/nodes\?tab=list&provider=[^&]+$/);
  await expect(page.getByText(/Showing nodes from sub-f\./)).toBeVisible();
});

test('a new subscription is selected when the backend cannot refresh it', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.resources.providers.can_refresh = false;
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('sub-u');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/sub');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-u added'})).toBeVisible();
  await expect(page).toHaveURL(/#\/nodes\?tab=list&provider=[^&]+$/);
  await expect(page.getByText(/Showing nodes from sub-u\./)).toBeVisible();
});

test('a subscription is added with its refresh interval, User-Agent and cache setting', async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('sub-o');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/sub?token=abc');
  await expect(dialog.getByRole('button', {name: 'Auto-refresh'})).toContainText('Every 24 hours');
  await expect(dialog.getByLabel('User-Agent')).toHaveAttribute('placeholder', 'honk/0.0.1-alpha');
  await expect(dialog.getByRole('switch', {name: 'Cache the subscription'})).toBeChecked();
  await dialog.getByRole('button', {name: 'Auto-refresh'}).click();
  await page.getByRole('option', {name: 'Every 6 hours', exact: true}).click();
  await dialog.getByLabel('User-Agent').fill('agent\u00e9');
  await expect(dialog.getByText('Up to 256 printable ASCII characters')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Add', exact: true})).toBeDisabled();
  await dialog.getByLabel('User-Agent').fill('clash.meta');
  await dialog.getByText('Cache the subscription').click();
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-o added and refreshed'})).toBeVisible();
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(
    "sub-o: {\n    url: 'https://example.org/sub?token=abc'\n    ua: 'clash.meta'\n    interval: '21600s'\n    cache: false\n  }"
  );
});

test('an untouched option is left to the backend and an unadvertised one is not shown', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.providers.create_options = {user_agent: 'honk/0.0.1-alpha'};
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('User-Agent')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Auto-refresh'})).toHaveCount(0);
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await dialog.getByLabel('Name').fill('sub-p');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/plain');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-p added and refreshed'})).toBeVisible();
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toContain("  sub-p: 'https://example.org/plain'\n");
});

test('a node can be tested on its own', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Test hk-01', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText(/hk-01: \d+ ms/);
});

// A Hysteria2 node listens on UDP only: a connect to its server endpoint fails while the node carries traffic, so the
// latency test must measure through the node over HTTP. `rows` rewrites the node's probe rows once the probe finishes.
async function udpOnlyNode(page: Parameters<typeof mockBackend>[0], rows: (row: ProbeResultItem) => ProbeResultItem) {
  const {api, handlers} = await mockBackend(page);
  const kinds: string[] = [];
  let measured: ProbeResultItem | undefined;
  handlers['GET nodes'] = async request => {
    const list = await api.nodes(query(request));
    const nodes = list.nodes.map(node => {
      if (node.id !== 'hk-01') return node;
      // What an earlier connect probe left behind: the endpoint refused, recorded as a warm TCP connect.
      const stale = {
        ...node.health.find(h => h.transport === 'tcp')!,
        warmth: 'warm' as const,
        measurement: 'tcp_connect' as const,
        state: 'unavailable' as const,
        latency_ms: null,
        error: 'probe_failed'
      };
      const health = measured
        ? [stale, {...stale, measurement: 'http_headers' as const, state: measured.state, latency_ms: measured.latency_ms, error: measured.error}]
        : [stale];
      return {...node, protocol: 'hysteria2' as const, health};
    });
    return {...list, nodes};
  };
  handlers['POST probes'] = async request => {
    const body = request.postDataJSON();
    kinds.push(body.kind);
    const accepted = await api.startProbe(body);
    handlers[`GET operations/${accepted.operation_id}`] = async () => {
      const operation = await api.operation(accepted.operation_id);
      if (operation.status !== 'succeeded' || operation.kind !== 'probe') return operation;
      const results = operation.result.results.map(rows);
      measured = results.find(row => row.ip_version === 'ipv4');
      return {...operation, result: {...operation.result, results}};
    };
    return accepted;
  };
  return kinds;
}

test('a UDP-only node is measured through the node, and the table shows its latency', async ({page}) => {
  const kinds = await udpOnlyNode(page, row => ({...row, state: 'healthy', latency_ms: 42, error: null}));
  await page.goto('/#/nodes?provider=inline');
  const row = rows(page.locator('.rp-table').nth(1)).filter({hasText: 'hk-01'});
  await expect(row).toContainText('Unavailable');
  await page.getByRole('button', {name: 'Test hk-01', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('hk-01: 42 ms');
  await expect(row).toContainText('42');
  await expect(row).not.toContainText('Unavailable');
  expect(kinds).toEqual(['http']);
});

test('a probe toast names its reason in words, never as a backend code', async ({page}) => {
  await udpOnlyNode(page, row =>
    row.ip_version === 'ipv4'
      ? {...row, state: 'unavailable', latency_ms: null, error: 'probe_failed'}
      : {...row, state: 'unknown', latency_ms: null, error: 'address_unavailable'}
  );
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Test hk-01', exact: true}).click();
  const toast = page.locator('.rp-toast.negative');
  await expect(toast).toHaveText(/hk-01: unreachable/);
  await expect(page.locator('.rp-toast')).not.toContainText(['probe_failed']);
});

test('an unknown probe result gives its reason in words', async ({page}) => {
  await udpOnlyNode(page, row => ({...row, state: 'unknown', latency_ms: null, error: 'probe_deadline'}));
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Test hk-01', exact: true}).click();
  await expect(page.locator('.rp-toast.neutral')).toContainText('hk-01: result unknown (The probe timed out before measuring)');
});

test.describe('long lists', () => {
  test.use({storage: {'doona-mock-big': '3000'}});
  test('a node list of thousands renders only the visible rows', async ({page}) => {
    await page.goto('/#/nodes?provider=sub-c');
    await expect(page.locator('.rp-toolbar').nth(1)).toContainText('3,000 / 3,000');
    const list = rows(page.locator('.rp-table').nth(1));
    await expect(list.first()).toBeVisible();
    expect(await list.count()).toBeLessThan(100);
  });
});

test('node sources list their nodes and a subscription can be refreshed', async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  const sources = page.locator('.rp-table').first().locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(sources).toHaveCount(2);
  await expect(sources.first()).toContainText('sub-c');
  const nodes = page.locator('.rp-table').nth(1).locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(nodes.first()).toBeVisible();
  expect(await nodes.count()).toBeGreaterThan(10);
  await sources.nth(1).click();
  await expect(page).toHaveURL(/provider=inline$/);
  await expect(nodes).toHaveCount(5);
  await page.getByRole('button', {name: 'Refresh sub-c', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('sub-c refreshed, 120 nodes');
});

test('a subscription refresh interval is written into the configuration', async ({page}) => {
  await page.goto('/#/config?tab=source');
  const editor = page.locator('.cm-content');
  const original = (await createMockApi().config()).sources.find(source => source.kind === 'main')!.content!;
  await editor.fill(
    original.replace(
      "sub-c: 'https://sub.example.net/api/v1/client/subscribe?token=demo'",
      "sub-c: {\n    url: 'https://sub.example.net/api/v1/client/subscribe?token=demo'\n    interval: '86400s'\n  }"
    )
  );
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  await page.goto('/#/nodes?tab=list');
  const sources = page.locator('.rp-table').first().locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(sources.first()).toContainText('Every 24 hours');
  await expect(sources.nth(1)).not.toContainText('Every');
  await page.getByRole('button', {name: 'Auto-refresh of sub-c', exact: true}).click();
  await page.getByRole('menuitemradio', {name: 'Every 6 hours', exact: true}).click();
  await expect(page.getByRole('alertdialog', {name: 'sub-c auto-refresh written to the configuration and reloaded: Every 6 hours', exact: true})).toBeVisible();
  await expect(sources.first()).toContainText('Every 6 hours');
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(
    "sub-c: {\n    url: 'https://sub.example.net/api/v1/client/subscribe?token=demo'\n    interval: '21600s'\n  }"
  );
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Auto-refresh of sub-c', exact: true}).click();
  await page.getByRole('menuitemradio', {name: 'Manual only', exact: true}).click();
  await expect(sources.first()).toContainText('Manual only');
});

test('built-in and unattributed provenance stay separate without granting inline deletion', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  for (const resource of Object.values(capabilities.resources)) resource.available = false;
  capabilities.resources.nodes.available = true;
  capabilities.resources.providers.available = true;
  const providers = await api.providers({limit: 1000});
  const inline = providers.providers.find(provider => provider.kind === 'inline')!;
  const snapshot = await api.nodes({limit: 1000});
  const node = snapshot.nodes[0];
  snapshot.nodes = [
    {...node, id: 'direct', name: 'direct', protocol: 'direct', provider_id: null},
    {...node, id: 'block', name: 'block', protocol: 'block', provider_id: null},
    {...node, id: 'null-owner', name: 'Null owner', provider_id: null},
    {...node, id: 'omitted-owner', name: 'Omitted owner', provider_id: undefined},
    {...node, id: 'inline-owner', name: 'Inline owner', provider_id: inline.id}
  ];
  snapshot.next_cursor = null;
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  await page.route('**/api/v1/providers?*', route => route.fulfill({json: providers}));
  await page.route('**/api/v1/nodes?*', route => route.fulfill({json: snapshot}));
  await page.goto('/#/nodes?tab=list');
  const list = rows(page.locator('.rp-table').nth(1));
  const sources = rows(page.locator('.rp-table').first());
  await expect(sources.first()).toContainText('Built-in');
  // The first real source is the default; the built-in row is chosen explicitly.
  await sources.first().click();
  await expect(list).toHaveCount(2);
  await expect(list).toContainText(['block', 'direct']);
  await expect(sources.first().getByRole('button', {name: /Refresh|Remove|More actions/})).toHaveCount(0);
  await sources.filter({hasText: 'Unattributed'}).click();
  await expect(list).toHaveCount(2);
  await expect(list).toContainText(['Null owner', 'Omitted owner']);
  await expect(page.getByRole('button', {name: /^Remove .* owner$/})).toHaveCount(0);
  await rows(page.locator('.rp-table').first()).filter({hasText: inline.name}).click();
  await expect(list).toHaveCount(1);
  await expect(page.getByRole('button', {name: 'Remove Inline owner', exact: true})).toBeVisible();
});

test('an unspecified subscription interval claims neither manual-only nor an engine default but can be set', async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  const subscription = rows(page.locator('.rp-table').first()).filter({hasText: 'sub-c'});
  await expect(subscription).toBeVisible();
  await expect(subscription).not.toContainText('Every 24 hours');
  await expect(subscription).not.toContainText('Manual only');
  await expect(subscription.getByRole('button', {name: 'Auto-refresh of sub-c', exact: true})).toHaveText('—');
});

test('without a node list the page shows providers alone, with no latency tab', async ({page}) => {
  const backend = await mockBackend(page);
  backend.capabilities.resources.nodes.available = false;
  await page.goto('/#/nodes?tab=latency');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
});

test('while a cancelled removal is still pending, no other node dialog can submit', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const node = (await api.nodes({limit: 1000})).nodes.find(item => item.provider_id === 'inline')!;
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  handlers[`DELETE nodes/${encodeURIComponent(node.id)}`] = async () => {
    await gate;
    return api.deleteNode(node.id);
  };
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: `Remove ${node.name}`, exact: true}).click();
  const confirmation = page.getByRole('alertdialog');
  const removing = page.waitForRequest(request => request.method() === 'DELETE');
  await confirmation.getByRole('button', {name: `Remove ${node.name}`, exact: true}).click();
  await removing;
  await confirmation.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(confirmation).toHaveCount(0);
  await page.getByRole('button', {name: 'Paste node link', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('hk-03');
  await dialog.getByLabel('Node link').fill('vless://uuid@example.com:443?security=tls#hk-03');
  const add = dialog.getByRole('button', {name: 'Add', exact: true});
  await expect(add).toBeDisabled();
  release();
  await expect(page.locator('.rp-toast.positive', {hasText: `${node.name} removed`})).toBeVisible();
  await expect(add).toBeEnabled();
});

test('short tables fit their rows, the protocol column shows whole names, and a long address stays inside its table', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  const backend = await mockBackend(page);
  // The settings page keeps the geodata table only where the sources cannot be configured.
  delete backend.capabilities.resources.geodata.configurable_sources;
  // Slow reads, so each table is drawn while it loads.
  const slow = (read: () => Promise<unknown>) => async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return read();
  };
  backend.handlers['GET providers'] = slow(() => backend.api.providers({limit: 1000}));
  backend.handlers['GET geodata'] = slow(() => backend.api.geodata());
  const whole = (cell: Locator) => cell.evaluate(element => element.scrollWidth <= element.clientWidth);
  await page.goto('/#/nodes');
  const sources = page.getByRole('grid', {name: 'Sources', exact: true});
  await expect(sources.getByRole('row')).toHaveCount(3);
  // A heading, two rows and the frame: no placeholder height left over from loading.
  await expect.poll(async () => (await page.locator('.rp-table', {has: sources}).boundingBox())!.height).toBeLessThanOrEqual(2 + 37 + 2 * 40 + 1);
  const protocol = page.locator('.rp-table .rp-truncate', {hasText: /^shadowsocks$/}).first();
  expect(await whole(protocol)).toBe(true);
  await page.goto('/#/settings');
  const geodata = page.getByRole('grid', {name: 'Geodata', exact: true});
  await expect(geodata.getByRole('row')).toHaveCount(3);
  await expect.poll(async () => (await page.locator('.rp-table', {has: geodata}).boundingBox())!.height).toBeLessThanOrEqual(2 + 37 + 2 * 40 + 1);
  // The release address is cut inside its column, not past the table's edge.
  const table = (await page.locator('.rp-table', {has: geodata}).boundingBox())!;
  const source = (await geodata.getByRole('row').nth(1).getByRole('gridcell').last().boundingBox())!;
  expect(source.x + source.width).toBeLessThanOrEqual(table.x + table.width + 1);
});

test('the note about node sources belongs to the list, not the latency tab', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/nodes');
  const note = page.getByText(/^Sources are subscriptions, files/);
  await expect(note).toBeVisible();
  await page.getByRole('tab', {name: 'Latency', exact: true}).click();
  await expect(page.getByRole('tabpanel', {name: 'Latency'}).getByRole('region', {name: 'Node latency'})).toBeVisible();
  await expect(note).toBeHidden();
});

test('the source kind badge shows its whole label in every language', async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  for (const lang of ['en', 'zh-TW', 'zh-CN']) {
    await page.evaluate(value => localStorage.setItem('doona-lang', value), lang);
    await page.reload();
    const badges = page.locator('.rp-table').first().locator('[role=rowgroup]:last-child .rp-badge');
    await expect(badges).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (const badge of await badges.all()) expect(await badge.evaluate(element => element.scrollWidth <= element.clientWidth), lang).toBe(true);
  }
});

test.describe('in Traditional Chinese', () => {
  test.use({storage: {'doona-lang': 'zh-TW'}});

  test('a failed subscription refresh names its cause in the page language', async ({page}) => {
    const {api, handlers} = await mockBackend(page);
    handlers['GET providers'] = async () => {
      const list = await api.providers({limit: 1000});
      const subscription = list.providers.find(item => item.kind === 'subscription')!;
      subscription.status = 'error';
      subscription.last_error = {code: 'fetch_failed', message: 'Provider refresh did not complete successfully.', details: null};
      return list;
    };
    await page.goto('/#/nodes?tab=list');
    const status = rows(page.locator('.rp-table').first()).getByText('失敗', {exact: true});
    await expect(async () => {
      await page.mouse.move(0, 0);
      await status.hover();
      await expect(page.getByRole('tooltip')).toContainText('無法下載訂閱，沿用目前的節點', {timeout: 1500});
    }).toPass();
  });
});

test('a refresh whose nodes were applied to a degraded runtime reads as applied with a warning', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const runtime = await api.runtime();
  handlers['POST providers/sub-c/refresh'] = async () => ({
    operation_id: 'refresh-degraded',
    kind: 'provider_refresh',
    status: 'queued',
    href: '/api/v1/operations/refresh-degraded',
    retryAfter: 1
  });
  handlers['GET operations/refresh-degraded'] = async () => ({
    operation_id: 'refresh-degraded',
    kind: 'provider_refresh',
    status: 'failed',
    created_at: runtime.observed_at,
    started_at: runtime.observed_at,
    finished_at: runtime.observed_at,
    result: null,
    error: {code: 'publication_degraded', message: 'Provider nodes were committed but the runtime is degraded.', details: {committed: true}}
  });
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Refresh sub-c', exact: true}).click();
  await expect(page.locator('.rp-toast.info')).toContainText('sub-c: nodes applied, but the datapath did not recover');
  await expect(page.locator('.rp-toast.negative')).toHaveCount(0);
});

test('the node list names its source, groups a node by a labelled menu, and refreshes every subscription', async ({page}) => {
  await page.goto('/#/nodes?tab=list&provider=inline');
  await expect(page.getByText('Showing nodes from config.dae. Choose another source above to view its nodes.', {exact: true})).toBeVisible();
  const join = page.getByRole('button', {name: 'Add hk-01 to a group', exact: true});
  await expect(join).toHaveText('Add to group');
  await page.getByRole('button', {name: 'Refresh subscription (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Subscriptions refreshed: 1 of 1'})).toBeVisible();
});

test('a latency row opens its node in the list', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?tab=latency');
  const row = page.locator('.rp-markerplot .row .name').getByRole('link').first();
  const name = (await row.innerText()).trim();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`#/nodes\\?provider=[^&]+&q=${encodeURIComponent(name)}$`));
  await expect(page.getByRole('tab', {name: 'Nodes', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', {name: 'Search nodes', exact: true})).toHaveValue(name);
  await expect(page.getByRole('grid').last()).toContainText(name);
});

test('adding a node to a group offers the group on the policies page', async ({page}) => {
  await page.goto('/#/nodes?tab=list&provider=inline');
  await page.getByRole('button', {name: 'Add hk-01 to a group', exact: true}).click();
  await page.getByRole('menuitem', {name: /^gaming/}).click();
  const joined = page.locator('.rp-toast.positive', {hasText: 'gaming'});
  await joined.getByRole('button', {name: 'View group', exact: true}).click();
  await expect(page).toHaveURL(/#\/policies\?group=gaming$/);
  await expect(page.locator('#group-gaming')).toBeInViewport();
});

test('a node search looks through every source and names the source of each result', async ({page}) => {
  await page.goto('/#/nodes?provider=sub-c');
  const table = page.locator('.rp-table').nth(1);
  const list = rows(table);
  const source = table.getByRole('columnheader', {name: /^Source/});
  await expect(source).toHaveCount(0);
  await page.getByLabel('Search nodes').fill('hk-0');
  await expect(list).toHaveCount(2);
  await expect(list.first()).toContainText('hk-01');
  await expect(list.first()).toContainText('config.dae');
  await expect(source).toBeVisible();
  await expect(page.getByText('Search covers all node sources.', {exact: true})).toBeVisible();
  await page.getByLabel('Search nodes').fill('no-such-node');
  await expect(table.getByText('No matching nodes', {exact: true})).toBeVisible();
  await page.getByLabel('Search nodes').fill('');
  await expect(source).toHaveCount(0);
  await expect(list.first()).not.toContainText('config.dae');
});

test('a node write conflict names its cause, and only a delete without groups reads as a change meanwhile', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const [node, other] = (await api.nodes({limit: 1000})).nodes.filter(item => item.provider_id === 'inline');
  handlers[`DELETE nodes/${encodeURIComponent(node.id)}`] = async () => {
    throw new ApiError(409, 'state_conflict', 'Groups still name this node as their final outbound', null, {stage: 'state_conflict', groups: ['proxy']});
  };
  handlers[`DELETE nodes/${encodeURIComponent(other.id)}`] = async () => {
    throw new ApiError(409, 'state_conflict', 'Configuration changed during the write', null, {stage: 'state_conflict'});
  };
  handlers['POST nodes'] = async () => {
    throw new ApiError(409, 'state_conflict', 'A resource with this name already exists', null, {stage: 'state_conflict'});
  };
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: `Remove ${node.name}`, exact: true}).click();
  const confirmation = page.getByRole('alertdialog');
  await confirmation.getByRole('button', {name: `Remove ${node.name}`, exact: true}).click();
  await expect(confirmation.getByRole('alert')).toContainText('Groups still name this node as their final outbound');
  await confirmation.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('button', {name: `Remove ${other.name}`, exact: true}).click();
  await confirmation.getByRole('button', {name: `Remove ${other.name}`, exact: true}).click();
  await expect(confirmation.getByRole('alert')).toContainText('The configuration changed or another write was still in progress');
  await confirmation.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('button', {name: 'Paste node link', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(node.name);
  await dialog.getByLabel('Node link').fill('vless://uuid@example.com:443?security=tls#dup');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(dialog.getByRole('alert')).toContainText('A resource with this name already exists');
  await expect(dialog.getByRole('alert')).not.toContainText('changed or another write');
});

test("a subscription's URL is edited where its entry is written", async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit sub-c', 'More actions for sub-c');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription sub-c'});
  await expect(dialog.getByRole('textbox', {name: 'Name', exact: true})).toHaveValue('sub-c');
  await dialog.getByRole('textbox', {name: 'Subscription URL', exact: true}).fill('https://updated.example.net/sub?token=new');
  // The URL alone changed, so the groups citing the tag are not offered.
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Saved sub-c');
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText("sub-c: 'https://updated.example.net/sub?token=new'");
});

test('renaming a subscription carries the groups whose subtag filter names it', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const added = main.content!.replace('subscription {\n', "subscription {\n  sub-d: 'https://other.example.org/sub'\n");
  await api.pollOperation(await api.replaceConfigSource(main.id, added, `"${main.content_sha256}"`));
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit sub-c', 'More actions for sub-c');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription sub-c'});
  const name = dialog.getByRole('textbox', {name: 'Name', exact: true});
  // A tag another subscription uses is refused.
  await name.fill('sub-d');
  // The clash is named once, on the field.
  await expect(dialog.getByText('Another subscription already uses this name', {exact: true})).toHaveCount(1);
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  await name.fill('skylink-sub');
  await expect(dialog.getByRole('switch', {name: 'Also update the subscription filter in skylink', exact: true})).toBeChecked();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText("skylink-sub: 'https://sub.example.net/api/v1/client/subscribe?token=demo'");
  await expect(editor).toContainText('filter: subtag(skylink-sub)');
  await expect(editor).not.toContainText('subtag(sub-c)');
});

test('a subscription in a read-only source offers its source file instead of an edit', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    for (const source of config.sources) if (source.kind === 'main') source.writable = false;
    return config;
  };
  await page.goto('/#/nodes?tab=list');
  const sources = page.locator('.rp-table').first();
  const open = await moreItem(sources, 'Open source', 'More actions for sub-c');
  await expect(page.getByRole('menu', {name: 'More actions for sub-c'}).getByRole('menuitem', {name: 'Edit sub-c', exact: true})).toHaveCount(0);
  await open.click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=[^&]+&line=\d+/);
});

test('a subscription not fetched yet is edited through its name', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const added = main.content!.replace('subscription {\n', "subscription {\n  sub-d: 'https://wrong.example.org/sub'\n");
  await api.pollOperation(await api.replaceConfigSource(main.id, added, `"${main.content_sha256}"`));
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit sub-d', 'More actions for sub-d');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription sub-d'});
  await dialog.getByRole('textbox', {name: 'Subscription URL', exact: true}).fill('https://right.example.org/sub');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText("sub-d: 'https://right.example.org/sub'");
});

test('a group in another source naming the tag blocks a rename but not a URL edit', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    const main = config.sources.find(source => source.kind === 'main')!;
    const content = 'group {\n  roaming { filter: subtag(sub-c) policy: min_moving_avg }\n}\n';
    config.sources.push({...main, id: 'extra-groups', kind: 'include', path: 'groups.dae', content});
    return config;
  };
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit sub-c', 'More actions for sub-c');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription sub-c'});
  await dialog.getByRole('textbox', {name: 'Name', exact: true}).fill('skylink-sub');
  await expect(dialog.getByText('Groups in groups.dae also filter on sub-c. Edit them in their source file before renaming.', {exact: true})).toBeVisible();
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  // Keeping the name leaves a URL edit free.
  await dialog.getByRole('textbox', {name: 'Name', exact: true}).fill('sub-c');
  await dialog.getByRole('textbox', {name: 'Subscription URL', exact: true}).fill('https://updated.example.net/sub');
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeEnabled();
});

test('two subscriptions sharing a name offer their source file instead of an edit', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  // An untagged entry honk names after its host, beside a tagged entry of that name pointing elsewhere.
  const added = main.content!.replace('subscription {\n', "subscription {\n  'https://sub-c/sub'\n");
  await api.pollOperation(await api.replaceConfigSource(main.id, added, `"${main.content_sha256}"`));
  handlers['GET providers'] = async () => {
    const list = await api.providers();
    const tagged = list.providers.find(provider => provider.id === 'sub-c')!;
    return {...list, providers: [...list.providers, {...tagged, id: 'sub-c-untagged', url_redacted: 'https://sub-c/sub'}]};
  };
  await page.goto('/#/nodes?tab=list');
  const named = rows(page.locator('.rp-table').first()).filter({hasText: 'sub-c'});
  await expect(named).toHaveCount(2);
  for (const row of [named.first(), named.last()]) {
    await expect(await moreItem(row, 'Open source', 'More actions for sub-c')).toBeVisible();
    await expect(page.getByRole('menu', {name: 'More actions for sub-c'}).getByRole('menuitem', {name: 'Edit sub-c', exact: true})).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
});

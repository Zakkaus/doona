import {freshBackend} from './getting-started';
import type {Locator} from '@playwright/test';
import {editorText, box} from './fixtures';
import {expect, expectFittedGroupTags, mockBackend, query, settle, test, moreAction, moreItem} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import {sha256} from '../src/api/hash';
import type {ProbeResult, Provider} from '../src/api/model';

type ProbeResultItem = ProbeResult['results'][number];

const nodeRows = (page: import('@playwright/test').Page) => page.locator('.rp-table').nth(1).locator('[role=row][data-key]');

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

test('node cell content starts at its header text, including latency and action icons', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?provider=inline');
  const table = page.locator('.rp-table').nth(1);
  await expect(rows(table)).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
  for (const label of ['Protocol', 'Latency', 'Groups', 'Actions']) {
    const header = table.getByRole('columnheader', {name: new RegExp(`^${label}`)});
    const index = await header.evaluate(el => [...el.parentElement!.children].indexOf(el));
    const cell = rows(table).first().locator('[role=rowheader], [role=gridcell]').nth(index);
    const headerLeft = await header.locator('.rp-th').evaluate(el => {
      const range = document.createRange();
      range.selectNodeContents(el.firstChild!);
      return range.getBoundingClientRect().left;
    });
    const contentLeft = await cell.evaluate((el, label) => {
      if (label === 'Actions') return el.querySelector('svg')!.getBoundingClientRect().left;
      if (label === 'Latency' || label === 'Groups') return el.firstElementChild!.getBoundingClientRect().left;
      const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange();
      range.selectNodeContents(text);
      return range.getBoundingClientRect().left;
    }, label);
    expect(Math.abs(contentLeft - headerLeft), label).toBeLessThanOrEqual(2);
    if (label === 'Latency') expect(await cell.evaluate(el => getComputedStyle(el).fontVariantNumeric)).toBe('tabular-nums');
  }
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

test('include declarations block removal even when the main source also declares them', async ({page}) => {
  const {api} = await mockBackend(page);
  const reason = 'Declared outside the main configuration file. Remove it from that file.';
  const content = "subscription {\n  edge: 'https://edge.example.net/sub'\n}\nnode {\n  'eu-01': 'trojan://demo@eu-01.example.net:443#eu-01'\n}\n";
  await api.pollOperation(await api.createConfigSource('config.d/edge.dae', content));
  await page.goto('/#/nodes?provider=inline');
  const removeNode = (name: string) => page.getByRole('button', {name: `Remove ${name}`, exact: true});
  await expect(removeNode('hk-01')).toBeEnabled();
  await expect(removeNode('eu-01')).toBeDisabled();
  const sources = page.locator('.rp-table').first();
  const harbor = await moreItem(sources, 'Remove harbor', 'More actions for harbor');
  await expect(harbor).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  const edge = await moreItem(sources, 'Remove edge', 'More actions for edge');
  await expect(edge).toHaveAttribute('aria-disabled', 'true');
  await expect(edge).toContainText(reason);
  await page.keyboard.press('Escape');

  const duplicate =
    "subscription {\n  harbor: 'https://sub.example.net/api/v1/client/subscribe?token=demo'\n}\nnode {\n  hk-01: 'vless://demo@hk-01.example.net:443?security=tls#hk-01'\n}\n";
  await api.pollOperation(await api.createConfigSource('config.d/duplicate.dae', duplicate));
  await page.reload();
  await expect(removeNode('hk-01')).toBeDisabled();
  const duplicatedProvider = await moreItem(sources, 'Remove harbor', 'More actions for harbor');
  await expect(duplicatedProvider).toHaveAttribute('aria-disabled', 'true');
  await expect(duplicatedProvider).toContainText(reason);
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
  const added = page.locator('.rp-toast.positive', {hasText: 'sub-d added and updated, 0 nodes'});
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
  await moreAction(page.locator('body'), 'Remove sub-d', 'More actions for sub-d');
  const removal = page.getByRole('alertdialog', {name: 'Remove node source sub-d', exact: true});
  await expect(removal).toContainText('Deletes this node source and its nodes from the main configuration and reloads.');
  await removal.getByRole('button', {name: 'Remove sub-d', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-d removed'})).toBeVisible();
  await expect(sources).toHaveCount(2);
  await expect(sources.filter({hasText: 'sub-d'})).toHaveCount(0);
});

test('a subscription a group filters on cannot be removed until the group changes', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    const main = config.sources.find(source => source.kind === 'main')!;
    const content = 'group {\n  travel { filter: subtag(harbor) && !name(keyword: HK) policy: min_moving_avg }\n}\n';
    config.sources.push({...main, id: 'extra-groups', kind: 'include', path: 'groups.dae', content});
    return config;
  };
  let deleted = false;
  handlers['DELETE providers/harbor'] = async () => {
    deleted = true;
    return api.deleteProvider('harbor');
  };
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Remove harbor', 'More actions for harbor');
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Groups that filter on harbor: backup, travel. Change their filters on the Policies page first.');
  await expect(confirmation.getByRole('button', {name: 'Remove harbor', exact: true})).toHaveCount(0);
  await expect(confirmation.getByRole('button')).toHaveText(['Close']);
  await confirmation.getByRole('link', {name: 'Open Policies', exact: true}).click();
  await expect(page).toHaveURL(/#\/policies/);
  await expect(confirmation).toHaveCount(0);
  expect(deleted).toBe(false);
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
  await expect(page.locator('.rp-toast.negative', {hasText: 'sub-f was written to the configuration, but could not be updated'})).toBeVisible();
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
  await expect(dialog.getByRole('button', {name: 'Auto-update'})).toContainText('Every 24 hours');
  await expect(dialog.getByLabel('User-Agent')).toHaveAttribute('placeholder', 'honk/0.0.1-alpha');
  await expect(dialog.getByRole('switch', {name: 'Cache the subscription'})).toBeChecked();
  await dialog.getByRole('button', {name: 'Auto-update'}).click();
  await page.getByRole('option', {name: 'Every 6 hours', exact: true}).click();
  await dialog.getByLabel('User-Agent').fill('agent\u00e9');
  await expect(dialog.getByText('Up to 256 printable ASCII characters')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Add', exact: true})).toBeDisabled();
  await dialog.getByLabel('User-Agent').fill('clash.meta');
  await dialog.getByText('Cache the subscription').click();
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-o added and updated'})).toBeVisible();
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(
    "sub-o: {\n    url: 'https://example.org/sub?token=abc'\n    ua: 'clash.meta'\n    interval: '21600s'\n    cache: false\n  }"
  );
});

test('a cold Nodes page finishes the first refresh after selecting a new subscription', async ({page}) => {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
  });
  let fetched = false;
  let release = () => {};
  const pending = new Promise<void>(resolve => (release = resolve));
  await page.route(/\/Nodes-[\w-]+\.js$/, async route => {
    fetched = true;
    await pending;
    await route.continue();
  });
  const {api, handlers} = await mockBackend(page);
  let showVersion = () => {};
  const version = new Promise<void>(resolve => (showVersion = resolve));
  handlers['GET version'] = async () => {
    await version;
    return api.version();
  };
  let finish = () => {};
  const refreshing = new Promise<void>(resolve => (finish = resolve));
  handlers['POST providers/sub-cold/refresh'] = async () => {
    await refreshing;
    return api.refreshProvider('sub-cold');
  };
  await page.goto('/#/nodes?tab=list', {waitUntil: 'domcontentloaded'});
  await expect.poll(() => fetched).toBe(true);
  await expect(page.locator('.rp-content .rp-empty[role="status"]')).toBeVisible();
  release();
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('sub-cold');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/plain');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page).toHaveURL(/provider=sub-cold$/);
  finish();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-cold added and updated'})).toBeVisible();
  showVersion();
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toContain("  sub-cold: 'https://example.org/plain'\n");
});

test('an untouched option is left to the backend and an unadvertised one is not shown', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.providers.create_options = {user_agent: 'honk/0.0.1-alpha'};
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('User-Agent')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Auto-update'})).toHaveCount(0);
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await dialog.getByLabel('Name').fill('sub-p');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/plain');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-p added and updated'})).toBeVisible();
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

test('an unavailable latency fits its column in English at 1440 px', async ({page}) => {
  await udpOnlyNode(page, row => row);
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?provider=inline');
  const latency = rows(page.locator('.rp-table').nth(1)).filter({hasText: 'hk-01'}).locator('.ms.err');
  await expect(latency).toHaveText('Unavailable');
  const {text, room} = await latency.evaluate(el => {
    const cell = el.closest<HTMLElement>('[role="gridcell"]')!;
    const style = getComputedStyle(cell);
    return {text: el.getBoundingClientRect().width, room: cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)};
  });
  expect(text).toBeLessThanOrEqual(room);
});

test('group tags fit their column at 1440 px, the rest behind a +N tag', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes');
  await page.evaluate(() => document.fonts.ready);
  await expectFittedGroupTags(page);
});

test('a long unavailable node name wraps inside the latency card', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const long = 'L' + 'o'.repeat(180) + 'ng';
  handlers['GET nodes'] = async () => {
    const list = await api.nodes({limit: 1000});
    const node = list.nodes.find(node => node.group_ids.length)!;
    const unavailable = node.health.map(health => ({...health, state: 'unavailable' as const, latency_ms: null, error: 'probe_failed'}));
    return {...list, nodes: list.nodes.map(each => (each === node ? {...node, name: long, health: unavailable} : each))};
  };
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?tab=latency');
  // The node sits in more than one group, and each group lists it.
  const notes = page.locator('.rp-markerplot .note', {hasText: long});
  await expect(notes.first()).toBeVisible();
  expect(await notes.evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
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
    await page.goto('/#/nodes?provider=harbor');
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
  await expect(sources.first()).toContainText('harbor');
  const nodes = page.locator('.rp-table').nth(1).locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(nodes.first()).toBeVisible();
  expect(await nodes.count()).toBeGreaterThan(10);
  await sources.nth(1).click();
  await expect(page).toHaveURL(/provider=inline$/);
  await expect(nodes).toHaveCount(5);
  await page.getByRole('button', {name: 'Update harbor', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('harbor updated, 120 nodes');
});

test('a subscription refresh interval is written into the configuration', async ({page}) => {
  await page.goto('/#/config?tab=source');
  const editor = page.locator('.cm-content');
  const original = (await createMockApi().config()).sources.find(source => source.kind === 'main')!.content!;
  await editor.fill(
    original.replace(
      "harbor: 'https://sub.example.net/api/v1/client/subscribe?token=demo'",
      "harbor: {\n    url: 'https://sub.example.net/api/v1/client/subscribe?token=demo'\n    interval: '86400s'\n  }"
    )
  );
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  await page.goto('/#/nodes?tab=list');
  const sources = page.locator('.rp-table').first().locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(sources.first()).toContainText('Every 24 hours');
  await expect(sources.nth(1)).not.toContainText('Every');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  await page.getByRole('dialog').getByRole('button', {name: 'Auto-update'}).click();
  await page.getByRole('option', {name: 'Every 6 hours', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(sources.first()).toContainText('Every 6 hours');
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(
    "harbor: {\n    url: 'https://sub.example.net/api/v1/client/subscribe?token=demo'\n    interval: '6h'\n  }"
  );
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  await page.getByRole('dialog').getByRole('button', {name: 'Auto-update'}).click();
  await page.getByRole('option', {name: 'Manual only', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Apply', exact: true}).click();
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
  const subscription = rows(page.locator('.rp-table').first()).filter({hasText: 'harbor'});
  await expect(subscription).toBeVisible();
  await expect(subscription).not.toContainText('Every 24 hours');
  await expect(subscription).not.toContainText('Manual only');
  await expect(subscription.getByRole('link')).toHaveCount(0);
  await moreAction(subscription, 'Edit harbor', 'More actions for harbor');
  await expect(page.getByRole('dialog', {name: 'Edit subscription harbor'})).toBeVisible();
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
  const sources = page.getByRole('grid', {name: 'Node sources', exact: true});
  await expect(sources.getByRole('row')).toHaveCount(3);
  // A heading, two rows and the frame: no placeholder height left over from loading.
  await expect.poll(async () => (await box(page.locator('.rp-table', {has: sources}))).height).toBeLessThanOrEqual(2 + 37 + 2 * 40 + 1);
  const protocol = page.locator('.rp-table .rp-truncate', {hasText: /^shadowsocks$/}).first();
  expect(await whole(protocol)).toBe(true);
  await page.goto('/#/settings');
  const geodata = page.getByRole('grid', {name: 'Geodata', exact: true});
  await expect(geodata.getByRole('row')).toHaveCount(3);
  await expect.poll(async () => (await box(page.locator('.rp-table', {has: geodata}))).height).toBeLessThanOrEqual(2 + 37 + 2 * 40 + 1);
  // The release address is cut inside its column, not past the table's edge.
  const table = await box(page.locator('.rp-table', {has: geodata}));
  const source = await box(geodata.getByRole('row').nth(1).getByRole('gridcell').last());
  expect(source.x + source.width).toBeLessThanOrEqual(table.x + table.width + 1);
});

test('the note about node sources belongs to the list, not the latency tab', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/nodes');
  const note = page.getByText('Manage subscriptions, files and inline nodes.', {exact: true});
  await expect(note).toBeVisible();
  const help = page.getByRole('button', {name: 'About Nodes', exact: true});
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', {name: 'Nodes', exact: true})).toContainText('changes are written to the main configuration and reloaded.');
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  await page.getByRole('tab', {name: 'Latency', exact: true}).click();
  await expect(page.getByRole('tabpanel', {name: 'Latency'}).getByRole('region', {name: 'Node latency'})).toBeVisible();
  await expect(note).toBeHidden();
});

test('the source kind badge shows its whole label in every language', async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  for (const lang of ['en', 'zh-TW', 'zh-CN']) {
    await page.evaluate(value => localStorage.setItem('doona-lang', value), lang);
    await settle(page);
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
  handlers['POST providers/harbor/refresh'] = async () => ({
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
  await page.getByRole('button', {name: 'Update harbor', exact: true}).click();
  await expect(page.locator('.rp-toast.warning')).toContainText('harbor: nodes applied, but the datapath did not recover');
  await expect(page.locator('.rp-toast.negative')).toHaveCount(0);
});

test('the node list names its source, groups a node by a labelled menu, and refreshes every subscription', async ({page}) => {
  await page.goto('/#/nodes?tab=list&provider=inline');
  await expect(page.getByText('Showing nodes from config.dae. Choose another node source above to view its nodes.', {exact: true})).toBeVisible();
  const join = page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true});
  await expect(join).toHaveAccessibleName('Node actions');
  await expect(join).toHaveText('');
  await page.getByRole('button', {name: 'Update subscription (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Subscriptions updated: 1 of 1'})).toBeVisible();
});

test('a latency row opens its node in the list', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?tab=latency');
  const row = page.locator('.rp-markerplot .row .name').getByRole('link').first();
  const name = (await row.innerText()).trim();
  const api = createMockApi();
  const node = (await api.nodes({limit: 1000})).nodes.find(node => node.name === name)!;
  expect(node.provider_id).toBeTruthy();
  await row.click();
  await expect(page).toHaveURL(url => {
    const [path, search] = url.hash.slice(1).split('?');
    const params = new URLSearchParams(search);
    return path === '/nodes' && params.get('provider') === node.provider_id && params.get('q') === name;
  });
  await expect(page.getByRole('tab', {name: 'Nodes', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', {name: 'Search nodes', exact: true})).toHaveValue(name);
  await expect(page.getByRole('grid').last()).toContainText(name);
});

test('adding a node to a group opens its staged editor on the policies page', async ({page}) => {
  await page.goto('/#/nodes?tab=list&provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  const menu = page.getByRole('menu', {name: 'Node actions', exact: true});
  await expect(menu.getByRole('menuitem')).toHaveText(['Edit…', 'Add to group', 'Change flag…']);
  await menu.getByRole('menuitem', {name: 'Add to group', exact: true}).click();
  const submenu = page.getByRole('menu', {name: 'Add to group', exact: true});
  await expect(submenu.locator('[slot=description]')).toHaveCount(0);
  await expect(submenu.getByRole('separator')).toBeVisible();
  await submenu.getByRole('menuitem', {name: 'gaming', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming', exact: true});
  await expect(dialog.getByRole('group', {name: 'Includes', exact: true})).toContainText('hk-01');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/#\/policies\?group=gaming$/);
  await expect(page.locator('#group-gaming')).toBeInViewport();
});

for (const width of [1440, 390])
  test(`node group submenu supports keyboard entry, return and creation at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/nodes?provider=inline');
    const trigger = page
      .getByRole('row')
      .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
      .getByRole('button', {name: 'Node actions', exact: true});
    await trigger.click();
    const join = page.getByRole('menuitem', {name: 'Add to group', exact: true});
    await join.focus();
    await page.keyboard.press('ArrowRight');
    const submenu = page.getByRole('menu', {name: 'Add to group', exact: true});
    await expect(submenu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(submenu).toHaveCount(0);
    await expect(join).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(submenu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(submenu.getByRole('menuitem', {name: 'New group…', exact: true})).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'New group', exact: true});
    await expect(dialog.getByRole('button', {name: 'Remove hk-01', exact: true})).toBeVisible();
  });

test('long group lists scroll inside the submenu and omit existing memberships', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  const groups = Array.from({length: 40}, (_, i) => `choice-${i} { filter: name(jp-01) policy: min_last_delay }`).join('\n');
  main.content = main.content.replace('group {', `group {\nalready { filter: name(hk-01) }\n${groups}\n`);
  main.content_sha256 = await sha256(main.content);
  handlers['GET config'] = async () => config;
  await page.goto('/#/nodes?provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  await page.getByRole('menuitem', {name: 'Add to group', exact: true}).click();
  const submenu = page.getByRole('menu', {name: 'Add to group', exact: true});
  await expect(submenu.getByRole('menuitem', {name: 'already', exact: true})).toHaveCount(0);
  expect(await submenu.evaluate(el => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto')).toBe(true);
  await submenu.evaluate(el => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(submenu.getByRole('menuitem', {name: 'choice-39', exact: true})).toHaveText('choice-39');
  await expect(submenu.getByRole('menuitem', {name: 'choice-39', exact: true})).toBeInViewport();
  await submenu.getByRole('menuitem', {name: 'New group…', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'New group', exact: true})).toBeVisible();
});

test('a node search looks through every source and names the source of each result', async ({page}) => {
  await page.goto('/#/nodes?provider=harbor');
  const table = page.locator('.rp-table').nth(1);
  const list = rows(table);
  const source = table.getByRole('columnheader', {name: /^Node source/});
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
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  await expect(dialog.getByRole('textbox', {name: 'Name', exact: true})).toHaveValue('harbor');
  await dialog.getByRole('textbox', {name: 'Subscription URL', exact: true}).fill('https://updated.example.net/sub?token=new');
  // The URL alone changed, so the groups citing the tag are not offered.
  await expect(dialog.getByRole('switch', {name: /^Also update/})).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Saved harbor');
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText("harbor: 'https://updated.example.net/sub?token=new'");
});

test("a subscription's User-Agent is set and removed where its entry is written", async ({page}) => {
  const url = 'https://sub.example.net/api/v1/client/subscribe?token=demo';
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  let dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  const agent = dialog.getByRole('textbox', {name: 'User-Agent', exact: true});
  await expect(agent).toHaveValue('');
  await expect(dialog.getByText('Leave empty to use the engine default.', {exact: true})).toBeVisible();
  await agent.fill('clash.meta');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(`harbor: '${url}'(clash.meta)`);
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  await expect(dialog.getByRole('textbox', {name: 'User-Agent', exact: true})).toHaveValue('clash.meta');
  // The User-Agent has its own field, so it is not listed again among the options kept as written.
  await expect(dialog.getByText('Other options, kept as written', {exact: true})).toHaveCount(0);
  await dialog.getByRole('textbox', {name: 'User-Agent', exact: true}).fill('');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(`harbor: '${url}'`);
  await expect(page.locator('.cm-content')).not.toContainText('clash.meta');
});

test("a subscription's download route is written into its entry and removed again", async ({page}) => {
  const url = 'https://sub.example.net/api/v1/client/subscribe?token=demo';
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  let dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  const route = dialog.getByRole('button', {name: 'Download route'});
  await expect(route).toContainText('By routing rules');
  await route.click();
  await page.getByRole('option', {name: 'Direct', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(`harbor: {\n    url: '${url}'\n    route: direct\n  }`);
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  await expect(dialog.getByRole('button', {name: 'Download route'})).toContainText('Direct');
  await expect(dialog.getByText('Other options, kept as written', {exact: true})).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Download route'}).click();
  await page.getByRole('option', {name: 'By routing rules', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText(`harbor: {\n    url: '${url}'\n  }`);
  await expect(page.locator('.cm-content')).not.toContainText('route: direct');
});

test('an engine that fetches subscriptions only directly offers no download route', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET providers'] = async () => {
    const list = await api.providers();
    return {...list, providers: list.providers.map(({download: _download, ...provider}) => provider)};
  };
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  await expect(dialog.getByRole('textbox', {name: 'User-Agent', exact: true})).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Download route'})).toHaveCount(0);
});

test('changing the interval of a block-form subscription keeps its User-Agent', async ({page}) => {
  const {api} = await mockBackend(page);
  const url = 'https://sub.example.net/api/v1/client/subscribe?token=demo';
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const block = main.content!.replace(`harbor: '${url}'`, `harbor: '${url}' {\n    ua: 'clash.meta'\n    interval: 1h\n  }`);
  await api.pollOperation(await api.replaceConfigSource(main.id, block, `"${main.content_sha256}"`));
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  await page.getByRole('dialog').getByRole('button', {name: 'Auto-update'}).click();
  await page.getByRole('option', {name: 'Every 6 hours', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText(`harbor: '${url}' {\n    ua: 'clash.meta'\n    interval: 6h\n  }`);
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  await expect(dialog.getByRole('textbox', {name: 'User-Agent', exact: true})).toHaveValue('clash.meta');
  await expect(dialog.getByRole('button', {name: 'Auto-update'})).toContainText('Every 6 hours');
  await expect(dialog.getByText('Other options, kept as written', {exact: true})).toHaveCount(0);
});

test('renaming a subscription carries the groups whose subtag filter names it', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const added = main.content!.replace('subscription {\n', "subscription {\n  sub-d: 'https://other.example.org/sub'\n");
  await api.pollOperation(await api.replaceConfigSource(main.id, added, `"${main.content_sha256}"`));
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  const name = dialog.getByRole('textbox', {name: 'Name', exact: true});
  // A tag another subscription uses is refused.
  await name.fill('sub-d');
  // The clash is named once, on the field.
  await expect(dialog.getByText('Another subscription already uses this name', {exact: true})).toHaveCount(1);
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  await name.fill('backup-sub');
  await expect(dialog.getByRole('switch', {name: 'Also update the subscription filter in backup', exact: true})).toBeChecked();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/config?tab=source');
  const editor = await editorText(page);
  expect(editor).toContain("backup-sub: 'https://sub.example.net/api/v1/client/subscribe?token=demo'");
  expect(editor).toContain('filter: subtag(backup-sub)');
  expect(editor).not.toContain('subtag(harbor)');
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
  const open = await moreItem(sources, 'Open config file', 'More actions for harbor');
  await expect(page.getByRole('menu', {name: 'More actions for harbor'}).getByRole('menuitem', {name: 'Edit harbor', exact: true})).toHaveCount(0);
  await open.click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=[^&]+&line=\d+/);
});

test('a subscription never fetched says so and refreshes from its row', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const added = main.content!.replace('subscription {\n', "subscription {\n  sub-d: 'https://example.org/sub'\n");
  await api.pollOperation(await api.replaceConfigSource(main.id, added, `"${main.content_sha256}"`));
  await page.goto('/#/nodes?tab=list');
  const row = rows(page.locator('.rp-table').first()).filter({hasText: 'sub-d'});
  await expect(row).toContainText('Not fetched');
  await expect(row.getByRole('button', {name: 'Fetch now'})).toHaveCount(0);
  await row.getByRole('button', {name: 'Update sub-d', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-d updated'})).toBeVisible();
  await expect(row).toContainText('OK');
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
    const content = 'group {\n  travel { filter: subtag(harbor) policy: min_moving_avg }\n}\n';
    config.sources.push({...main, id: 'extra-groups', kind: 'include', path: 'groups.dae', content});
    return config;
  };
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  await dialog.getByRole('textbox', {name: 'Name', exact: true}).fill('backup-sub');
  await expect(dialog.getByText('Groups that filter on harbor: backup, travel. Change their filters on the Policies page first.')).toBeVisible();
  await expect(dialog.getByRole('link', {name: 'Open Policies', exact: true})).toHaveAttribute('href', '#/policies');
  await expect(dialog.getByRole('switch', {name: /^Also update/})).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  // Keeping the name leaves a URL edit free.
  await dialog.getByRole('textbox', {name: 'Name', exact: true}).fill('harbor');
  await dialog.getByRole('textbox', {name: 'Subscription URL', exact: true}).fill('https://updated.example.net/sub');
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeEnabled();
});

test('two subscriptions sharing a name offer their source file instead of an edit', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  // An untagged entry honk names after its host, beside a tagged entry of that name pointing elsewhere.
  const added = main.content!.replace('subscription {\n', "subscription {\n  'https://harbor/sub'\n");
  await api.pollOperation(await api.replaceConfigSource(main.id, added, `"${main.content_sha256}"`));
  handlers['GET providers'] = async () => {
    const list = await api.providers();
    const tagged = list.providers.find(provider => provider.id === 'harbor')!;
    return {...list, providers: [...list.providers, {...tagged, id: 'harbor-untagged', url_redacted: 'https://harbor/sub'}]};
  };
  await page.goto('/#/nodes?tab=list');
  const named = rows(page.locator('.rp-table').first()).filter({hasText: 'harbor'});
  await expect(named).toHaveCount(2);
  for (const row of [named.first(), named.last()]) {
    await expect(await moreItem(row, 'Open config file', 'More actions for harbor')).toBeVisible();
    await expect(page.getByRole('menu', {name: 'More actions for harbor'}).getByRole('menuitem', {name: 'Edit harbor', exact: true})).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
});

test('a subscription in a writable include is edited while the main source is read-only', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    const main = config.sources.find(source => source.kind === 'main')!;
    const entry = main.content!.match(/^\s*harbor:.*$/m)![0];
    main.content = main.content!.replace(entry + '\n', '');
    main.content_sha256 = await sha256(main.content);
    main.writable = false;
    const content = 'subscription {\n' + entry + '\n}\n';
    config.sources.push({...main, id: 'subs', kind: 'include', path: 'subs.dae', writable: true, content, content_sha256: await sha256(content)});
    return config;
  };
  await page.goto('/#/nodes?tab=list');
  const edit = await moreItem(page.locator('.rp-table').first(), 'Edit harbor', 'More actions for harbor');
  await expect(edit).toBeEnabled();
  await edit.click();
  await expect(page.getByRole('dialog', {name: 'Edit subscription harbor'})).toBeVisible();
});

test('an edit refused because the file changed saves over the file as it is now, keeping what was typed', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  const url = dialog.getByRole('textbox', {name: 'Subscription URL', exact: true});
  await url.fill('https://updated.example.net/sub');
  // Another editor changes the file while the dialog is open.
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const changed = '# edited elsewhere\n' + main.content!;
  await api.pollOperation(await api.replaceConfigSource(main.id, changed, `"${main.content_sha256}"`));
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  await apply.click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(url).toHaveValue('https://updated.example.net/sub');
  await apply.click();
  await expect(dialog).toHaveCount(0);
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(2);
  const saved = (await api.config()).sources.find(source => source.id === main.id)!.content!;
  expect(saved.startsWith('# edited elsewhere\n')).toBe(true);
  expect(saved).toContain("harbor: 'https://updated.example.net/sub'");
});

test('an edit refused because the entry left its file says so on the next save', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/nodes?tab=list');
  await moreAction(page.locator('body'), 'Edit harbor', 'More actions for harbor');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  await dialog.getByRole('textbox', {name: 'Subscription URL', exact: true}).fill('https://updated.example.net/sub');
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const removed = main.content!.replace(/^\s*harbor:.*\n/m, '');
  await api.pollOperation(await api.replaceConfigSource(main.id, removed, `"${main.content_sha256}"`));
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  await apply.click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await apply.click();
  await expect(dialog.getByRole('alert')).toContainText('This subscription is no longer in its config file');
});

test('with no subscription and no node the page says so and offers Add subscription', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET providers'] = async () => ({providers: [], next_cursor: null});
  backend.handlers['GET nodes'] = async () => ({observed_at: new Date().toISOString(), nodes: [], next_cursor: null});
  await page.goto('/#/nodes');
  const empty = page.locator('.rp-empty', {hasText: 'No subscriptions or proxy nodes are available.'});
  await expect(empty).toBeVisible();
  await expect(page.locator('.rp-table')).toHaveCount(0);
  await expect(page.getByRole('searchbox', {name: 'Search nodes'})).toHaveCount(0);
  await expect(page.getByRole('columnheader')).toHaveCount(0);
  await expect(empty.getByRole('button', {name: 'Paste node link', exact: true})).toBeVisible();
  await empty.getByRole('button', {name: 'Add subscription', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Add subscription'})).toBeVisible();
});

test('the add-subscription parameter is consumed when subscriptions cannot be managed', async ({page}) => {
  const backend = await mockBackend(page);
  backend.capabilities.resources.providers.can_manage = false;
  await page.goto('/#/nodes?add=subscription&tab=list&q=first&provider=inline');
  await expect(page.getByRole('heading', {name: 'Nodes', exact: true})).toBeVisible();
  await expect(page).toHaveURL(/#\/nodes\?tab=list&q=first&provider=inline$/);
  await expect(page.getByRole('dialog', {name: 'Add subscription', exact: true})).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Nodes', exact: true})).toBeVisible();
  await expect(page).toHaveURL(/#\/nodes\?tab=list&q=first&provider=inline$/);
});

test('the add-subscription address is consumed across history and reload', async ({page}) => {
  await freshBackend(page);
  await page.goto('/#/activity');
  await expect(page.getByRole('region', {name: 'Getting started'})).toBeVisible();
  await page.evaluate(() => {
    location.hash = '/nodes?add=subscription&tab=list&q=first&provider=inline';
  });
  const dialog = page.getByRole('dialog', {name: 'Add subscription', exact: true});
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#\/nodes\?tab=list&q=first&provider=inline$/);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.goBack();
  await expect(page.getByRole('region', {name: 'Getting started'})).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/#\/nodes\?tab=list&q=first&provider=inline$/);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Nodes', exact: true})).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('latency names wrap across the phone fact row', async ({page}) => {
  await page.setViewportSize({width: 390, height: 1000});
  await page.goto('/#/nodes?tab=latency');
  const names = page.locator('.rp-fact-name');
  await expect(names).toHaveCount(2);
  for (const name of await names.all()) {
    const geometry = await name.evaluate(el => {
      const value = el.querySelector('.rp-big')!;
      return {
        width: el.getBoundingClientRect().width,
        parent: el.parentElement!.getBoundingClientRect().width,
        scroll: value.scrollWidth,
        client: value.clientWidth,
        font: getComputedStyle(value).fontSize
      };
    });
    expect(geometry.width).toBe(geometry.parent);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);
    expect(geometry.font).toBe('22px');
  }
});

test('node source help is contextual', async ({page}) => {
  await page.goto('/#/nodes');
  const help = page.getByRole('button', {name: 'About Nodes', exact: true});
  await help.click();
  await expect(page.locator('.rp-popover')).toContainText('main configuration');
});

test('node editing writes in place and renames group references', async ({page}) => {
  const {api} = await mockBackend(page);
  let source = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(
    await api.replaceConfigSource(source.id, source.content.replace('filter: name(jp-01, hk-02)', 'filter: name(hk-01, hk-02)'), `"${source.content_sha256}"`)
  );
  source = (await api.config()).sources.find(source => source.kind === 'main')!;
  await page.goto('/#/nodes?provider=inline');
  const row = nodeRows(page).filter({hasText: 'hk-01'});
  await row.getByRole('button', {name: 'Node actions', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Edit…', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit node hk-01'});
  await dialog.getByLabel('Name', {exact: true}).fill('edge one');
  await dialog.getByLabel('Node link', {exact: true}).fill('socks5://127.0.0.1:1080');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(nodeRows(page).filter({hasText: 'edge one'})).toBeVisible();
  const saved = (await api.config()).sources.find(item => item.id === source.id)!.content;
  expect(saved).toBe(
    source.content
      .replace("'hk-01': 'vless://demo@hk-01.example.net:443?security=tls#hk-01'", "'edge one': 'socks5://127.0.0.1:1080'")
      .replaceAll('name(hk-01', "name('edge one'")
      .replace('default: hk-01', "default: 'edge one'")
  );
});

test('missing latency names and the remaining count open probeable node rows', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const listed = await api.nodes();
  const original = listed.nodes.find(node => node.name === 'hk-01')!;
  listed.nodes = Array.from({length: 9}, (_, index) => ({
    ...original,
    id: `missing-${index}`,
    name: `missing-${index}`,
    health: original.health.map(health => ({...health, state: index === 0 ? ('unavailable' as const) : ('unknown' as const), latency_ms: null}))
  }));
  handlers['GET nodes'] = async () => ({...listed, next_cursor: null});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/nodes?tab=latency');
  await page.getByRole('link', {name: 'missing-0', exact: true}).first().click();
  await expect(page).toHaveURL(/provider=inline.*q=missing-0.*node=missing-0/);
  await expect(nodeRows(page)).toHaveCount(1);
  await expect(page.getByRole('button', {name: 'Test missing-0', exact: true})).toBeVisible();
  await page.goto('/#/nodes?tab=latency');
  await page.getByRole('link', {name: '2 more', exact: true}).first().click();
  await expect(nodeRows(page)).toHaveCount(8);
  await expect(page.getByRole('button', {name: 'Test missing-8', exact: true})).toBeVisible();
  await page.reload();
  await expect(nodeRows(page)).toHaveCount(8);
  const selectedUrl = page.url();
  await page.goto('/#/nodes?group=missing-group');
  await expect(nodeRows(page)).toHaveCount(0);
  await page.goto(selectedUrl);
  await expect(nodeRows(page)).toHaveCount(8);
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page).not.toHaveURL(/nodes=/);
  await page.locator('.rp-table').first().locator('[role=row][data-key=inline]').click();
  await expect(nodeRows(page)).toHaveCount(9);
});

test('the interval jump edits the declaring include while the main file is read-only', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  let include = "subscription {\n  harbor: 'https://sub.example.net/api/v1/client/subscribe?token=demo' # keep\n}\n";
  handlers['GET config'] = async () => {
    const config = await api.config();
    const source = config.sources.find(source => source.kind === 'main')!;
    source.content = source.content.replace(/^\s*harbor:.*\n/m, '');
    source.content_sha256 = await sha256(source.content);
    source.writable = false;
    config.sources.push({...source, id: 'subs', path: 'subs.dae', kind: 'include', writable: true, content: include, content_sha256: await sha256(include)});
    return config;
  };
  handlers['PUT config/sources/subs'] = async request => {
    expect(request.headers()['if-match']).toBe(`"${await sha256(include)}"`);
    include = request.postDataJSON().content;
    return api.replaceConfigSource(main.id, main.content, `"${main.content_sha256}"`);
  };
  await page.goto('/#/nodes?editSubscription=harbor&focus=interval');
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  const interval = dialog.getByRole('button', {name: 'Auto-update'});
  await expect(interval).toBeFocused();
  await expect(page).not.toHaveURL(/editSubscription|focus=/);
  await page.keyboard.press('Enter');
  await page.getByRole('option', {name: 'Every 6 hours', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(include).toBe("subscription {\n  harbor: { # keep\n    url: 'https://sub.example.net/api/v1/client/subscribe?token=demo'\n    interval: 6h\n  }\n}\n");
  expect(requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname)).toEqual(['/api/v1/config/sources/subs']);
});

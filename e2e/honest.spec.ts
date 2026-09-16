import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

test('native activity uses API version and events without demo mode controls', async ({page}) => {
  const version = await createMockApi().version();
  await page.clock.install();
  await page.goto('/#/activity');
  await expect(page.locator('.rp-version')).toHaveText(`${version.engine.name} ${version.engine.version}`);
  await expect(page.getByRole('radiogroup', {name: 'Mode', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Global target', exact: true})).toHaveCount(0);
  const notifications = page.getByRole('region', {name: 'Notifications'});
  await page.clock.fastForward(5100);
  await expect(notifications.getByRole('listitem').filter({hasText: 'runtime.updated'}).first()).toContainText('/api/v1/runtime');
  await expect(page.locator('.rp-tile-val .rp-delta')).toHaveCount(0);
  await page.goto('/#/connections?id=2');
  const detail = page.locator('.rp-card').filter({has: page.getByRole('heading', {name: 'cdn.bilibili.com'})});
  await expect(detail).toBeVisible();
  await expect(detail.locator('.rp-btn.accent')).toHaveCount(0);
  await page.goto('/#/events');
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('search reads live connection addresses, node and group names, and available pages', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const connections = await api.connections();
  const connection = connections.tcp[0];
  connection.id = 'live/id:1';
  connection.domain = 'live-search.example';
  connection.dst = '198.51.100.42:443';
  connection.src = '192.0.2.42:3210';
  const nodes = await api.nodes();
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
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog');
  for (const query of ['live-search.example', '198.51.100.42', '192.0.2.42']) {
    await dialog.getByRole('searchbox').fill(query);
    await expect(dialog.getByRole('option', {name: /live-search.example/})).toBeVisible();
  }
  await dialog.getByRole('option', {name: /live-search.example/}).click();
  await expect(page).toHaveURL(/#\/connections\?id=live%2Fid%3A1$/);
  await expect(page.locator('.rp-card h3')).toHaveText('live-search.example');
  for (const query of ['Live node', 'Live group', 'Settings']) {
    await page.keyboard.press('Control+K');
    await dialog.getByRole('searchbox').fill(query);
    await dialog.getByRole('option', {name: query, exact: true}).click();
    await expect(page).toHaveURL(query === 'Settings' ? /#\/settings$/ : /#\/policies$/);
  }
});

test('refresh remains pending until completion, refetches non-polling resources, and reports errors', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const version = await api.version();
  const responses: Record<string, unknown> = {
    '/capabilities': capabilities,
    '/version': version,
    '/runtime': await api.runtime(),
    '/runtime/outbounds': await api.runtimeOutbounds(),
    '/runtime/traffic/history': await api.trafficHistory(),
    '/connections': await api.connections(),
    '/nodes': await api.nodes(),
    '/groups': await api.groups()
  };
  const counts: Record<string, number> = {};
  let hold: Promise<void> | undefined;
  let release = () => {};
  let brokenRuntime = false;
  await page.clock.install({time: new Date('2026-09-16T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-16T00:00:01Z'));
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    counts[path] = (counts[path] ?? 0) + 1;
    if (path === '/version') await hold;
    if (path === '/runtime' && brokenRuntime) return route.fulfill({contentType: 'application/json', body: '{'});
    await route.fulfill({json: responses[path]});
  });
  await page.goto('/#/activity');
  await expect(page.locator('.rp-version')).toHaveText(`${version.engine.name} ${version.engine.version}`);
  await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
  await expect.poll(() => Object.keys(counts).sort()).toEqual(Object.keys(responses).sort());
  const before = {...counts};
  hold = new Promise<void>(resolve => {
    release = resolve;
  });
  responses['/version'] = {...version, engine: {name: 'honk-live', version: '1.2.4'}};
  const refresh = page.getByRole('button', {name: 'Reload data', exact: true});
  await page.getByRole('button', {name: 'Reload data', exact: true}).click();
  await expect.poll(() => Object.entries(before).every(([path, count]) => counts[path] === count + 1)).toBe(true);
  await page.clock.fastForward(700);
  await expect(refresh).toHaveAttribute('data-pending');
  release();
  await expect(page.locator('.rp-version')).toHaveText('honk-live 1.2.4');
  await expect(refresh).not.toHaveAttribute('data-pending');
  await expect(page.locator('.rp-toast.positive')).toContainText('Data refreshed.');
  hold = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.getByRole('button', {name: 'Reload data', exact: true}).click();
  await expect(refresh).toHaveAttribute('data-pending');
  await page.clock.fastForward(2100);
  await expect(refresh).toHaveAttribute('data-pending');
  release();
  await expect(refresh).not.toHaveAttribute('data-pending');
  await expect(page.getByRole('alert')).toHaveCount(0);
  brokenRuntime = true;
  await page.getByRole('button', {name: 'Reload data', exact: true}).click();
  await expect(page.locator('.rp-content').getByRole('alert')).toBeVisible();
  await expect(refresh).not.toHaveAttribute('data-pending');
  await expect(page.locator('.rp-toast.negative')).toContainText('Could not refresh data');
});

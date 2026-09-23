import {downloadText, expect, mockBackend, test} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {test as browserTest} from '@playwright/test';

test('a resolution record opens beside the log with its answers', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/dns?tab=log');
  const rows = page.locator('.rp-table').locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows.first()).toBeVisible();
  const first = rows.first();
  const name = (await first.getByRole('rowheader').innerText()).trim();
  await first.click();
  const panel = page.locator('.rp-panel');
  await expect(panel.getByRole('heading', {name})).toBeVisible();
  await expect(panel.locator('.rp-kv')).toContainText('Route source');
  await expect(panel.locator('.rp-code, .rp-empty').first()).toBeVisible();
  await panel.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(panel).toHaveCount(0);
});

test('the DNS page fits without overflow at phone width with the drawer', async ({page}) => {
  await page.setViewportSize({width: 400, height: 800});
  await page.goto('/#/dns?tab=log');
  const rows = page.locator('.rp-table').locator('[role=rowgroup]:last-child [role=row][data-key]');
  await rows.first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('all supported DNS types are queried in bounded batches and shown together', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  for (const resource of Object.values(capabilities.resources)) resource.available = false;
  capabilities.resources.dns_query.available = true;
  capabilities.resources.dns_query.record_types = ['A', 'AAAA', 'TXT'];
  capabilities.resources.dns_query.limits!.max_types_per_request = 1;
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  const requested: string[][] = [];
  await page.route('**/api/v1/dns/query?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const types = params.getAll('type');
    requested.push(types);
    expect(types).toHaveLength(1);
    await route.fulfill({json: await api.dnsQuery(params.get('domain')!, types)});
  });
  await page.goto('/#/dns?domain=example.com&type=all');
  await page.getByRole('button', {name: 'Query', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'example.com. TXT', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'example.com. A', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'example.com. AAAA', exact: true})).toBeVisible();
  expect(requested).toEqual([['A'], ['AAAA'], ['TXT']]);
});

test('DNS tabs preserve linked query drafts', async ({page}) => {
  await page.goto('/#/dns?domain=example.com&type=AAAA');
  await page.getByRole('tab', {name: 'Cache', exact: true}).click();
  await expect(page).toHaveURL(/domain=example.com/);
  await page.getByRole('tab', {name: 'Query', exact: true}).click();
  await expect(page.getByRole('textbox', {name: 'Domain', exact: true})).toHaveValue('example.com');
  await page.getByRole('button', {name: 'Query', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'example.com. AAAA', exact: true})).toBeVisible();
});

test('DNS logs load older pages and export only loaded records', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  capabilities.resources.dns_log.max_page_size = 1;
  const seed = await api.dnsLog();
  const records = seed.records.slice(0, 2);
  const cursors: Array<string | null> = [];
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  await page.route('**/api/v1/runtime', async route => route.fulfill({json: await api.runtime()}));
  await page.route('**/api/v1/dns/log?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const cursor = params.get('cursor');
    cursors.push(cursor);
    expect(params.get('limit')).toBe('1');
    await route.fulfill({json: {...seed, total: 500, records: [records[cursor ? 1 : 0]], next_cursor: cursor ? null : 'older'}});
  });
  await page.goto('/#/dns?tab=log');
  await expect(page.getByText('1 loaded; the export covers loaded records only', {exact: true})).toBeVisible();
  await expect(page.getByText('500 records in the ring buffer', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Load older records'}).click();
  // Everything is loaded now, so the qualifier goes away.
  await expect(page.getByText(/loaded; the export covers/)).toHaveCount(0);
  expect(cursors).toContain('older');
  await expect(page.getByRole('button', {name: 'Load older records'})).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export CSV'}).click();
  const stream = await (await download).createReadStream();
  let body = '';
  for await (const chunk of stream as AsyncIterable<Uint8Array>) body += new TextDecoder().decode(chunk);
  expect(body.trim().split('\n')).toHaveLength(3);
  for (const record of records) expect(body).toContain(record.id);
});

browserTest('a transient DNS refusal stays pending until the advertised retry succeeds', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  for (const resource of Object.values(capabilities.resources)) resource.available = false;
  capabilities.resources.dns_query.available = true;
  const times: number[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  await page.route('**/api/v1/dns/query?*', async route => {
    times.push(Date.now());
    if (times.length === 1)
      return route.fulfill({status: 429, headers: {'Retry-After': '1'}, json: {error: {code: 'rate_limited', message: 'Wait'}, request_id: 'dns-refused'}});
    return route.fulfill({json: await api.dnsQuery('example.com', ['A'])});
  });
  await page.goto('/#/dns?domain=example.com');
  await page.getByRole('button', {name: 'Query', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'example.com. A', exact: true})).toBeVisible();
  expect(times).toHaveLength(2);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000);
  await expect(page.locator('.rp-toast.negative')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('paging holds the DNS window through new arrivals until Refresh', async ({page}) => {
  const {api, capabilities, handlers} = await mockBackend(page);
  capabilities.resources.dns_log.max_page_size = 2;
  const seed = await api.dnsLog();
  const record = seed.records[0];
  let arrived = false;
  let heads = 0;
  handlers['GET dns/log'] = async request => {
    const cursor = new URL(request.url()).searchParams.get('cursor');
    if (!cursor) heads++;
    const ids = cursor ? ['d2', 'd1'] : arrived ? ['d5', 'd4'] : ['d4', 'd3'];
    return {...seed, records: ids.map(id => ({...record, id, question: {...record.question, name: id + '.test'}})), next_cursor: cursor ? null : 'older'};
  };
  await page.clock.install();
  await page.goto('/#/dns?tab=log');
  await page.getByRole('button', {name: 'Load older records'}).click();
  const rows = page.getByRole('grid', {name: 'Resolution log'}).getByRole('rowheader');
  await expect(rows).toHaveText(['d4.test', 'd3.test', 'd2.test', 'd1.test']);
  const before = heads;
  arrived = true;
  await page.clock.fastForward(5100);
  await expect.poll(() => heads).toBeGreaterThan(before);
  await expect(page.getByText('Newer records are waiting. Refresh replaces the loaded records.', {exact: true})).toBeVisible();
  await expect(rows).toHaveText(['d4.test', 'd3.test', 'd2.test', 'd1.test']);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export CSV'}).click();
  const body = await downloadText(await downloading);
  for (const id of ['d4', 'd3', 'd2', 'd1']) expect(body).toContain(id + '.test');
  expect(body).not.toContain('d5.test');
  await page.getByRole('tabpanel', {name: 'Resolution log'}).getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(rows).toHaveText(['d5.test', 'd4.test']);
  await expect(page.getByRole('button', {name: 'Load older records'})).toBeVisible();
  await expect(page.getByText(/Newer records are waiting/)).toHaveCount(0);
});

test('DNS source filters send IP literals only on head and older requests', async ({page}) => {
  const {api, capabilities, handlers, requests} = await mockBackend(page);
  capabilities.resources.dns_log.max_page_size = 1;
  const seed = await api.dnsLog();
  handlers['GET dns/log'] = async request => ({
    ...seed,
    records: seed.records.slice(0, 1),
    next_cursor: new URL(request.url()).searchParams.has('cursor') ? null : 'older'
  });
  await page.goto('/#/dns?tab=log');
  const source = page.getByRole('searchbox', {name: 'Device', exact: true});
  await source.fill('2001:db8::1');
  await expect.poll(() => requests.filter(request => new URL(request.url()).searchParams.get('src') === '2001:db8::1').length).toBeGreaterThan(0);
  await page.getByRole('button', {name: 'Load older records'}).click();
  await expect
    .poll(
      () =>
        requests.filter(request => {
          const params = new URL(request.url()).searchParams;
          return params.get('src') === '2001:db8::1' && params.has('cursor');
        }).length
    )
    .toBe(1);
  await source.fill('10.0.0.12:53211');
  await expect(page.getByRole('button', {name: 'Load older records'})).toBeVisible();
  await page.getByRole('button', {name: 'Load older records'}).click();
  const logRequests = requests.filter(request => new URL(request.url()).pathname === '/api/v1/dns/log');
  expect(logRequests.every(request => !new URL(request.url()).searchParams.get('src')?.includes('53211'))).toBe(true);
});

test('the resolution log refresh shows its request pending', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  await page.goto('/#/dns?tab=log');
  await expect(page.getByRole('grid', {name: 'Resolution log'}).getByRole('rowheader').first()).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  handlers['GET dns/log'] = async () => {
    await gate;
    return api.dnsLog({});
  };
  // The top bar has a Refresh icon button of its own; this is the one in the log's toolbar.
  const refresh = page.locator('.rp-toolbar').getByRole('button', {name: 'Refresh', exact: true});
  await refresh.click();
  await expect(refresh).toHaveAttribute('data-pending');
  release();
  await expect(refresh).not.toHaveAttribute('data-pending');
});

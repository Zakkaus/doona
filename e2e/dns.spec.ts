import {downloadText, expect, mockBackend, test} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
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
    const body = route.request().postDataJSON();
    const types = body.type;
    requested.push(types);
    expect(types).toHaveLength(1);
    await route.fulfill({json: await api.dnsQuery(body.domain, types)});
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
  await expect(page.getByText('500 records kept', {exact: true})).toBeVisible();
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

test('an older DNS page keeps the limit its cursor was issued with after the head falls back to a smaller one', async ({page}) => {
  const {api, capabilities, handlers} = await mockBackend(page);
  capabilities.resources.dns_log.max_page_size = 8;
  const seed = await api.dnsLog();
  const record = seed.records[0];
  const sent: Array<[string | null, string | null]> = [];
  let refuse = false;
  handlers['GET dns/log'] = async request => {
    const params = new URL(request.url()).searchParams;
    const cursor = params.get('cursor');
    sent.push([cursor, params.get('limit')]);
    if (!cursor && refuse && params.get('limit') === '8') throw new ApiError(503, 'snapshot_unavailable', 'Busy', null, null, 1);
    const ids = cursor === 'c1' ? ['d2'] : cursor === 'c2' ? ['d1'] : ['d4', 'd3'];
    const next = cursor === 'c1' ? 'c2' : cursor === 'c2' ? null : 'c1';
    return {...seed, records: ids.map(id => ({...record, id, question: {...record.question, name: id + '.test'}})), next_cursor: next};
  };
  await page.clock.install();
  await page.goto('/#/dns?tab=log');
  const older = page.getByRole('button', {name: 'Load older records'});
  await older.click();
  const rows = page.getByRole('grid', {name: 'Resolution log'}).getByRole('rowheader');
  await expect(rows).toHaveText(['d4.test', 'd3.test', 'd2.test']);
  const mark = sent.length;
  refuse = true;
  // The head poll is refused at 8, waits the second it is asked to, and is served at 2.
  await expect
    .poll(async () => {
      await page.clock.fastForward(5100);
      return sent.slice(mark).some(([cursor, limit]) => cursor === null && limit === '2');
    })
    .toBe(true);
  await older.click();
  await expect(rows).toHaveText(['d4.test', 'd3.test', 'd2.test', 'd1.test']);
  expect(sent.filter(([cursor]) => cursor !== null)).toEqual([
    ['c1', '8'],
    ['c2', '8']
  ]);
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
  // An address with a port is not a literal: the last valid filter stays in force.
  await source.fill('10.0.0.12:53211');
  await expect(source).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('tabpanel', {name: 'Resolution log'}).getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Load older records'})).toBeVisible();
  await page.getByRole('button', {name: 'Load older records'}).click();
  const logRequests = requests.filter(request => new URL(request.url()).pathname === '/api/v1/dns/log');
  expect(logRequests.every(request => !new URL(request.url()).searchParams.get('src')?.includes('53211'))).toBe(true);
  await expect
    .poll(
      () =>
        requests.filter(request => {
          const params = new URL(request.url()).searchParams;
          return params.get('src') === '2001:db8::1' && params.has('cursor');
        }).length
    )
    .toBe(2);
});

test('a mistyped device address keeps the last filter and says so', async ({page}) => {
  const {requests} = await mockBackend(page);
  const src = () =>
    requests.filter(request => new URL(request.url()).pathname === '/api/v1/dns/log').map(request => new URL(request.url()).searchParams.get('src'));
  await page.goto('/#/dns?tab=log');
  const source = page.getByRole('searchbox', {name: 'Device', exact: true});
  await source.fill('10.0.0.12');
  await expect.poll(() => src().at(-1)).toBe('10.0.0.12');
  const before = src().length;
  await source.fill('10.0.0.300');
  await expect(page.getByText('Enter an IPv4 or IPv6 address.')).toBeVisible();
  await expect(source).toHaveAttribute('aria-invalid', 'true');
  // The error is the field's own, read with it, and showing it keeps the field focused for the next keystroke.
  await expect(source).toHaveAccessibleDescription('Enter an IPv4 or IPv6 address.');
  await expect(source).toBeFocused();
  await page.getByRole('tabpanel', {name: 'Resolution log'}).getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect.poll(() => src().length).toBeGreaterThan(before);
  expect(
    src()
      .slice(before)
      .every(value => value === '10.0.0.12')
  ).toBe(true);
  await source.fill('');
  await expect(page.getByText('Enter an IPv4 or IPv6 address.')).toHaveCount(0);
  await expect.poll(() => src().at(-1)).toBeNull();
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

test('Retry after a failed older page asks for that page again and keeps the loaded records', async ({page}) => {
  const {api, capabilities, handlers} = await mockBackend(page);
  capabilities.resources.dns_log.max_page_size = 2;
  const seed = await api.dnsLog();
  const record = seed.records[0];
  let fail = true;
  const cursors: string[] = [];
  handlers['GET dns/log'] = async request => {
    const cursor = new URL(request.url()).searchParams.get('cursor');
    if (cursor) {
      cursors.push(cursor);
      if (fail) throw new ApiError(500, 'internal', 'Older records unavailable');
    }
    const ids = cursor ? ['d2', 'd1'] : ['d4', 'd3'];
    return {...seed, records: ids.map(id => ({...record, id, question: {...record.question, name: id + '.test'}})), next_cursor: cursor ? null : 'older'};
  };
  await page.clock.install();
  await page.goto('/#/dns?tab=log');
  const rows = page.getByRole('grid', {name: 'Resolution log'}).getByRole('rowheader');
  await expect(rows).toHaveText(['d4.test', 'd3.test']);
  await page.getByRole('button', {name: 'Load older records'}).click();
  const alert = page.getByRole('alert').filter({hasText: 'Older records unavailable'});
  await expect(alert).toBeVisible();
  fail = false;
  await alert.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(rows).toHaveText(['d4.test', 'd3.test', 'd2.test', 'd1.test']);
  await expect(alert).toHaveCount(0);
  expect(cursors).toEqual(['older', 'older']);
});

test('an expired older-page cursor starts the log again from the newest page', async ({page}) => {
  const {api, capabilities, handlers} = await mockBackend(page);
  capabilities.resources.dns_log.max_page_size = 2;
  const seed = await api.dnsLog();
  const record = seed.records[0];
  let heads = 0;
  let refusal = new ApiError(400, 'invalid_request', 'Unknown or expired cursor');
  handlers['GET dns/log'] = async request => {
    if (new URL(request.url()).searchParams.has('cursor')) throw refusal;
    const ids = ++heads === 1 ? ['d4', 'd3'] : ['d6', 'd5'];
    return {...seed, records: ids.map(id => ({...record, id, question: {...record.question, name: id + '.test'}})), next_cursor: 'older'};
  };
  await page.goto('/#/dns?tab=log');
  const rows = page.getByRole('grid', {name: 'Resolution log'}).getByRole('rowheader');
  await expect(rows).toHaveText(['d4.test', 'd3.test']);
  await page.getByRole('button', {name: 'Load older records'}).click();
  await expect(page.getByText('Could not load older records; reloading from the newest page.', {exact: true})).toBeVisible();
  await expect(rows).toHaveText(['d6.test', 'd5.test']);
  await expect(page.getByRole('alert').filter({hasText: 'expired cursor'})).toHaveCount(0);
  // Any other 400 is a real refusal: it is shown and the loaded records stay.
  refusal = new ApiError(400, 'unsupported_value', 'Unsupported filter');
  await page.getByRole('button', {name: 'Load older records'}).click();
  await expect(page.getByRole('alert').filter({hasText: 'Unsupported filter'})).toBeVisible();
  await expect(rows).toHaveText(['d6.test', 'd5.test']);
  expect(heads).toBe(2);
});

test('an older page the backend cannot hold a snapshot for starts the log again after the wait', async ({page}) => {
  const {api, capabilities, handlers} = await mockBackend(page);
  capabilities.resources.dns_log.max_page_size = 2;
  const seed = await api.dnsLog();
  const record = seed.records[0];
  let heads = 0;
  const older: string[] = [];
  handlers['GET dns/log'] = async request => {
    const params = new URL(request.url()).searchParams;
    if (params.has('cursor')) {
      older.push(params.get('limit') ?? '');
      throw new ApiError(503, 'snapshot_unavailable', 'A coherent snapshot is unavailable', null, null, 1);
    }
    const ids = ++heads === 1 ? ['d4', 'd3'] : ['d6', 'd5'];
    return {...seed, records: ids.map(id => ({...record, id, question: {...record.question, name: id + '.test'}})), next_cursor: 'older'};
  };
  await page.goto('/#/dns?tab=log');
  const rows = page.getByRole('grid', {name: 'Resolution log'}).getByRole('rowheader');
  await expect(rows).toHaveText(['d4.test', 'd3.test']);
  await page.getByRole('button', {name: 'Load older records'}).click();
  await expect(page.getByText('Could not load older records; reloading from the newest page.', {exact: true})).toBeVisible();
  await expect(rows).toHaveText(['d6.test', 'd5.test']);
  await expect(page.getByRole('alert').filter({hasText: 'snapshot'})).toHaveCount(0);
  // The cursor is asked for once, at the limit it was issued with, never again at a smaller one.
  expect(older).toEqual(['2']);
  expect(heads).toBe(2);
});

test('a failed query stays on the query tab', async ({page}) => {
  const {handlers} = await mockBackend(page);
  handlers['POST dns/query'] = async () => {
    throw new ApiError(500, 'internal', 'Resolver offline');
  };
  await page.goto('/#/dns?tab=query&domain=example.com');
  await page.getByRole('button', {name: 'Query', exact: true}).click();
  const alert = page.getByRole('alert').filter({hasText: 'Resolver offline'});
  await expect(page.getByRole('tabpanel', {name: 'Query'}).getByRole('alert').filter({hasText: 'Resolver offline'})).toBeVisible();
  await page.getByRole('tab', {name: 'Cache', exact: true}).click();
  await expect(alert).toBeHidden();
  await page.getByRole('tab', {name: 'Query', exact: true}).click();
  await expect(alert).toBeVisible();
});

test('a rate-limited query says how long it waits before retrying', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let refused = false;
  handlers['POST dns/query'] = async request => {
    if (!refused) {
      refused = true;
      throw new ApiError(429, 'rate_limited', 'Too many requests', null, null, 5);
    }
    const body = request.postDataJSON();
    return api.dnsQuery(body.domain, body.type);
  };
  await page.goto('/#/dns?tab=query&domain=example.com');
  await page.getByRole('button', {name: 'Query', exact: true}).click();
  const notice = page.getByRole('status').filter({hasText: 'Rate limit reached'});
  const shown = notice.locator('[aria-hidden="true"]');
  await expect(shown).toHaveText(/^Rate limit reached: retrying in [45] s$/);
  // The live region's text stays as it was when the wait began, so screen readers announce it once.
  const heard = () =>
    notice.evaluate(element => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
      return copy.textContent;
    });
  const first = await heard();
  expect(first).toMatch(/^Rate limit reached: retrying in [45] s$/);
  await expect(shown).not.toHaveText((await shown.textContent())!);
  expect(await heard()).toBe(first);
  await expect(notice).toBeHidden({timeout: 10000});
  await expect(page.getByRole('heading', {name: /^example\.com\. /}).first()).toBeVisible();
});

test('on a phone, Load older records stays in view at the end of the log', async ({page}) => {
  const {api, capabilities, handlers} = await mockBackend(page);
  capabilities.resources.dns_log.max_page_size = 1;
  const seed = await api.dnsLog();
  handlers['GET dns/log'] = async request => {
    const cursor = new URL(request.url()).searchParams.get('cursor');
    return {...seed, total: 2, records: [seed.records[cursor ? 1 : 0]], next_cursor: cursor ? null : 'older'};
  };
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/dns?tab=log');
  const older = page.getByRole('button', {name: 'Load older records', exact: true});
  await expect(older).toBeVisible();
  const [table, button] = [(await page.getByRole('grid', {name: 'Resolution log'}).boundingBox())!, (await older.boundingBox())!];
  expect(button.y).toBeGreaterThanOrEqual(table.y + table.height);
  await older.click();
  await expect(older).toHaveCount(0);
});

test('the statistics lead to the DNS configuration, the cache and the log filtered to a ranked item', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/dns');
  await page.getByRole('link', {name: 'Open DNS configuration', exact: true}).click();
  // The link opens the dns section's first line in the main file.
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-main&line=29$/);
  await expect(page.locator('.cm-activeLine')).toContainText('dns {');
  await page.goBack();
  await page.getByRole('region', {name: 'Cache', exact: true}).getByRole('link', {name: 'View cache', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?tab=cache$/);
  await expect(page.getByRole('tab', {name: 'Cache', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  const ranking = page.getByRole('region', {name: 'Top queries', exact: true});
  const device = ranking.getByRole('link').first();
  const address = (await device.innerText()).trim();
  await device.click();
  await expect(page).toHaveURL(new RegExp(`#/dns\\?tab=log&device=${encodeURIComponent(address).replace(/[.[\]]/g, '\\$&')}$`));
  await expect(page.getByRole('searchbox', {name: 'Device', exact: true})).toHaveValue(address);
  await expect(page.getByRole('grid', {name: 'Resolution log'}).getByRole('row').nth(1)).toContainText(address);
  await page.goBack();
  await ranking.getByRole('radio', {name: 'Domains', exact: true}).click();
  const domain = ranking.getByRole('link').first();
  const name = (await domain.innerText()).trim();
  await domain.click();
  await expect(page).toHaveURL(new RegExp(`#/dns\\?tab=log&domain=${name.replace(/\./g, '\\.')}$`));
  await expect(page.getByRole('searchbox', {name: 'Domain', exact: true})).toHaveValue(name);
  await expect(page.getByRole('grid', {name: 'Resolution log'}).getByRole('rowheader').first()).toContainText(name);
});

test('the resolution log toolbar opens the DNS rules', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/dns?tab=log');
  await page.getByRole('button', {name: 'DNS rules', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=dns$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/dns\?tab=log$/);
});

test('the resolution log toolbar opens the recording settings, from the overflow menu on a phone', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/dns?tab=log');
  await page.getByRole('button', {name: 'More actions', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Recording settings', exact: true}).click();
  await expect(page).toHaveURL(/#\/settings\?card=runtime$/);
});

// The type and elapsed columns hold short values that must read whole; the domain column gives up the room.
for (const [lang, type, elapsed] of [
  ['en', 'Type', 'Elapsed'],
  ['zh-CN', '类型', '耗时'],
  ['zh-TW', '類型', '耗時']
]) {
  test.describe(lang, () => {
    test.use({viewport: {width: 1280, height: 900}, storage: {'doona-lang': lang}});

    for (const [tab, labels] of [
      ['log', [type, elapsed]],
      ['cache', [type]]
    ] as const) {
      test(`the DNS ${tab} keeps its short columns whole`, async ({page}) => {
        await page.goto(`/#/dns?tab=${tab}`);
        const panel = page.getByRole('tabpanel');
        await expect(panel.locator('[role=row][data-key]').first()).toBeVisible();
        const cut = await panel.evaluate((root, labels) => {
          const heads = [...root.querySelectorAll('[role=columnheader]')].map(head => head.textContent);
          return labels.flatMap(label => {
            const index = heads.indexOf(label);
            if (index < 0) return [`no ${label} column`];
            return [...root.querySelectorAll('[role=row][data-key]')].flatMap(row => {
              const cell = row.children[index].querySelector('.rp-truncate') ?? row.children[index];
              return cell.scrollWidth > cell.clientWidth ? [`${label}: ${cell.textContent}`] : [];
            });
          });
        }, labels);
        expect(cut).toEqual([]);
      });
    }
  });
}

import {expect, test} from './fixtures';
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
  await expect(page.getByRole('heading', {name: 'example.com. · TXT', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'example.com. · A', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'example.com. · AAAA', exact: true})).toBeVisible();
  expect(requested).toEqual([['A'], ['AAAA'], ['TXT']]);
});

test('DNS tabs preserve linked query drafts', async ({page}) => {
  await page.goto('/#/dns?domain=example.com&type=AAAA');
  await page.getByRole('tab', {name: 'Cache', exact: true}).click();
  await expect(page).toHaveURL(/domain=example.com/);
  await page.getByRole('tab', {name: 'Query', exact: true}).click();
  await expect(page.getByRole('textbox', {name: 'Domain', exact: true})).toHaveValue('example.com');
  await page.getByRole('button', {name: 'Query', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'example.com. · AAAA', exact: true})).toBeVisible();
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
  await expect(page.getByText('1 loaded record; export includes only this record', {exact: true})).toBeVisible();
  await expect(page.getByText('500 records in the ring buffer', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Load older records'}).click();
  await expect(page.getByText('2 loaded records; export includes only these records', {exact: true})).toBeVisible();
  expect(cursors).toContain('older');
  await expect(page.getByRole('button', {name: 'Load older records'})).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export loaded CSV'}).click();
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
  await expect(page.getByRole('heading', {name: 'example.com. · A', exact: true})).toBeVisible();
  expect(times).toHaveLength(2);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000);
  await expect(page.locator('.rp-toast.negative')).toHaveCount(0);
  expect(errors).toEqual([]);
});

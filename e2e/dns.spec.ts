import type {Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {dnsCache} from '../src/api/mock/fixtures';
import {expect, test} from './fixtures';

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

async function nativeDns(page: Page) {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const responses: Record<string, unknown> = {
    '/capabilities': capabilities,
    '/version': await api.version(),
    '/runtime': await api.runtime(),
    '/groups': await api.groups(),
    '/nodes': await api.nodes()
  };
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (!(path in responses)) throw new Error(`Unexpected request: ${route.request().method()} ${path}`);
    await route.fulfill({json: responses[path]});
  });
}

test('the cache lists all 818 entries through bounded summary pages and refreshes them', async ({page}) => {
  await nativeDns(page);
  await page.clock.install();
  let entries = Array.from({length: 818}, (_, index) => ({
    ...dnsCache.entries[0],
    entry_id: `cache-${index + 1}`,
    domain: `cached-${index + 1}.example.`,
    type: 'TXT',
    answers: undefined
  }));
  const requests: URLSearchParams[] = [];
  await page.route('**/api/v1/dns/cache?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    const offset = Number(query.get('cursor')?.split(':')[1] ?? 0);
    const limit = Number(query.get('limit') ?? 100);
    const full = query.get('detail') === 'full';
    const rows = entries.slice(offset, offset + limit).map(entry => ({
      ...entry,
      ...(full ? {answers: [{name: entry.domain, type: 'TXT', class: 'IN', ttl: 60, data: `"${'x'.repeat(3000)}"`}]} : {})
    }));
    // Model the native response's conservative metadata and RR projection budget.
    const bytes = rows.reduce((size, entry) => size + 512 + entry.entry_id.length + entry.domain.length + JSON.stringify(entry.answers ?? []).length, 1024);
    if (bytes > 262144)
      return route.fulfill({
        status: 503,
        json: {error: {code: 'temporarily_unavailable', message: 'DNS observation is temporarily unavailable'}, request_id: 'cache-budget'}
      });
    const end = offset + rows.length;
    await route.fulfill({json: {...dnsCache, total: entries.length, entries: rows, next_cursor: end < entries.length ? `snapshot:${end}` : null}});
  });
  await page.goto('/#/dns?tab=cache');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(grid).toHaveAttribute('aria-rowcount', '819');
  await expect(grid.getByRole('rowheader').first()).toHaveText('cached-1.example.');
  await grid.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(grid.getByRole('rowheader', {name: 'cached-818.example.', exact: true})).toBeVisible();
  expect(requests.map(query => query.get('cursor'))).toEqual([null, ...Array.from({length: 8}, (_, index) => `snapshot:${(index + 1) * 100}`)]);
  for (const query of requests) {
    expect(query.get('limit')).toBe('100');
    expect(query.get('detail')).toBe('summary');
    expect(query.has('domain')).toBe(false);
  }
  entries = entries.slice(0, -1);
  await page.clock.runFor(15000);
  await expect(grid).toHaveAttribute('aria-rowcount', '818');
  await expect(grid.getByRole('rowheader', {name: 'cached-817.example.', exact: true})).toBeVisible();
});

test('domain filtering precedes cache snapshot admission and never narrows global flush', async ({page}) => {
  await nativeDns(page);
  const entries = [
    {...dnsCache.entries[0], domain: 'api.Telegram.org.', answers: undefined},
    {...dnsCache.entries[0], entry_id: 'c2', domain: 'cdn.telegram.org.', answers: undefined}
  ];
  const requests: URLSearchParams[] = [];
  let flushed = false;
  await page.route('**/api/v1/dns/cache?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    if (!flushed && query.get('domain')?.toLowerCase() !== 'telegram')
      return route.fulfill({
        status: 503,
        json: {error: {code: 'temporarily_unavailable', message: 'DNS observation is temporarily unavailable'}, request_id: 'snapshot-budget'}
      });
    const offset = query.get('cursor') ? 1 : 0;
    await route.fulfill({
      json: {
        ...dnsCache,
        total: flushed ? 0 : 2,
        entries: flushed ? [] : entries.slice(offset, offset + 1),
        next_cursor: !flushed && offset === 0 ? 'filtered:1' : null
      }
    });
  });
  await page.route('**/api/v1/dns/cache/flush', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({});
    expect(new URL(route.request().url()).search).toBe('');
    flushed = true;
    await route.fulfill({json: {matched: 818, deleted: 818}});
  });
  await page.goto('/#/dns?tab=cache&domain=TeLeGrAm');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(grid.getByRole('rowheader')).toHaveText(['api.Telegram.org.', 'cdn.telegram.org.']);
  await expect(page.locator('.rp-toolbar .rp-kv')).toContainText('2');
  expect(requests.map(query => query.get('domain'))).toEqual(['telegram', 'telegram']);
  expect(requests.map(query => query.get('cursor'))).toEqual([null, 'filtered:1']);
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
  await expect(dialog).toContainText('Clears every cache record; this cannot be undone.');
  await dialog.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(grid.getByRole('rowheader', {name: /telegram\.org\./i})).toHaveCount(0);
  await expect(page.locator('.rp-toolbar .rp-kv')).toContainText('0');
  await page.getByRole('button', {name: 'Domain: TeLeGrAm', exact: true}).click();
  await expect.poll(() => requests.at(-1)?.has('domain')).toBe(false);
});

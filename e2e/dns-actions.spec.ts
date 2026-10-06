import type {Locator, Page, Request} from '@playwright/test';
import {ApiError} from '../src/api/error';
import {expect, mockBackend, query, test, settleFrames, box} from './fixtures';

test('cache deletion removes one entry and flushing requires confirmation', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  // Flushing clears the expired entries the listing leaves out too.
  const cached = (await api.dnsCache({include_expired: true})).total;
  expect(entries.length).toBeGreaterThan(1);
  await page.goto('/#/dns?tab=cache');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(grid).toHaveAttribute('aria-rowcount', String(entries.length + 1));
  const actionsHeader = page.getByRole('columnheader', {name: /^Actions /}).locator('.rp-th');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(await actionsHeader.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', {name: `Delete the ${entries[0].type} cache entry for ${entries[0].domain}`, exact: true}).click();
  await expect(page.getByRole('button', {name: `Delete the ${entries[0].type} cache entry for ${entries[0].domain}`, exact: true})).toHaveCount(0);
  await expect(grid).toHaveAttribute('aria-rowcount', String(entries.length));
  await expect(page.locator('.rp-toast.positive')).toContainText('Deleted 1 cache entry');
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(0);
  await expect(grid).toHaveAttribute('aria-rowcount', String(entries.length));
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await dialog.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(page.getByText('No matching cache entries', {exact: true})).toBeVisible();
  await expect(page.locator('.rp-toast.positive').last()).toContainText(`matched: ${cached - 1}, deleted: ${cached - 1}`);
  expect(requests.filter(request => request.method() !== 'GET').map(request => [request.method(), new URL(request.url()).pathname])).toEqual([
    ['DELETE', `/api/v1/dns/cache/${encodeURIComponent(entries[0].entry_id)}`],
    ['POST', '/api/v1/dns/cache/flush']
  ]);
});

test('the cache lists expired entries while its switch is on, and one can be deleted from its row', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const listed = (await api.dnsCache()).entries;
  const expired = (await api.dnsCache({include_expired: true})).entries.filter(entry => !listed.some(item => item.entry_id === entry.entry_id));
  expect(expired.length).toBeGreaterThan(0);
  await page.goto('/#/dns?tab=cache');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(grid).toHaveAttribute('aria-rowcount', String(listed.length + 1));
  const toggle = page.getByRole('switch', {name: 'Show expired', exact: true});
  const label = page.locator('.rp-switch').filter({hasText: 'Show expired'});
  await expect(toggle).not.toBeChecked();
  // The cache tab's walks, apart from the one-entry usage reads.
  const walks = () =>
    requests
      .map(request => new URL(request.url()))
      .filter(url => url.pathname === '/api/v1/dns/cache' && url.searchParams.get('limit') !== '1')
      .map(url => url.searchParams.get('include_expired'));
  const off = walks().length;
  expect(off).toBeGreaterThan(0);
  expect(walks()).toEqual(Array(off).fill(null));
  await label.click();
  await expect(grid).toHaveAttribute('aria-rowcount', String(listed.length + expired.length + 1));
  expect(walks().slice(off)).toEqual(Array(walks().length - off).fill('true'));
  expect(walks().length).toBeGreaterThan(off);
  const remove = page.getByRole('button', {name: `Delete the ${expired[0].type} cache entry for ${expired[0].domain}`, exact: true});
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Deleted 1 cache entry');
  await expect(grid).toHaveAttribute('aria-rowcount', String(listed.length + expired.length));
  expect(walks().at(-1)).toBe('true');
  await label.click();
  await expect(grid).toHaveAttribute('aria-rowcount', String(listed.length + 1));
  await expect.poll(() => walks().at(-1)).toBeNull();
});

test('a missing cache capability keeps the toolbar fixed and explains the disabled action', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  const {capabilities} = await mockBackend(page);
  await page.goto('/#/dns?tab=cache');
  const flush = page.getByRole('button', {name: 'Clear all cache', exact: true});
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(flush).toBeEnabled();
  await expect(grid.getByRole('rowheader').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = {button: await box(flush), table: await box(grid)};
  capabilities.resources.dns_cache.flush = false;
  await page.reload();
  const reason = 'This backend does not support clearing the cache';
  await expect(flush).toHaveAccessibleDescription(reason);
  await expect(flush).toBeDisabled();
  await expect(grid.getByRole('rowheader').first()).toBeVisible();
  expect((await box(flush)).y).toBe(before.button.y);
  expect((await box(grid)).y).toBe(before.table.y);
  await page.mouse.move(0, 0);
  await flush.locator('..').hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toHaveText(reason);
  expect(await tip.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
});

test.describe('Traditional Chinese cache labels', () => {
  test.use({viewport: {width: 1280, height: 900}, storage: {'doona-lang': 'zh-TW', 'doona-scheme': 'dark'}});

  test('the stale deadline and memory-only badge fit without truncation', async ({page}) => {
    await mockBackend(page);
    await page.goto('/#/dns?tab=cache');
    const header = page.getByRole('columnheader', {name: /^逾期可用至 /}).locator('.rp-th');
    const badge = page.getByText('快取僅存於記憶體，重新啟動後清空', {exact: true});
    await expect(header).toBeVisible();
    await expect(badge).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (const label of [header, badge]) expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const status = page.getByRole('gridcell', {name: 'NXDOMAIN', exact: true}).first();
    expect(await status.evaluate(cell => [cell, ...cell.querySelectorAll('*')].every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
    await expect(page.getByText('請先選取一列', {exact: true})).toHaveCount(0);
    const row = page.getByRole('row', {name: 'api.telegram.org.', exact: true});
    const add = row.getByRole('button', {name: '為 api.telegram.org. 新增 DNS 請求規則', exact: true});
    const remove = row.getByRole('button', {name: '刪除 api.telegram.org. 的 A 快取項目', exact: true});
    const addBox = await box(add);
    const removeBox = await box(remove);
    expect({width: addBox.width, height: addBox.height}).toEqual({width: removeBox.width, height: removeBox.height});
  });
});

test('a cache deletion toast omits its request ID and logs it', async ({page}) => {
  const warnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const {api, handlers} = await mockBackend(page);
  const entry = (await api.dnsCache()).entries[0];
  handlers[`DELETE dns/cache/${encodeURIComponent(entry.entry_id)}`] = async () => {
    throw new ApiError(502, 'upstream_unavailable', 'Cache backend unavailable', 'cache-delete-17');
  };
  await page.goto('/#/dns?tab=cache');
  await page.getByRole('button', {name: `Delete the ${entry.type} cache entry for ${entry.domain}`, exact: true}).click();
  const failure = page.locator('.rp-toast.negative');
  await expect(failure).toContainText('Cache backend unavailable');
  await expect(failure).not.toContainText('cache-delete-17');
  expect(warnings.filter(text => text.includes('request_id: cache-delete-17'))).toHaveLength(1);
});

test('a failed cache flush preserves rows and reports failure', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  handlers['POST dns/cache/flush'] = async () => {
    throw new ApiError(503, 'operation_failed', 'Cache is locked');
  };
  await page.goto('/#/dns?tab=cache');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  const rows = grid.getByRole('rowheader');
  await expect(grid).toHaveAttribute('aria-rowcount', String(entries.length + 1));
  const shown = await rows.allTextContents();
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
  await dialog.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  // The failure stays in the open dialog, where the action was confirmed.
  await expect(dialog.getByRole('alert')).toContainText('Cache is locked');
  await expect(dialog.getByRole('alert')).toBeFocused();
  await expect(page.locator('.rp-toast')).toHaveCount(0);
  await expect(grid).toHaveAttribute('aria-rowcount', String(entries.length + 1));
  await expect(rows).toHaveText(shown);
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(1);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
});

test('a confirmation stays open while its action is pending', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  handlers['POST dns/cache/flush'] = async () => {
    await gate;
    return api.flushDnsCache();
  };
  await page.goto('/#/dns?tab=cache');
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
  await dialog.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(dialog.locator('.rp-btn-progress [role=progressbar]')).toBeVisible();
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Cache cleared, matched: ');
});

for (const way of ['Cancel', 'Escape'] as const) {
  test(`${way} leaves a confirmation whose action never answers and drops its late result`, async ({page}) => {
    const {api, handlers} = await mockBackend(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    handlers['POST dns/cache/flush'] = async () => {
      await gate;
      return api.flushDnsCache();
    };
    await page.goto('/#/dns?tab=cache');
    const trigger = page.getByRole('button', {name: 'Clear all cache', exact: true});
    await trigger.click();
    const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
    const flushing = page.waitForRequest(request => request.method() === 'POST');
    await dialog.getByRole('button', {name: 'Clear all cache', exact: true}).click();
    await flushing;
    if (way === 'Cancel') await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeEnabled();
    release();
    await settleFrames(page);
    await expect(page.locator('.rp-toast')).toHaveCount(0);
  });
}

test('Cancel on a pending flush reads the cache again, since the flush may already have landed', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  let flushed!: () => void;
  const landed = new Promise<void>(resolve => (flushed = resolve));
  handlers['POST dns/cache/flush'] = async () => {
    const value = await api.flushDnsCache();
    flushed();
    await new Promise(() => {});
    return value;
  };
  await page.goto('/#/dns?tab=cache');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(grid).toHaveAttribute('aria-rowcount', String(entries.length + 1));
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
  await dialog.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await landed;
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  // The cache polls every 15 s; the empty table must come from the read that Cancel starts.
  await expect(page.getByText('No matching cache entries', {exact: true})).toBeVisible();
});

test('the cache table fits its entries instead of holding a page of empty space', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const cache = await api.dnsCache();
  const entries = cache.entries.slice(0, 3);
  handlers['GET dns/cache'] = async () => ({...cache, entries, next_cursor: null});
  await page.goto('/#/dns?tab=cache');
  const table = page.locator('.rp-table', {has: page.getByRole('grid', {name: 'Cache', exact: true})});
  await expect(table.getByRole('rowheader')).toHaveCount(entries.length);
  // Border, header and one row per entry; a fill-height table would stay at 442.
  await expect.poll(async () => (await box(table)).height).toBeLessThanOrEqual(2 + 37 + entries.length * 40 + 1);
});

test('a hidden cache tab stops walking the cache until it is shown again', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const walks = () =>
    requests.filter(request => {
      const url = new URL(request.url());
      return url.pathname === '/api/v1/dns/cache' && url.searchParams.get('limit') === '1000';
    }).length;
  handlers['GET dns/cache'] = async request => {
    const cache = await api.dnsCache(query(request));
    if (new URL(request.url()).searchParams.get('limit') !== '1000') return cache;
    // A new domain makes completion of each walk observable, even when the cache is otherwise unchanged.
    return {...cache, entries: cache.entries.map((entry, index) => (index === 0 ? {...entry, domain: `walk-${walks()}.example`} : entry))};
  };
  await page.clock.install();
  await page.goto('/#/dns?tab=cache');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(grid.getByRole('rowheader', {name: 'walk-1.example', exact: true})).toBeVisible();
  const shown = walks();
  await page.clock.fastForward(16000);
  await expect(grid.getByRole('rowheader', {name: `walk-${shown + 1}.example`, exact: true})).toBeVisible();
  await page.getByRole('tab', {name: 'Statistics', exact: true}).click();
  await expect(page.getByRole('tabpanel', {name: 'Statistics', exact: true}).getByText('Median', {exact: true})).toBeVisible();
  await expect(grid).toBeHidden();
  const hidden = walks();
  await page.clock.fastForward(46000);
  await settleFrames(page);
  expect(walks()).toBe(hidden);
  await page.getByRole('tab', {name: 'Cache', exact: true}).click();
  await expect(grid.getByRole('rowheader', {name: `walk-${hidden + 1}.example`, exact: true})).toBeVisible();
  expect(walks()).toBe(hidden + 1);
});

const pick = async (page: Page, current: string, label: string, option: string) => {
  await page.getByRole('button', {name: `${current} ${label}`, exact: true}).click();
  await page.getByRole('option', {name: option, exact: true}).click();
};
// What the confirmation lists: each entry's name and record type, in the order the cache holds them.
const listed = (dialog: Locator) =>
  dialog
    .getByRole('listitem')
    .allInnerTexts()
    .then(rows => rows.map(row => row.replace(/\s+/g, ' ').trim()));
const named = (entries: Array<{domain: string; type: string}>) => entries.map(entry => `${entry.domain} ${entry.type}`);
const deletes = (requests: Request[]) => requests.filter(request => request.method() === 'DELETE');

test('cache criteria filter the table, clear linked state and work without deletion', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  const matches = entries.filter(entry => entry.domain.toLowerCase().includes('cdn'));
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  const count = async (n: number) =>
    expect
      .poll(async () => {
        const total = await grid.getAttribute('aria-rowcount');
        return total === null ? grid.getByRole('rowheader').count() : Number(total) - 1;
      })
      .toBe(n);
  await page.goto('/#/dns?tab=cache');
  await count(entries.length);
  const pattern = page.getByRole('textbox', {name: 'Pattern', exact: true});
  await pattern.fill('cdn');
  await expect(page.getByText('No matching cache entries', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Delete matching', exact: true})).toBeDisabled();
  await pick(page, 'Domain suffix', 'Match by', 'Domain keyword');
  await count(matches.length);
  await pick(page, 'All supported types', 'Type', 'A');
  await count(matches.filter(entry => entry.type === 'A').length);
  await pattern.fill('');
  await count(entries.filter(entry => entry.type === 'A').length);
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await count(entries.length);
  capabilities.resources.dns_cache.delete_name = false;
  capabilities.resources.dns_cache.delete_entry = false;
  await page.goto('/#/dns?tab=cache&domain=cdn');
  await page.reload();
  await expect(page.getByRole('button', {name: 'Domain keyword Match by', exact: true})).toBeVisible();
  await expect(pattern).toHaveValue('cdn');
  await count(matches.length);
  await expect(page.getByRole('button', {name: 'Delete matching', exact: true})).toHaveCount(0);
  await pattern.fill('telegram');
  await count(entries.filter(entry => entry.domain.includes('telegram')).length);
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?tab=cache$/);
  await expect(pattern).toHaveValue('');
  await count(entries.length);
});

test('pattern deletion shows how many entries match and deletes them one by one', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  const matches = entries.filter(entry => entry.domain.endsWith('bilibili.com.'));
  expect(matches.length).toBeGreaterThan(1);
  await page.goto('/#/dns?tab=cache');
  const button = page.getByRole('button', {name: 'Delete matching', exact: true});
  const pattern = page.getByRole('textbox', {name: 'Pattern', exact: true});
  await expect(button).toBeDisabled();
  await pick(page, 'Domain suffix', 'Match by', 'Domain regex');
  await pattern.fill('(');
  await expect(pattern).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', {name: 'About Pattern', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Pattern', exact: true})).toContainText('JavaScript regex syntax');
  await page.keyboard.press('Escape');
  await expect(button).toBeDisabled();
  await pick(page, 'Domain regex', 'Match by', 'Domain suffix');
  await pattern.fill('.');
  await expect(pattern).toHaveAttribute('aria-invalid', 'true');
  await expect(button).toBeDisabled();
  await pick(page, 'Domain suffix', 'Match by', 'Domain regex');
  await pattern.fill('*.bilibili.com');
  await expect(pattern).toHaveValue('bilibili.com');
  await expect(page.getByRole('button', {name: 'Domain suffix Match by', exact: true})).toBeVisible();
  await button.click();
  const dialog = page.getByRole('alertdialog', {name: 'Delete matching', exact: true});
  await expect(dialog).toContainText(`Delete ${matches.length} cache entries?`);
  expect(await listed(dialog)).toEqual(named(matches));
  await dialog.getByRole('button', {name: 'Delete matching', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText(`Deleted ${matches.length} cache entries`);
  await expect(page.getByText('No matching cache entries', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page.getByRole('grid', {name: 'Cache', exact: true})).toHaveAttribute('aria-rowcount', String(entries.length - matches.length + 1));
  expect(deletes(requests).map(request => new URL(request.url()).pathname)).toEqual(
    expect.arrayContaining(matches.map(entry => `/api/v1/dns/cache/${encodeURIComponent(entry.entry_id)}`))
  );
  expect(deletes(requests)).toHaveLength(matches.length);
});

test.describe('regex worker', () => {
  // Service-worker precaching bypasses request interception.
  test.use({serviceWorkers: 'block'});

  test('a backtracking regex times out without blocking the cache controls or permitting partial deletion', async ({page}) => {
    const {api, handlers, requests} = await mockBackend(page);
    const cache = await api.dnsCache();
    const entries = [
      {...cache.entries[0], entry_id: 'safe', domain: 'example.com.', type: 'A'},
      {...cache.entries[0], entry_id: 'ptr', domain: 'a.'.repeat(32) + 'ip6.arpa.', type: 'PTR'}
    ];
    handlers['GET dns/cache'] = async () => ({...cache, entries, next_cursor: null});
    await page.goto('/#/dns?tab=cache');
    await expect(page.getByRole('grid', {name: 'Cache', exact: true}).getByRole('rowheader')).toHaveCount(2);
    await pick(page, 'Domain suffix', 'Match by', 'Domain regex');
    const pattern = page.getByRole('textbox', {name: 'Pattern', exact: true});
    const button = page.getByRole('button', {name: 'Delete matching', exact: true});
    await pattern.fill('^(.+\\.)*example\\.com$');
    await expect(page.getByText('Regex matching timed out. Use a simpler pattern.', {exact: true})).toBeVisible();
    await expect(button).toBeDisabled();
    expect(deletes(requests)).toHaveLength(0);
    let delayed = false;
    await page.route('**/assets/match.worker-*.js', async route => {
      // A slow chunk download must not consume the regex execution deadline.
      await page.waitForTimeout(1500);
      delayed = true;
      await route.continue();
    });
    await pattern.fill('^example\\.com$');
    await button.click();
    const dialog = page.getByRole('alertdialog', {name: 'Delete matching', exact: true});
    expect(delayed).toBe(true);
    expect(await listed(dialog)).toEqual(named([entries[0]]));
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  });
});

test('the confirmation lists at most 100 entries and counts the rest', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const cache = await api.dnsCache();
  const entries = Array.from({length: 103}, (_, i) => ({
    ...cache.entries[0],
    entry_id: `bulk-${i}`,
    domain: `host-${String(i).padStart(3, '0')}${i === 0 ? '-'.padEnd(120, 'x') : ''}.bulk.example.`,
    type: 'A'
  }));
  handlers['GET dns/cache'] = async () => ({...cache, entries, next_cursor: null});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/dns?tab=cache');
  await page.getByRole('textbox', {name: 'Pattern', exact: true}).fill('bulk.example');
  await page.getByRole('button', {name: 'Delete matching', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Delete matching', exact: true});
  await expect(dialog).toContainText('Delete 103 cache entries?');
  const rows = await listed(dialog);
  expect(rows).toHaveLength(101);
  expect(rows.slice(0, 100)).toEqual(named(entries.slice(0, 100)));
  expect(rows[100]).toBe('and 3 more');
  // A long name is cut inside the phone dialog, not scrolled sideways.
  await expect.poll(() => dialog.locator('.rp-dialog-body').evaluate(body => body.scrollWidth - body.clientWidth)).toBe(0);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  expect(deletes(requests)).toHaveLength(0);
});

test('the delete-matching row keeps its controls and height whichever match kind is picked', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/dns?tab=cache');
  const row = page.locator('.rp-toolbar').filter({has: page.getByRole('button', {name: 'Delete matching', exact: true})});
  const controls = [
    page.getByRole('textbox', {name: 'Pattern', exact: true}).locator('..'),
    page.getByRole('button', {name: /Match by$/}),
    page.getByRole('button', {name: /Type$/}),
    page.getByRole('button', {name: 'Delete matching', exact: true})
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 900});
    const heights: number[] = [];
    for (const [current, kind] of [
      ['Domain suffix', 'Full domain'],
      ['Full domain', 'Domain regex']
    ]) {
      await pick(page, current, 'Match by', kind);
      await expect(page.getByRole('button', {name: 'About Pattern', exact: true})).toHaveCount(kind === 'Domain regex' ? 1 : 0);
      const boxes = await Promise.all(controls.map(box));
      expect(new Set(boxes.map(b => b.height)).size).toBe(1);
      // A phone stacks the controls, one per line; a wide row shares one line.
      if (width > 600) expect(new Set(boxes.map(b => b.y)).size).toBe(1);
      heights.push((await box(row)).height);
    }
    expect(heights[1]).toBe(heights[0]);
    await pick(page, 'Domain regex', 'Match by', 'Domain suffix');
  }
});

test('an empty pattern with a record type deletes that whole type', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  const type = 'AAAA';
  const matches = entries.filter(entry => entry.type === type);
  await page.goto('/#/dns?tab=cache');
  const button = page.getByRole('button', {name: 'Delete matching', exact: true});
  await expect(button).toBeDisabled();
  await pick(page, 'All supported types', 'Type', type);
  await button.click();
  const dialog = page.getByRole('alertdialog', {name: 'Delete matching', exact: true});
  await expect(dialog).toContainText(`Delete ${matches.length} cache entries?`);
  expect(await listed(dialog)).toEqual(named(matches));
  await dialog.getByRole('button', {name: 'Delete matching', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('No matching cache entries', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page.getByRole('grid', {name: 'Cache', exact: true})).toHaveAttribute('aria-rowcount', String(entries.length - matches.length + 1));
  await expect(page.getByRole('button', {name: new RegExp(`^Delete the ${type} cache entry`)})).toHaveCount(0);
  expect(deletes(requests)).toHaveLength(matches.length);
});

test('an exact name goes in one request, and the row needs a delete capability', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  const entry = entries.find(entry => entry.type === 'AAAA')!;
  await page.goto('/#/dns?tab=cache');
  const button = page.getByRole('button', {name: 'Delete matching', exact: true});
  await pick(page, 'Domain suffix', 'Match by', 'Full domain');
  await page.getByRole('textbox', {name: 'Pattern', exact: true}).fill(entry.domain.toUpperCase());
  await pick(page, 'All supported types', 'Type', entry.type);
  await button.click();
  const dialog = page.getByRole('alertdialog', {name: 'Delete matching', exact: true});
  expect(await listed(dialog)).toEqual(named([entry]));
  await dialog.getByRole('button', {name: 'Delete matching', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', {name: `Delete the ${entry.type} cache entry for ${entry.domain}`, exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page.getByRole('button', {name: `Delete the A cache entry for ${entry.domain}`, exact: true})).toBeVisible();
  const sent = deletes(requests);
  expect(sent).toHaveLength(1);
  expect(new URL(sent[0].url()).searchParams.getAll('type')).toEqual([entry.type]);
  const offer = (delete_name: boolean, delete_entry: boolean) => {
    handlers['GET capabilities'] = async () => {
      const capabilities = await api.capabilities();
      capabilities.resources.events.available = false;
      capabilities.resources.dns_cache.delete_name = delete_name;
      capabilities.resources.dns_cache.delete_entry = delete_entry;
      return capabilities;
    };
    return page.reload();
  };
  // Without a delete-by-name request, the same name goes entry by entry.
  await offer(false, true);
  await pick(page, 'Domain suffix', 'Match by', 'Full domain');
  await page.getByRole('textbox', {name: 'Pattern', exact: true}).fill(entry.domain);
  await pick(page, 'All supported types', 'Type', 'A');
  const before = deletes(requests).length;
  await button.click();
  await dialog.getByRole('button', {name: 'Delete matching', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', {name: `Delete the A cache entry for ${entry.domain}`, exact: true})).toHaveCount(0);
  const entryDeletes = deletes(requests).slice(before);
  expect(entryDeletes.map(request => new URL(request.url()).pathname)).toEqual([expect.stringMatching(/^\/api\/v1\/dns\/cache\/[^/]+$/)]);
  // Only an exact name can go when entries cannot be deleted one by one.
  await offer(true, false);
  await pick(page, 'Domain suffix', 'Match by', 'Domain keyword');
  await page.getByRole('textbox', {name: 'Pattern', exact: true}).fill('bilibili');
  await expect(page.getByText('This backend deletes cache entries by full domain only', {exact: true})).toBeVisible();
  await expect(button).toBeDisabled();
  await offer(false, false);
  await expect(page.getByRole('grid', {name: 'Cache', exact: true})).toBeVisible();
  await expect(button).toHaveCount(0);
});

import {ApiError} from '../src/api/error';
import {expect, mockBackend, test} from './fixtures';

test('cache deletion removes one entry and flushing requires confirmation', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  expect(entries.length).toBeGreaterThan(1);
  await page.goto('/#/dns?tab=cache');
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  await expect(grid).toHaveAttribute('aria-rowcount', String(entries.length + 1));
  const deleteHeader = page.getByRole('columnheader', {name: /^Delete /}).locator('.rp-th');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(await deleteHeader.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
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
  await expect(page.getByText('No cache entries', {exact: true})).toBeVisible();
  await expect(page.locator('.rp-toast.positive').last()).toContainText(`matched: ${entries.length - 1}, deleted: ${entries.length - 1}`);
  expect(requests.filter(request => request.method() !== 'GET').map(request => [request.method(), new URL(request.url()).pathname])).toEqual([
    ['DELETE', `/api/v1/dns/cache/${encodeURIComponent(entries[0].entry_id)}`],
    ['POST', '/api/v1/dns/cache/flush']
  ]);
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
  await expect(dialog.locator('.rp-spinner')).toBeVisible();
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
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
  await expect(page.getByText('No cache entries', {exact: true})).toBeVisible();
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
  await expect.poll(async () => (await table.boundingBox())!.height).toBeLessThanOrEqual(2 + 37 + entries.length * 40 + 1);
});

test('a hidden cache tab stops walking the cache until it is shown again', async ({page}) => {
  const {requests} = await mockBackend(page);
  const walks = () => requests.filter(request => new URL(request.url()).searchParams.get('limit') === '1000').length;
  await page.clock.install();
  await page.goto('/#/dns?tab=cache');
  await expect(page.getByRole('grid', {name: 'Cache', exact: true}).getByRole('rowheader').first()).toBeVisible();
  const shown = walks();
  await page.clock.fastForward(16000);
  await expect.poll(walks).toBeGreaterThan(shown);
  await page.getByRole('tab', {name: 'Statistics', exact: true}).click();
  // A walk the timers had already started may still reach the route; count from after it lands.
  await page.waitForTimeout(500);
  const hidden = walks();
  await page.clock.fastForward(46000);
  // A walk the timers started would reach the route within this real-time pause.
  await page.waitForTimeout(500);
  expect(walks()).toBe(hidden);
  await page.getByRole('tab', {name: 'Cache', exact: true}).click();
  await expect.poll(walks).toBeGreaterThan(hidden);
});

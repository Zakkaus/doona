import {ApiError} from '../src/api/error';
import {expect, mockBackend, test} from './fixtures';

test('cache deletion removes one entry and flushing requires confirmation', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const entries = (await api.dnsCache()).entries;
  expect(entries.length).toBeGreaterThan(1);
  await page.goto('/#/dns?tab=cache');
  const rows = page.getByRole('grid', {name: 'Cache', exact: true}).getByRole('rowheader');
  await expect(rows).toHaveCount(entries.length);
  const deleteHeader = page.getByRole('columnheader', {name: /^Delete /}).locator('.rp-th');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(await deleteHeader.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', {name: `Delete cache entry ${entries[0].entry_id}`, exact: true}).click();
  await expect(page.getByRole('button', {name: `Delete cache entry ${entries[0].entry_id}`, exact: true})).toHaveCount(0);
  await expect(rows).toHaveCount(entries.length - 1);
  await expect(page.locator('.rp-toast.positive')).toContainText('Deleted 1 cache entry');
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(0);
  await expect(rows).toHaveCount(entries.length - 1);
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await dialog.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(page.getByText('No cache entries', {exact: true})).toBeVisible();
  await expect(page.locator('.rp-toast.positive').last()).toContainText(`matched / deleted: ${entries.length - 1} / ${entries.length - 1}`);
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
  const rows = page.getByRole('grid', {name: 'Cache', exact: true}).getByRole('rowheader');
  await expect(rows).toHaveCount(entries.length);
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Cache is locked');
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  await expect(rows).toHaveText(entries.map(entry => entry.domain));
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(1);
});

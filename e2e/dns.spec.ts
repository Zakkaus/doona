import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

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

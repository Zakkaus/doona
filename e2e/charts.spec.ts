import {expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';

test.use({storage: {'doona-lang': 'en'}});

const fact = (page: import('@playwright/test').Page, label: string) =>
  page
    .locator('.rp-facts > div')
    .filter({has: page.locator('dt', {hasText: new RegExp(`^${label}$`)})})
    .locator('dd');

test('DNS opens on its statistics, with each figure labelled and its sample counted', async ({page}) => {
  await page.goto('/#/dns');
  await expect(page.getByRole('tab', {name: 'Statistics'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', {name: 'Cache', exact: true})).toBeVisible();
  await expect(page.getByText(/^Entries: \d+ \/ 8,192, size: [\d.]+ KB \/ 32 MB$/)).toBeVisible();
  await expect(fact(page, 'Median')).toHaveText(/^\d+ ms$/);
  await expect(fact(page, 'P95')).toHaveText(/^\d+ ms$/);
  await expect(fact(page, 'Cache hit rate')).toHaveText(/^\d+%$/);
  await expect(page.getByText(/^Loaded: \d+, uncached: \d+, sent upstream: \d+$/)).toBeVisible();
  const outcomes = page.getByRole('img', {name: /^Outcomes: /});
  for (const label of ['From the cache', 'Answered upstream', 'No such name', 'Failed']) await expect(outcomes).toHaveAccessibleName(new RegExp(label));
  await expect(page.getByRole('img', {name: /^Upstream latency \(\d+ lookups\)$/})).toBeVisible();
  // A link that filters by domain lands on the log itself.
  await page.goto('/#/dns?domain=example.com');
  await expect(page.getByRole('tab', {name: 'Resolution log'})).toHaveAttribute('aria-selected', 'true');
});

test('node latency groups two ways, shortens long groups and shows a tip on hover', async ({page}) => {
  await page.goto('/#/nodes?tab=latency');
  await expect(page.getByRole('tab', {name: 'Latency'})).toHaveAttribute('aria-selected', 'true');
  await expect(fact(page, 'Lowest')).toHaveText(/^.+ \(\d+ ms\)$/);
  await expect(fact(page, 'Highest')).toHaveText(/^.+ \(\d+ ms\)$/);
  await expect(fact(page, 'Unavailable')).toHaveText(/^\d+ nodes?$/);
  const plot = page.getByRole('group', {name: 'Node latency'});
  for (const label of ['Latest latency', 'Moving average', 'Average of the last 10']) await expect(plot.getByText(label, {exact: true})).toBeVisible();
  const row = plot.getByRole('img', {name: /^.+, latest: \d+ ms, moving average: \d+ ms, average of the last 10: \d+ ms$/}).first();
  await row.hover();
  await expect(page.locator('.rp-charttip')).toContainText('Moving average');
  const showAll = plot.getByRole('button', {name: /^Show all \d+$/});
  await expect(showAll).toBeVisible();
  const before = await plot.getByRole('img').count();
  await showAll.click();
  await expect.poll(() => plot.getByRole('img').count()).toBeGreaterThan(before);
  await page.getByRole('radio', {name: 'Protocol'}).click();
  await expect(plot.getByRole('region', {name: 'shadowsocks'})).toBeVisible();
});

test('traffic is the first connections tab, and a point opens its connection in the list', async ({page}) => {
  await page.goto('/#/connections');
  await expect(page.getByRole('tab', {name: 'Traffic'})).toHaveAttribute('aria-selected', 'true');
  await expect(fact(page, 'Heaviest connection')).toHaveText('cdn.bilibili.com (direct)');
  await expect(fact(page, 'Download')).toHaveText('1.1 GB');
  await expect(page.getByText(/^Connections: \d+(?:, without byte totals: \d+)?$/)).toBeVisible();
  await page.locator('.rp-scatter circle').first().click();
  await expect(page).toHaveURL(/[?&]tab=list/);
  await expect(page).toHaveURL(/[?&]id=/);
  await expect(page.getByRole('tab', {name: 'Connections'})).toHaveAttribute('aria-selected', 'true');
});

test('the log heatmap sits above the list and sets the minimum level from a row', async ({page}) => {
  await page.goto('/#/logs');
  await expect(fact(page, 'Errors')).toHaveText(/^\d+ records?$/);
  await expect(fact(page, 'Most errors')).toHaveText(/^\d\d:\d\d–\d\d:\d\d \(\d+\)$/);
  await page.getByRole('button', {name: 'Show Warning and above'}).click();
  await expect(page.getByRole('group', {name: 'Log activity over time'}).getByText('Info', {exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: /Level$/})).toContainText('Warning');
});

test('the DNS cache card reads usage from one entry and says only what the backend reports', async ({page}) => {
  const backend = await mockBackend(page);
  const card = page.getByRole('region', {name: 'Cache', exact: true});
  await page.goto('/#/dns');
  await expect(card.getByText(/^Entries: \d+ \/ 8,192, size: [\d.]+ KB \/ 32 MB$/)).toBeVisible();
  await expect(card.getByText('Usage', {exact: true})).toBeVisible();
  const listings = backend.requests.filter(request => new URL(request.url()).pathname.endsWith('/dns/cache'));
  // Every read asks for one entry: the card never walks the whole cache, however often it refreshes.
  const limits = listings.map(request => new URL(request.url()).searchParams.get('limit'));
  expect(limits.length).toBeGreaterThan(0);
  expect(new Set(limits)).toEqual(new Set(['1']));
  // A 503 after a reading replaces that reading: the backend no longer reports how full its cache is.
  backend.handlers['GET dns/cache'] = async () => {
    throw new ApiError(503, 'unavailable', 'DNS cache unavailable');
  };
  await page.locator('.rp-top').getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(card.getByText('The cache listing is temporarily unavailable', {exact: true})).toBeVisible();
  await expect(card.getByText('Usage', {exact: true})).toHaveCount(0);
  await page.reload();
  await expect(card.getByText('The cache listing is temporarily unavailable', {exact: true})).toBeVisible();
  // A backend that predates usage reporting gets no capacity claim.
  backend.handlers['GET dns/cache'] = async () => {
    const {usage: _, ...list} = await backend.api.dnsCache({limit: 1});
    return list;
  };
  await page.reload();
  await expect(card.getByText(/^Entries: \d+, capacity limit: not reported$/)).toBeVisible();
  await expect(card.getByText('Usage', {exact: true})).toHaveCount(0);
  // A backend that cannot read its cache says so for good.
  backend.capabilities.resources.dns_cache.read = false;
  await page.reload();
  await expect(card.getByText('This backend does not provide a cache listing', {exact: true})).toBeVisible();
});

for (const count of [0, 4]) {
  test(`with ${count} resolution records the charts wait for more while the cache card still reports`, async ({page}) => {
    const backend = await mockBackend(page);
    const seed = await backend.api.dnsLog();
    backend.handlers['GET dns/log'] = async () => ({...seed, records: seed.records.slice(0, count), next_cursor: null});
    await page.goto('/#/dns');
    const card = page.getByRole('region', {name: 'Cache', exact: true});
    await expect(card.getByText(/^Entries: \d+ \/ 8,192, size: [\d.]+ KB \/ 32 MB$/)).toBeVisible();
    await expect(page.getByText('Too few records to chart yet', {exact: true})).toHaveCount(3);
    await expect(page.locator('.rp-facts')).toHaveCount(0);
  });
}

test('a failed first log read shows in the charts it feeds while the cache card still reports', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET dns/log'] = async () => {
    throw new ApiError(500, 'internal', 'Log unavailable');
  };
  await page.goto('/#/dns');
  const card = page.getByRole('region', {name: 'Cache', exact: true});
  await expect(card.getByText(/^Entries: \d+ \/ 8,192, size: [\d.]+ KB \/ 32 MB$/)).toBeVisible();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({hasText: 'Log unavailable'})).toHaveCount(3);
});

test('the latency axis keeps its last label inside the chart on a phone', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/dns');
  const chart = page.getByRole('img', {name: /^Upstream latency \(\d+ lookups\)$/});
  await expect(chart).toBeVisible();
  const overflow = await chart.evaluate(svg => {
    const edge = svg.getBoundingClientRect().right;
    return Math.max(...[...svg.querySelectorAll('text.tick')].map(tick => tick.getBoundingClientRect().right - edge));
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

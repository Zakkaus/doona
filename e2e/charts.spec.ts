import {expect, test} from './fixtures';

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
  await expect(page.getByText(/^\d+ cache entries; the backend reports no capacity$/)).toBeVisible();
  await expect(fact(page, 'Median')).toHaveText(/^\d+ ms$/);
  await expect(fact(page, 'P95')).toHaveText(/^\d+ ms$/);
  await expect(fact(page, 'Cache hit rate')).toHaveText(/^\d+%$/);
  await expect(page.getByText(/^\d+ loaded records: \d+ uncached, \d+ sent upstream;/)).toBeVisible();
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
  const row = plot.getByRole('img', {name: /^.+: latest \d+ ms, moving average \d+ ms, average of the last 10 \d+ ms$/}).first();
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

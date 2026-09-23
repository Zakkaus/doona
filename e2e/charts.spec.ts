import {expect, test} from './fixtures';

test.use({storage: {'doona-lang': 'en'}});

test('the DNS log card answers in words, counts its sample and stays folded once folded', async ({page}) => {
  await page.goto('/#/dns?tab=log');
  const trigger = page.getByRole('button', {name: 'Lookup speed and outcomes'});
  await expect(trigger).toBeVisible();
  await expect(page.getByText(/^A typical lookup takes \d+ ms and the slowest 5% take over \d+ ms; \d+% were answered from the cache\.$/)).toBeVisible();
  await expect(page.getByText(/^From the \d+ loaded records$/)).toBeVisible();
  const outcomes = page.getByRole('img', {name: /^Outcomes: /});
  for (const label of ['From the cache', 'Answered upstream', 'No such name', 'Failed']) await expect(outcomes).toHaveAccessibleName(new RegExp(label));
  await expect(page.getByRole('img', {name: /lookups sent upstream/})).toBeVisible();
  await trigger.click();
  await expect(outcomes).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', {name: 'Lookup speed and outcomes'})).toHaveAttribute('aria-expanded', 'false');
});

test('node latency shows three named markers per node, groups two ways and shortens long groups', async ({page}) => {
  await page.goto('/#/nodes?tab=latency');
  await expect(page.getByRole('tab', {name: 'Latency'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/^The fastest is .+ \(\d+ ms\) and the slowest .+ \(\d+ ms\); \d+ nodes? (is|are) unavailable\.$/)).toBeVisible();
  const plot = page.getByRole('group', {name: 'Node latency'});
  for (const label of ['Latest', 'Moving average', 'Average of the last 10']) await expect(plot.getByText(label, {exact: true})).toBeVisible();
  await expect(plot.getByRole('img', {name: /^hk-01: latest \d+ ms, moving average \d+ ms, average of the last 10 \d+ ms$/}).first()).toBeVisible();
  const showAll = plot.getByRole('button', {name: /^Show all \d+$/});
  await expect(showAll).toBeVisible();
  const before = await plot.getByRole('img').count();
  await showAll.click();
  await expect.poll(() => plot.getByRole('img').count()).toBeGreaterThan(before);
  await page.getByRole('radio', {name: 'Protocol'}).click();
  await expect(plot.getByRole('region', {name: 'shadowsocks'})).toBeVisible();
});

test('clicking a connection in the traffic chart opens it', async ({page}) => {
  await page.goto('/#/connections');
  await expect(page.getByText(/^The busiest is cdn\.bilibili\.com \(via direct, 1\.1 GB down, 1\.1 MB up\)\.$/)).toBeVisible();
  await page.getByRole('button', {name: 'Traffic per connection'}).click();
  await page.locator('.rp-scatter circle').first().click();
  await expect(page).toHaveURL(/[?&]id=/);
});

test('the log heatmap sets the minimum level from a row', async ({page}) => {
  await page.goto('/#/logs');
  await expect(page.getByText(/^\d+ errors?, most of them around \d\d:\d\d–\d\d:\d\d \(\d+\)\.$/)).toBeVisible();
  await page.getByRole('button', {name: 'Show Warning and above'}).click();
  await expect(page.getByRole('button', {name: /Level$/})).toContainText('Warning');
  await expect(page.getByRole('group', {name: 'Log activity over time'}).getByText('Info', {exact: true})).toHaveCount(0);
});

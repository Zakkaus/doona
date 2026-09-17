import type {Locator} from '@playwright/test';
import {expect, test} from './fixtures';

const rows = (table: Locator) => table.locator('[role=rowgroup]:last-child [role=row][data-key]');

test('nodes sort by name, latency and protocol, and filter by group and protocol', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  const table = page.locator('.rp-table').nth(1);
  const list = rows(table);
  await expect(list).toHaveCount(5);
  await expect(list.first()).toContainText('hk-01');
  await table.getByRole('columnheader', {name: /^Latency/}).click();
  await expect(list.first()).toContainText('sg-01');
  await expect(list.last()).toContainText('jp-01');
  await table.getByRole('columnheader', {name: /^Latency/}).click();
  await expect(list.first()).toContainText('jp-01');
  await table.getByRole('columnheader', {name: /^Node/}).click();
  await expect(list.first()).toContainText('hk-01');
  await page.getByRole('button', {name: /Group$/}).click();
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await expect(list).toHaveCount(2);
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('2 / 5');
  await page.getByLabel('Search nodes').fill('jp');
  await expect(list).toHaveCount(1);
});

test('a share link becomes an inline node and can be removed again', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  const table = page.locator('.rp-table').nth(1);
  const list = rows(table);
  await expect(list).toHaveCount(5);
  await page.getByRole('button', {name: 'Paste node link', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('hk-03');
  await dialog.getByLabel('Node link').fill('foo://nope');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Unsupported share link scheme');
  await dialog.getByLabel('Node link').fill('vless://uuid@example.com:443?security=tls#hk-03');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'hk-03 added'})).toBeVisible();
  await expect(list).toHaveCount(6);
  await expect(list.filter({hasText: 'hk-03'})).toContainText('vless');
  await page.getByRole('button', {name: 'Remove hk-03', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove hk-03', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'hk-03 removed'})).toBeVisible();
  await expect(list).toHaveCount(5);
  // The management write landed in the main source as a new generation.
  await page.locator('.rp-nav[href="#/config"]').click();
  await expect(page.locator('.rp-toolbar').first()).toContainText('42');
});

test('a subscription is added unfetched and removed with its nodes', async ({page}) => {
  await page.goto('/#/nodes');
  const sources = rows(page.locator('.rp-table').first());
  await expect(sources).toHaveCount(2);
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('sub-d');
  await dialog.getByLabel('Subscription URL').fill('https://example.org/sub?token=abc');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-d added'})).toBeVisible();
  await expect(sources).toHaveCount(3);
  await expect(sources.filter({hasText: 'sub-d'})).toContainText('Stale');
  await page.getByRole('button', {name: 'Remove sub-c', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove sub-c', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-c removed'})).toBeVisible();
  await expect(sources).toHaveCount(2);
  await expect(sources.first()).toContainText('config.dae');
});

test('a node can be tested on its own', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Test hk-01', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText(/hk-01: \d+ ms/);
});

test.describe('long lists', () => {
  test.use({storage: {'doona-mock-big': '3000'}});
  test('a node list of thousands renders only the visible rows', async ({page}) => {
    await page.goto('/#/nodes?provider=sub-c');
    await expect(page.locator('.rp-toolbar').nth(1)).toContainText('3,000 / 3,000');
    const list = rows(page.locator('.rp-table').nth(1));
    await expect(list.first()).toBeVisible();
    expect(await list.count()).toBeLessThan(100);
  });
});

test('node sources list their nodes and a subscription can be refreshed', async ({page}) => {
  await page.goto('/#/nodes');
  const sources = page.locator('.rp-table').first().locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(sources).toHaveCount(2);
  await expect(sources.first()).toContainText('sub-c');
  const nodes = page.locator('.rp-table').nth(1).locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(nodes.first()).toBeVisible();
  expect(await nodes.count()).toBeGreaterThan(10);
  await sources.nth(1).click();
  await expect(page).toHaveURL(/provider=inline$/);
  await expect(nodes).toHaveCount(5);
  await page.getByRole('button', {name: 'Refresh sub-c', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('sub-c refreshed, 100 nodes');
});

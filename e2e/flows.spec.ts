import {expect, test} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});

test('a flow opens its trace beside the list and links to its connection', async ({page}) => {
  await page.goto('/#/flows');
  const rows = page.locator('.rp-table tbody tr[data-key]');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.locator('.rp-panel')).toHaveCount(0);
  await expect(page.getByRole('group', {name: 'Observation coverage'})).toContainText('3 dropped records');
  await rows.filter({hasText: 'api.telegram.org'}).first().click();
  await expect(page).toHaveURL(/#\/flows\?id=flow-1$/);
  const panel = page.locator('.rp-panel');
  await expect(panel.getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await expect(panel.getByText('Complete', {exact: true})).toBeVisible();
  expect(await panel.locator('.rp-step').count()).toBeGreaterThan(3);
  await expect(panel.locator('.rp-step').first()).toContainText('Input');
  await panel.getByRole('button', {name: 'View connection', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections\?id=1$/);
  await expect(page.locator('.rp-panel').getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await page.locator('.rp-panel').getByRole('button', {name: 'View flow', exact: true}).click();
  await expect(page).toHaveURL(/#\/flows\?id=flow-1$/);
  await page.locator('.rp-panel').getByRole('button', {name: 'Close', exact: true}).click();
  await expect(page).toHaveURL(/#\/flows$/);
  await expect(page.locator('.rp-panel')).toHaveCount(0);
});

test('the traffic map lays out the config and a pinned path filters the list', async ({page}) => {
  await page.goto('/#/flows');
  const map = page.getByRole('region', {name: 'Traffic path'});
  const rows = page.locator('.rp-table tbody tr[data-key]');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  for (const column of ['Ingress', 'Rule', 'Outbound', 'Node']) await expect(map.getByRole('group', {name: column})).toBeVisible();
  // Every configured group is in the outbound column, used or not; links are drawn once boxes are laid out.
  for (const group of ['proxy', 'direct', 'airport']) await expect(map.getByRole('group', {name: 'Outbound'}).getByText(group, {exact: true})).toBeVisible();
  expect(await map.locator('svg path').count()).toBeGreaterThan(3);
  const rule = map.getByRole('group', {name: 'Rule'}).getByRole('radio').or(map.getByRole('group', {name: 'Rule'}).getByRole('button')).filter({hasText: 'dip(geoip:cn)'});
  await rule.click();
  await expect(page).toHaveURL(/path=rule%3Adip/);
  await expect(rule).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('dip(geoip:cn)');
  await expect(map.locator('[data-map-id][data-dim]').first()).toBeVisible();
  await page.getByRole('button', {name: 'Clear path filter', exact: true}).click();
  await expect(rows).toHaveCount(total);
  await expect(page).not.toHaveURL(/path=/);
  await expect(map.locator('[data-map-id][data-dim]')).toHaveCount(0);
});

test('filters narrow the list and the connection chip clears its filter', async ({page}) => {
  await page.goto('/#/flows');
  const rows = page.locator('.rp-table tbody tr[data-key]');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  await page.getByRole('radio', {name: 'UDP', exact: true}).click();
  await expect(rows.first()).toContainText('UDP');
  expect(await rows.count()).toBeLessThan(total);
  await page.getByRole('radio', {name: 'All', exact: true}).click();
  await expect(rows).toHaveCount(total);
  await page.goto('/#/flows?connection_id=1');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('api.telegram.org');
  await page.getByRole('button', {name: 'Clear connection filter', exact: true}).click();
  await expect(page).toHaveURL(/#\/flows$/);
  await expect(rows).toHaveCount(total);
});

test.describe('flows unavailable', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('direct flow link renders without browser errors', async ({page}) => {
    await page.goto('/#/flows');
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.locator('.rp-nav[href="#/flows"]')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/flows$/);
  });
});

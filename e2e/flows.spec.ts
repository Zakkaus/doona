import {expect, test} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});

test('a flow opens its trace beside the list and links to its connection', async ({page}) => {
  await page.goto('/#/rules?tab=flows');
  const rows = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.locator('.rp-panel')).toHaveCount(0);
  await expect(page.getByRole('group', {name: 'Observation coverage'})).toContainText('3 dropped records');
  await rows.filter({hasText: 'api.telegram.org'}).first().click();
  await expect(page).toHaveURL(/#\/rules\?tab=flows&id=flow-1$/);
  const panel = page.locator('.rp-panel');
  await expect(panel.getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await expect(panel.getByText('Complete', {exact: true})).toBeVisible();
  expect(await panel.locator('.rp-step').count()).toBeGreaterThan(3);
  await expect(panel.locator('.rp-step').first()).toContainText('Input');
  await panel.getByRole('link', {name: 'View connection', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections\?id=1$/);
  await expect(page.locator('.rp-panel').getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await page.locator('.rp-panel').getByRole('button', {name: 'View flow', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=flows&id=flow-1$/);
  await page.locator('.rp-panel').getByRole('button', {name: 'Close', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=flows$/);
  await expect(page.locator('.rp-panel')).toHaveCount(0);
});

test('a pinned topology item carries into the records', async ({page}) => {
  await page.goto('/#/rules?tab=map');
  const topology = page.getByRole('region', {name: 'Connection topology', exact: true});
  const rule = topology.locator('[data-stage="rule"]').filter({hasText: 'dip(geoip: private)'}).first();
  await rule.click();
  // A rule is pinned by its id, so the address survives a rewording of the expression.
  await expect(page).toHaveURL(/path=rule%3Ar3$/);
  await expect(rule).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: 'Show the 4 flows on this path', exact: true}).click();
  await expect(page).toHaveURL(/tab=flows/);
  const rows = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('dip(geoip: private)');
  await page.getByRole('button', {name: 'Clear path filter', exact: true}).click();
  await expect(page).not.toHaveURL(/path=/);
  await expect.poll(() => rows.count()).toBeGreaterThan(4);
  await page.goto('/#/flows');
  await expect(page).toHaveURL(/#\/rules\?tab=map$/);
  await expect(topology).toBeVisible();
});

test('filters narrow the list and the connection chip clears its filter', async ({page}) => {
  await page.goto('/#/rules?tab=flows');
  const rows = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  await page.getByRole('radio', {name: 'UDP', exact: true}).click();
  await expect(rows.first()).toContainText('UDP');
  expect(await rows.count()).toBeLessThan(total);
  await page.getByRole('radio', {name: 'All', exact: true}).click();
  await expect(rows).toHaveCount(total);
  await page.goto('/#/rules?tab=flows&connection_id=1');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('api.telegram.org');
  await page.getByRole('button', {name: 'Clear connection filter', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=flows$/);
  await expect(rows).toHaveCount(total);
});

test.describe('flows unavailable', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('direct flow link renders without browser errors', async ({page}) => {
    await page.goto('/#/flows');
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.locator('.rp-nav[href="#/rules"]')).toHaveAttribute('data-unavailable', '');
    await expect(page).toHaveURL(/#\/rules\?tab=map$/);
  });
});

test('a flow record links its rule into the rule list', async ({page}) => {
  await page.goto('/#/rules?tab=flows');
  const link = page.getByRole('link', {name: /^Open .* in the rule list$/}).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=/);
  await expect(page.locator('[role="row"][aria-selected="true"]')).toBeVisible();
});

test('topology columns trace retained paths and pin by keyboard and pointer', async ({page}) => {
  await page.goto('/#/rules?tab=map');
  const topology = page.getByRole('region', {name: 'Connection topology', exact: true});
  for (const [stage, caption] of [
    ['client', 'Client'],
    ['rule', 'Rule'],
    ['outbound', 'Outbound'],
    ['node', 'Node']
  ]) {
    await expect(topology.locator('.rp-topology-captions').getByText(caption, {exact: true})).toBeVisible();
    await expect(topology.locator(`[data-stage="${stage}"]`).first()).toBeVisible();
    expect(await topology.locator(`[data-stage="${stage}"]`).count()).toBeLessThanOrEqual(12);
  }
  const node = topology.locator('[data-stage="client"]').filter({hasText: '10.0.0.12'}).first();
  await node.hover();
  await expect(topology.locator('.rp-topology-link[opacity="0.5"]').first()).toBeVisible();
  await expect(topology.locator('.rp-topology-link[opacity="0.06"]').first()).toBeVisible();
  await node.click();
  await expect(page).toHaveURL(/path=client%3A10\.0\.0\.12/);
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await node.press('Escape');
  await expect(page).not.toHaveURL(/path=/);
  await expect(node).toHaveAttribute('aria-pressed', 'false');
  await node.press('Enter');
  await expect(page).toHaveURL(/path=client%3A/);
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await node.press('Space');
  await expect(page).not.toHaveURL(/path=/);
  await expect(node).toHaveAttribute('aria-pressed', 'false');
  await node.click();
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await node.click();
  await expect(page).not.toHaveURL(/path=/);
  await expect(node).toHaveAttribute('aria-pressed', 'false');
  await topology.locator('h2').hover();
  const ribbon = topology.locator('.rp-topology-link').first();
  await ribbon.hover();
  await expect(topology.locator('.rp-topology-link[opacity="0.06"]').first()).toBeVisible();
  const others = topology.getByRole('button', {name: 'Others · 22 flows', exact: true});
  await others.click();
  await expect(page.getByRole('button', {name: 'Show the 22 flows on this path', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Show the 22 flows on this path', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Clear path filter', exact: true})).toHaveText('Path: Others');
  await expect(page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]')).toHaveCount(22);
});

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
  await panel.getByRole('button', {name: 'View connection', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections\?id=1$/);
  await expect(page.locator('.rp-panel').getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await page.locator('.rp-panel').getByRole('button', {name: 'View flow', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=flows&id=flow-1$/);
  await page.locator('.rp-panel').getByRole('button', {name: 'Close', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=flows$/);
  await expect(page.locator('.rp-panel')).toHaveCount(0);
});

test('the routing map lays the config out as lanes and a pinned item carries into the records', async ({page}) => {
  await page.goto('/#/rules?tab=map');
  const map = page.getByRole('region', {name: 'Traffic path'});
  const lanes = map.locator('.rp-lane');
  for (const group of ['proxy', 'Direct', 'skylink']) await expect(map.locator('strong', {hasText: new RegExp(`^${group}$`)})).toBeVisible();
  await expect(lanes.filter({has: page.locator('strong', {hasText: /^skylink$/})})).toContainText('Selected');
  const rule = map.getByRole('radio', {name: 'dip(geoip: private) 4', exact: true});
  await rule.click();
  // A rule is pinned by its id, so the address survives a rewording of the expression.
  await expect(page).toHaveURL(/path=rule%3Ar3$/);
  await expect(rule).toHaveAttribute('aria-checked', 'true');
  expect(await map.locator('.rp-lane[data-dim]').count()).toBeGreaterThan(0);
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
  await expect(map).toBeVisible();
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

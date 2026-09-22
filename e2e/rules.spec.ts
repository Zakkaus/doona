import {createMockApi} from '../src/api/mock';
import {expect, test} from './fixtures';

// Without the backend's rule dictionary the list falls back to the flows grouped by rule.
test('the rule list filters by source without accumulating polls, sorted in config order', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  capabilities.resources.rules.available = false;
  const flows = await api.flows();
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  await page.route('**/api/v1/flows?*', route => route.fulfill({json: flows}));
  await page.goto('/#/rules?tab=list');
  const panel = page.getByRole('tabpanel', {name: 'Rule list'});
  const rows = panel.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows.first()).toBeVisible();
  const allCount = await rows.count();
  const snapshot = await rows.allTextContents();
  const ids = await panel.getByRole('rowheader').allTextContents();
  expect(ids.length).toBe(allCount);
  const sourceRows = await Promise.all(
    ['Kernel', 'Recomputed', 'Unknown'].map(async source => ({
      source,
      texts: await rows.filter({has: page.locator('.rp-badge', {hasText: new RegExp(`^${source}$`)})}).allTextContents()
    }))
  );
  const filters = panel.getByRole('radiogroup', {name: 'Rule source'});
  for (const {source, texts} of sourceRows) {
    await filters.getByRole('radio', {name: source, exact: true}).click();
    await expect(rows).toHaveCount(texts.length);
    expect(await rows.allTextContents()).toEqual(texts);
  }
  expect(sourceRows.some(({texts}) => texts.length < allCount)).toBe(true);
  await filters.getByRole('radio', {name: 'All', exact: true}).click();
  await expect(rows).toHaveCount(allCount);
  await page.clock.fastForward(6000);
  expect(await rows.allTextContents()).toEqual(snapshot);
});

test('the rule list keeps exact loss counts and replaces an empty snapshot', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  capabilities.resources.rules.available = false;
  const snapshot = await api.flows();
  const flow = snapshot.flows[0];
  snapshot.flows = Array.from({length: 13}, (_, i) => ({
    ...flow,
    id: `flow-${i}`,
    rule_id: `rule-${i}`,
    rule_expression: `domain(full: rule-${i}.example)`,
    rule_source: 'kernel'
  }));
  snapshot.flows.push(
    {...flow, id: 'null-recomputed', rule_id: null, rule_expression: null, rule_source: 'recomputed'},
    {...flow, id: 'null-unknown', rule_id: null, rule_expression: null, rule_source: 'unknown'}
  );
  snapshot.dropped_records = '18446744073709551615';
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  await page.route('**/api/v1/flows?*', route => route.fulfill({json: snapshot}));
  await page.goto('/#/rules?tab=list');
  const panel = page.getByRole('tabpanel', {name: 'Rule list'});
  const rows = panel.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows).toHaveCount(15);
  const ids = await panel.getByRole('rowheader').allTextContents();
  expect(ids.slice(0, 3)).toEqual(['domain(full: rule-0.example)', 'domain(full: rule-1.example)', 'domain(full: rule-2.example)']);
  expect(ids.slice(-2)).toEqual(['Unknown rule', 'Unknown rule']);
  await expect(rows.first()).toContainText('6.7%');
  await expect(panel.getByText('18,446,744,073,709,551,615 dropped records', {exact: true})).toBeVisible();
  await panel.getByRole('radio', {name: 'Unknown', exact: true}).click();
  await expect(rows).toHaveCount(1);
  snapshot.flows = [];
  snapshot.dropped_records = null;
  await page.clock.fastForward(16000);
  await expect(rows).toHaveCount(0);
  await expect(panel.getByText('No matching flows in this snapshot', {exact: true})).toBeVisible();
  await expect(panel.getByText('Dropped record count unknown', {exact: true})).toBeVisible();
});

test.describe('without flow capability', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('the page leaves the navigation and a deep link says so', async ({page}) => {
    await page.goto('/#/rules');
    await expect(page.locator('.rp-nav[href="#/rules"]')).toHaveAttribute('data-unavailable', '');
    await expect(page.locator('.rp-content')).toContainText('The backend does not offer this page.');
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/rules$/);
  });
});

test('trace query mode validates ports and shows evaluations for both DNS address families', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  for (const resource of Object.values(capabilities.resources)) resource.available = false;
  capabilities.resources.routing_trace.available = true;
  capabilities.resources.routing_trace.resolve_modes = ['none'];
  capabilities.resources.dns_query.available = true;
  capabilities.resources.dns_query.limits!.max_types_per_request = 1;
  const requested: string[][] = [];
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  await page.route('**/api/v1/dns/query?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const types = query.getAll('type');
    requested.push(types);
    expect(types).toHaveLength(1);
    await route.fulfill({json: await api.dnsQuery(query.get('domain')!, types)});
  });
  await page.route('**/api/v1/routing/trace', async route => {
    await route.fulfill({json: await api.routingTrace(route.request().postDataJSON())});
  });
  await page.goto('/#/rules?tab=trace');
  await expect(page.getByLabel('Domain', {exact: true})).toHaveValue('');
  await expect(page.getByLabel('Destination port', {exact: true})).toHaveValue('');
  await expect(page.getByRole('button', {name: 'Run trace', exact: true})).toBeDisabled();
  expect(requested).toEqual([]);
  await page.getByLabel('Domain', {exact: true}).fill('trace.example');
  const run = page.getByRole('button', {name: 'Run trace', exact: true});
  await page.getByLabel('Destination port', {exact: true}).fill('65536');
  await expect(run).toBeDisabled();
  await page.getByLabel('Destination port', {exact: true}).fill('443');
  await run.click();
  await expect(page.getByRole('heading', {name: '192.0.2.14', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: '2001:db8::14', exact: true})).toBeVisible();
  await expect(page.getByRole('grid', {name: 'Rule evaluation 1', exact: true})).toBeVisible();
  await expect(page.getByRole('grid', {name: 'Rule evaluation 2', exact: true})).toBeVisible();
  expect(requested).toEqual([['A'], ['AAAA']]);
});

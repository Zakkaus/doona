import {createMockApi} from '../src/api/mock';
import {expect, test} from './fixtures';

test('the rule list filters by source without accumulating polls, sorted in config order', async ({page}) => {
  await page.clock.install();
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
  // Config order: rule-2 before rule-10, unknown IDs last.
  const ids = await panel.getByRole('rowheader').allTextContents();
  expect(ids.slice(0, 3)).toEqual(['domain(full: rule-0.example)', 'domain(full: rule-1.example)', 'domain(full: rule-2.example)']);
  expect(ids.slice(-2)).toEqual(['Unknown rule', 'Unknown rule']);
  await expect(rows.first()).toContainText('6.7%');
  await expect(panel.getByText('18446744073709551615 dropped records', {exact: true})).toBeVisible();
  await panel.getByRole('radio', {name: 'Unknown', exact: true}).click();
  await expect(rows).toHaveCount(1);
  snapshot.flows = [];
  snapshot.dropped_records = null;
  await page.clock.fastForward(6000);
  await expect(rows).toHaveCount(0);
  await expect(panel.getByText('No matching flows in this snapshot', {exact: true})).toBeVisible();
  await expect(panel.getByText('Dropped record count unknown', {exact: true})).toBeVisible();
});

test.describe('without flow capability', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('renders the rules page without tabs', async ({page}) => {
    await page.goto('/#/rules');
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.getByText('Routing trace unavailable', {exact: true})).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/rules$/);
  });
});

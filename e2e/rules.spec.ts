import {createMockApi} from '../src/api/mock';
import {expect, test} from './fixtures';

test('rule distribution filters sources without changing snapshot shares or accumulating polls', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/rules');
  const card = page.getByRole('region', {name: 'Rule distribution'});
  const rows = card.getByRole('listitem');
  await expect(rows.first()).toBeVisible();
  const allCount = await rows.count();
  const snapshot = await rows.allTextContents();
  const sourceRows = await Promise.all(
    ['kernel', 'Recomputed', 'Unknown'].map(async source => ({
      source,
      texts: await rows.filter({has: page.locator('.rp-provenance', {hasText: new RegExp(`^${source}$`)})}).allTextContents()
    }))
  );
  const filters = card.getByRole('radiogroup', {name: 'Rule source'});
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
  await rows.first().click();
  await expect(page).toHaveURL(/#\/rules$/);
});

test('retains overflow shares and exact loss counts, then replaces an empty snapshot', async ({page}) => {
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
  await page.route('**/api/v1/flows?*', route => route.fulfill({json: snapshot}));
  await page.goto('/#/rules');
  const card = page.getByRole('region', {name: 'Rule distribution'});
  const rows = card.getByRole('listitem');
  await expect(rows).toHaveCount(13);
  await expect(rows.last()).toContainText('Other 3 rules');
  await expect(rows.last()).toContainText('3 flows · 20.0%');
  await expect(card.getByText('18446744073709551615 dropped records', {exact: true})).toBeVisible();
  await card.getByRole('radio', {name: 'Unknown', exact: true}).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Unknown rule');
  await expect(rows.first()).toContainText('1 flow · 6.7%');
  snapshot.flows = [];
  snapshot.dropped_records = null;
  await page.clock.fastForward(6000);
  await expect(rows).toHaveCount(0);
  await expect(card.getByText('No matching flows in this snapshot', {exact: true})).toBeVisible();
  await expect(card.getByText('Dropped record count unknown', {exact: true})).toBeVisible();
});

test.describe('without flow capability', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('renders the routing page without a distribution card', async ({page}) => {
    await page.goto('/#/rules');
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.getByText('Routing trace unavailable', {exact: true})).toBeVisible();
    await expect(page.getByRole('region', {name: 'Rule distribution'})).toHaveCount(0);
    await expect(page).toHaveURL(/#\/rules$/);
  });
});

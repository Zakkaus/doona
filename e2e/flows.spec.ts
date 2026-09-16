import {expect, test} from './fixtures';

test('retained-flow graph filters rows and clears with the chip, repeated click, Enter, or Space', async ({page}) => {
  await page.goto('/#/flows');
  const chart = page.getByRole('region', {name: 'Flow distribution'});
  await expect(chart.locator('.rp-flow-columns')).toBeVisible();
  const nodes = page.locator('.rp-flow-graph button[data-node-id]');
  const rows = page.locator('.rp-table tbody tr[data-key]');
  const total = await rows.count();
  const rule = nodes.filter({hasText: 'domain(full: api.telegram.org)'});
  const firstRule = nodes.and(page.locator('[data-stage="rule"]')).first();
  await firstRule.click();
  await expect(rows).toHaveCount(1);
  expect(await rows.count()).toBeLessThan(total);
  await expect(rows.first()).toHaveAttribute('data-key', 'flow-1');
  const chip = page.getByRole('button', {name: 'Clear filter: Rule · domain(full: api.telegram.org)', exact: true});
  await chip.click();
  await expect(rows).toHaveCount(total);
  await expect(chip).toHaveCount(0);
  await rule.click();
  await rule.click();
  await expect(rows).toHaveCount(total);
  const lastSource = nodes.and(page.locator('[data-stage="source"]')).last();
  await lastSource.focus();
  await page.keyboard.press('Tab');
  await expect(rule).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(1);
  await expect(rule).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(total);
  await expect(rule).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(rows).toHaveCount(1);
  await expect(rule).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(rows).toHaveCount(total);
  await expect(rule).toHaveAttribute('aria-pressed', 'false');
  await expect(chart.getByText('3 dropped records', {exact: true})).toBeVisible();
  for (const label of ['Unknown source', 'Unknown rule', 'Unknown chain', 'Unknown outbound']) {
    await expect(nodes.getByText(label, {exact: true})).toBeVisible();
  }
});

test('graph visibility survives a reload without hiding coverage', async ({page}) => {
  await page.goto('/#/flows');
  const chart = page.getByRole('region', {name: 'Flow distribution'});
  await expect(chart.locator('.rp-flow-columns')).toBeVisible();
  await chart.getByRole('button', {name: 'Hide', exact: true}).click();
  await expect(chart.locator('.rp-flow-columns')).toHaveCount(0);
  await expect(chart.getByRole('group', {name: 'Observation coverage'})).toBeVisible();
  await page.reload();
  await expect(chart.getByRole('button', {name: 'Show flow graph'})).toBeVisible();
  await expect(chart.locator('.rp-flow-columns')).toHaveCount(0);
  await chart.getByRole('button', {name: 'Show flow graph'}).click();
  await expect(chart.locator('.rp-flow-columns')).toBeVisible();
  await page.reload();
  await expect(chart.locator('.rp-flow-columns')).toBeVisible();
});

test.describe('flows unavailable', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('direct flow link has no graph or browser errors', async ({page}) => {
    await page.goto('/#/flows');
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.locator('.rp-nav[href="#/flows"]')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/flows$/);
    await expect(page.locator('.rp-flow-graph')).toHaveCount(0);
  });
});

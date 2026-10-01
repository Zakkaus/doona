import {test, expect, moreAction, query} from './fixtures';
import {mockBackend} from './flag-fixtures';

test('country flags are a default-on display preference in the table and group picker', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const before = await api.config();
  await page.goto('/#/nodes?tab=list&provider=inline&q=jp-01');
  const name = page.locator('.rp-table').last().locator('.rp-truncate', {hasText: 'jp-01'}).first();
  await expect(name).toHaveText('jp-01');
  await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  await page.goto('/#/settings?card=appearance');
  const toggle = page.getByRole('switch', {name: 'Show country flags', exact: true});
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeChecked();
  await expect(toggle).toHaveAccessibleDescription('Adds a flag before node names that have none. Display only.');
  await page.goto('/#/nodes?tab=list&provider=inline&q=jp-01');
  await expect(name).toHaveText('jp-01');
  await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  await page.getByLabel('Search nodes').fill('jp-01');
  await expect(name).toHaveText('jp-01');
  await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  await page.reload();
  await expect(name).toHaveText('jp-01');
  await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('dialog');
  await search.getByRole('searchbox').fill('jp-01');
  await expect(search.getByRole('option', {name: /jp-01/}).locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  await search.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(search).toHaveCount(0);
  await page.goto('/#/policies');
  const proxy = page.getByRole('region', {name: 'proxy', exact: true});
  await moreAction(proxy, 'Edit group');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Final outbound$/}).click();
  await page.getByRole('searchbox', {name: 'Filter outbounds', exact: true}).fill('jp-01');
  const option = page.getByRole('option', {name: /jp-01/});
  await expect(option.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  expect(await api.config()).toEqual(before);
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  await option.click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  const original = before.sources.find(source => source.kind === 'main')!.content!;
  const expected = original.replace('    default: hk-01\n', '    default: hk-01\n    final: jp-01\n');
  expect(writes[0].postDataJSON()).toMatchObject({content: expected});
  const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(saved).toBe(expected);
  await page.goto('/#/settings?card=appearance');
  await page.getByText('Show country flags', {exact: true}).click();
  await page.goto('/#/nodes?tab=list&provider=inline&q=jp-01');
  await expect(name).toHaveText('jp-01');
  await expect(name.locator('.rp-node-flag')).toHaveCount(0);
});

test('decorations leave selected and copied names, accessible names and overflow tooltips unchanged', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => localStorage.setItem('doona-country-flags', 'on'));
  const {api, handlers} = await mockBackend(page);
  handlers['GET nodes'] = async request => {
    const list = await api.nodes(query(request));
    return {...list, nodes: list.nodes.map(node => (node.id === 'jp-01' ? {...node, group_ids: []} : node))};
  };
  await page.goto('/#/nodes?tab=list&provider=inline&q=jp-01');
  const name = page
    .locator('.rp-table .rp-truncate')
    .filter({hasText: /^jp-01$/})
    .first();
  await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  const truncated = name;
  const constraint = await page.addStyleTag({content: '.rp-table .rp-node-name { max-width: 30px; }'});
  await expect(truncated).toHaveAttribute('data-tip', '');
  const tooltip = page.getByRole('tooltip');
  await page.mouse.move(0, 0);
  await truncated.hover();
  await expect(tooltip).toHaveText('jp-01');
  await expect(tooltip.locator('.rp-node-flag')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await constraint.evaluate(node => node.parentNode?.removeChild(node));
  // ResizeObserver removes the tooltip wrapper; select the replacement span after it settles.
  await expect(name).not.toHaveAttribute('data-tip', '');
  const selected = await name.evaluate(node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(selected).toBe('jp-01');
  await page.keyboard.press('ControlOrMeta+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('jp-01');
  await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate(() => window.getSelection()?.toString())).not.toContain('🇯🇵');
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox').fill('jp-01');
  const option = dialog.getByRole('option', {name: 'jp-01', exact: true});
  await expect(option).toHaveAccessibleName('jp-01');
  await expect(option.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('rowheader', {name: 'jp-01', exact: true})).toHaveAccessibleName('jp-01');
});

test('Flows records, tree nodes and latency chart tooltips use the same decoration', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-country-flags', 'on'));
  const {api, handlers} = await mockBackend(page);
  await page.goto('/#/flows?tab=records');
  const cell = page
    .locator('.rp-table .rp-chain')
    .filter({hasText: /^hk-01$/})
    .first();
  await expect(cell).toHaveText('hk-01');
  await expect(cell.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇭🇰');
  await expect(cell).toHaveAttribute('data-tip', '');
  await page.mouse.move(0, 0);
  await cell.hover();
  await expect(page.getByRole('tooltip')).toHaveText('proxy → hk-01');
  await page.goto('/#/flows?tab=map');
  const tile = page.locator('[data-stage="node"]').filter({hasText: 'hk-01'}).first();
  await expect(tile.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇭🇰');
  await expect(tile).not.toHaveAccessibleName(/🇭🇰/);
  await page.goto('/#/connections');
  const card = page.getByRole('region', {name: 'Node latency', exact: true});
  await expect(card.locator('.rp-swarm circle').first()).toBeVisible();
  await card.locator('.rp-swarm circle').first().hover();
  const tip = card.locator('.rp-charttip');
  await expect(tip.locator('.rp-node-flag')).toBeVisible();
  expect(await tip.locator('b').textContent()).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  handlers['GET nodes'] = async request => {
    const list = await api.nodes(query(request));
    return {...list, nodes: list.nodes.map(node => (node.id === 'jp-01' ? {...node, health: []} : node))};
  };
  await page.goto('/#/nodes?tab=latency');
  const row = page.locator('.rp-markerplot .row').filter({hasText: 'hk-01'}).first();
  await expect(row).toBeVisible();
  const unavailable = page.locator('.rp-markerplot .note').filter({hasText: 'jp-01'}).first();
  await expect(unavailable.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇯🇵');
  await expect(row.getByRole('link', {name: 'hk-01', exact: true})).toHaveAccessibleName('hk-01');
  await row.hover();
  await expect(page.locator('.rp-charttip .rp-node-flag')).toHaveAttribute('data-flag', '🇭🇰');
});

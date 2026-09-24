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

test('a pinned tree item carries into the records', async ({page}) => {
  await page.goto('/#/rules?tab=map');
  const topology = page.getByRole('region', {name: 'Connection topology', exact: true});
  const rule = topology.locator('[data-stage="rule"]').filter({hasText: 'dip(geoip: private)'});
  await rule.click();
  // A rule is pinned by its id, so the address survives a rewording of the expression.
  await expect(page).toHaveURL(/path=rule%3Ar3$/);
  await expect(rule).toHaveAttribute('aria-pressed', 'true');
  const showFlows = page.getByRole('button', {name: /^Show the \d+ flows? on this path$/});
  const matching = Number((await showFlows.innerText()).match(/\d+/)?.[0]);
  expect(matching).toBeGreaterThan(0);
  await showFlows.click();
  await expect(page).toHaveURL(/tab=flows/);
  const grid = page.getByRole('grid');
  const rows = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  const count = async () => {
    const virtualCount = await grid.getAttribute('aria-rowcount');
    return virtualCount ? Number(virtualCount) - 1 : rows.count();
  };
  await expect.poll(count).toBe(matching);
  await expect(rows.first()).toContainText('dip(geoip: private)');
  const clearPath = page.getByRole('button', {name: 'Clear path filter: Path: dip(geoip: private)', exact: true});
  await expect(clearPath).toHaveText('Path: dip(geoip: private)');
  await clearPath.click();
  await expect(page).not.toHaveURL(/path=/);
  await expect.poll(count).toBeGreaterThan(matching);
  await page.goto('/#/flows');
  await expect(page).toHaveURL(/#\/rules\?tab=map$/);
  await expect(topology).toBeVisible();
});

test('a flow offers a rule for its target, prefilled in the rule list', async ({page}) => {
  await page.goto('/#/rules?tab=flows&id=flow-1');
  const panel = page.locator('.rp-panel');
  await panel.getByRole('link', {name: 'Add a rule for this target', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule', exact: true});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.rp-code')).toHaveText('domain(suffix: api.telegram.org)');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/rules\?tab=list$/);
  // A second seed after the first was dismissed still opens, with the list and config already cached.
  await page.getByRole('tab', {name: 'Flow records', exact: true}).click();
  await page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]').filter({hasText: 'cdn.bilibili.com'}).first().click();
  await panel.getByRole('link', {name: 'Add a rule for this target', exact: true}).click();
  await expect(dialog.locator('.rp-code')).toHaveText('domain(suffix: cdn.bilibili.com)');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.goto('/#/rules?tab=list&add=dip:203.0.113.5');
  await expect(page.getByRole('dialog', {name: 'Add rule', exact: true}).locator('.rp-code')).toHaveText('dip(203.0.113.5)');
});

test('filters narrow the list and the connection chip clears its filter', async ({page}) => {
  await page.goto('/#/rules?tab=flows');
  const grid = page.getByRole('grid');
  const rows = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows.first()).toBeVisible();
  const total = Number(await grid.getAttribute('aria-rowcount')) - 1;
  await page.getByRole('radio', {name: 'UDP', exact: true}).click();
  await expect(rows.first()).toContainText('UDP');
  expect(Number(await grid.getAttribute('aria-rowcount')) - 1).toBeLessThan(total);
  await page.getByRole('radio', {name: 'All', exact: true}).click();
  await expect(grid).toHaveAttribute('aria-rowcount', String(total + 1));
  await page.goto('/#/rules?tab=flows&connection_id=1');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('api.telegram.org');
  await page.getByRole('button', {name: 'Clear connection filter: Connection: 1', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=flows$/);
  await expect(grid).toHaveAttribute('aria-rowcount', String(total + 1));
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

test('the tree draws every configured rule, follows a hover along its branch and pins by keyboard and pointer', async ({page}) => {
  await page.goto('/#/rules?tab=map');
  const topology = page.getByRole('region', {name: 'Connection topology', exact: true});
  for (const [stage, caption] of [
    ['rule', 'Rule'],
    ['outbound', 'Outbound'],
    ['node', 'Node']
  ]) {
    await expect(topology.locator('.rp-tree-captions').getByText(caption, {exact: true})).toBeVisible();
    await expect(topology.locator(`[data-stage="${stage}"]`).first()).toBeVisible();
  }
  // Every configured rule is drawn, unused ones included, grouped under its outbound.
  const rules = topology.locator('[data-stage="rule"]');
  await expect(rules).toHaveCount(10);
  await expect(rules.filter({hasText: 'sip(10.0.0.0/24) && dport(25)'})).toContainText('0');
  await expect(rules.filter({hasText: 'fallback: resilient'})).toHaveCount(1);
  // Groups nothing routes to are still drawn, with a dashed connector to the node they select.
  await expect(topology.locator('[data-stage="outbound"]').filter({hasText: 'skylink'})).toBeVisible();
  const links = topology.locator('.rp-tree-links path');
  expect(await links.count()).toBeGreaterThan(8);
  await expect(topology.locator('.rp-tree-links path[stroke-dasharray]').first()).toBeAttached();
  // Hovering a rule lights its branch and dims the rest.
  const item = topology.locator('[data-stage="rule"]').filter({hasText: 'domain(suffix: doubleclick.net)'});
  await item.hover();
  await expect(topology.locator('[data-stage="outbound"]').filter({hasText: 'block'})).not.toHaveClass(/dim/);
  await expect(topology.locator('[data-stage="outbound"]').filter({hasText: 'proxy'})).toHaveClass(/dim/);
  await expect(topology.locator('.rp-tree-links path[data-state="active"]').first()).toBeAttached();
  await expect(topology.locator('.rp-tree-links path[data-state="dim"]').first()).toBeAttached();
  // A node pins too, and lights the groups and rules that reach it.
  const node = topology.locator('[data-stage="node"]').filter({hasText: 'hk-01'});
  await node.click();
  await expect(page).toHaveURL(/path=node%3Ahk-01/);
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await expect(topology.locator('[data-stage="outbound"]').filter({hasText: 'proxy'})).not.toHaveClass(/dim/);
  await node.press('Escape');
  await expect(page).not.toHaveURL(/path=/);
  await expect(node).toHaveAttribute('aria-pressed', 'false');
  await node.press('Enter');
  await expect(page).toHaveURL(/path=node%3A/);
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await node.press('Space');
  await expect(page).not.toHaveURL(/path=/);
  await expect(node).toHaveAttribute('aria-pressed', 'false');
  await node.click();
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await node.click();
  await expect(page).not.toHaveURL(/path=/);
  await expect(node).toHaveAttribute('aria-pressed', 'false');
});

test('the tree can be seen by device, with the toggle in the address and pins carrying over', async ({page}) => {
  await page.goto('/#/rules?tab=map');
  const topology = page.getByRole('region', {name: 'Connection topology', exact: true});
  await page.getByRole('radio', {name: 'By device', exact: true}).click();
  await expect(page).toHaveURL(/by=client/);
  await expect(topology.locator('.rp-tree-captions').getByText('Device', {exact: true})).toBeVisible();
  await expect(topology.locator('[data-stage="rule"]')).toHaveCount(0);
  const device = topology.locator('[data-stage="client"]').filter({hasText: '10.0.0.12'});
  await expect(device).toHaveAttribute('aria-label', /^10\.0\.0\.12, \d+ flows, → /);
  await device.click();
  await expect(page).toHaveURL(/path=client%3A10\.0\.0\.12/);
  await page.getByRole('button', {name: /^Show the \d+ flows on this path$/}).click();
  await expect(page.getByRole('button', {name: 'Clear path filter: Path: 10.0.0.12', exact: true})).toHaveText('Path: 10.0.0.12');
  await page.goBack();
  await expect(page).toHaveURL(/tab=map&by=client&path=client%3A10\.0\.0\.12/);
  await page.getByRole('radio', {name: 'By rule', exact: true}).click();
  await expect(page).not.toHaveURL(/by=|path=/);
  await expect(topology.locator('[data-stage="rule"]').first()).toBeVisible();
});

test.describe('narrow screens', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('the map cues horizontal panning and gives tiles a 36 px target', async ({page}) => {
    await page.goto('/#/rules?tab=map');
    for (const lang of ['zh-TW', 'en']) {
      for (const scheme of ['light', 'dark']) {
        await page.evaluate(
          ({lang, scheme}) => {
            localStorage.setItem('doona-lang', lang);
            localStorage.setItem('doona-scheme', scheme);
          },
          {lang, scheme}
        );
        await page.reload();
        const map = page.locator('.rp-topology');
        await expect(map.locator('.rp-tree-hint')).toBeVisible();
        await expect(map.locator('.rp-tree-tile').first()).toBeVisible();
        const heights = await map.locator('.rp-tree-tile').evaluateAll(tiles => tiles.map(tile => tile.getBoundingClientRect().height));
        expect(Math.min(...heights), `${lang} ${scheme} tile height`).toBeGreaterThanOrEqual(36);
        expect(await map.locator('.rp-tree').evaluate(tree => tree.scrollWidth > tree.clientWidth)).toBe(true);
      }
    }
  });

  test('the tree keeps its shape and pans inside its card instead of widening the page', async ({page}) => {
    await page.goto('/#/rules?tab=map');
    const topology = page.getByRole('region', {name: 'Connection topology', exact: true});
    await expect(topology.locator('[data-stage="node"]').first()).toBeVisible();
    const box = (await topology.locator('.rp-tree').evaluate(el => ({scroll: el.scrollWidth, client: el.clientWidth})))!;
    expect(box.scroll).toBeGreaterThan(box.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Growing to a desktop width and back keeps the columns where the width says, not where they were.
    await page.setViewportSize({width: 1280, height: 844});
    await expect.poll(() => topology.locator('.rp-tree').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.setViewportSize({width: 390, height: 844});
    await expect.poll(() => topology.locator('.rp-tree').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const tiles = await topology.locator('.rp-tree-tile').evaluateAll(els => els.map(el => el.getBoundingClientRect()));
    const overlaps = tiles.some((a, i) => tiles.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
    expect(overlaps).toBe(false);
  });
});

test('the connection topology card is titled like the other chart cards', async ({page}) => {
  await page.goto('/#/rules?tab=map');
  const topology = page.getByRole('region', {name: 'Connection topology', exact: true});
  await expect(topology.getByRole('heading', {level: 3, name: 'Connection topology', exact: true})).toHaveClass(/\brp-h3\b/);
});

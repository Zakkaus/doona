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
  await expect(toggle).toHaveAccessibleDescription('Shows flags before node names. Display only.');
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
  await page.bringToFront();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
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
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('jp-01');
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

test('edits node flags from the existing menu and updates the table, picker and Flows', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const config = await api.config();
  await page.goto('/#/nodes?tab=list&provider=inline&q=hk-01');
  const row = page.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})});
  await row.getByRole('button', {name: 'Node actions', exact: true}).click();
  const edit = page.getByRole('menuitem', {name: 'Change flag…', exact: true});
  const menuGeometry = await edit.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    control: parseFloat(getComputedStyle(element).getPropertyValue('--rp-control'))
  }));
  expect(menuGeometry.height).toBe(menuGeometry.control);
  await edit.click();
  const dialog = page.getByRole('dialog', {name: 'Change flag…', exact: true});
  await dialog.getByRole('button', {name: /Flag/}).click();
  await page.getByRole('searchbox', {name: 'Search regions', exact: true}).fill('Taiwan');
  const option = page.getByRole('option', {name: /Taiwan/});
  const geometry = await option.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const label = element.querySelector('.rp-il')!.getBoundingClientRect();
    return {
      height: rect.height,
      control: parseFloat(getComputedStyle(element).getPropertyValue('--rp-control')),
      paddingStart: getComputedStyle(element).paddingInlineStart,
      paddingEnd: getComputedStyle(element).paddingInlineEnd,
      inset: label.left - rect.left,
      right: rect.right - label.right
    };
  });
  expect(geometry.height).toBe(geometry.control);
  expect(geometry.paddingStart).toBe(geometry.paddingEnd);
  expect(geometry.inset).toBeGreaterThanOrEqual(8);
  expect(geometry.right).toBeGreaterThanOrEqual(8);
  await option.click();
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(row.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'Edit group');
  const policy = page.getByRole('dialog');
  await policy.getByRole('button', {name: /Final outbound$/}).click();
  await page.getByRole('searchbox', {name: 'Filter outbounds', exact: true}).fill('hk-01');
  await expect(page.getByRole('option', {name: /hk-01/}).locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
  await page.getByRole('searchbox', {name: 'Filter outbounds', exact: true}).fill('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await policy.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.goto('/#/flows?tab=records');
  const name = page
    .locator('.rp-table .rp-chain')
    .filter({hasText: /^hk-01$/})
    .first();
  await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
  await page.reload();
  await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
  expect(await api.config()).toEqual(config);
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

for (const width of [1440, 390])
  test(`flag choices preserve embedded flags and follow the master switch at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    const {api, handlers} = await mockBackend(page);
    handlers['GET nodes'] = async request => {
      const list = await api.nodes(query(request));
      return {...list, nodes: list.nodes.map(node => (node.id === 'jp-01' ? {...node, name: '🇯🇵 jp-01'} : node))};
    };
    await page.goto('/#/nodes?tab=list&provider=inline&q=hk-01');
    const name = page.getByRole('rowheader', {name: 'hk-01', exact: true});
    const edit = async () => {
      await page
        .getByRole('row')
        .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
        .getByRole('button', {name: 'Node actions', exact: true})
        .click();
      await page.getByRole('menuitem', {name: 'Change flag…', exact: true}).click();
      return page.getByRole('dialog', {name: 'Change flag…', exact: true});
    };
    const dialog = await edit();
    const trigger = dialog.getByRole('button', {name: /Flag/});
    const geometry = await trigger.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      control: parseFloat(getComputedStyle(element).getPropertyValue('--rp-control'))
    }));
    expect(geometry.height).toBe(geometry.control);
    await trigger.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await trigger.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    expect(await trigger.evaluate(element => element.getBoundingClientRect().height)).toBe(geometry.control);
    await page.getByRole('option', {name: 'No flag', exact: true}).click();
    await dialog.getByRole('button', {name: 'Close', exact: true}).click();
    await expect(name.locator('.rp-node-flag')).toHaveCount(0);
    await edit();
    await dialog.getByRole('button', {name: /Flag/}).click();
    await page.getByRole('option', {name: /Automatic.*Hong Kong/}).click();
    await dialog.getByRole('button', {name: 'Close', exact: true}).click();
    await expect(name.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇭🇰');
    await page.getByRole('searchbox', {name: 'Search nodes', exact: true}).fill('jp-01');
    await expect(page.getByRole('rowheader', {name: '🇯🇵 jp-01', exact: true})).toBeVisible();
    await page
      .getByRole('row')
      .filter({has: page.getByRole('rowheader', {name: '🇯🇵 jp-01', exact: true})})
      .getByRole('button', {name: 'Node actions', exact: true})
      .click();
    await page.getByRole('menuitem', {name: 'Change flag…', exact: true}).click();
    await expect(dialog.getByRole('button', {name: /Flag/})).toBeDisabled();
    await expect(dialog.getByRole('button', {name: /Flag/})).toHaveAccessibleDescription('The flag is part of this name and cannot be hidden or replaced.');
    await expect(dialog.getByRole('button', {name: /Flag/})).toContainText('Automatic');
    await dialog.getByRole('button', {name: 'Close', exact: true}).click();
    await page.getByRole('rowheader', {name: '🇯🇵 jp-01', exact: true}).click();
    const embeddedDetails = page.getByRole('region', {name: 'Node details', exact: true});
    await expect(embeddedDetails.getByRole('button', {name: /Flag/})).toBeDisabled();
    await expect(embeddedDetails.getByRole('button', {name: /Flag/})).toHaveAccessibleDescription(
      'The flag is part of this name and cannot be hidden or replaced.'
    );
    await page.goto('/#/settings?card=appearance');
    await page.getByText('Show country flags', {exact: true}).click();
    await page.goto('/#/nodes?tab=list&provider=inline');
    await expect(page.locator('.rp-table .rp-node-flag')).toHaveCount(0);
    await expect(page.getByRole('rowheader', {name: '🇯🇵 jp-01', exact: true})).toBeVisible();
  });

for (const [lang, scheme, width] of [
  ['zh-TW', 'dark', 1440],
  ['en', 'light', 390]
] as const)
  test(`region picker names, order, search and placement in ${lang} at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    await page.addInitScript(
      ({lang, scheme}) => {
        localStorage.setItem('doona-lang', lang);
        localStorage.setItem('doona-scheme', scheme);
      },
      {lang, scheme}
    );
    await mockBackend(page);
    await page.goto('/#/nodes?provider=inline&q=hk-01');
    await page.getByRole('rowheader', {name: 'hk-01', exact: true}).click();
    const details = page.getByRole('region', {name: lang === 'en' ? 'Node details' : '節點詳細資料', exact: true});
    const trigger = details.getByRole('button', {name: lang === 'en' ? /Flag/ : /國旗/});
    await trigger.scrollIntoViewIfNeeded();
    const inset = () =>
      trigger.evaluate(element => {
        const item = element.querySelector('.rp-il')!;
        return item.getBoundingClientRect().left - element.getBoundingClientRect().left - parseFloat(getComputedStyle(element).paddingInlineStart);
      });
    expect(await inset()).toBeCloseTo(0, 1);
    await expect(trigger.locator('.rp-il > .rp-node-flag')).toHaveAttribute('data-flag', '🇭🇰');
    await trigger.press('Enter');
    const options = page.getByRole('option');
    const expected =
      lang === 'en' ? ['Hong Kong', 'Taiwan', 'Japan', 'Singapore', 'United States', 'South Korea'] : ['香港', '台灣', '日本', '新加坡', '美國', '韓國'];
    for (const [index, label] of expected.entries()) await expect(options.nth(index + 2).locator('.rp-truncate')).toHaveText(label);
    const placement = await trigger.evaluate(element => {
      const popover = document.querySelector('.rp-search-popover')!.getBoundingClientRect();
      const button = element.getBoundingClientRect();
      const label = element.closest('.rp-picker')!.querySelector('.lbl')!.getBoundingClientRect();
      return {clear: popover.top >= button.bottom || popover.bottom <= label.top, inside: popover.left >= 0 && popover.right <= innerWidth};
    });
    expect(placement).toEqual({clear: true, inside: true});
    const search = page.getByRole('searchbox', {name: lang === 'en' ? 'Search regions' : '搜尋地區', exact: true});
    for (const term of [expected[0], lang === 'en' ? 'Hong Kong SAR China' : '中國香港特別行政區', 'HK', 'Hong Kong']) {
      await search.fill(term);
      await expect(page.locator('[role="option"][data-key="HK"] .rp-truncate')).toHaveText(expected[0]);
    }
    await search.fill('Macao');
    await expect(options.first().locator('.rp-truncate')).toHaveText(lang === 'en' ? 'Macao' : '澳門');
    await search.fill('');
    await page.getByRole('option', {name: lang === 'en' ? 'No flag' : '不顯示國旗', exact: true}).click();
    await expect(trigger.locator('.rp-node-flag')).toHaveCount(0);
    expect(await inset()).toBeCloseTo(0, 1);
    await trigger.press('Enter');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

test('node details and row actions share live overrides, aligned flag rows and icon geometry', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/nodes?provider=inline&q=hk-01');
  const row = page.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})});
  const actions = row.getByRole('button', {name: 'Node actions', exact: true});
  const probe = row.getByRole('button', {name: 'Test hk-01', exact: true});
  const actionBox = await actions.boundingBox();
  const probeBox = await probe.boundingBox();
  expect(actionBox?.height).toBe(probeBox?.height);
  expect(actionBox!.width).toBeCloseTo(probeBox!.width, 1);
  const iconOffset = await actions.locator('svg').evaluate(svg => {
    const icon = svg.getBoundingClientRect();
    const button = svg.closest('button')!.getBoundingClientRect();
    return [icon.x + icon.width / 2 - button.x - button.width / 2, icon.y + icon.height / 2 - button.y - button.height / 2];
  });
  for (const offset of iconOffset) expect(Math.abs(offset)).toBeLessThanOrEqual(1);
  await row.focus();
  for (let i = 0; i < 12 && !(await actions.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('ArrowRight');
  await expect(actions).toBeFocused();
  await expect(page.getByRole('tooltip', {name: 'Node actions', exact: true})).toBeVisible();
  await row.click();
  const details = page.getByRole('region', {name: 'Node details', exact: true});
  await expect(details.getByText('vless', {exact: true})).toBeVisible();
  await details.getByRole('button', {name: /Flag/}).click();
  const automatic = page.getByRole('option', {name: /Automatic.*Hong Kong/});
  const noFlag = page.getByRole('option', {name: 'No flag', exact: true});
  const labelLeft = (option: typeof automatic) => option.locator('.rp-truncate').evaluate(element => element.getBoundingClientRect().left);
  expect(await labelLeft(noFlag)).toBe(await labelLeft(automatic));
  expect(await labelLeft(noFlag)).toBe(await labelLeft(page.getByRole('option', {name: /^Hong Kong/})));
  await noFlag.click();
  await expect(details.locator('.rp-node-name .rp-node-flag')).toHaveCount(0);
  await row.click();
  await expect(row.locator('.rp-node-flag')).toHaveCount(0);
  await actions.click();
  await expect(page.getByRole('menu').getByText('Add to group', {exact: true})).toBeVisible();
  await page.getByRole('menuitem', {name: 'Change flag…', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Change flag…', exact: true});
  await dialog.getByRole('button', {name: /Flag/}).click();
  await expect(dialog.getByRole('button', {name: /Flag/})).toHaveAccessibleDescription('Display only. Saved in this browser.');
  await page.getByRole('searchbox', {name: 'Search regions', exact: true}).fill('Taiwan');
  await page.getByRole('option', {name: /Taiwan/}).click();
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await row.click();
  await expect(details.locator('.rp-node-name .rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
  await row.click();
  await page.reload();
  await expect(row.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
});


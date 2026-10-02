import {expect, mockBackend, test, box} from './fixtures';
import {nestedIn, compileFilters, readGroupEntries, writeGroupEntry} from '../src/dae/groups';
import {regionFilters} from '../src/features/shared/groupIncludes';

test.use({storage: {'doona-lang': 'en'}});
const hk = regionFilters.find(region => region.id === 'HK')!.filter;
const jp = regionFilters.find(region => region.id === 'JP')!.filter;
const cardFor = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', {name, exact: true});
async function regionalGroup(page: import('@playwright/test').Page) {
  const backend = await mockBackend(page);
  const main = (await backend.api.config()).sources.find(source => source.kind === 'main')!;
  await backend.api.pollOperation(
    await backend.api.replaceConfigSource(
      main.id,
      writeGroupEntry(main.content, 'visual', {filters: [hk], policy: 'min_moving_avg'}),
      `"${main.content_sha256}"`
    )
  );
  return backend;
}

test('one pencil opens the visual editor, no-op saves preserve bytes and tag removal can be undone', async ({page}) => {
  const {api} = await regionalGroup(page);
  await page.goto(`/#/policies?group=${(await api.groups()).find(group => group.name === 'visual')!.id}`);
  const card = cardFor(page, 'visual');
  await expect(card.getByRole('group', {name: 'Includes'})).toContainText('Hong Kong');
  await card.getByRole('button', {name: 'More actions', exact: true}).click();
  await expect(page.getByRole('menuitem', {name: 'Edit group', exact: true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group visual', exact: true});
  await expect(dialog.getByRole('checkbox', {name: /^Hong Kong/})).toBeChecked();
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog
    .locator('label')
    .filter({has: page.getByRole('checkbox', {name: /^Japan/})})
    .click();
  const nodes = (await api.nodes({limit: 1000})).nodes;
  await expect(dialog.getByRole('status')).toContainText(`${nodes.filter(compileFilters([hk, jp])).length} node`);
  await dialog.getByRole('group', {name: 'Subscriptions', exact: true}).locator('label').first().click();
  await dialog.getByRole('button', {name: 'Remove Hong Kong', exact: true}).click();
  await expect(dialog.getByText(/still match another filter/)).toBeVisible();
  await expect(dialog.getByRole('checkbox', {name: /^Hong Kong/})).not.toBeChecked();
  await dialog.getByRole('button', {name: 'Undo', exact: true}).click();
  await expect(dialog.getByRole('checkbox', {name: /^Hong Kong/})).toBeChecked();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByRole('group', {name: 'Includes'})).toContainText('Japan');
});

test('Nodes creates through the shared editor with region and subscription selections for an automatic policy', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.goto('/#/nodes?provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  await page.getByRole('menuitem', {name: 'New group…', exact: true}).click();
  await expect(page).toHaveURL(/#\/policies/);
  const dialog = page.getByRole('dialog', {name: 'New group', exact: true});
  await dialog.getByRole('textbox', {name: 'Group name', exact: true}).fill('visual');
  await expect(dialog.getByRole('button', {name: /Selection policy/})).toContainText('Fastest on average');
  await dialog
    .locator('label')
    .filter({has: page.getByRole('checkbox', {name: /^Hong Kong/})})
    .click();
  await dialog.getByRole('group', {name: 'Subscriptions', exact: true}).locator('label').first().click();
  const filters = ['name(hk-01)', hk, 'subtag(harbor)'];
  const count = (await api.nodes({limit: 1000})).nodes.filter(compileFilters(filters)).length;
  await expect(dialog.getByRole('status')).toContainText(`${count} node`);
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  const card = cardFor(page, 'visual');
  await expect(card.getByRole('group', {name: 'Includes'})).toContainText('Hong Kong');
  await expect(card.getByRole('group', {name: 'Includes'})).toContainText('harbor');
  await expect.poll(async () => (await api.group((await api.groups()).find(group => group.name === 'visual')!.id)).members.length).toBe(count);
  await expect(card).toContainText(`${count} members`);
  const text = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  expect(readGroupEntries(text).find(group => group.name === 'visual')!.filters).toEqual(filters);
  await expect(card.getByRole('heading', {name: 'visual', exact: true})).toBeFocused();
});

test('membership jumps stage the node without writing and node links focus their group', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.goto('/#/nodes?provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'jp-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  await page.getByRole('menuitem', {name: /^hk/}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group hk', exact: true});
  await expect(dialog.getByRole('group', {name: 'Includes'})).toContainText('jp-01');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect.poll(async () => (await api.group('hk')).members.some(member => member.name === 'jp-01')).toBe(true);
  const card = cardFor(page, 'hk');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog.getByRole('link', {name: 'View on Nodes page', exact: true}).click();
  await expect(page).toHaveURL(/#\/nodes\?group=hk/);
  await expect(page.getByRole('button', {name: /Group$/})).toContainText('hk');
  const row = page.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'jp-01', exact: true})});
  await row.getByRole('link', {name: 'hk', exact: true}).click();
  await expect(card.getByRole('heading', {name: 'hk', exact: true})).toBeFocused();
  await expect(card).toHaveAttribute('data-highlighted', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const reason of ['read-only', 'ambiguous'] as const)
  test(`pencil is disabled with the ${reason} reason`, async ({page}) => {
    const {api, handlers} = await regionalGroup(page);
    handlers['GET config'] = async () => {
      const config = await api.config();
      return {
        ...config,
        sources:
          reason === 'read-only'
            ? config.sources.map(source => ({...source, writable: false}))
            : [...config.sources, {...config.sources.find(source => source.kind === 'main')!, id: 'duplicate', path: '/etc/duplicate.dae'}]
      };
    };
    await page.goto(`/#/policies?group=${(await api.groups()).find(group => group.name === 'visual')!.id}`);
    const button = cardFor(page, 'visual').getByRole('button', {name: 'Edit group', exact: true});
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(reason === 'read-only' ? /read.only/ : /more than once/);
  });

test('a group without configuration access offers a disabled pencil and a read-only view', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET capabilities'] = async () => {
    const capabilities = await api.capabilities();
    capabilities.resources.config.available = false;
    capabilities.resources.events.available = false;
    return capabilities;
  };
  await page.goto('/#/policies?group=office');
  const card = cardFor(page, 'office');
  const pencil = card.getByRole('button', {name: 'Edit group', exact: true});
  await expect(pencil).toBeDisabled();
  await expect(pencil).toHaveAccessibleDescription('The configuration is not ready for editing yet');
  await card.getByRole('button', {name: 'More actions', exact: true}).click();
  await page.getByRole('menuitem', {name: 'View configuration', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'office configuration', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toHaveCount(0);
});

test('old Arrange links redirect to Policies with no second tab', async ({page}) => {
  await page.goto('/#/policies?tab=arrange');
  await expect(page).toHaveURL(/#\/policies$/);
  await expect(page.getByRole('tab', {name: 'Group membership'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'New group', exact: true})).toBeVisible();
});

test('node search adds a selection and keeps advanced filters unchanged', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const custom = "name(keyword: 'hk') && !name(keyword: '02')";
  await api.pollOperation(
    await api.replaceConfigSource(main.id, writeGroupEntry(main.content, 'visual', {filters: [custom], policy: 'min_moving_avg'}), `"${main.content_sha256}"`)
  );
  await page.goto(`/#/policies?group=${(await api.groups()).find(group => group.name === 'visual')!.id}`);
  await cardFor(page, 'visual').getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group visual'});
  await expect(dialog.getByRole('textbox', {name: 'Values', exact: true}).nth(0)).toHaveValue('hk');
  await expect(dialog.getByRole('textbox', {name: 'Values', exact: true}).nth(1)).toHaveValue('02');
  await dialog.getByRole('button', {name: 'Nodes', exact: true}).click();
  await page.getByRole('searchbox', {name: 'Search nodes'}).fill('sg-01');
  await page.getByRole('option', {name: 'sg-01', exact: true}).click();
  await page.getByRole('searchbox', {name: 'Search nodes'}).fill('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name: 'Nodes', exact: true})).toHaveCount(0);
  await expect(dialog.getByRole('group', {name: 'Includes'})).toContainText('sg-01');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(
    readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(group => group.name === 'visual')!.filters
  ).toEqual([custom, 'name(sg-01)']);
});

test('a linked group with no members does not show all nodes', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(
    await api.replaceConfigSource(
      main.id,
      writeGroupEntry(main.content, 'empty', {filters: ['name(missing)'], policy: 'min_moving_avg'}),
      `"${main.content_sha256}"`
    )
  );
  await page.goto(`/#/nodes?group=${(await api.groups()).find(group => group.name === 'empty')!.id}`);
  await expect(page.getByRole('rowheader', {name: 'hk-01', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: /Group$/})).toContainText('empty');
});

test.describe('phone jumps', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true});
  test('phone member links reach the filtered Nodes list and return to the highlighted heading', async ({page}) => {
    const {api} = await mockBackend(page);
    const main = (await api.config()).sources.find(source => source.kind === 'main')!;
    await api.pollOperation(
      await api.replaceConfigSource(
        main.id,
        writeGroupEntry(main.content, 'linked', {filters: ['subtag(harbor)'], policy: 'min_moving_avg'}),
        `"${main.content_sha256}"`
      )
    );
    const id = (await api.groups()).find(group => group.name === 'linked')!.id;
    await page.goto(`/#/policies?group=${id}`);
    const card = cardFor(page, 'linked');
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', {name: 'Edit group', exact: true}).click();
    await page.getByRole('dialog', {name: 'Edit group linked'}).getByRole('link', {name: 'View on Nodes page', exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`#/nodes\\?group=${id}$`));
    await page.locator('.rp-table [role=grid]').last().getByRole('rowheader').first().click();
    const jump = page.locator('.rp-table-detail').getByRole('link', {name: 'linked', exact: true});
    await expect(jump).toBeVisible();
    await jump.tap();
    await expect(card.getByRole('heading', {name: 'linked', exact: true})).toBeFocused();
    await expect(card).toHaveCSS('outline-style', 'solid');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test('removing the final node and turning every-node off both save an empty group', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(
    await api.replaceConfigSource(
      main.id,
      writeGroupEntry(main.content, 'visual', {filters: ['name(hk-01)'], policy: 'min_moving_avg'}),
      `"${main.content_sha256}"`
    )
  );
  await page.goto(`/#/policies?group=${(await api.groups()).find(group => group.name === 'visual')!.id}`);
  const card = cardFor(page, 'visual');
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group visual', exact: true});
  await dialog.getByRole('button', {name: 'Remove hk-01', exact: true}).click();
  await expect(dialog.getByRole('status')).toContainText('0 nodes');
  const every = dialog.getByRole('switch', {name: 'All nodes', exact: true});
  await every.press('Space');
  await expect(every).toBeChecked();
  await every.press('Space');
  await expect(every).not.toBeChecked();
  await expect(dialog.getByRole('status')).toContainText('0 nodes');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.group((await api.groups()).find(group => group.name === 'visual')!.id)).members.map(node => node.name)).toEqual([]);
});

test('a group without filters shows every-node selected', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(
    await api.replaceConfigSource(main.id, writeGroupEntry(main.content, 'visual', {filters: [], policy: 'min_moving_avg'}), `"${main.content_sha256}"`)
  );
  await page.goto(`/#/policies?group=${(await api.groups()).find(group => group.name === 'visual')!.id}`);
  await cardFor(page, 'visual').getByRole('button', {name: 'Edit group', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Edit group visual', exact: true}).getByRole('switch', {name: 'All nodes', exact: true})).toBeChecked();
});

test('a stalled first group read does not hide the other policy cards', async ({page}) => {
  const {handlers} = await mockBackend(page);
  handlers['GET groups/proxy'] = () => new Promise(() => {});
  await page.goto('/#/policies');
  await expect(cardFor(page, 'auto')).toBeVisible({timeout: 7000});
});

for (const width of [1440, 390]) {
  test(`long member names preserve picker rows, labels and tag action sizes at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    const {api, handlers} = await mockBackend(page);
    const name = 'hk-production-primary-singapore-routing-fallback-upstream-001';
    handlers['GET nodes'] = async () => {
      const result = await api.nodes({limit: 1000});
      return {...result, nodes: [...result.nodes, {...result.nodes[0], id: 'long-node', name}]};
    };
    await page.goto('/#/policies');
    await page.getByRole('button', {name: 'New group', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'New group', exact: true});
    const labels = dialog.getByRole('group', {name: 'Regions', exact: true}).locator(':scope > span');
    await expect(labels).toHaveCSS('font-size', '12px');
    await dialog.getByRole('button', {name: 'Nodes', exact: true}).click();
    await page.getByRole('searchbox', {name: 'Search nodes', exact: true}).fill('production');
    const option = page.getByRole('option', {name, exact: true});
    await expect(option).toBeVisible();
    const controlSize = await option.evaluate(el => Number.parseFloat(getComputedStyle(el).getPropertyValue('--rp-control')));
    expect((await box(option)).height).toBeLessThanOrEqual(controlSize);
    await expect(option.locator('.rp-truncate')).toHaveCSS('white-space', 'nowrap');
    await option.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog', {name: 'Nodes', exact: true})).toHaveCount(0);
    const action = dialog.getByRole('button', {name: `Remove ${name}`, exact: true});
    const bounds = await box(action);
    expect(bounds.width).toBe(bounds.height);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

test('recognised filters have one visual editor and nested group tags support removal and undo', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies?group=proxy');
  const card = cardFor(page, 'proxy');
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group proxy', exact: true});
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Groups', exact: true}).click();
  await expect(page.getByRole('option', {name: 'hk', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('option', {name: 'proxy', exact: true})).toBeDisabled();
  await page.getByRole('option', {name: 'hk', exact: true}).click();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('button', {name: 'Remove hk', exact: true})).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Undo', exact: true}).click();
  await expect(dialog.getByRole('button', {name: 'Remove hk', exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog.getByRole('button', {name: 'Groups', exact: true}).click();
  await page.getByRole('searchbox', {name: 'Search groups', exact: true}).fill('office');
  await page.getByRole('option', {name: 'office', exact: true}).click();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', {name: 'Remove hk', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  const filters = readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(group => group.name === 'proxy')!.filters;
  expect(nestedIn({filters})).toEqual(['auto', 'jp', 'us', 'tw', 'sg', 'kr', 'office']);
  await expect(card.getByRole('group', {name: 'Includes', exact: true})).not.toContainText('hk');
});

test('legacy region counts agree on the card, checkbox, tag and summary before and after editing', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies?group=hk');
  const card = cardFor(page, 'hk');
  await expect(card.getByRole('group', {name: 'Includes', exact: true})).toHaveText('Hong Kong (12 nodes)');
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group hk', exact: true});
  await expect(dialog.getByRole('checkbox', {name: 'Hong Kong (12 nodes)', exact: true})).toBeChecked();
  await expect(dialog.getByRole('group', {name: 'Includes', exact: true})).toContainText('Hong Kong (12 nodes)');
  await expect(dialog.getByRole('status')).toHaveText('12 nodes');
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog.getByRole('button', {name: 'Remove Hong Kong', exact: true}).click();
  await expect(dialog.getByRole('status')).toHaveText('0 nodes');
  await dialog
    .locator('label')
    .filter({has: page.getByRole('checkbox', {name: /^Hong Kong/})})
    .click();
  await expect(dialog.getByRole('checkbox', {name: 'Hong Kong (14 nodes)', exact: true})).toBeChecked();
  await expect(dialog.getByRole('status')).toHaveText('14 nodes');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(card.getByRole('group', {name: 'Includes', exact: true})).toHaveText('Hong Kong (14 nodes)');
});

test('the membership summary is a short count with names in a collapsed tag list', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/nodes?provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  await page.getByRole('menuitem', {name: 'New group…', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New group', exact: true});
  await expect(dialog.getByRole('status')).toHaveText('1 node');
  await expect(dialog.getByText(/Currently selects|no filter|holds every node/)).toHaveCount(0);
  const matches = dialog.getByRole('button', {name: 'Matching nodes', exact: true});
  await expect(matches).toHaveAttribute('aria-expanded', 'false');
  await matches.click();
  await expect(dialog.getByRole('group', {name: 'Matching nodes', exact: true}).last()).toHaveText('hk-01');
  await dialog
    .locator('label')
    .filter({has: page.getByRole('switch', {name: 'All nodes', exact: true})})
    .click();
  await expect(dialog.getByRole('status')).toHaveText('125 nodes');
  await expect(dialog.getByText(/Currently selects|no filter|holds every node/)).toHaveCount(0);
});

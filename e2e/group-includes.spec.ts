import {expect, mockBackend, test} from './fixtures';
import {compileFilters, readGroupEntries, writeGroupEntry} from '../src/dae/groups';
import {regionFilters} from '../src/features/shared/groupIncludes';

test.use({storage: {'doona-lang': 'en'}});
const hk = regionFilters.find(region => region.id === 'HK')!.filter;
const cardFor = (page: import('@playwright/test').Page, name: string) => page.locator('.rp-drop').filter({has: page.getByRole('heading', {name, exact: true})});

async function regionalGroup(page: import('@playwright/test').Page) {
  const backend = await mockBackend(page);
  for (const name of ['HK visual', 'JP visual']) {
    await backend.api.createNode({name, link: 'socks5://127.0.0.1:1080'});
    await expect.poll(async () => (await backend.api.nodes({limit: 1000})).nodes.some(node => node.name === name)).toBe(true);
  }
  const main = (await backend.api.config()).sources.find(source => source.kind === 'main')!;
  await backend.api.replaceConfigSource(
    main.id,
    writeGroupEntry(main.content, 'visual', {filters: [hk], policy: 'min_moving_avg'}),
    `"${main.content_sha256}"`
  );
  await expect.poll(async () => (await backend.api.config()).sources.find(source => source.kind === 'main')!.content).toContain('visual {');
  return backend;
}

test('Arrange edits region membership visually, previews the union and keeps no-op saves byte-identical', async ({page}) => {
  const {api} = await regionalGroup(page);
  const nodes = (await api.nodes({limit: 1000})).nodes;
  const beforeCount = nodes.filter(compileFilters([hk])).length;
  const afterCount = nodes.filter(compileFilters([hk, regionFilters.find(region => region.id === 'JP')!.filter])).length;
  await page.goto('/#/policies?tab=arrange');
  const card = cardFor(page, 'visual');
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group visual', exact: true});
  await expect(dialog.getByRole('checkbox', {name: /^Hong Kong/})).toBeChecked();
  await expect(dialog.getByRole('button', {name: 'Advanced', exact: true})).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByRole('status')).toContainText(`Currently includes ${beforeCount} node`);
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog.getByRole('checkbox', {name: /^Japan/}).check();
  await expect(dialog.getByRole('status')).toContainText(`Currently includes ${afterCount} node`);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText('JP visual');
  const written = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  expect(readGroupEntries(written).find(group => group.name === 'visual')!.filters).toEqual([hk, regionFilters.find(region => region.id === 'JP')!.filter]);
  await expect(card).not.toContainText('cannot be removed here');
});

test('new groups select subscriptions and searchable nodes without editing raw filters', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies?tab=arrange');
  await page.getByRole('button', {name: 'New group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New group', exact: true});
  await dialog.getByRole('textbox', {name: 'Group name'}).fill('visual');
  const subscriptions = dialog.getByRole('group', {name: 'Subscriptions', exact: true});
  await subscriptions.getByRole('checkbox').first().check();
  await dialog.getByRole('button', {name: 'Nodes', exact: true}).click();
  await page.getByRole('searchbox', {name: 'Search nodes'}).fill('hk-01');
  await page.getByRole('option', {name: 'hk-01', exact: true}).click();
  await page.getByRole('searchbox', {name: 'Search nodes'}).fill('sg-01');
  await page.getByRole('option', {name: 'sg-01', exact: true}).click();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('button', {name: 'Nodes', exact: true})).toContainText('2 selected');
  await expect(dialog.getByRole('button', {name: 'Advanced', exact: true})).toHaveAttribute('aria-expanded', 'false');
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await page.getByRole('button', {name: 'Review and apply'}).click();
  await page.getByRole('dialog', {name: 'Review changes'}).getByRole('button', {name: 'Apply', exact: true}).click();
  await expect
    .poll(
      async () => readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(group => group.name === 'visual')?.filters
    )
    .toEqual(['subtag(sub-c)', 'name(hk-01)', 'name(sg-01)']);
});

for (const reason of ['read-only', 'ambiguous'] as const)
  test(`Arrange disables editing with the ${reason} reason`, async ({page}) => {
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
    await page.goto('/#/policies?tab=arrange');
    const button = cardFor(page, 'visual').getByRole('button', {name: 'Edit group', exact: true});
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(reason === 'read-only' ? /read.only/ : /more than once/);
    await button.locator('..').focus();
    await expect(page.getByRole('tooltip')).toContainText(reason === 'read-only' ? 'read-only' : 'more than once');
  });

test('Arrange keeps a disabled Edit button when configuration is unavailable and offers View configuration for an undeclared group', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let unavailable = true;
  handlers['GET capabilities'] = async () => {
    const capabilities = await api.capabilities();
    return {
      ...capabilities,
      resources: {
        ...capabilities.resources,
        events: {...capabilities.resources.events, available: false},
        config: {...capabilities.resources.config, available: !unavailable}
      }
    };
  };
  handlers['GET config'] = async () => ({...(await api.config()), sources: []});
  await page.goto('/#/policies?tab=arrange');
  const card = cardFor(page, 'proxy');
  await expect(card.getByRole('button', {name: 'Edit group', exact: true})).toBeDisabled();
  await expect(card.getByRole('button', {name: 'Edit group', exact: true})).toHaveAccessibleDescription(/configuration.*not.*ready/i);
  unavailable = false;
  await page.reload();
  await card.getByRole('button', {name: 'View configuration', exact: true}).click();
  await expect(page.getByRole('dialog')).toContainText('No loaded configuration file defines this group');
});

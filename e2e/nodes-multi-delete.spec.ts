import {expect, mockBackend, test} from './fixtures';

test('deletes two selected manual nodes with one confirmation on desktop and phone', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  for (const name of ['batch-first', 'batch-second']) await api.createNode({name, link: `vless://demo@example.com:443#${name}`});
  const added = (await api.nodes({limit: 1000})).nodes.filter(node => ['batch-first', 'batch-second'].includes(node.name));
  for (const node of added) handlers[`DELETE nodes/${encodeURIComponent(node.id)}`] = () => api.deleteNode(node.id);
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?provider=inline');
  const table = page.locator('.rp-table').first();
  const first = table.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'batch-first', exact: true})});
  const second = table.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'batch-second', exact: true})});
  await first.locator('.rp-checkbox').click();
  await second.locator('.rp-checkbox').click();
  const remove = page.getByRole('button', {name: 'Remove selected (2)', exact: true});
  await expect(remove).toBeVisible();
  await expect(page.getByRole('region', {name: 'Node details', exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'Clear', exact: true}).filter({hasText: 'Clear'}).click();
  await expect(first.getByRole('checkbox')).not.toBeChecked();
  await expect(second.getByRole('checkbox')).not.toBeChecked();
  await expect(remove).toHaveCount(0);
  await page.setViewportSize({width: 390, height: 844});
  await first.locator('.rp-checkbox').click();
  await second.locator('.rp-checkbox').click();
  await remove.click();
  const dialog = page.getByRole('alertdialog', {name: 'Remove selected (2)', exact: true});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(first.getByRole('checkbox')).toBeChecked();
  await expect(second.getByRole('checkbox')).toBeChecked();
  await remove.click();
  await dialog.getByRole('button', {name: 'Remove selected (2)', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);
  await expect(remove).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'DELETE' && new URL(request.url()).pathname.startsWith('/api/v1/nodes/'))).toHaveLength(2);
  expect((await api.nodes({limit: 1000})).nodes.filter(node => added.some(item => item.id === node.id))).toEqual([]);
});

test('selects subscription rows for testing without offering removal and sends only chosen node IDs', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const providers = (await api.providers({limit: 1000})).providers;
  const listed = (await api.nodes({limit: 1000})).nodes;
  const subscription = providers.find(provider => provider.kind === 'subscription' && listed.filter(node => node.provider_id === provider.id).length > 2)!;
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto(`/#/nodes?provider=${encodeURIComponent(subscription.id)}`);
  const table = page.locator('.rp-table').first();
  await expect(table.getByRole('rowheader').first()).toBeVisible();
  const names = (await table.getByRole('rowheader').allTextContents()).slice(0, 2);
  const chosen = names.map(name => listed.find(node => node.provider_id === subscription.id && node.name === name)!);
  for (const node of chosen) {
    const row = table.getByRole('row').filter({has: page.getByRole('rowheader', {name: node.name, exact: true})});
    await expect(row.getByRole('checkbox')).toBeEnabled();
    await row.locator('.rp-checkbox').click();
    await expect(row.getByRole('checkbox')).toBeChecked();
  }
  await expect(page.getByRole('button', {name: /^Remove selected/})).toHaveCount(0);
  const testSelected = page.getByRole('button', {name: 'Test selected (2)', exact: true});
  await expect(testSelected).toBeEnabled();
  await testSelected.click();
  await expect(page.locator('.rp-toast').filter({hasText: /^Tested 2, unavailable /})).toBeVisible();
  await expect(testSelected).toBeEnabled();
  const probes = requests.filter(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/probes');
  expect(probes.map(request => request.postDataJSON().target.node_id).sort()).toEqual(chosen.map(node => node.id).sort());
  await expect(page.getByRole('button', {name: /^Remove selected/})).toHaveCount(0);
  await page.getByRole('button', {name: 'Clear', exact: true}).filter({hasText: 'Clear'}).click();
  await expect(page.getByRole('button', {name: 'Test all', exact: true})).toBeVisible();
});

test('selects nodes with the keyboard', async ({page}) => {
  const {api} = await mockBackend(page);
  for (const name of ['key-first', 'key-second']) await api.createNode({name, link: `vless://demo@example.com:443#${name}`});
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/nodes?provider=inline');
  const table = page.locator('.rp-table').first();
  const first = table.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'key-first', exact: true})});
  // With nothing checked, a press opens the detail and marks the row apart from checked ones; a second press closes it.
  await first.getByRole('rowheader').click();
  await expect(first).toHaveAttribute('data-open', 'true');
  await first.getByRole('rowheader').click();
  await expect(first).not.toHaveAttribute('data-open');
  await first.locator('.rp-checkbox').click();
  await expect(table.getByRole('checkbox', {checked: true})).toHaveCount(1);
  await page.keyboard.press('Shift+ArrowDown');
  await expect(table.getByRole('checkbox', {checked: true})).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(table.getByRole('checkbox', {checked: false})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(table.getByRole('checkbox', {checked: true})).toHaveCount(0);
});

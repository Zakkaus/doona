import {expect, mockBackend, test, moreAction} from './fixtures';

const regions = (page: import('@playwright/test').Page) => page.locator('.rp-content section.rp-card');

test('the kind filter counts manual and automatic groups, and the address keeps it across a reload and Back', async ({page}) => {
  await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const filter = page.getByRole('radiogroup', {name: 'Filter groups by selection'});
  await expect(filter.getByRole('radio')).toHaveText(['All 17', 'Manual 8', 'Automatic 9']);
  await expect(filter.getByRole('radio', {name: 'All 17'})).toBeChecked();
  // It sits on the tab row, at its end.
  const [tabs, box] = [await page.getByRole('tablist', {name: 'Policies'}).boundingBox(), await filter.boundingBox()];
  expect(Math.abs(tabs!.y + tabs!.height / 2 - (box!.y + box!.height / 2))).toBeLessThan(4);
  await filter.getByRole('radio', {name: 'Manual 8'}).click();
  await expect(page).toHaveURL(/kind=manual/);
  await expect(regions(page)).toHaveCount(8);
  await expect(page.getByRole('region', {name: 'proxy', exact: true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'Manual 8'})).toBeChecked();
  await expect(regions(page)).toHaveCount(8);
  await page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'Automatic 9'}).click();
  await expect(regions(page)).toHaveCount(9);
  await expect(page.getByRole('region', {name: 'proxy', exact: true})).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'Manual 8'})).toBeChecked();
  await expect(regions(page)).toHaveCount(8);
  // The arrange tab has no use for it.
  await page.getByRole('tab', {name: 'Group membership'}).click();
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'})).toHaveCount(0);
});

test('a filter that leaves no group says so in one line', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET groups'] = async () => (await api.groups()).filter(group => group.policy.kind !== 'selector');
  await page.goto('/#/policies?kind=manual');
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'Manual 0'})).toBeChecked();
  await expect(page.locator('.rp-empty').filter({hasText: 'No manual groups'})).toBeVisible();
  await expect(regions(page)).toHaveCount(0);
});

test('a link to a group the filter hides shows every group and opens the linked one', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/policies?kind=manual&group=auto');
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'All 17'})).toBeChecked();
  await expect(page).toHaveURL(/policies\?group=auto$/);
  const card = page.getByRole('region', {name: 'auto', exact: true});
  await expect(card).toBeInViewport();
  // The linked automatic group opens with its members shown.
  await expect(card.getByRole('button', {name: /^Current/})).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('row', {name: '日本 01 2x', exact: true})).toBeVisible();
  // An automatic group nobody linked stays folded.
  await page.getByRole('region', {name: 'gaming', exact: true}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('region', {name: 'gaming', exact: true}).getByRole('button', {name: /^Current/})).toHaveAttribute('aria-expanded', 'false');
});

test('returning to a deep-linked group reopens it while a collapse within the visit stays closed', async ({page}) => {
  await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies?group=auto');
  const summary = page.getByRole('region', {name: 'auto', exact: true}).getByRole('button', {name: /^Current/});
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => (location.hash = '#/policies?group=gaming'));
  await page.getByRole('region', {name: 'gaming', exact: true}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('region', {name: 'gaming', exact: true}).getByRole('button', {name: /^Current/})).toHaveAttribute('aria-expanded', 'true');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await page.goBack();
  await expect(page).toHaveURL(/policies\?group=auto$/);
  await page.getByRole('region', {name: 'auto', exact: true}).scrollIntoViewIfNeeded();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
});

test('releasing a collapsed automatic group clears overrides on both networks', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await api.selectGroup('gaming', {member_id: 'hk-02', network: 'udp'});
  await api.selectGroup('gaming', {member_id: 'jp-01', network: 'tcp'});
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies?group=gaming');
  const card = page.getByRole('region', {name: 'gaming', exact: true});
  await card.getByRole('radiogroup', {name: 'Select network for gaming'}).getByRole('radio', {name: 'TCP', exact: true}).click();
  await card.getByRole('button', {name: /^Current/}).click();
  await expect(card.getByRole('radiogroup')).toHaveCount(0);
  await moreAction(card, 'Back to automatic');
  await expect(card.getByText('Pinned', {exact: true})).toHaveCount(0);
  expect(requests.find(request => request.method() === 'DELETE')?.url()).toContain('network=both');
  const selection = (await api.group('gaming')).runtime.selection;
  expect([selection.tcp?.source, selection.udp?.source]).not.toContain('override');
});

test('toggling interruption stages it with unsaved filters in one conditional source write', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'office', exact: true}), 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group office'});
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Filter'}).fill('name(hk-01, sg-01)');
  await dialog.getByText('Interrupt existing connections on switch', {exact: true}).click();
  await expect(dialog.getByRole('switch')).toBeChecked();
  expect(requests.filter(request => request.method() === 'PATCH')).toHaveLength(0);
  expect((await api.group('office')).config.interrupt_connections).toBe(false);
  const origin = (await api.config()).sources.find(source => source.kind === 'main')!;
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toHaveCount(0);
  const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(saved).toContain('filter: name(hk-01, sg-01)');
  expect((await api.group('office')).config.interrupt_connections).toBe(true);
  const writes = requests.filter(request => request.method() === 'PUT' && new URL(request.url()).pathname.includes('/config/sources/'));
  expect(writes).toHaveLength(1);
  expect(writes[0].headers()['if-match']).toBe(`"${origin.content_sha256}"`);
});

for (const when of ['before', 'after'])
  test(`an external source edit ${when} toggling interruption still refuses the first save`, async ({page}) => {
    const {api} = await mockBackend(page);
    await page.goto('/#/policies');
    await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'Edit group');
    const dialog = page.getByRole('dialog', {name: 'Edit group proxy'});
    const external = async () => {
      const main = (await api.config()).sources.find(source => source.kind === 'main')!;
      await api.replaceConfigSource(main.id, '# external edit\n' + main.content, `"${main.content_sha256}"`);
      await expect.poll(async () => (await api.config()).sources.find(source => source.kind === 'main')!.content).toContain('# external edit');
    };
    if (when === 'before') await external();
    await dialog.getByText('Interrupt existing connections on switch', {exact: true}).click();
    await expect(dialog.getByRole('switch')).toBeChecked();
    const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
    await expect(apply).toBeEnabled();
    if (when === 'after') await external();
    const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
    await apply.click();
    await rejected;
    await expect(dialog.getByRole('alert')).toBeVisible();
  });

test('a resource-level read-only dialog explains why configuration cannot be edited', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.resources.config.writable = false;
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'View configuration');
  await expect(page.getByRole('dialog', {name: 'proxy configuration'})).toContainText(
    'This backend does not provide configuration writes, so this view is read-only.'
  );
});

test('running configuration has a heading when interruption is its only field', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET groups/proxy'] = async () => {
    const group = await api.group('proxy');
    for (const key of Object.keys(group.config)) Object.assign(group.config, {[key]: null});
    group.capabilities.mutable_config = ['interrupt_connections'];
    return group;
  };
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group proxy'});
  await expect(dialog.locator('.rp-kv')).toHaveCount(0);
  await expect(dialog.getByRole('heading', {name: 'Running configuration'})).toBeVisible();
  await expect(dialog.getByRole('switch')).toBeVisible();
});

test('an automatic group sums itself up, opens on a press and still takes a pinned member', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies?kind=auto');
  const card = page.getByRole('region', {name: 'gaming', exact: true});
  const summary = card.getByRole('button', {name: /^Current/});
  await expect(summary).toHaveText(/^Current: \S+, \d+ available$/);
  await expect(card.getByRole('button', {name: /^jp-01\b/})).toHaveCount(0);
  await summary.click();
  const member = card.getByRole('button', {name: /^hk-02\b/});
  const pinned = (await member.getAttribute('aria-pressed')) === 'true' ? card.getByRole('button', {name: /^jp-01\b/}) : member;
  await pinned.click();
  await expect(pinned).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByText('Pinned', {exact: true})).toBeVisible();
  await moreAction(card, 'Back to automatic');
  await expect(card.getByText('Pinned', {exact: true})).toHaveCount(0);
  const controls = requests.filter(request => request.method() !== 'GET').map(request => [request.method(), new URL(request.url()).pathname]);
  expect(controls).toEqual([
    ['PUT', '/api/v1/groups/gaming/selection'],
    ['DELETE', '/api/v1/groups/gaming/selection']
  ]);
});

test('cancelling an interrupt-only draft leaves the source and live group unchanged', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'proxy', exact: true});
  await expect(card.getByRole('switch')).toHaveCount(0);
  await moreAction(card, 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group proxy'});
  await expect(dialog.getByText('Check interval', {exact: true})).toBeVisible();
  const origin = (await api.config()).sources.find(source => source.kind === 'main')!;
  await dialog.getByText('Interrupt existing connections on switch', {exact: true}).click();
  await expect(dialog.getByRole('switch')).toBeChecked();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(requests.filter(request => ['PATCH', 'PUT'].includes(request.method()))).toHaveLength(0);
  expect((await api.config()).sources.find(source => source.id === origin.id)!.content_sha256).toBe(origin.content_sha256);
  expect((await api.group('proxy')).config.interrupt_connections).toBe(false);
  await moreAction(card, 'Edit group');
  await expect(dialog.getByRole('switch')).not.toBeChecked();
});

test('the view dialog patches interruption live and refetches after a PATCH 412', async ({page}) => {
  const {api, capabilities, requests} = await mockBackend(page);
  capabilities.resources.config.writable = false;
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'View configuration');
  const dialog = page.getByRole('dialog', {name: 'proxy configuration'});
  const toggle = dialog.getByRole('switch', {name: 'Interrupt existing connections on switch'});
  await expect(toggle).not.toBeChecked();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.replaceConfigSource(main.id, '# external edit\n' + main.content, `"${main.content_sha256}"`);
  await expect.poll(async () => (await api.config()).sources.find(source => source.kind === 'main')!.content).toContain('# external edit');
  let patchRejected = false;
  const rejected = page.waitForResponse(response => {
    if (response.request().method() !== 'PATCH' || response.status() !== 412) return false;
    patchRejected = true;
    return true;
  });
  const refreshed = page.waitForResponse(
    response => patchRejected && response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/groups/proxy')
  );
  await dialog.getByText('Interrupt existing connections on switch', {exact: true}).click();
  await rejected;
  await refreshed;
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.status() === 202);
  await dialog.getByText('Interrupt existing connections on switch', {exact: true}).click();
  await saved;
  await expect(toggle).toBeChecked();
  expect((await api.group('proxy')).config.interrupt_connections).toBe(true);
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
});

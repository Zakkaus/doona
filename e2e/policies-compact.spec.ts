import {expect, mockBackend, test, moreAction} from './fixtures';

const regions = (page: import('@playwright/test').Page) => page.locator('.rp-content section.rp-card');

test('the kind filter counts manual and automatic groups, and the address keeps it across a reload and Back', async ({page}) => {
  await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const filter = page.getByRole('radiogroup', {name: 'Filter groups by selection'});
  await expect(filter.getByRole('radio')).toHaveText(['All 4', 'Manual 1', 'Automatic 3']);
  await expect(filter.getByRole('radio', {name: 'All 4'})).toBeChecked();
  // It sits on the tab row, at its end.
  const [tabs, box] = [await page.getByRole('tablist', {name: 'Policies'}).boundingBox(), await filter.boundingBox()];
  expect(Math.abs(tabs!.y + tabs!.height / 2 - (box!.y + box!.height / 2))).toBeLessThan(4);
  await filter.getByRole('radio', {name: 'Manual 1'}).click();
  await expect(page).toHaveURL(/kind=manual/);
  await expect(regions(page)).toHaveCount(1);
  await expect(page.getByRole('region', {name: 'proxy', exact: true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'Manual 1'})).toBeChecked();
  await expect(regions(page)).toHaveCount(1);
  await page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'Automatic 3'}).click();
  await expect(regions(page)).toHaveCount(3);
  await expect(page.getByRole('region', {name: 'proxy', exact: true})).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'Manual 1'})).toBeChecked();
  await expect(regions(page)).toHaveCount(1);
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
  await page.goto('/#/policies?kind=manual&group=resilient');
  await expect(page.getByRole('radiogroup', {name: 'Filter groups by selection'}).getByRole('radio', {name: 'All 4'})).toBeChecked();
  const card = page.getByRole('region', {name: 'resilient', exact: true});
  await expect(card).toBeInViewport();
  // The linked automatic group opens with its members shown.
  await expect(card.getByRole('button', {name: /^Current/})).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('button', {name: /^us-01\b/})).toBeVisible();
  // An automatic group nobody linked stays folded.
  await expect(page.getByRole('region', {name: 'gaming', exact: true}).getByRole('button', {name: /^Current/})).toHaveAttribute('aria-expanded', 'false');
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

test('the edit dialog shows the running configuration and the interrupt switch, which writes to the group', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'proxy', exact: true});
  // Nothing of the configuration stays on the card.
  await expect(card.getByRole('switch')).toHaveCount(0);
  await expect(card.getByRole('button', {name: 'Configuration', exact: true})).toHaveCount(0);
  await moreAction(card, 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group proxy'});
  await expect(dialog.getByRole('heading', {name: 'Running configuration'})).toBeVisible();
  await expect(dialog.getByText('Check interval', {exact: true})).toBeVisible();
  const toggle = dialog.getByRole('switch', {name: 'Interrupt existing connections on switch'});
  await expect(toggle).not.toBeChecked();
  await dialog.getByText('Interrupt existing connections on switch', {exact: true}).click();
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'proxy'})).toBeVisible();
  await expect(toggle).toBeChecked();
  const patches = requests.filter(request => request.method() === 'PATCH');
  expect(patches.map(request => [new URL(request.url()).pathname, request.postDataJSON()])).toEqual([
    ['/api/v1/groups/proxy/config', expect.arrayContaining([expect.objectContaining({path: '/config/interrupt_connections', value: true})])]
  ]);
  // The switch writes at once; cancelling the dialog leaves the file alone.
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
});

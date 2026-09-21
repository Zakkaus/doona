import {expect, mockBackend, test} from './fixtures';

test('policies select a member, pin one network, release and test the group', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const selector = page.getByRole('region', {name: 'proxy', exact: true});
  const selected = selector.getByRole('button', {name: /^sg-01\b/});
  await selected.click();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rp-toast.positive')).toContainText('proxy selected sg-01');
  const automatic = page.getByRole('region', {name: 'resilient', exact: true});
  await automatic.getByRole('radio', {name: 'TCP', exact: true}).click();
  const pinned = automatic.getByRole('button', {name: /^us-01\b/});
  await pinned.click();
  await expect(pinned).toHaveAttribute('aria-pressed', 'true');
  await expect(automatic.getByText('Pinned', {exact: true})).toBeVisible();
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'resilient pinned us-01'})).toBeVisible();
  await automatic.getByRole('button', {name: 'Back to automatic', exact: true}).click();
  await expect(automatic.getByText('Automatic', {exact: true})).toBeVisible();
  await expect(automatic.getByRole('button', {name: 'Back to automatic', exact: true})).toHaveCount(0);
  await expect(automatic.getByRole('button', {name: /^sg-01\b/})).toHaveAttribute('aria-pressed', 'true');
  await automatic.getByRole('button', {name: 'Test all', exact: true}).click();
  await expect(page.locator('.rp-toast.positive').filter({hasText: /resilient.*available.*selection (changed|unchanged)/})).toBeVisible();
  await expect(automatic.getByRole('button', {name: 'Test all', exact: true})).toBeEnabled();
  const controls = requests.filter(request => request.method() !== 'GET');
  expect(controls.map(request => [request.method(), new URL(request.url()).pathname + new URL(request.url()).search])).toEqual([
    ['PUT', '/api/v1/groups/proxy/selection'],
    ['PUT', '/api/v1/groups/resilient/selection'],
    ['DELETE', '/api/v1/groups/resilient/selection?network=tcp'],
    ['POST', '/api/v1/probes']
  ]);
  expect(controls[0].postDataJSON()).toEqual({member_id: 'sg-01', network: 'both'});
  expect(controls[1].postDataJSON()).toEqual({member_id: 'us-01', network: 'tcp'});
  expect(controls[3].postDataJSON()).toMatchObject({target: {type: 'group', group_id: 'resilient'}, transport: ['tcp']});
});

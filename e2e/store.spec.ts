import {expect, mockBackend, test, moreAction, moreItem} from './fixtures';
import {ApiError} from '../src/api/error';

test.use({viewport: {width: 1440, height: 1000}});

test('Test all completes a group larger than the advertised job ceiling', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const group = await api.group('backup');
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'backup', exact: true});
  await moreAction(card, 'Test all');
  await expect(page.locator('.rp-toast.positive').filter({hasText: /backup.*available.*selection/})).toBeVisible();
  const jobs = requests
    .filter(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/probes'))
    .map(request => request.postDataJSON());
  expect(jobs.map(job => job.members.length)).toEqual([64, group.members.length - 64]);
  expect(jobs.flatMap(job => job.members)).toEqual(group.members.map(member => member.id));
  await expect(await moreItem(card, 'Test all')).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('a failed second probe batch reports partial completion instead of success', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const group = await api.group('backup');
  let jobs = 0;
  handlers['POST probes'] = request => {
    if (++jobs === 2) throw new ApiError(422, 'unsupported_value', 'Batch refused');
    return api.startProbe(request.postDataJSON());
  };
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'backup', exact: true});
  await moreAction(card, 'Test all');
  await expect(page.locator('.rp-toast.negative')).toContainText(`Tested 64 of ${group.members.length} members`);
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  await expect(await moreItem(card, 'Test all')).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('query simulation traces the first IPv4 and IPv6 answer and lists every answer', async ({page}) => {
  const {api, capabilities, handlers, requests} = await mockBackend(page);
  // honk's own limit: one address per trace request.
  capabilities.resources.routing_trace.resolve_modes = ['none'];
  capabilities.resources.routing_trace.max_addresses = 1;
  const answers: Record<string, string[]> = {A: ['192.0.2.10', '192.0.2.11', '192.0.2.12'], AAAA: ['2001:db8::10', '2001:db8::11']};
  handlers['POST dns/query'] = async request => {
    const body = request.postDataJSON();
    const response = await api.dnsQuery(body.domain, body.type);
    return {
      ...response,
      results: response.results.map(result => ({
        ...result,
        status: 'NOERROR',
        answers: (answers[result.type] ?? []).map(data => ({name: response.domain, type: result.type, class: 'IN', ttl: 60, data}))
      }))
    };
  };
  handlers['POST routing/trace'] = request => api.routingTrace(request.postDataJSON());
  await page.goto('/#/rules?tab=trace');
  await page.getByLabel('Domain', {exact: true}).fill('trace.example');
  await page.getByLabel('Destination port', {exact: true}).fill('443');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  await expect(page.getByText('Simulated address').first()).toBeVisible();
  await expect(page.getByText(/192\.0\.2\.12/)).toBeVisible();
  await expect(page.locator('.rp-toast.negative')).toHaveCount(0);
  const traced = requests
    .filter(request => request.method() === 'POST' && request.url().endsWith('/routing/trace'))
    .map(request => request.postDataJSON().input.dst_ip);
  expect(traced.every(ip => ip === '192.0.2.10' || ip === '2001:db8::10')).toBe(true);
  expect(traced.length).toBeGreaterThan(0);
  expect(traced.length).toBeLessThanOrEqual(2);
});

// Five-second polls are for what changes by the second; these lists and rings refresh far less often.
for (const [route, path, most] of [
  ['activity', 'runtime/traffic/history', 2],
  ['activity', 'connections', 4],
  ['nodes?tab=list', 'providers', 3]
] as const)
  test(`${route} fetches ${path} at most ${most} times a minute`, async ({page}) => {
    const {requests} = await mockBackend(page);
    const count = () => requests.filter(request => new URL(request.url()).pathname === `/api/v1/${path}`).length;
    await page.clock.install();
    await page.goto(`/#/${route}`);
    await expect.poll(count).toBe(1);
    for (let i = 0; i < 12; i++) {
      await page.clock.fastForward(5000);
      await page.waitForTimeout(50);
    }
    expect(count()).toBeLessThanOrEqual(most);
  });

test('an open Policies page shows a selection made elsewhere and stops polling while hidden', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.clock.install();
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'proxy', exact: true});
  await card.getByRole('searchbox', {name: 'Filter nodes'}).fill('-0');
  // TCP and UDP start on different members, so no member is the selection yet.
  const member = card.getByRole('row', {name: 'sg-01', exact: true});
  await expect(member).toHaveAttribute('aria-selected', 'false');
  await api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'});
  await page.clock.fastForward(5500);
  await expect(member).toHaveAttribute('aria-selected', 'true');
  const listReads = () => requests.filter(request => request.method() === 'GET' && new URL(request.url()).pathname === '/api/v1/groups').length;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const before = listReads();
  await page.clock.fastForward(30000);
  expect(listReads()).toBe(before);
});

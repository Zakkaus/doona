import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

test('home charts collect memory polls and change the traffic history range', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  // Without a producer-side ring the curve is built from this session's polls.
  capabilities.resources.memory_history = {available: false};
  const responses: Record<string, unknown> = {
    '/version': await api.version(),
    '/capabilities': capabilities,
    '/runtime': await api.runtime(),
    '/runtime/outbounds': await api.runtimeOutbounds(),
    '/connections': await api.connections(),
    '/nodes': await api.nodes(),
    '/groups': await api.groups()
  };
  let memoryPoll = 0;
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/runtime/memory') {
      const memory = await api.runtimeMemory();
      memory.observed_at = new Date(Date.parse(memory.observed_at) + memoryPoll++ * 5000).toISOString();
      memory.process = {rss_bytes: String(memoryPoll * 1000000)};
      return route.fulfill({json: memory});
    }
    if (path === '/runtime/traffic/history')
      return route.fulfill({json: await api.trafficHistory({window_seconds: Number(url.searchParams.get('window_seconds'))})});
    await route.fulfill({json: responses[path]});
  });
  await page.goto('/#/activity');
  const memory = page.getByRole('region', {name: 'Memory', exact: true});
  const traffic = page.getByRole('region', {name: 'Traffic', exact: true});
  await expect(traffic.locator('.recharts-surface')).toBeVisible();
  // One sample is not a curve yet; the second poll draws it.
  await expect(memory.getByRole('status')).toContainText('Sampling');
  await page.clock.fastForward(5100);
  await expect(memory.locator('.recharts-surface')).toBeVisible();
  await expect(memory.locator('.rp-legend')).toContainText('2 MB');
  await expect(memory.locator('.recharts-area-curve').first()).toHaveAttribute('d', /L|C/);
  const request = page.waitForRequest(
    request => request.url().includes('/runtime/traffic/history?') && new URL(request.url()).searchParams.get('window_seconds') === '3600'
  );
  await traffic.getByRole('radio', {name: '1H', exact: true}).click();
  await request;
  await expect(traffic.locator('.recharts-surface')).toBeVisible();
});

test('the outbound mode switch drives the engine and reads back on return', async ({page}) => {
  await page.goto('/#/activity');
  await page.getByRole('radio', {name: 'Direct', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Outbound mode: Direct');
  await page.goto('/#/overview');
  await page.goto('/#/activity');
  await expect(page.getByRole('radio', {name: 'Direct', exact: true})).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', {name: 'Global', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Global'})).toBeVisible();
  await page.getByRole('radio', {name: 'Rule', exact: true}).click();
  await expect(page.getByRole('radio', {name: 'Rule', exact: true})).toHaveAttribute('aria-checked', 'true');
});

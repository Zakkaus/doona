import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {test as browserTest} from '@playwright/test';

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
  let releaseNodes: () => void = () => {};
  const nodesReady = new Promise<void>(resolve => {
    releaseNodes = resolve;
  });
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/nodes') await nodesReady;
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
  releaseNodes();
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

test('the outbound mode is staged and applied as a configuration write with a reload', async ({page}) => {
  await page.goto('/#/activity');
  const mode = page.getByRole('radiogroup', {name: 'Outbound mode'});
  await expect(mode.getByRole('radio', {name: 'Rule', exact: true})).toHaveAttribute('aria-checked', 'true');
  const apply = page.getByRole('button', {name: 'Apply', exact: true});
  await expect(apply).toBeDisabled();
  await mode.getByRole('radio', {name: 'Direct', exact: true}).click();
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'reloaded: Direct'})).toBeVisible();
  await expect(apply).toBeDisabled();
  // The marked rule is near the source end, outside CodeMirror's initial viewport.
  const routing = async () => {
    await page.goto('/#/config?tab=source');
    await page.locator('.cm-scroller').evaluate(el => el.scrollTo(0, el.scrollHeight));
    return page.locator('.cm-content');
  };
  await expect(await routing()).toContainText('l4proto(tcp, udp) -> direct # doona: outbound mode');
  await page.goto('/#/activity');
  await expect(mode.getByRole('radio', {name: 'Direct', exact: true})).toHaveAttribute('aria-checked', 'true');
  await mode.getByRole('radio', {name: 'Rule', exact: true}).click();
  await apply.click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'reloaded: Rule'})).toBeVisible();
  await expect(await routing()).not.toContainText('doona: outbound mode');
});

test('the global target picker is disabled without a writable main source', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const config = await api.config();
  for (const source of config.sources) source.writable = false;
  const responses: Record<string, unknown> = {
    '/version': await api.version(),
    '/capabilities': capabilities,
    '/runtime': await api.runtime(),
    '/runtime/memory': await api.runtimeMemory(),
    '/runtime/memory/history': await api.memoryHistory(),
    '/runtime/outbounds': await api.runtimeOutbounds(),
    '/runtime/traffic/history': await api.trafficHistory(),
    '/connections': await api.connections(),
    '/nodes': await api.nodes(),
    '/groups': await api.groups(),
    '/config': config
  };
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    await route.fulfill({json: responses[path]});
  });
  await page.goto('/#/activity');
  await expect(page.locator('.rp-version')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Global target', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toHaveCount(0);
});

test('the compact node menu selects by keyboard and returns focus to its trigger', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-mock-big', '7'));
  await page.goto('/#/activity');
  const trigger = page.getByRole('button', {name: 'Node', exact: true});
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', {name: 'Node', exact: true});
  const last = menu.getByRole('menuitemradio').last();
  const name = await last.getAttribute('data-key');
  expect(name).not.toBeNull();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(12);
  await expect(page.getByRole('searchbox', {name: 'Filter nodes'})).toHaveCount(0);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toContainText(name!);
  await expect(trigger).toBeFocused();
});

test('notices hide housekeeping events while the Events page retains them', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  const notices = page.getByRole('region', {name: 'Notifications and issues'});
  await expect(notices.getByRole('listitem').filter({hasText: 'stream.ready'})).toHaveCount(1);
  await page.clock.fastForward(10100);
  await expect(notices.getByRole('listitem').filter({hasText: /runtime\.updated|flow\.updated/})).toHaveCount(0);
  await page.goto('/#/events');
  await expect(page.getByRole('gridcell', {name: 'Stream ready', exact: true})).toBeVisible();
  await page.clock.fastForward(5100);
  await expect(page.getByRole('row').filter({hasText: 'Runtime updated'}).first()).toContainText('/api/v1/runtime');
});

test('hidden notices keep their published snapshot until the 200-event window is revealed', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  const notices = page.getByRole('region', {name: 'Notifications and issues'});
  const ready = notices.getByRole('listitem').filter({hasText: 'stream.ready'});
  await expect(ready).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(1000100);
  await expect(ready).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, value: false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(notices.getByRole('listitem')).toHaveCount(0);
});

test.describe('many outbounds', () => {
  test.use({storage: {'doona-mock-big': '3000'}});
  test('the outbound usage legend scrolls instead of growing the card', async ({page}) => {
    await page.goto('/#/activity');
    const legend = page.locator('.rp-donut .lst');
    await expect(legend.locator('.r')).toHaveCount(29);
    expect(await legend.evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight <= 170)).toBe(true);
  });

  test('the node menu searches virtual sections and selects the filtered node by keyboard', async ({page}) => {
    await page.goto('/#/activity');
    const trigger = page.getByRole('button', {name: 'Node', exact: true});
    await trigger.click();
    const menu = page.getByRole('menu', {name: 'Node', exact: true});
    const search = page.getByRole('searchbox', {name: 'Filter nodes'});
    await expect(search).toBeFocused();
    await expect(menu.locator('.rp-sec-h').first()).toBeVisible();
    expect(await menu.getByRole('menuitemradio').count()).toBeLessThan(3000);
    await menu.evaluate(el => el.scrollTo(0, el.scrollHeight));
    const target = menu.getByRole('menuitemradio').last();
    const name = await target.getAttribute('data-key');
    expect(name).not.toBeNull();
    await search.fill(name!);
    await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
    const health = await menu.locator('.desc').innerText();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toContainText(name!);
    await expect(trigger).toBeFocused();
    await trigger.click();
    // The virtual list renders the selected row only once the filter narrows it into view.
    await search.fill(name!);
    await expect(menu.getByRole('menuitemradio', {name: new RegExp(name!)})).toHaveAttribute('aria-checked', 'true');
    await expect(menu.locator('.desc')).toHaveText(health);
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
});

test('staged mode changes require discard before navigation', async ({page}) => {
  await page.goto('/#/activity');
  const mode = page.getByRole('radiogroup', {name: 'Outbound mode'});
  await mode.getByRole('radio', {name: 'Direct', exact: true}).click();
  await page.locator('.rp-nav[href="#/overview"]').click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(mode.getByRole('radio', {name: 'Direct', exact: true})).toHaveAttribute('aria-checked', 'true');
  await page.locator('.rp-nav[href="#/overview"]').click();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/overview$/);
  await page.locator('.rp-nav[href="#/activity"]').click();
  await expect(mode.getByRole('radio', {name: 'Rule', exact: true})).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
});

test('local traffic renders without history and duplicate node names retain independent latency', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  for (const resource of Object.values(capabilities.resources)) resource.available = false;
  capabilities.resources.nodes.available = true;
  const nodes = await api.nodes();
  const healthy = nodes.nodes.find(node => node.name === 'hk-01')!;
  const unavailable = nodes.nodes.find(node => node.name === 'jp-01')!;
  nodes.nodes = [
    {...healthy, id: 'a/hk', name: 'HK', subscription_tag: 'provider-a'},
    {...unavailable, id: 'b/hk', name: 'HK', subscription_tag: 'provider-b'}
  ];
  const responses: Record<string, unknown> = {'/capabilities': capabilities, '/version': await api.version(), '/nodes': nodes};
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/runtime') {
      const runtime = await api.runtime();
      runtime.traffic.sampled_at = new Date().toISOString();
      return route.fulfill({json: runtime});
    }
    return route.fulfill({json: responses[path]});
  });
  await page.goto('/#/activity');
  await expect(page.getByRole('region', {name: 'Traffic', exact: true}).locator('.recharts-surface')).toBeVisible();
  const trigger = page.getByRole('button', {name: 'Node', exact: true});
  await trigger.click();
  await page.getByRole('menuitemradio').filter({hasText: 'provider-b'}).click();
  const card = trigger.locator('xpath=ancestor::div[contains(@class,"rp-card")][1]');
  await expect(card.locator('.rp-big')).toHaveText('—');
  await trigger.click();
  await expect(page.getByRole('menuitemradio').filter({hasText: 'provider-b'})).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio').filter({hasText: 'provider-a'}).click();
  await expect(card.locator('.rp-big')).toContainText('ms');
});

browserTest('configuration read failures are shown instead of write restrictions', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  for (const [key, resource] of Object.entries(capabilities.resources)) if (key !== 'config') resource.available = false;
  const responses: Record<string, unknown> = {'/capabilities': capabilities, '/version': await api.version(), '/runtime': await api.runtime()};
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/config')
      return route.fulfill({status: 500, json: {error: {code: 'internal_error', message: 'Configuration storage failed'}, request_id: 'config-read'}});
    return route.fulfill({json: responses[path]});
  });
  await page.goto('/#/activity');
  await expect(page.getByRole('alert').filter({hasText: 'Configuration storage failed'})).toBeVisible();
  await expect(page.getByText('Needs a writable main configuration', {exact: true})).toHaveCount(0);
  expect(errors).toEqual([]);
});

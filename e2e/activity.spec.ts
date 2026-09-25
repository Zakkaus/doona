import {expect, mockBackend, test} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {test as browserTest, type Page} from '@playwright/test';
import {sha256} from '../src/api/hash';

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
  await expect(traffic.locator('.rp-activity-surface')).toBeVisible();
  releaseNodes();
  // One sample is not a curve yet; the second poll draws it.
  await expect(memory.getByRole('status')).toContainText('Sampling');
  await page.clock.fastForward(5100);
  await expect(memory.locator('.rp-activity-surface')).toBeVisible();
  await expect(memory.locator('.rp-legend')).toContainText('2 MB');
  await expect(memory.locator('.rp-area-curve').first()).toHaveAttribute('d', /L|C/);
  const memoryCurve = await memory.locator('.rp-area-curve').first().getAttribute('d');
  const request = page.waitForRequest(
    request => request.url().includes('/runtime/traffic/history?') && new URL(request.url()).searchParams.get('window_seconds') === '3600'
  );
  await traffic.getByRole('radio', {name: '1 h', exact: true}).click();
  await request;
  await expect(traffic.locator('.rp-activity-surface')).toBeVisible();
  await expect(memory.locator('.rp-area-curve').first()).toHaveAttribute('d', memoryCurve!);
  await traffic.getByRole('radio', {name: '7 d', exact: true}).click();
  await expect(memory.locator('.rp-area-curve').first()).toHaveAttribute('d', memoryCurve!);
});

test('the outbound mode is staged and applied as a configuration write with a reload', async ({page}) => {
  const {api} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  const ordinary = '  domain(suffix: doubleclick.net) -> block\n';
  const content = source.content!.replace(ordinary, '').replace('  domain(geosite: cn)', ordinary + '  domain(geosite: cn)');
  await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
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

test('read-only main configuration keeps the current mode and explains the write restriction', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  main.content = main.content!.replace('\nrouting {\n', '\nrouting {\n  l4proto(tcp, udp) -> proxy # doona: outbound mode\n');
  main.content_sha256 = await sha256(main.content);
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
  const mode = page.getByRole('radiogroup', {name: 'Outbound mode'});
  await expect(mode.getByRole('radio', {name: 'Global', exact: true})).toHaveAttribute('aria-checked', 'true');
  await expect(mode.getByRole('radio', {name: 'Global', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Global target', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Global target', exact: true})).toContainText('proxy');
  await page.getByRole('button', {name: 'Why is the mode read-only?'}).click();
  await expect(page.getByRole('dialog', {name: 'Why is the mode read-only?'})).toContainText('honk requires configuration writes');
  await expect(page.getByRole('link', {name: 'Installation instructions'})).toHaveAttribute(
    'href',
    'https://github.com/Zakkaus/doona/blob/main/README.md#install'
  );
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
  const notices = page.getByRole('region', {name: 'Notifications', exact: true});
  await expect(notices.getByRole('listitem').filter({hasText: 'Stream ready'})).toHaveCount(1);
  await page.clock.fastForward(10100);
  await expect(notices.getByRole('listitem').filter({hasText: /runtime\.updated|flow\.updated/})).toHaveCount(0);
  await page.goto('/#/events');
  await expect(page.getByRole('gridcell', {name: 'Stream ready', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Exclude runtime updates Kind', exact: true}).click();
  await page.getByRole('option', {name: 'Runtime updated', exact: true}).click();
  await page.clock.fastForward(5100);
  await expect(page.getByRole('row').filter({hasText: 'Runtime updated'}).first()).toContainText('/api/v1/runtime');
});

test('mock notices include distinct operations and recording gaps', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/activity');
  for (const lang of ['zh-TW', 'en']) {
    for (const scheme of ['light', 'dark']) {
      await page.evaluate(
        ({lang, scheme}) => {
          localStorage.setItem('doona-lang', lang);
          localStorage.setItem('doona-scheme', scheme);
        },
        {lang, scheme}
      );
      await page.reload();
      const notices = page.locator('.rp-feed');
      await expect(notices.getByRole('listitem')).toHaveCount(6);
      await expect(notices.locator('.rp-light.warn')).toHaveCount(2);
      if (lang === 'en') {
        await expect(notices.getByRole('listitem').filter({hasText: 'Configuration activated'})).toHaveCount(1);
        await expect(notices.getByRole('listitem').filter({hasText: 'Operation updated'})).toHaveCount(2);
        await expect(notices.getByRole('listitem').filter({hasText: 'Flow records lost'})).toHaveCount(2);
      }
    }
  }
});

test('housekeeping cannot evict notices while the page is hidden', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  const notices = page.getByRole('region', {name: 'Notifications', exact: true});
  const ready = notices.getByRole('listitem').filter({hasText: 'Stream ready'});
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
  await expect(ready).toHaveCount(1);
});

// The live window is two minutes of ten-second history, so a curve drawn from it has a dozen points across the plot.
async function expectLiveCurves(page: Page) {
  const curves = page.locator('.rp-spark .rp-area-curve');
  await expect(curves).toHaveCount(3);
  for (const curve of await curves.all()) await expect.poll(() => curve.evaluate(pointCount)).toBeGreaterThanOrEqual(10);
  const traffic = page.getByRole('region', {name: 'Traffic', exact: true});
  const area = traffic.locator('.rp-area-curve').first();
  await expect.poll(() => area.evaluate(pointCount)).toBeGreaterThanOrEqual(10);
  // The curve spans the window rather than bunching at its newest edge.
  const plot = await traffic.locator('.rp-area-grid').first().boundingBox();
  const drawn = await area.boundingBox();
  expect(drawn!.width).toBeGreaterThan(plot!.width * 0.8);
}
const pointCount = (path: Element) => (path.getAttribute('d')?.match(/[MLC]/g) ?? []).length;

test('the live curves keep their window after the page was hidden', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  await expectLiveCurves(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(600000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, value: false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(1000);
  await expectLiveCurves(page);
});

test('the live curves are drawn when the page opens after the session has run a while', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/overview');
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.clock.runFor(600000);
  await page.goto('/#/activity');
  await page.clock.runFor(1000);
  await expectLiveCurves(page);
});

for (const width of [390, 1440]) {
  test.describe(`${width}px metric tiles`, () => {
    test.use({viewport: {width, height: 900}});
    test('keep a readable sparkline and equal heights in each row', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('.rp-strip .rp-spark')).toHaveCount(3);
      const tiles = await page.locator('.rp-strip > *').evaluateAll(elements =>
        elements.map(tile => {
          const box = tile.getBoundingClientRect();
          const style = getComputedStyle(tile);
          const inset = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
          const value = tile.querySelector('.rp-big')!.getBoundingClientRect();
          const spark = tile.querySelector('.rp-spark')?.getBoundingClientRect();
          return {
            label: tile.querySelector('.rp-tile-head')!.textContent,
            top: Math.round(box.top),
            height: box.height,
            content: box.width - inset,
            spark: spark && {width: spark.width, beside: spark.left >= value.right, below: spark.top >= value.bottom}
          };
        })
      );
      for (const tile of tiles) {
        const row = tiles.filter(other => other.top === tile.top);
        for (const other of row) expect(other.height, `${tile.label} and ${other.label} share a row`).toBeCloseTo(tile.height, 0);
        if (!tile.spark) continue;
        if (width === 390) {
          expect(tile.spark.below, `${tile.label}: sparkline under the value`).toBe(true);
          expect(tile.spark.width, `${tile.label}: sparkline width`).toBeGreaterThanOrEqual(tile.content * 0.6);
        } else expect(tile.spark.beside, `${tile.label}: sparkline beside the value`).toBe(true);
      }
    });
  });
}

test.describe('many outbounds', () => {
  test.use({storage: {'doona-mock-big': '3000'}});
  test('the outbound usage legend scrolls instead of growing the card', async ({page}) => {
    await page.goto('/#/activity');
    const legend = page.locator('.rp-donut .lst');
    await expect(legend.locator('.r')).toHaveCount(29);
    expect(await legend.evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight <= 170)).toBe(true);
  });

  test.describe('without the service worker', () => {
    // Request interception does not see what a service worker fetches.
    test.use({serviceWorkers: 'block'});
    test('the node search loads on intent and keeps the menu size while it arrives', async ({page}) => {
      const chunk = /\/NodeSearch-[\w-]+\.js$/;
      let fetched = 0;
      let release = () => {};
      const arrived = new Promise<void>(resolve => (release = resolve));
      await page.route(chunk, async route => {
        fetched++;
        await arrived;
        await route.continue();
      });
      await page.goto('/#/activity');
      const trigger = page.getByRole('button', {name: 'Node', exact: true});
      await expect(trigger).toBeVisible();
      expect(fetched).toBe(0);
      await trigger.hover();
      await expect.poll(() => fetched).toBe(1);
      await trigger.click();
      const popover = page.locator('.rp-popover');
      await expect(popover.locator('.rp-menu-pending')).toBeVisible();
      const pending = await popover.boundingBox();
      release();
      await expect(page.getByRole('searchbox', {name: 'Filter nodes'})).toBeFocused();
      expect(await popover.boundingBox()).toEqual(pending);
    });
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
  capabilities.resources.runtime.available = true;
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
  await expect(page.getByRole('region', {name: 'Traffic', exact: true}).locator('.rp-activity-surface')).toBeVisible();
  const trigger = page.getByRole('button', {name: 'Node', exact: true});
  await trigger.click();
  await page.getByRole('menuitemradio').filter({hasText: 'provider-b'}).click();
  const card = trigger.locator('xpath=ancestor::div[contains(@class,"rp-card")][1]');
  await expect(card.locator('.rp-big')).toHaveText('—');
  await expect(card.getByText('Unavailable', {exact: true})).toBeVisible();
  await expect(card.getByText('Timed out', {exact: true})).toHaveCount(0);
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

test('optional runtime does not block independent activity sections or poll an unsupported endpoint', async ({page}) => {
  const {capabilities, requests} = await mockBackend(page);
  capabilities.resources.runtime.available = false;
  await page.clock.install();
  await page.goto('/#/activity');
  await expect(page.getByRole('button', {name: 'Node', exact: true})).toBeVisible();
  await expect(page.getByRole('region', {name: 'Memory', exact: true}).locator('.rp-activity-surface')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Outbound downloads', exact: true})).toBeVisible();
  await expect(page.getByText('Not provided by this backend', {exact: true})).toBeVisible();
  await page.clock.fastForward(10100);
  expect(requests.filter(request => new URL(request.url()).pathname === '/api/v1/runtime')).toEqual([]);
});

test('interleaved mandatory rules reject mode changes without writing configuration', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const config = await api.config();
  const source = config.sources.find(source => source.kind === 'main')!;
  source.content = 'routing {\n  domain(example.com) -> proxy\n  pname(system) -> direct(must)\n  fallback: proxy\n}\n';
  source.content_sha256 = await sha256(source.content);
  handlers['GET config'] = async () => config;
  await page.goto('/#/activity');
  await page.getByRole('radiogroup', {name: 'Outbound mode'}).getByRole('radio', {name: 'Direct', exact: true}).click();
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Ordinary rules precede must rules');
  expect(requests.filter(request => request.method() === 'PUT')).toEqual([]);
});

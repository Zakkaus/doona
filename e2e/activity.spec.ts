import {expect, expectLoadFailures, faults, mockBackend, scrollIntoList, setAppearance, settle, test, box, settleFrames, expectTextInside} from './fixtures';
import {createMockApi} from '../mock';
import {test as browserTest, type Page} from '@playwright/test';
import {sha256} from '../src/api/hash';
import {scanConfig} from '../src/dae/text';
import {demoRouting} from '../src/dae/startingRouting';

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
    '/connections': await api.connections({detail: 'full', limit: 1000}),
    '/nodes': await api.nodes({limit: 1000}),
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
  const memory = page.locator('main').getByRole('region', {name: 'Memory', exact: true});
  await memory.scrollIntoViewIfNeeded();
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

test('the traffic figures stay while the runtime read fails, muted until it recovers', async ({page}) => {
  await mockBackend(page);
  const runtime = /\/api\/v1\/runtime$/;
  expectLoadFailures(page, runtime);
  await page.goto('/#/activity');
  const tiles = page.locator("[data-profile='metrics'] .rp-card").filter({hasNot: page.getByRole('button', {name: /^Groups: /})});
  const figures = tiles.locator('.rp-big');
  await expect(figures).toHaveCount(4);
  await expect(tiles.locator('.rp-big.rp-muted')).toHaveCount(0);
  // The runtime is polled every five seconds.
  await page.route(runtime, route => route.abort('failed'));
  await expect(page.locator('.rp-dashboard-cell > .rp-alert')).toContainText('The backend could not be reached', {timeout: 10_000});
  await expect(tiles.locator('.rp-big.rp-muted')).toHaveCount(4);
  await expect(figures.first()).not.toBeEmpty();
  await page.unroute(runtime);
  await expect(page.locator('.rp-dashboard-cell > .rp-alert')).toHaveCount(0, {timeout: 10_000});
  await expect(tiles.locator('.rp-big.rp-muted')).toHaveCount(0);
});

test('the outbound mode is staged and applied as a configuration write with a reload', async ({page}) => {
  const {api} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  const ordinary = '  domain(suffix: doubleclick.net) -> block\n';
  const content = source.content!.replace(ordinary, '').replace('  domain(geosite:cn)', ordinary + '  domain(geosite:cn)');
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
  // The marked rule is near the source end, outside CodeMirror's initial viewport; the page scrolls the editor.
  const routing = async () => {
    await page.goto('/#/config?tab=source');
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
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

test('applying a mode keeps the Apply button that the pending announcement names', async ({page}) => {
  await page.goto('/#/activity');
  const apply = page.getByRole('button', {name: 'Apply', exact: true});
  await page.getByRole('radiogroup', {name: 'Outbound mode'}).getByRole('radio', {name: 'Direct', exact: true}).click();
  const id = await apply.getAttribute('id');
  await apply.click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'reloaded: Direct'})).toBeVisible();
  await expect(apply).toBeDisabled();
  // React Aria announces the pending state by pointing at the button; a remounted button leaves it naming nothing.
  await expect(apply).toHaveAttribute('id', id!);
  const named = await page
    .locator('[data-live-announcer] [role=img]')
    .evaluateAll(els => els.map(el => document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''));
  expect(named.length).toBeGreaterThan(0);
  expect(named.every(text => text === 'Apply')).toBe(true);
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
    '/connections': await api.connections({detail: 'full', limit: 1000}),
    '/nodes': await api.nodes({limit: 1000}),
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
  await expect(page.getByRole('button', {name: 'Global mode outbound', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Global mode outbound', exact: true})).toContainText('proxy');
  await expect(page.getByRole('button', {name: 'Global mode outbound', exact: true})).toHaveAccessibleDescription('Read-only');
  await page.getByRole('button', {name: 'Why is the mode read-only?'}).click();
  await expect(page.getByRole('dialog', {name: 'Why is the mode read-only?'})).toContainText('honk requires configuration writes');
  await expect(page.getByRole('link', {name: 'Read-only config files'})).toHaveAttribute(
    'href',
    'https://zakkaus.github.io/doona-docs/en/troubleshooting.html#read-only'
  );
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toHaveCount(0);
});

test('the compact group menu selects by keyboard and returns focus to its trigger', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET groups'] = async () => (await backend.api.groups()).slice(0, 4);
  await page.goto('/#/activity');
  const trigger = page.getByRole('button', {name: /^Groups: /});
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', {name: 'Groups', exact: true});
  const last = menu.getByRole('menuitemradio').last();
  const name = await last.getAttribute('data-key');
  expect(name).not.toBeNull();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(5);
  await expect(page.getByRole('searchbox', {name: 'Groups'})).toHaveCount(0);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('doona-dashboard')!).sections[1].items.find((item: {id: string}) => item.id === 'latency').group)
  ).toBe(name);
  await expect(trigger).toBeFocused();
});

test('the latency card follows the busiest group, remembers a choice and resolves its active node', async ({page}) => {
  // Keep the ranking card near the viewport so its shared connection poll runs.
  await page.setViewportSize({width: 1280, height: 1000});
  const backend = await mockBackend(page);
  backend.capabilities.resources.events.available = false;
  const snapshot = await backend.api.connections({detail: 'full', limit: 1000});
  let groups = (await backend.api.groups()).filter(group => ['proxy', 'auto', 'gaming', 'backup'].includes(group.name));
  groups[1].selection.tcp_member_id = 'sg-01';
  groups[0].selection.tcp_member_id = groups[1].id;
  let busiest = 'proxy';
  let reads = 0;
  backend.handlers['GET groups'] = async () => groups;
  backend.handlers['GET connections'] = async () => {
    reads++;
    return {...snapshot, tcp: [{...snapshot.tcp[0], state: 'active', outbound: busiest, chain: ['gaming', 'jp-01']}], udp: []};
  };
  // A saved node choice belongs to the old picker and must be ignored.
  await page.addInitScript(() => localStorage.setItem('doona-activity-node', 'jp-01'));
  await page.clock.install();
  await page.goto('/#/activity');
  const trigger = page.getByRole('button', {name: /^Groups: /});
  const menu = page.getByRole('menu', {name: 'Groups', exact: true});
  const tile = page.locator('.rp-card', {hasText: 'Latency'}).first();
  await expect(trigger).toHaveText('sg-01');
  await expect(trigger).toHaveAccessibleName('Groups: sg-01');
  await expect(tile.locator('.rp-tile-val')).toHaveText('63 ms');
  expect(reads).toBe(1);
  busiest = 'gaming';
  await page.clock.fastForward(20100);
  await expect(trigger).toHaveText('hk-02');
  await expect(tile).toContainText('hk-02');
  await expect(tile.locator('.rp-big')).toHaveText('91 ms');
  expect(reads).toBe(2);
  await trigger.click();
  const follow = menu.getByRole('menuitemradio', {name: 'Automatic', exact: true});
  await expect(menu.getByRole('menuitemradio').first()).toHaveText('Automatic');
  await expect(follow).toHaveAttribute('aria-checked', 'true');
  await expect(menu.locator('p, .rp-menu-note, .desc')).toHaveCount(0);
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Automatic', ...groups.map(group => group.name)]);
  await expect(menu.locator('[aria-checked="true"]')).toHaveCount(1);
  await menu.locator('[data-key="proxy"]').click();
  await expect(trigger).toHaveText('sg-01');
  await expect(trigger).toHaveAccessibleName('Groups: sg-01');
  const latencyGroup = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('doona-dashboard')!).sections[1].items.find((item: {id: string}) => item.id === 'latency').group);
  expect(await latencyGroup()).toBe('proxy');
  groups[1].selection.tcp_member_id = 'hk-01';
  await page.clock.fastForward(30100);
  await expect(trigger).toHaveText('hk-01');
  await expect(trigger).toHaveAccessibleName('Groups: hk-01');
  await expect(tile.locator('.rp-tile-val')).toHaveText('84 ms');
  await page.reload();
  await expect(trigger).toHaveText('hk-01');
  await expect(trigger).toHaveAccessibleName('Groups: hk-01');
  await trigger.click();
  await expect(menu.locator('[data-key="proxy"]')).toHaveAttribute('aria-checked', 'true');
  await expect(menu.locator('[aria-checked="true"]')).toHaveCount(1);
  await follow.click();
  await expect(trigger).toHaveText('hk-02');
  await expect(tile).toContainText('hk-02');
  // Following traffic is saved as the card's choice and survives a reload.
  await expect.poll(latencyGroup).toBeFalsy();
  await page.reload();
  await expect(trigger).toHaveText('hk-02');
  await trigger.click();
  await menu.locator('[data-key="proxy"]').click();
  const originalGroups = groups;
  groups = groups.filter(group => group.name !== 'proxy');
  await page.reload();
  await expect(trigger).toHaveText('hk-02');
  await expect(tile).toContainText('hk-02');
  await trigger.click();
  await expect(follow).toHaveAttribute('aria-checked', 'true');
  // A saved group that no longer exists is cleared from the layout.
  await expect.poll(latencyGroup).toBeFalsy();
  await follow.click();
  groups = originalGroups;
  await page.clock.fastForward(30100);
  await expect(trigger).toHaveText('hk-02');
  await expect(tile).toContainText('hk-02');
  expect(backend.requests.every(request => request.method() === 'GET')).toBe(true);
});

test('group latency shares connection demand and manual choices stop following traffic', async ({page}) => {
  const backend = await mockBackend(page);
  backend.capabilities.resources.events.available = false;
  let reads = 0;
  backend.handlers['GET connections'] = async () => {
    reads++;
    return backend.api.connections({detail: 'full', limit: 1000});
  };
  await page.setViewportSize({width: 390, height: 600});
  await page.clock.install();
  await page.goto('/#/activity');
  const ranking = page.locator('.rp-card', {has: page.getByRole('heading', {name: 'Top traffic', exact: true})});
  await ranking.scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  await expect(ranking.getByRole('link').first()).toBeVisible();
  await page.clock.runFor(100);
  // Returning from off screen can refresh the list before the timed poll.
  const initialReads = reads;
  await ranking.scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  await expect(ranking.getByRole('link').first()).toBeVisible();
  await page.clock.runFor(100);
  await page.clock.fastForward(20100);
  await expect.poll(() => reads).toBeGreaterThan(initialReads);
  const trigger = page.getByRole('button', {name: /^Groups: /});
  await page.setViewportSize({width: 390, height: 480});
  await page.getByRole('heading', {name: 'Activity', exact: true}).evaluate(el => el.scrollIntoView({block: 'start'}));
  await expect.poll(async () => (await box(ranking)).y).toBeGreaterThan(1000);
  await page.clock.runFor(100);
  await page.clock.fastForward(1000);
  for (const id of ['ranking', 'latency', 'connectionOutbounds']) {
    await expect(page.locator(`.rp-dashboard-cell[data-module="${id}"]`)).toHaveAttribute('data-visible', 'false');
  }
  await page.clock.runFor(100);
  const pausedReads = reads;
  await page.clock.fastForward(40100);
  await page.clock.runFor(100);
  expect(reads).toBe(pausedReads);
  await trigger.click();
  await page.getByRole('menuitemradio').filter({hasText: 'proxy'}).click();
  await page.clock.runFor(100);
  const manuallyChosenReads = reads;
  await page.clock.fastForward(40100);
  await page.clock.runFor(100);
  expect(reads).toBe(manuallyChosenReads);
  await ranking.scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  await page.clock.fastForward(20100);
  await expect.poll(() => reads).toBeGreaterThan(pausedReads);
});

test('the latency tile of a healthy node has no status light', async ({page}) => {
  await page.goto('/#/activity');
  const tile = page.locator('.rp-card', {hasText: 'Latency'}).first();
  await expect(tile.getByRole('link')).toHaveAccessibleName(/^[^→]+: \d/);
  await expect(tile.locator('.rp-light')).toHaveCount(0);
});

test('the latency tile names an active node that is unavailable and keeps its size', async ({page}) => {
  // Narrow tiles stack the value over the line, so the light has to fill the line's place.
  await page.setViewportSize({width: 390, height: 900});
  const backend = await mockBackend(page, {faults: true});
  const groups = await backend.api.groups();
  groups.find(group => group.name === 'gaming')!.selection.tcp_member_id = 'jp-01';
  backend.handlers['GET groups'] = async () => groups;
  await page.goto('/#/activity');
  const tile = page.locator('.rp-card', {hasText: 'Latency'}).first();
  // The value link appears once the nodes have loaded; before that the tile shows its placeholder.
  await expect(tile.getByRole('link')).toHaveAccessibleName(/^[^→]+: \d/);
  await expect(tile.locator('.rp-light')).toHaveCount(0);
  const height = (await box(tile)).height;
  await page.getByRole('button', {name: /^Groups: /}).click();
  await page.getByRole('searchbox', {name: 'Groups', exact: true}).fill('gaming');
  const jp = page.getByRole('menuitemradio').filter({hasText: 'gaming'});
  await scrollIntoList(jp);
  await jp.click();
  await expect(tile.locator('.rp-light')).toHaveText('Unavailable');
  expect((await box(tile)).height).toBe(height);
  // The light takes the line's place: each row keeps one height, and the tiles keep their sizes without lines.
  const sizes = () =>
    page
      .locator("[data-profile='metrics'] > *")
      .evaluateAll(tiles => tiles.map(tile => [Math.round(tile.getBoundingClientRect().top), tile.getBoundingClientRect().height]));
  const lit = await sizes();
  for (const [top] of lit) expect(new Set(lit.filter(other => other[0] === top).map(other => other[1])).size, 'one height per row').toBe(1);
  await page.evaluate(() => localStorage.setItem('doona-sparklines', 'off'));
  await page.reload();
  await expect(tile.locator('.rp-light')).toHaveText('Unavailable');
  await expect(page.locator("[data-profile='metrics'] .rp-spark")).toHaveCount(0);
  expect(await sizes(), 'the same sizes without lines').toEqual(lit);
});

test('the latency card explains automatic selection from its info button', async ({page}) => {
  await page.goto('/#/activity');
  const help = page.locator('.rp-latency').getByRole('button', {name: 'About Latency', exact: true});
  await help.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {name: 'Latency', exact: true});
  await expect(dialog).toContainText('By default, this card follows the group with the most connections; choosing a group changes only this card.');
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  await expect(dialog).toHaveCount(0);
});

test('notices hide housekeeping events while the Events page retains them', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  const notices = page.getByRole('region', {name: 'Notifications', exact: true});
  await notices.scrollIntoViewIfNeeded();
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

test.describe(() => {
  test.use({storage: faults});
  test('mock notices include distinct operations and the recording gap, not routine overflow', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/#/activity');
    for (const lang of ['zh-TW', 'en']) {
      for (const scheme of ['light', 'dark']) {
        await setAppearance(page, lang, scheme);
        await settle(page);
        await page.reload();
        const notices = page.locator('.rp-feed');
        await notices.scrollIntoViewIfNeeded();
        await expect(notices.getByRole('listitem')).toHaveCount(5);
        await expect(notices.locator('.rp-light.warn')).toHaveCount(1);
        if (lang === 'en') {
          await expect(notices.getByRole('listitem').filter({hasText: 'Configuration activated'})).toHaveCount(1);
          await expect(notices.getByRole('listitem').filter({hasText: 'Operation updated'})).toHaveCount(2);
          await expect(notices.getByRole('listitem').filter({hasText: 'Flow records lost'})).toHaveCount(1);
          await expect(notices.getByRole('listitem').filter({hasText: 'records reached the retention limit'})).toHaveCount(0);
        }
      }
    }
  });
});

test.describe(() => {
  test.use({storage: faults});
  test('notice summaries start at one edge however wide their labels are', async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('doona-lang', 'en'));
    // A phone's card is about as narrow as the card gets.
    for (const width of [390, 1440]) {
      await page.setViewportSize({width, height: 900});
      await page.goto('/#/activity');
      const notices = page.getByRole('region', {name: 'Notifications', exact: true});
      await notices.scrollIntoViewIfNeeded();
      await expect(notices.locator('.rp-light.warn')).toHaveText('Warning');
      const edges = await notices.locator('[role=listitem] .rp-note').evaluateAll(notes => notes.map(note => note.getBoundingClientRect().left));
      expect(edges.length).toBeGreaterThan(1);
      expect(new Set(edges).size).toBe(1);
      // A label lines up with its summary's first line, also when the summary wraps.
      const offsets = await notices.locator('[role=listitem]').evaluateAll(items =>
        items.map(item => {
          const label = item.querySelector('.rp-light')!.getBoundingClientRect();
          const note = item.querySelector('.rp-note')!;
          const line = parseFloat(getComputedStyle(note).lineHeight);
          return Math.abs(label.top + label.height / 2 - (note.getBoundingClientRect().top + line / 2));
        })
      );
      for (const offset of offsets) expect(offset).toBeLessThan(4);
    }
  });
});

test('housekeeping cannot evict notices while the page is hidden', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  const notices = page.getByRole('region', {name: 'Notifications', exact: true});
  await notices.scrollIntoViewIfNeeded();
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

// The live window is two minutes of ten-second history, so a traffic curve drawn from it has a dozen points across the plot.
async function expectLiveCurves(page: Page) {
  const curves = page.locator(':is([data-module=download], [data-module=upload], [data-module=connections]) .rp-spark .rp-area-curve');
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
// A sparkline waits for its second sample: whatever is drawn has at least two points, and a lone sample leaves no dot.
async function expectNoLoneSample(page: Page) {
  await expect(page.locator('.rp-spark circle')).toHaveCount(0);
  for (const curve of await page.locator('.rp-spark .rp-area-curve').all()) expect(await curve.evaluate(pointCount)).toBeGreaterThanOrEqual(2);
}

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
    test('keep a readable sparkline and equal heights in each row, and their heights without sparklines', async ({page}) => {
      await page.clock.install();
      await page.goto('/#/activity');
      await expectNoLoneSample(page);
      // CPU and latency draw the session's own polls; the node list comes every 30 seconds.
      await page.clock.runFor(1000);
      await expectNoLoneSample(page);
      await page.clock.runFor(60000);
      await expect(page.locator("[data-profile='metrics'] .rp-spark svg")).toHaveCount(5);
      const measure = () =>
        page.locator("[data-profile='metrics'] > *").evaluateAll(elements =>
          elements.map(tile => {
            const box = tile.getBoundingClientRect();
            const style = getComputedStyle(tile);
            const inset =
              parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
            const value = tile.querySelector('.rp-big')!.getBoundingClientRect();
            const spark = tile.querySelector('.rp-spark')?.getBoundingClientRect();
            return {
              label: tile.querySelector('.rp-tile-head')!.textContent,
              head: tile.querySelector('.rp-tile-head')!.getBoundingClientRect().height,
              line: tile.querySelector('.rp-tile-body')!.getBoundingClientRect().top - box.top,
              top: Math.round(box.top),
              height: box.height,
              content: box.width - inset,
              spark: spark && {width: spark.width, height: spark.height, beside: spark.left >= value.right, below: spark.top >= value.bottom}
            };
          })
        );
      const tiles = await measure();
      // The latency tile keeps its picker on the caption's line, so its header and value line match the others'.
      const [download, latency] = ['Download', 'Latency'].map(label => tiles.find(tile => tile.label!.startsWith(label))!);
      expect([latency.head, latency.line], 'latency header and value line').toEqual([download.head, download.line]);
      // One plot height; under the value every plot spans the tile, beside it each fills the room up to the same cap.
      expect(new Set(tiles.map(tile => tile.spark!.height)).size, 'plot heights').toBe(1);
      expect(new Set(tiles.filter(tile => tile.spark!.below).map(tile => Math.round(tile.spark!.width))).size, 'stacked plot widths').toBeLessThanOrEqual(1);
      for (const tile of tiles.filter(tile => !tile.spark!.below)) expect(tile.spark!.width, `${tile.label}: plot width`).toBeLessThanOrEqual(120);
      for (const tile of tiles) {
        const row = tiles.filter(other => other.top === tile.top);
        for (const other of row) expect(other.height, `${tile.label} and ${other.label} share a row`).toBeCloseTo(tile.height, 0);
        if (!tile.spark) continue;
        // A tile narrower than the value and a 64px line stacks them (cards-dashboard.css).
        if (tile.content < 174) {
          expect(tile.spark.below, `${tile.label}: sparkline under the value`).toBe(true);
          expect(tile.spark.width, `${tile.label}: sparkline width`).toBeGreaterThanOrEqual(tile.content * 0.6);
        } else expect(tile.spark.beside, `${tile.label}: sparkline beside the value`).toBe(true);
      }
      await page.evaluate(() => localStorage.setItem('doona-sparklines', 'off'));
      await page.reload();
      await expect(page.locator("[data-profile='metrics'] .rp-big")).toHaveCount(5);
      await expect(page.locator("[data-profile='metrics'] .rp-spark")).toHaveCount(0);
      expect((await measure()).map(tile => [tile.top, tile.height])).toEqual(tiles.map(tile => [tile.top, tile.height]));
    });
  });
}

test('the latency sparkline restarts when the tile picks another group', async ({page}) => {
  // Hold time between reads: a menu can pause and resume the tile, and events can bring a read forward.
  await page.clock.install({time: new Date('2026-09-16T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-16T00:00:01Z'));
  await page.goto('/#/activity');
  await expect(page.locator('.rp-latency .rp-big')).toHaveText(/ms/);
  const curve = page.locator('.rp-latency .rp-spark .rp-area-curve');
  await page.clock.runFor(61000);
  await expect.poll(() => curve.evaluate(pointCount)).toBeGreaterThanOrEqual(3);
  await page.locator('.rp-latency .rp-select').click();
  const group = page.getByRole('menuitemradio', {name: 'proxy', exact: true});
  // The virtual menu restores pointer events on a timer after scrolling; let it run while picking.
  await page.clock.resume();
  await scrollIntoList(group);
  await group.click();
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(async () => page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 50))).toPass();
  // One sample is no line; the box stays.
  await expect(curve).toHaveCount(0);
  await expectNoLoneSample(page);
  await expect(page.locator('.rp-latency .rp-spark')).toBeVisible();
  await page.clock.runFor(31000);
  await expect.poll(() => curve.evaluate(pointCount)).toBeGreaterThanOrEqual(2);
});

// The picker stays inside the tile; phones keep two tiles per row and truncate long node names.
for (const [width, lang] of [
  [320, 'en'],
  [320, 'zh-TW'],
  [360, 'en'],
  [360, 'zh-TW'],
  [390, 'zh-CN'],
  [1440, 'en']
] as const)
  test.describe(`${width}px ${lang} metric strip`, () => {
    test.use({viewport: {width, height: 800}, storage: {'doona-lang': lang}});
    test('keeps two tiles to a row and the group picker inside its tile', async ({page}) => {
      const backend = await mockBackend(page);
      backend.handlers['GET nodes'] = async () => {
        const result = await backend.api.nodes({limit: 1000});
        return {...result, nodes: result.nodes.map(node => ({...node, name: `${node.name}-relay-through-a-long-provider-name`}))};
      };
      const groups = await backend.api.groups();
      backend.handlers['GET groups'] = async () => groups.map(group => ({...group, name: `${group.name}-a-long-policy-group-name`}));
      // The clock holds the trigger's own close timer, set when the pointer left the text, until focus has come back.
      if (width === 1440) await page.clock.install();
      await page.goto('/#/activity');
      const trigger = page.locator('.rp-latency .rp-select');
      await trigger.click();
      await page.getByRole('menuitemradio', {name: 'proxy-a-long-policy-group-name', exact: true}).click();
      // A slow round trip makes the target a past time, so the pause is tried again.
      if (width === 1440) await expect(async () => page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 50))).toPass();
      const tile = page.locator("[data-profile='metrics'] .rp-card").filter({has: page.locator('.rp-tile-head .rp-select')});
      const picker = tile.locator('.rp-tile-head .rp-select');
      await expect(picker).toContainText('-relay-through-a-long-provider-name');
      const tops = await page.locator("[data-profile='metrics'] > *").evaluateAll(tiles => tiles.map(el => Math.round(el.getBoundingClientRect().top)));
      const rows = [...new Set(tops)].map(top => tops.filter(other => other === top).length);
      if (width < 600) expect(rows.slice(0, -1).every(count => count === 2) && rows.at(-1)! <= 2, `tiles per row: ${rows.join(', ')}`).toBe(true);
      const {edge, left, start, parts, name, gap, height, chevron, control} = await tile.evaluate(el => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const button = el.querySelector('.rp-tile-head .rp-select')!;
        const text = button.querySelector<HTMLElement>('.rp-truncate:last-child');
        return {
          edge: box.right - parseFloat(style.paddingInlineEnd),
          left: box.left + parseFloat(style.paddingInlineStart),
          start: button.getBoundingClientRect().left,
          parts: [button, button.querySelector('svg')!].map(part => part.getBoundingClientRect().right),
          name: text && {full: text.scrollWidth, shown: text.clientWidth, overflow: getComputedStyle(text).textOverflow},
          gap: getComputedStyle(button).gap,
          height: button.getBoundingClientRect().height,
          chevron: button.querySelector('svg')!.getBoundingClientRect().width,
          control: parseFloat(getComputedStyle(button).getPropertyValue('--rp-control'))
        };
      });
      expect(start).toBeGreaterThanOrEqual(left - 0.5);
      for (const right of parts) expect(right).toBeLessThanOrEqual(edge + 0.5);
      expect(name, 'the name is ellipsised').not.toBeNull();
      expect(name!.full).toBeGreaterThan(name!.shown);
      expect(name!.overflow).toBe('ellipsis');
      expect(gap).toBe('4px');
      expect(height).toBe(control);
      expect(chevron).toBe(20);
      if (width === 1440) {
        await expect(picker.locator('.rp-truncate')).toHaveAttribute('data-tip');
        const tip = page.getByRole('tooltip').filter({hasText: (await picker.textContent())!});
        await picker.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await page.clock.runFor(700);
        await expect(tip).toBeVisible();
        // A tip that is closing stays in the DOM, marked, until its exit ends.
        await expect(tip).not.toHaveAttribute('data-exiting');
        await page.clock.resume();
        await page.keyboard.press('Tab');
        await expect(tip).toBeHidden();
        await page.keyboard.press('Shift+Tab');
      }
      await picker.click();
      await expect(page.getByRole('menuitemradio', {name: 'proxy-a-long-policy-group-name', exact: true})).toBeVisible();
      await expect(page.getByRole('menu')).not.toContainText('-relay-through-a-long-provider-name');
    });
  });

async function mockManyGroups(page: Page) {
  const backend = await mockBackend(page);
  const base = (await backend.api.groups())[0];
  backend.handlers['GET groups'] = async () => Array.from({length: 40}, (_, i) => ({...base, id: `group-${i}`, name: `group-${i}`}));
}

test.describe('many outbounds', () => {
  test.use({storage: {'doona-mock-big': '3000'}});
  test('the outbound usage legend scrolls instead of growing the card', async ({page}) => {
    await page.goto('/#/activity');
    const legend = page.locator('[data-module=outbounds] .rp-donut .lst');
    await expect(legend.locator('.r')).toHaveCount(29);
    expect(await legend.evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight <= 170)).toBe(true);
  });

  test.describe('without the service worker', () => {
    // Request interception does not see what a service worker fetches.
    test.use({serviceWorkers: 'block'});
    test('the group search loads on intent and keeps the menu size while it arrives', async ({page}) => {
      await mockManyGroups(page);
      // The idle warm-up loads other pages that import the search list, which would fetch it before the hover.
      await page.addInitScript(() => {
        window.requestIdleCallback = () => 0;
      });
      const chunk = /\/SearchList-[\w-]+\.js$/;
      let fetched = 0;
      let release = () => {};
      const arrived = new Promise<void>(resolve => (release = resolve));
      await page.route(chunk, async route => {
        fetched++;
        await arrived;
        await route.continue();
      });
      await page.goto('/#/activity');
      const trigger = page.getByRole('button', {name: /^Groups: /});
      await expect(trigger).toBeVisible();
      expect(fetched).toBe(0);
      await trigger.hover();
      await expect.poll(() => fetched).toBe(1);
      await trigger.click();
      const popover = page.locator('.rp-popover');
      await expect(popover.locator('.rp-menu-pending')).toBeVisible();
      // The popover drifts 4px as it enters; measure where it settles, not a frame of the entrance.
      await popover.evaluate(el => Promise.all(el.getAnimations({subtree: true}).map(animation => animation.finished)));
      const pending = await popover.boundingBox();
      release();
      await expect(page.getByRole('searchbox', {name: 'Groups'})).toBeFocused();
      expect(await popover.boundingBox()).toEqual(pending);
    });
  });

  test('the group menu searches and selects the filtered group by keyboard', async ({page}) => {
    await mockManyGroups(page);
    await page.goto('/#/activity');
    const trigger = page.getByRole('button', {name: /^Groups: /});
    await trigger.click();
    const menu = page.getByRole('menu', {name: 'Groups', exact: true});
    const search = page.getByRole('searchbox', {name: 'Groups'});
    await expect(search).toBeFocused();
    await expect(menu.getByRole('menuitemradio').first()).toHaveText('Automatic');
    expect(await menu.getByRole('menuitemradio').count()).toBeLessThan(41);
    await menu.evaluate(el => el.scrollTo(0, el.scrollHeight));
    const target = menu.getByRole('menuitemradio').last();
    const name = await target.getAttribute('data-key');
    expect(name).not.toBeNull();
    await search.fill(name!);
    await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
    await expect(menu.locator('.desc')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('doona-dashboard')!).sections[1].items.find((item: {id: string}) => item.id === 'latency').group
      )
    ).toBe(name);
    await expect(trigger).toBeFocused();
    await trigger.click();
    // The virtual list renders the selected row only once the filter narrows it into view.
    await search.fill(name!);
    await expect(menu.getByRole('menuitemradio', {name: new RegExp(name!)})).toHaveAttribute('aria-checked', 'true');
    await expect(menu.locator('.desc')).toHaveCount(0);
    await expect(menu.locator('[aria-checked="true"]')).toHaveCount(1);
    await expect(trigger).toHaveText('hk-01');
    await expect(trigger).toHaveAccessibleName('Groups: hk-01');
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
});

test('an engine whose configuration syntax doona does not write shows no mode and takes no change', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const marked = main.content!.replace('\nrouting {\n', '\nrouting {\n  l4proto(tcp, udp) -> proxy # doona: outbound mode\n');
  await api.pollOperation(await api.replaceConfigSource(main.id, marked, `"${main.content_sha256}"`));
  const version = await api.version();
  handlers['GET version'] = async () => ({...version, engine: {...version.engine, name: 'other'}});
  await page.goto('/#/activity');
  await expect(page.locator('.rp-version')).toBeVisible();
  const mode = page.getByRole('radiogroup', {name: 'Outbound mode'});
  await expect(page.getByText('Not provided by this backend', {exact: true}).first()).toBeVisible();
  for (const name of ['Rule', 'Direct', 'Global']) {
    await expect(mode.getByRole('radio', {name, exact: true})).toBeDisabled();
    await expect(mode.getByRole('radio', {name, exact: true})).not.toBeChecked();
  }
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toHaveCount(0);
  expect(requests.filter(request => request.method() !== 'GET')).toEqual([]);
});

test('the mode card waits for the version before saying the mode is not provided', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const version = await api.version();
  let answer = () => {};
  const held = new Promise<void>(resolve => (answer = resolve));
  handlers['GET version'] = async () => {
    await held;
    return version;
  };
  await page.goto('/#/activity');
  // While the engine is unknown the card looks as it does before the configuration arrives.
  await expect(page.getByRole('button', {name: 'Why is the mode read-only?'})).toBeVisible();
  await expect(page.getByText('Not provided by this backend', {exact: true})).toHaveCount(0);
  answer();
  await expect(page.getByRole('radiogroup', {name: 'Outbound mode'}).getByRole('radio', {name: 'Rule', exact: true})).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Not provided by this backend', {exact: true})).toHaveCount(0);
});

test('staged mode changes require discard before navigation', async ({page}) => {
  await page.goto('/#/activity');
  const mode = page.getByRole('radiogroup', {name: 'Outbound mode'});
  await mode.getByRole('radio', {name: 'Direct', exact: true}).click();
  await page.locator('.rp-nav[href="#/overview"]').click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(mode.getByRole('radio', {name: 'Direct', exact: true})).toHaveAttribute('aria-checked', 'true');
  await page.locator('.rp-nav[href="#/overview"]').click();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/overview$/);
  await page.locator('.rp-nav[href="#/activity"]').click();
  await expect(mode.getByRole('radio', {name: 'Rule', exact: true})).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
});

test('local traffic renders without history and latency falls back to a node without groups', async ({page}) => {
  const api = createMockApi({faults: true});
  const capabilities = await api.capabilities();
  for (const resource of Object.values(capabilities.resources)) resource.available = false;
  capabilities.resources.nodes.available = true;
  capabilities.resources.runtime.available = true;
  const nodes = await api.nodes({limit: 1000});
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
  const trigger = page.getByRole('button', {name: /^Groups: /});
  const card = trigger.locator('xpath=ancestor::*[contains(@class,"rp-card")][1]');
  await expect(trigger).toHaveText('HK');
  await expect(card.locator('.rp-big')).toContainText('ms');
  await trigger.click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(1);
  await expect(page.getByRole('menuitemradio')).toHaveText('Automatic');
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
  await expect(page.locator('main').getByRole('alert').filter({hasText: 'Configuration storage failed'})).toBeVisible();
  await expect(page.getByText('Needs a writable main configuration', {exact: true})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('optional runtime does not block independent activity sections or poll an unsupported endpoint', async ({page}) => {
  const {capabilities, requests} = await mockBackend(page);
  capabilities.resources.runtime.available = false;
  await page.clock.install();
  await page.goto('/#/activity');
  await expect(page.getByRole('button', {name: /^Groups: /})).toBeVisible();
  await page.locator('main').getByRole('region', {name: 'Memory', exact: true}).scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  await expect(page.locator('main').getByRole('region', {name: 'Memory', exact: true}).locator('.rp-activity-surface')).toBeVisible();
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
  const toast = page.locator('.rp-toast.negative');
  await expect(toast).toContainText('Move the must rules to the top of the routing block');
  // The rule in the way is named on its own line.
  await expect(toast).toContainText('domain(example.com) -> proxy');
  expect(requests.filter(request => request.method() === 'PUT')).toEqual([]);
});

test('the demo switches the outbound mode and back while preserving mandatory rules', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const block = scanConfig(main.content!).blocks.find(block => block.name === 'routing')!;
  const content = main.content!.slice(0, block.from) + demoRouting + main.content!.slice(block.to);
  await api.pollOperation(await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`));
  await page.goto('/#/activity');
  const modes = page.getByRole('radiogroup', {name: 'Outbound mode'});
  await modes.getByRole('radio', {name: 'Direct', exact: true}).click();
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('reloaded: Direct');
  await expect(page.locator('.rp-toast.negative')).toHaveCount(0);
  // The catch-all is a real rule of the new generation, right after the must rules.
  await page.goto('/#/rules?tab=list&view=advanced');
  const rules = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rules.nth(0)).toContainText('pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53)');
  await expect(rules.nth(0)).toContainText('direct');
  await expect(rules.nth(0).getByText('must', {exact: true})).toBeVisible();
  await expect(rules.nth(1)).toContainText('dip(geoip: private)');
  await expect(rules.nth(1)).toContainText('direct');
  await expect(rules.nth(1).getByText('must', {exact: true})).toBeVisible();
  await expect(rules.nth(2)).toContainText('l4proto(tcp, udp)');
  await expect(rules.nth(2)).toContainText('direct');
  await page.goto('/#/activity');
  await expect(modes.getByRole('radio', {name: 'Direct', exact: true})).toBeChecked();
  await modes.getByRole('radio', {name: 'Rule', exact: true}).click();
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'reloaded: Rule'})).toBeVisible();
  await expect(modes.getByRole('radio', {name: 'Rule', exact: true})).toBeChecked();
});

test.describe(() => {
  test.use({storage: faults});
  test('the status card reports a degraded datapath as the Overview header does', async ({page}) => {
    await page.goto('/#/activity');
    const status = page.locator("[data-profile='quick'] .rp-control-card > .rp-row > .rp-light");
    await expect(status).toHaveText('Running, datapath degraded');
    await expect(status).toHaveClass(/\bwarn\b/);
  });
});

test('the active connections tile opens the connection list', async ({page}) => {
  await page.goto('/#/activity');
  await page.getByRole('link', {name: 'Active connections', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections\?tab=list$/);
  await expect(page.getByRole('tab', {name: 'Connections', exact: true})).toHaveAttribute('aria-selected', 'true');
});

test('the download and upload tiles open the connections traffic', async ({page}) => {
  for (const name of ['Download', 'Upload']) {
    await page.goto('/#/activity');
    await page.getByRole('link', {name, exact: true}).click();
    await expect(page).toHaveURL(/#\/connections\?tab=traffic$/);
    await expect(page.getByRole('tab', {name: 'Traffic', exact: true})).toHaveAttribute('aria-selected', 'true');
  }
});

test('the rankings, outbound usage and latency tile open the connections and node they name', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/activity');
  const escape = (text: string) => encodeURIComponent(text).replace(/[.[\]()*+?]/g, '\\$&');
  // The list groups rows by default, so it is a tree grid.
  const list = page.getByRole('treegrid', {name: 'Connections'}).or(page.getByRole('grid', {name: 'Connections'}));
  const ranking = page.locator('.rp-card', {has: page.getByRole('heading', {name: 'Top traffic', exact: true})});
  await ranking.scrollIntoViewIfNeeded();
  const device = ranking.getByRole('link').first();
  const address = (await device.innerText()).trim();
  await device.click();
  await expect(page).toHaveURL(new RegExp(`#/connections\\?src=${escape(address)}$`));
  await expect(page.getByRole('tab', {name: 'Connections', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(list).toContainText(address);
  await page.goBack();
  await ranking.getByRole('radio', {name: 'Domains', exact: true}).click();
  const domain = ranking.getByRole('link').first();
  const name = (await domain.innerText()).trim();
  await domain.click();
  await expect(page).toHaveURL(new RegExp(`#/connections\\?q=${escape(name)}$`));
  await expect(page.getByRole('searchbox', {name: 'Filter', exact: true})).toHaveValue(name);
  await page.goBack();
  const usage = page.locator('.rp-card', {has: page.getByRole('heading', {name: 'Outbound downloads', exact: true})});
  await usage.getByRole('link', {name: 'proxy', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections\?out=proxy$/);
  // The outbound picker shows the filter the link set.
  await expect(page.getByRole('button', {name: 'proxy Outbound', exact: true})).toBeVisible();
  await page.goBack();
  const tile = page.locator('.rp-card', {hasText: 'Latency'}).first();
  const node = tile.getByRole('link');
  await expect(node).toHaveAccessibleName(/^[^→]+: /);
  const nodeName = (await node.getAttribute('aria-label'))!.split(':')[0];
  await node.click();
  await expect(page).toHaveURL(new RegExp(`#/nodes\\?provider=[^&]+&q=${escape(nodeName)}$`));
  await expect(page.getByRole('searchbox', {name: 'Search nodes', exact: true})).toHaveValue(nodeName);
});

test('the CPU tile opens the overview', async ({page}) => {
  await page.goto('/#/activity');
  await page.locator('.rp-card', {hasText: 'CPU usage'}).locator('.rp-tile-val > .rp-link').click();
  await expect(page).toHaveURL(/#\/overview$/);
});

test('the notices card says what is missing to route through a proxy until it is added', async ({page}) => {
  const backend = await mockBackend(page);
  const config = await backend.api.config();
  // Every top-level routing block goes; the DNS routing nested in dns stays.
  const unrouted = {
    ...config,
    sources: config.sources.map(source => {
      if (!source.content) return source;
      const blocks = scanConfig(source.content).blocks.filter(block => block.name === 'routing');
      const content = blocks.reduceRight((text, block) => text.slice(0, block.from) + text.slice(block.to), source.content);
      return {...source, content};
    })
  };
  backend.handlers['GET config'] = async () => unrouted;
  backend.handlers['GET providers'] = async () => ({providers: [], next_cursor: null});
  backend.handlers['GET nodes'] = async () => ({observed_at: new Date().toISOString(), nodes: [], next_cursor: null});
  await page.goto('/#/activity');
  const card = page.getByRole('region', {name: 'Notifications'});
  await card.scrollIntoViewIfNeeded();
  const subscriptions = card.getByRole('listitem').filter({hasText: 'No subscriptions yet'});
  const routing = card.getByRole('listitem').filter({hasText: 'No routing rules configured'});
  await expect(subscriptions.getByRole('link', {name: 'Add subscription', exact: true})).toHaveAttribute('href', '#/nodes');
  await routing.getByRole('link', {name: 'Choose a routing mode', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&view=simple$/);
  await expect(page.getByRole('radiogroup', {name: 'Routing mode'})).toBeVisible();
  // Once the backend has both, the notices are gone.
  delete backend.handlers['GET config'];
  delete backend.handlers['GET providers'];
  delete backend.handlers['GET nodes'];
  await page.goto('/#/activity');
  await settle(page);
  await page.reload();
  await expect(card.getByText('No subscriptions yet')).toHaveCount(0);
  await expect(card.getByText('No routing rules configured')).toHaveCount(0);
});

test('the latency picker shows the resolved node on a phone', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('doona-lang', 'zh-CN');
    localStorage.setItem('doona-country-flags', 'off');
  });
  await page.setViewportSize({width: 390, height: 900});
  await page.goto('/#/activity');
  const picker = page.locator('.rp-latency .rp-select');
  await expect(picker).toContainText('hk-01');
  await expect(picker).toHaveAccessibleName('组：hk-01');
  // A phone tile hides the caption from view, so the picker on its line keeps room for the name; the caption still names the tile.
  expect(await picker.locator('.rp-truncate').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(0);
  expect(await page.locator('.rp-latency').ariaSnapshot()).toMatch(/text: 延迟$/m);
  const icon = await page.locator('.rp-latency .rp-tile-head > svg').boundingBox();
  const controls = await page.locator('.rp-latency .rp-tile-controls').boundingBox();
  expect(controls!.y).toBeLessThan(icon!.y + icon!.height);
});

for (const [lang, scheme, width] of [
  ['en', 'light', 1440],
  ['zh-TW', 'dark', 1440],
  ['zh-CN', 'light', 390]
] as const)
  test.describe(`${lang} ${scheme} latency geometry`, () => {
    test.use({viewport: {width, height: 900}, storage: {'doona-lang': lang, 'doona-scheme': scheme, 'doona-country-flags': 'off'}});
    test('keeps the title above the value and the controls inside the card', async ({page}) => {
      await page.goto('/#/activity');
      const card = page.locator('.rp-latency');
      const picker = card.locator('.rp-select');
      const value = card.locator('.rp-big');
      // A phone tile shows the clock icon in the caption's place.
      const title = card.locator(width < 600 ? '.rp-tile-head > svg' : '.rp-tile-caption');
      await expect(picker).toHaveText('hk-01');
      await expect(value).toHaveText('84 ms');
      await page.evaluate(() => document.fonts.ready);
      await settleFrames(page);
      const [titleBox, triggerBox, valueBox] = await Promise.all([box(title), box(picker), box(value)]);
      expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(triggerBox.x);
      expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(valueBox.y);
      expect(triggerBox.y + triggerBox.height).toBeLessThanOrEqual(valueBox.y);
      expect(await value.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(
        await picker.evaluate(el => parseFloat(getComputedStyle(el).fontSize))
      );
      for (const element of width < 600 ? [picker, value] : [title, picker, value]) {
        await expectTextInside(element);
        expect(
          await element.evaluate(el => {
            const card = el.closest('.rp-latency')!.getBoundingClientRect();
            const own = el.getBoundingClientRect();
            return own.left >= card.left && own.right <= card.right && own.top >= card.top && own.bottom <= card.bottom;
          })
        ).toBe(true);
      }
    });
  });

test('the latency menu contains only Automatic and group names with one checked choice', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET groups'] = async () => (await backend.api.groups()).filter(group => ['proxy', 'auto', 'gaming', 'backup'].includes(group.name));
  await page.goto('/#/activity');
  await page.getByRole('button', {name: /^Groups: /}).click();
  const menu = page.getByRole('menu', {name: 'Groups', exact: true});
  await expect(page.locator('.rp-latency .rp-select')).toHaveAccessibleName('Groups: hk-01');
  await expect(menu).toHaveAccessibleName('Groups');
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Automatic', 'proxy', 'auto', 'gaming', 'backup']);
  await expect(menu.locator('p, .rp-menu-note, .desc')).toHaveCount(0);
  await expect(menu.locator('[aria-checked="true"]')).toHaveCount(1);
  await expect(menu.getByRole('menuitemradio', {name: 'Automatic', exact: true})).toHaveAttribute('aria-checked', 'true');
});

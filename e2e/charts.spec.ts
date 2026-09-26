import {expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';

test.use({storage: {'doona-lang': 'en'}});

const fact = (page: import('@playwright/test').Page, label: string) =>
  page
    .locator('.rp-facts > div')
    .filter({has: page.locator('dt', {hasText: new RegExp(`^${label}$`)})})
    .locator('dd');

test('DNS opens on its statistics, with each figure labelled and its sample counted', async ({page}) => {
  await page.goto('/#/dns');
  await expect(page.getByRole('tab', {name: 'Statistics'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', {name: 'Cache', exact: true})).toBeVisible();
  await expect(page.getByText(/^Entries: \d+ \/ 256$/)).toBeVisible();
  await expect(fact(page, 'Median')).toHaveText(/^\d+ ms$/);
  await expect(fact(page, 'P95')).toHaveText(/^[\d,]+ ms$/);
  await expect(fact(page, 'Cache hit rate')).toHaveText(/^\d+%$/);
  await expect(page.getByText(/^Loaded: \d+, uncached: \d+, sent upstream: \d+$/)).toBeVisible();
  const outcomes = page.getByRole('img', {name: /^Outcomes: /});
  for (const label of ['From the cache', 'Answered upstream', 'No such name', 'Failed']) await expect(outcomes).toHaveAccessibleName(new RegExp(label));
  await expect(page.getByRole('img', {name: /^Upstream latency \(\d+ lookups\)$/})).toBeVisible();
  // A link that filters by domain lands on the log itself.
  await page.goto('/#/dns?domain=example.com');
  await expect(page.getByRole('tab', {name: 'Resolution log'})).toHaveAttribute('aria-selected', 'true');
});

test('node latency groups two ways, shortens long groups and shows a tip on hover', async ({page}) => {
  await page.goto('/#/nodes?tab=latency');
  await expect(page.getByRole('tab', {name: 'Latency'})).toHaveAttribute('aria-selected', 'true');
  await expect(fact(page, 'Lowest').locator('.rp-big')).toHaveText(/.+/);
  await expect(fact(page, 'Lowest').locator('.rp-fact-caption')).toHaveText(/^\d+ ms$/);
  await expect(fact(page, 'Highest').locator('.rp-big')).toHaveText(/.+/);
  await expect(fact(page, 'Highest').locator('.rp-fact-caption')).toHaveText(/^\d+ ms$/);
  await expect(fact(page, 'Unavailable')).toHaveText(/^\d+ nodes?$/);
  const plot = page.getByRole('group', {name: 'Node latency'});
  for (const label of ['Latest latency', 'Moving average', 'Average of the last 10']) await expect(plot.getByText(label, {exact: true})).toBeVisible();
  const row = plot.getByRole('img', {name: /^.+, latest: \d+ ms, moving average: \d+ ms, average of the last 10: \d+ ms$/}).first();
  await row.hover();
  await expect(page.locator('.rp-charttip')).toContainText('Moving average');
  const showAll = plot.getByRole('button', {name: /^Show all \d+$/});
  await expect(showAll).toBeVisible();
  const before = await plot.getByRole('img').count();
  await showAll.click();
  await expect.poll(() => plot.getByRole('img').count()).toBeGreaterThan(before);
  await page.getByRole('radio', {name: 'Protocol'}).click();
  await expect(plot.getByRole('region', {name: 'shadowsocks'})).toBeVisible();
});

test('traffic is the first connections tab, and a point opens its connection in the list', async ({page}) => {
  await page.goto('/#/connections');
  await expect(page.getByRole('tab', {name: 'Traffic'})).toHaveAttribute('aria-selected', 'true');
  await expect(fact(page, 'Heaviest connection').locator('.rp-big')).toHaveText('cdn.bilibili.com');
  await expect(fact(page, 'Heaviest connection').locator('.rp-fact-caption')).toHaveText('direct');
  await expect(fact(page, 'Download')).toHaveText('1.2 GB');
  await expect(page.getByText(/^Connections: \d+(?:, without byte totals: \d+)?$/)).toBeVisible();
  await page.locator('.rp-scatter circle').first().click();
  await expect(page).toHaveURL(/[?&]tab=list/);
  await expect(page).toHaveURL(/[?&]id=/);
  await expect(page.getByRole('tab', {name: 'Connections'})).toHaveAttribute('aria-selected', 'true');
});

const nodeLatency = (page: import('@playwright/test').Page) => page.getByRole('region', {name: 'Node latency', exact: true});

test('the traffic tab plots every node latency and marks the nodes current connections use', async ({page}) => {
  await page.goto('/#/connections');
  const card = nodeLatency(page);
  await expect(card.getByText(/^Nodes with a latency: \d+, without: \d+$/)).toBeVisible();
  await expect(card.getByText(/^All nodes, P50: \d+ ms, P90: \d+ ms$/)).toBeVisible();
  await expect(card.getByText(/^Nodes in use, weighted by connections, P50: \d+ ms$/)).toBeVisible();
  // One dot per node, not only the three in use.
  const chart = card.getByRole('img', {name: 'Node latency'});
  await expect.poll(() => chart.locator('circle').count()).toBeGreaterThan(3);
  await expect(card.locator('.rp-legend')).toHaveText(/In use 3.*Not in use \d+/);
  const used = chart.locator('circle').filter({visible: true});
  // The tip of a node in use counts its connections; hk-01 carries most of the mock's proxied traffic.
  for (let i = 0, n = await used.count(); i < n; i++) {
    await used.nth(i).hover();
    if (((await page.locator('.rp-charttip').textContent()) ?? '').startsWith('hk-01')) break;
  }
  await expect(page.locator('.rp-charttip')).toContainText(/^hk-01.*Connections: \d+$/);
});

test('the weighted median counts the connections whose node has no latency', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET nodes'] = async () => {
    const list = await backend.api.nodes({limit: 1000});
    const failed = (node: (typeof list.nodes)[number]) => ({...node, health: node.health.map(h => ({...h, state: 'unavailable' as const, latency_ms: null}))});
    return {...list, nodes: list.nodes.map(node => (node.id === 'hk-02' ? failed(node) : node))};
  };
  await page.goto('/#/connections');
  await expect(nodeLatency(page).getByText(/^Nodes in use, weighted by connections, P50: \d+ ms, connections without a latency: [1-9]\d*$/)).toBeVisible();
});

test('without connection chains the latency card plots every node alike', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET connections'] = async () => {
    const list = await backend.api.connections();
    return {...list, tcp: list.tcp.map(row => ({...row, chain: []})), udp: list.udp.map(row => ({...row, chain: []}))};
  };
  await page.goto('/#/connections');
  const card = nodeLatency(page);
  await expect(card.getByText(/^All nodes, P50: \d+ ms, P90: \d+ ms$/)).toBeVisible();
  await expect(card.getByText(/weighted/)).toHaveCount(0);
  await expect(card.locator('.rp-legend')).toHaveCount(0);
  await expect.poll(() => card.locator('circle').count()).toBeGreaterThan(3);
});

test('the latency card waits for a latency, and stays out without health samples or a node list', async ({page}) => {
  const backend = await mockBackend(page);
  const nodes = async (health: (node: {health: unknown[]}) => object) => {
    const list = await backend.api.nodes({limit: 1000});
    return {...list, nodes: list.nodes.map(node => ({...node, ...health(node)}))};
  };
  backend.handlers['GET nodes'] = () => nodes(node => ({health: node.health.map(h => ({...(h as object), state: 'unavailable', latency_ms: null}))}));
  await page.goto('/#/connections');
  await expect(nodeLatency(page).getByText('No node has a latency sample yet.', {exact: true})).toBeVisible();
  await expect(nodeLatency(page).locator('.rp-swarm')).toHaveCount(0);
  for (const health of [() => ({health: []}), () => ({health: undefined})]) {
    backend.handlers['GET nodes'] = () => nodes(health);
    const read = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/v1/nodes'));
    await page.reload();
    await read;
    await expect(page.locator('.rp-scatter')).toBeVisible();
    await expect(nodeLatency(page)).toHaveCount(0);
  }
  backend.handlers['GET nodes'] = () => nodes(node => node);
  backend.capabilities.resources.nodes.available = false;
  await page.reload();
  await expect(page.locator('.rp-scatter')).toBeVisible();
  await expect(nodeLatency(page)).toHaveCount(0);
});

test('a failed node read keeps the latency card with the reason and a retry', async ({page}) => {
  const backend = await mockBackend(page);
  let fail = true;
  backend.handlers['GET nodes'] = async () => {
    if (fail) throw new ApiError(500, 'internal', 'Node list failed', null, null, null);
    return backend.api.nodes({limit: 1000});
  };
  await page.goto('/#/connections');
  await expect(page.locator('.rp-scatter')).toBeVisible();
  const alert = nodeLatency(page).getByRole('alert');
  await expect(alert).toBeVisible();
  fail = false;
  await alert.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(nodeLatency(page).getByRole('alert')).toHaveCount(0);
  await expect(nodeLatency(page).locator('.rp-swarm')).toBeVisible();
});

test('the log heatmap sits above the list and sets the minimum level from a row', async ({page}) => {
  await page.goto('/#/logs');
  await expect(fact(page, 'Errors')).toHaveText(/^\d+ records?$/);
  await expect(fact(page, 'Most errors').locator('.rp-big')).toHaveText(/^\d\d:\d\d–\d\d:\d\d$/);
  await expect(fact(page, 'Most errors').locator('.rp-fact-caption')).toHaveText(/^\d+ records?$/);
  await page.getByRole('button', {name: 'Show Warning and above'}).click();
  await expect(page.getByRole('group', {name: 'Log activity over time'}).getByText('Info', {exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: /Level$/})).toContainText('Warning');
});

test('the DNS cache card reads usage from one entry and says only what the backend reports', async ({page}) => {
  const backend = await mockBackend(page);
  const card = page.getByRole('region', {name: 'Cache', exact: true});
  await page.goto('/#/dns');
  await expect(card.getByText(/^Entries: \d+ \/ 256$/)).toBeVisible();
  await expect(card.getByText('Usage', {exact: true})).toBeVisible();
  // The entry count is the cache's only limit, so no size is stated.
  await expect(card.getByText(/\bsize\b|\bMB\b|\bKB\b/)).toHaveCount(0);
  const listings = backend.requests.filter(request => new URL(request.url()).pathname.endsWith('/dns/cache'));
  // Every read asks for one entry: the card never walks the whole cache, however often it refreshes.
  const limits = listings.map(request => new URL(request.url()).searchParams.get('limit'));
  expect(limits.length).toBeGreaterThan(0);
  expect(new Set(limits)).toEqual(new Set(['1']));
  // A 503 after a reading replaces that reading: the backend no longer reports how full its cache is.
  backend.handlers['GET dns/cache'] = async () => {
    throw new ApiError(503, 'unavailable', 'DNS cache unavailable');
  };
  await page.locator('.rp-top').getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(card.getByText('The cache listing is temporarily unavailable', {exact: true})).toBeVisible();
  await expect(card.getByText('Usage', {exact: true})).toHaveCount(0);
  await page.reload();
  await expect(card.getByText('The cache listing is temporarily unavailable', {exact: true})).toBeVisible();
  // A backend that predates usage reporting gets no capacity claim.
  backend.handlers['GET dns/cache'] = async () => {
    const {usage: _, ...list} = await backend.api.dnsCache({limit: 1});
    return list;
  };
  await page.reload();
  await expect(card.getByText(/^Entries: \d+, capacity limit: not reported$/)).toBeVisible();
  await expect(card.getByText('Usage', {exact: true})).toHaveCount(0);
  // A backend that cannot read its cache says so for good.
  backend.capabilities.resources.dns_cache.read = false;
  await page.reload();
  await expect(card.getByText('This backend does not provide a cache listing', {exact: true})).toBeVisible();
});

test('the DNS cache card reuses the listing the cache tab just walked', async ({page}) => {
  const backend = await mockBackend(page);
  await page.goto('/#/dns?tab=cache');
  await expect(page.getByRole('tab', {name: 'Cache', exact: true})).toHaveAttribute('aria-selected', 'true');
  const listings = () => backend.requests.filter(request => new URL(request.url()).pathname.endsWith('/dns/cache'));
  await expect.poll(() => listings().length).toBeGreaterThan(0);
  await page.getByRole('tab', {name: 'Statistics', exact: true}).click();
  const card = page.getByRole('region', {name: 'Cache', exact: true});
  await expect(card.getByText(/^Entries: \d+ \/ 256$/)).toBeVisible();
  expect(listings().map(request => new URL(request.url()).searchParams.get('limit'))).not.toContain('1');
});

for (const count of [0, 4]) {
  test(`with ${count} resolution records the charts wait for more while the cache card still reports`, async ({page}) => {
    const backend = await mockBackend(page);
    const seed = await backend.api.dnsLog();
    backend.handlers['GET dns/log'] = async () => ({...seed, records: seed.records.slice(0, count), next_cursor: null});
    await page.goto('/#/dns');
    const card = page.getByRole('region', {name: 'Cache', exact: true});
    await expect(card.getByText(/^Entries: \d+ \/ 256$/)).toBeVisible();
    await expect(page.getByText('Too few records to chart yet', {exact: true})).toHaveCount(3);
    await expect(page.locator('.rp-facts')).toHaveCount(0);
  });
}

test('a failed first log read shows once above the charts it feeds while the cache card still reports', async ({page}) => {
  const backend = await mockBackend(page);
  backend.handlers['GET dns/log'] = async () => {
    throw new ApiError(500, 'internal', 'Log unavailable');
  };
  await page.goto('/#/dns');
  const card = page.getByRole('region', {name: 'Cache', exact: true});
  await expect(card.getByText(/^Entries: \d+ \/ 256$/)).toBeVisible();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({hasText: 'Log unavailable'})).toHaveCount(1);
  await expect(page.getByText('Resolution log not loaded', {exact: true})).toHaveCount(3);
});

for (const [served, note] of [
  [20, 'The backend ended this page early: 20 of 25 records'],
  [25, null]
] as const) {
  test(`a log page an older backend refuses is asked for again smaller, ${served} records served`, async ({page}) => {
    const backend = await mockBackend(page);
    const seed = await backend.api.dnsLog();
    const limits: string[] = [];
    backend.handlers['GET dns/log'] = async request => {
      const limit = new URL(request.url()).searchParams.get('limit') ?? '';
      limits.push(limit);
      if (Number(limit) > 25) throw new ApiError(503, 'temporarily_unavailable', 'DNS log response exceeds the projection budget', null, null, 1);
      return {...seed, records: seed.records.slice(0, served), next_cursor: 'older'};
    };
    await page.goto('/#/dns');
    await expect(page.locator('.rp-facts')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(limits.slice(0, 2)).toEqual(['100', '25']);
    // Measured against the 25 asked for when the page was served, not the 100 that was refused.
    if (note) await expect(page.getByText(note, {exact: true})).toBeVisible();
    else await expect(page.getByText(/^The backend ended this page early/)).toHaveCount(0);
  });
}

test('the latency axis keeps its last label inside the chart on a phone', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/dns');
  const chart = page.getByRole('img', {name: /^Upstream latency \(\d+ lookups\)$/});
  await expect(chart).toBeVisible();
  const overflow = await chart.evaluate(svg => {
    const edge = svg.getBoundingClientRect().right;
    return Math.max(...[...svg.querySelectorAll('text.tick')].map(tick => tick.getBoundingClientRect().right - edge));
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the narrow latency plot keeps its annotations clear of axis labels', async ({page}) => {
  await page.setViewportSize({width: 320, height: 844});
  await page.goto('/#/dns');
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
      const chart = page.locator('.rp-swarm svg').first();
      await expect(chart).toBeVisible();
      await expect(chart.locator('.mark line')).toHaveCount(2);
      await expect(chart.locator('.mark text')).toHaveCount(0);
      const overlap = await chart.locator('text.tick').evaluateAll(labels => {
        const boxes = labels.map(label => label.getBoundingClientRect());
        return boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
      });
      expect(overlap, `${lang} ${scheme} axis labels`).toBe(false);
    }
  }
});

test('DNS summaries use their card height at 1024 px', async ({page}) => {
  await page.setViewportSize({width: 1024, height: 900});
  await page.goto('/#/dns');
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
      await expect(page.locator('.rp-waffle')).toBeVisible();
      const gaps = await page.locator('.rp-chart-page > .rp-g21 > .rp-card:nth-child(2)').evaluateAll(cards =>
        cards.map(card => {
          const last = [...card.children].at(-1)!;
          return card.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
        })
      );
      expect(gaps).toHaveLength(2);
      for (const gap of gaps) expect(gap, `${lang} ${scheme} summary gap`).toBeLessThan(40);
    }
  }
});

test('activity draws all six charts without loading a chart vendor', async ({page}) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/#/activity');
  await expect(page.getByRole('application', {name: 'Traffic', exact: true})).toBeVisible();
  expect(requests.filter(url => /vendor-charts/.test(url))).toEqual([]);
  await expect(page.locator('.rp-activity-surface')).toHaveCount(6);
  const traffic = page.getByRole('region', {name: 'Traffic', exact: true});
  const chart = traffic.getByRole('application');
  await chart.focus();
  await expect(traffic.getByRole('status')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(traffic.getByRole('status')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(traffic.getByRole('status')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(traffic.getByRole('status')).toBeVisible();
  // The tip changes on every arrow key, so it waits for the screen reader instead of interrupting it.
  await expect(traffic.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await expect(traffic.locator('.rp-charttip-bounded')).toHaveCSS('transition-duration', '0.4s');
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(traffic.locator('.rp-charttip-bounded')).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Enter');
  await expect(traffic.getByRole('status')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(traffic.getByRole('status')).toBeVisible();
});

for (const lang of ['zh-TW', 'zh-CN']) {
  test.describe(`activity tooltips in ${lang}`, () => {
    test.use({storage: {'doona-lang': lang}});
    test('sorts translated series names consistently', async ({page}) => {
      await page.goto('/#/activity');
      await page.getByRole('application').nth(2).focus();
      await expect(page.locator('.rp-charttip-bounded li').first()).toContainText(/^cgroup/);
    });
  });
}

test('a sparkline shows the hovered sample in a tip and stays out of the focus order', async ({page}) => {
  await page.goto('/#/activity');
  const tile = page.locator('.rp-card').filter({has: page.locator('.rp-spark'), hasText: 'Download'});
  const spark = tile.locator('.rp-spark svg');
  await spark.hover();
  await expect(spark.locator('circle')).toHaveAttribute('r', '4');
  await expect(spark).not.toHaveAttribute('tabindex');
  const tip = tile.locator('.rp-charttip-bounded');
  await expect(tip).toBeVisible();
  await expect(tip.locator('li')).toHaveText(/^[\d.,]+ [KMGT]?B\/s$/);
  await expect(tip.locator('p')).toHaveText(/\d{1,2}:\d{2}:\d{2}/);
  await page.mouse.move(0, 0);
  await expect(spark.locator('circle')).toHaveCount(0);
  await expect(tip).toHaveCount(0);
});

// The card clips what overflows it, so the tip has to open inwards at both ends of the line.
for (const [name, storage] of [
  ['on a phone', {}],
  ['mirrored on a phone', {'doona-mirror': 'on'}]
] as const) {
  test.describe(`the sparkline tip ${name}`, () => {
    test.use({storage, viewport: {width: 320, height: 800}});
    test('stays inside its card at both ends', async ({page}) => {
      await page.goto('/#/activity');
      const tile = page.locator('.rp-card').filter({has: page.locator('.rp-spark'), hasText: 'Download'});
      const spark = tile.locator('.rp-spark svg');
      await expect(spark).toBeVisible();
      const card = (await tile.boundingBox())!;
      const line = (await spark.boundingBox())!;
      for (const x of [1, line.width - 1]) {
        await page.mouse.move(line.x + x, line.y + line.height / 2);
        const tip = tile.locator('.rp-charttip-bounded');
        await expect(tip).toBeVisible();
        await expect(async () => {
          const box = (await tip.locator('[role=status]').boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(card.x);
          expect(box.y).toBeGreaterThanOrEqual(card.y);
          expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
          expect(box.y + box.height).toBeLessThanOrEqual(card.y + card.height);
        }).toPass();
      }
    });

    // Font metrics differ between machines, so force a tip wider than the card: it has to wrap, not overflow.
    test('wraps inside its card when wider than it', async ({page}) => {
      await page.goto('/#/activity');
      await page.addStyleTag({content: '.rp-charttip-bounded [role=status] { padding-inline: 48px !important; }'});
      const tile = page.locator('.rp-card').filter({has: page.locator('.rp-spark'), hasText: 'Download'});
      const spark = tile.locator('.rp-spark svg');
      await expect(spark).toBeVisible();
      const card = (await tile.boundingBox())!;
      const line = (await spark.boundingBox())!;
      await page.mouse.move(line.x + line.width - 1, line.y + line.height / 2);
      const tip = tile.locator('.rp-charttip-bounded [role=status]');
      await expect(tip).toBeVisible();
      await expect(async () => {
        const box = (await tip.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(card.x);
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      }).toPass();
    });
  });
}

test('the donut keeps stepping after a refresh leaves fewer slices than the one selected', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let shrink = false;
  handlers['GET runtime/outbounds'] = async () => {
    const outbounds = await api.runtimeOutbounds();
    // The first two outbounds carry nothing any more, so their slices leave the ring.
    const idle = outbounds.outbounds.map((row, i) => (i < 2 ? {...row, upload_bytes: '0', download_bytes: '0'} : row));
    return shrink ? {...outbounds, outbounds: idle} : outbounds;
  };
  await page.goto('/#/activity');
  const donut = page.locator('.rp-donut');
  const chart = donut.getByRole('application');
  await expect(chart).toBeVisible();
  const slices = await donut.locator('path').count();
  await chart.focus();
  for (let i = 1; i < slices; i++) await page.keyboard.press('ArrowRight');
  await expect(donut.locator('.rp-charttip-bounded')).toBeVisible();
  shrink = true;
  await page.keyboard.press('r');
  await expect(donut.locator('path')).toHaveCount(slices - 2);
  await page.keyboard.press('ArrowLeft');
  await expect(donut.locator('.rp-charttip-bounded')).toBeVisible();
  await expect(donut.locator('.rp-charttip-bounded li')).toContainText(/\d/);
});

test('the donut tooltip paints above the total in the middle of the ring', async ({page}) => {
  await page.goto('/#/activity');
  const donut = page.locator('.rp-donut');
  await donut.getByRole('application').focus();
  const tip = donut.locator('.rp-charttip-bounded');
  await expect(tip).toBeVisible();
  // Both ignore the pointer; let them take it for a moment to ask which one is on top where the tip is.
  const top = await donut.evaluate(root => {
    const tip = root.querySelector<HTMLElement>('.rp-charttip-bounded')!;
    const center = root.querySelector<HTMLElement>('.center')!;
    tip.style.pointerEvents = center.style.pointerEvents = 'auto';
    const box = tip.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    tip.style.pointerEvents = 'none';
    center.style.pointerEvents = '';
    return hit?.closest('.rp-charttip-bounded, .center')?.className;
  });
  expect(top).toBe('rp-charttip-bounded');
});

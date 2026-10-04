import {expect, settleFrames, test, mockBackend, fulfillStream} from './fixtures';
import type {Locator} from '@playwright/test';

// Headless Chromium hides scrollbars by default; with classic scrollbars shown, as in Chromium on Linux and Windows,
// a table whose scroller gains a scrollbar after load, or switches from a native to a virtualised grid, used to slide
// every column sideways a moment after the rows arrived (tables-forms.css explains the gutter that prevents it).
test.use({viewport: {width: 1440, height: 900}, launchOptions: {ignoreDefaultArgs: ['--hide-scrollbars']}});
test.skip(({browserName}) => browserName !== 'chromium', 'classic scrollbars are a Chromium launch option');

// Painted frames watched once the rows are shown, and the least of them that must have measured a table with rows.
const observed = 150;
const sampled = 30;

// Pages that show a table for the probe to measure.
const pages = ['flows?tab=records', 'connections?tab=list', 'nodes', 'logs', 'events', 'dns?tab=log'];

for (const path of pages) {
  test(`${path}: table columns hold still while the page loads`, async ({page}) => {
    // Every frame, note each table's column edges; a change while the table and its header stay the same size is a slide.
    await page.addInitScript(() => {
      const seen = new Map<number, string>();
      const slides: string[] = [];
      const counts = {samples: 0};
      Object.assign(window, {slides, counts});
      const look = () => {
        document.querySelectorAll<HTMLElement>('.rp-table').forEach((table, index) => {
          const heads = [...table.querySelectorAll('[role=columnheader]')].map(head => Math.round(head.getBoundingClientRect().left));
          if (!heads.length) return;
          if (table.querySelector('[role=gridcell], [role=rowheader]')) counts.samples++;
          const key = `${table.offsetWidth}:${heads.length}`;
          const now = `${key}|${heads.join(',')}`;
          const before = seen.get(index);
          if (before && before.split('|')[0] === key && before !== now) slides.push(`table ${index}: ${before} -> ${now}`);
          seen.set(index, now);
        });
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    for (const load of ['first', 'reload']) {
      if (load === 'first') await page.goto(`/#/${path}`);
      else await page.reload();
      // The heading is outside the page's lazy chunk, so the observation starts once the header and a data row are shown.
      const table = page.locator('.rp-table').first();
      await expect(table.getByRole('columnheader').first()).toBeVisible();
      await expect(table.locator('[role=gridcell], [role=rowheader]').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const before = await page.evaluate(() => (window as unknown as {counts: {samples: number}}).counts.samples);
      await settleFrames(page, observed);
      const seen = await page.evaluate(() => {
        const w = window as unknown as {slides: string[]; counts: {samples: number}};
        return {slides: w.slides, samples: w.counts.samples};
      });
      expect(seen.samples - before, `${load} load: frames that measured a table with rows`).toBeGreaterThanOrEqual(sampled);
      expect(seen.slides, `${load} load`).toEqual([]);
    }
  });
}

test('the page keeps its width while a short page gives way to a long one', async ({page}) => {
  // Every frame, note the root's width and whether the page is taller than the window. A root scrollbar that comes and
  // goes with the page's height moves every table sideways by its width.
  await page.addInitScript(() => {
    const widths = new Set<number>();
    const heights = new Set<boolean>();
    Object.assign(window, {widths, heights});
    const look = () => {
      widths.add(document.documentElement.clientWidth);
      heights.add(document.documentElement.scrollHeight > innerHeight);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.goto('/#/events');
  await expect(page.getByRole('heading', {level: 1, name: 'Events'})).toBeVisible();
  await page.locator('.rp-side').getByRole('link', {name: 'Settings'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Settings'})).toBeVisible();
  await settleFrames(page, 60);
  const seen = await page.evaluate(() => {
    const w = window as unknown as {widths: Set<number>; heights: Set<boolean>};
    return {widths: [...w.widths], heights: [...w.heights].sort()};
  });
  expect(seen.heights, 'the route change goes from a short page to a long one').toEqual([false, true]);
  expect(seen.widths).toHaveLength(1);
});

async function expectWholeToken(cell: Locator) {
  await expect(cell).toBeVisible();
  await cell.page().evaluate(() => document.fonts.ready.then(() => undefined));
  expect(await cell.evaluate(element => [element, ...element.querySelectorAll('*')].every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
}

for (const lang of ['en', 'zh-TW'] as const) {
  for (const width of [1280, 1024]) {
    test.describe(`short tokens ${lang} ${width}px`, () => {
      test.use({viewport: {width, height: 900}, storage: {'doona-lang': lang}});

      test('Connections and Flows retain the longest state label', async ({page}) => {
        const {api, handlers} = await mockBackend(page);
        handlers['GET connections'] = async () => {
          const list = await api.connections();
          return {...list, tcp: [{...list.tcp[0], state: 'observed'}], udp: []};
        };
        handlers['GET flows'] = async () => {
          const list = await api.flows();
          return {...list, flows: [{...list.flows[0], state: 'observed', started_at: new Date(Date.now() - 59000).toISOString()}], next_cursor: null};
        };
        for (const path of ['connections?tab=list', 'flows?tab=records']) {
          await page.goto('/#/' + path);
          await expectWholeToken(page.getByRole('gridcell', {name: lang === 'en' ? 'Observed' : '觀測中', exact: true}).first());
          if (path.startsWith('flows')) {
            await expectWholeToken(page.getByRole('gridcell', {name: lang === 'en' ? /seconds ago|minute ago/ : /秒前|分鐘前/}).first());
            await expectWholeToken(page.getByRole('gridcell', {name: 'TCP', exact: true}).first());
          }
        }
      });

      test('Providers retain the longest fetch status', async ({page}) => {
        const {api, handlers} = await mockBackend(page);
        handlers['GET providers'] = async () => {
          const list = await api.providers();
          return {...list, providers: list.providers.map(provider => ({...provider, status: 'stale', updated_at: null, last_error: null}))};
        };
        await page.goto('/#/nodes');
        await expectWholeToken(page.getByRole('gridcell', {name: lang === 'en' ? 'Not fetched' : '尚未擷取', exact: true}).first());
      });

      test('Rules retain four-digit snapshot hit counts in both views', async ({page}) => {
        const {api, handlers, capabilities} = await mockBackend(page);
        handlers['GET flows'] = async () => {
          const list = await api.flows();
          return {...list, flows: Array.from({length: 4096}, (_, i) => ({...list.flows[0], id: `token-${i}`})), next_cursor: null};
        };
        // The fitted dictionary intentionally drops Hits at 1024px; distribution retains it.
        for (const dictionary of width === 1024 ? [false] : [true, false]) {
          capabilities.resources.rules.available = dictionary;
          await page.goto('/#/rules?tab=list&view=advanced');
          await page.reload();
          await expectWholeToken(page.getByRole('gridcell', {name: '4,096', exact: true}).first());
        }
      });

      test('Events and Logs retain the longest kind and level labels', async ({page}) => {
        const {api, capabilities} = await mockBackend(page);
        capabilities.resources.events.available = true;
        const runtime = await api.runtime();
        const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
        await page.route(/\/api\/v1\/events(\?.*)?$/, route =>
          fulfillStream(route, [{id: 'event:1', event: 'generation.changed', data: {...data, previous_generation_id: '39', generation_id: '40'}}])
        );
        await page.route(/\/api\/v1\/logs(\?.*)?$/, route =>
          fulfillStream(route, [
            {id: 'ready:0', event: 'stream.ready', data},
            {id: 'log:1', event: 'log', data: {ts: runtime.observed_at, level: 'warn', target: 'dns', message: 'Slow query', fields: null}}
          ])
        );
        await page.goto('/#/events');
        await expectWholeToken(page.getByRole('gridcell', {name: lang === 'en' ? 'Configuration activated' : '組態生效', exact: true}));
        await page.goto('/#/logs');
        await expectWholeToken(page.getByRole('gridcell', {name: lang === 'en' ? 'Warning' : '警告', exact: true}));
      });
    });
  }
}

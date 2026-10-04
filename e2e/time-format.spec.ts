import {expect, fulfillStream, mockBackend, test} from './fixtures';
import type {Locator} from '@playwright/test';

// Every clock time on a page keeps whole in the longest clock: 12 hours, with the year first.
const clocks = {'doona-time-format': '12h', 'doona-date-format': 'ymd'};
const cut = (cells: Locator) =>
  cells.evaluateAll(els =>
    els.flatMap(el =>
      [el, ...el.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth).map(e => `${el.textContent}: ${e.scrollWidth} > ${e.clientWidth}`)
    )
  );
// A day period next to the hour, without naming its words: ICU picks 清晨, 上午, 晚上 and others by the hour, and the set
// moves between ICU versions.
const meridiem = /\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)|\p{Script=Han}{2}\s?\d{1,2}:\d{2}/u;

for (const lang of ['en', 'zh-TW'])
  for (const width of [1280, 1024]) {
    test.describe(`12-hour times in ${lang} at ${width}px`, () => {
      test.use({viewport: {width, height: 900}, storage: {...clocks, 'doona-lang': lang}});

      test('a log and an event time column holds the whole time', async ({page}) => {
        const {api, capabilities} = await mockBackend(page);
        capabilities.resources.events.available = true;
        capabilities.resources.events.kinds = ['stream.ready', 'runtime.updated'];
        const runtime = await api.runtime();
        const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
        // 12:59:59 local, the widest clock in 12-hour time, whatever zone the browser runs in.
        const ts = new Date(2026, 1, 13, 12, 59, 59).toISOString();
        await page.route('**/api/v1/logs?*', route =>
          fulfillStream(route, [
            {id: 'ready:0', event: 'stream.ready', data},
            {id: 'log:1', event: 'log', data: {ts, level: 'info', target: 'honk::dns', message: 'DNS answered', fields: null}}
          ])
        );
        await page.route('**/api/v1/events', route =>
          fulfillStream(route, [
            {id: 'events:1', event: 'stream.ready', data: {...data, observed_at: ts}},
            {id: 'events:2', event: 'runtime.updated', data: {...data, observed_at: ts, href: '/api/v1/runtime'}}
          ])
        );
        for (const [path, name] of [
          ['/#/logs', 'logs'],
          ['/#/events', 'events']
        ]) {
          await page.goto(path);
          const grid = page.getByRole('grid');
          const time = grid.locator('.rp-code').filter({hasText: /12:59:59/});
          await expect(time.first()).toBeVisible();
          await expect(time.first()).toContainText(meridiem);
          expect(await cut(time), `${name} times`).toEqual([]);
        }
      });

      test('the overview start time holds on one line', async ({page}) => {
        await page.goto('/#/overview');
        const started = page
          .locator('.rp-kv > div')
          .filter({has: page.locator('.k', {hasText: /^(Started|啟動時間)$/})})
          .locator('.v');
        await expect(started).toContainText(meridiem);
        const {lines, cutOff} = await started.evaluate(el => ({
          lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
          cutOff: [el, ...el.querySelectorAll('*')].some(e => e.scrollWidth > e.clientWidth)
        }));
        expect(lines).toBe(1);
        expect(cutOff).toBe(false);
      });
    });
  }

for (const lang of ['en', 'zh-TW'])
  for (const width of [1280, 390]) {
    test.describe(`12-hour chart axes in ${lang} at ${width}px`, () => {
      test.use({viewport: {width, height: 900}, storage: {...clocks, 'doona-lang': lang}});

      test('the time axis keeps its labels apart and inside the chart, and the tip holds the whole time', async ({page}) => {
        await page.clock.install();
        await page.goto('/#/activity');
        await page.clock.runFor(61000);
        await expect(page.getByRole('application', {name: lang === 'en' ? 'Traffic' : '流量', exact: true})).toBeVisible();
        for (const surface of await page.locator('main .rp-activity-surface').all()) {
          await surface.scrollIntoViewIfNeeded();
          const {labels, overlap, outside} = await surface.evaluate(svg => {
            const edge = svg.getBoundingClientRect();
            const boxes = [...svg.querySelectorAll('text.rp-area-tick')].map(tick => ({text: tick.textContent ?? '', box: tick.getBoundingClientRect()}));
            const clocks = boxes.filter(({text}) => /:\d{2}/.test(text));
            return {
              labels: clocks.map(({text}) => text),
              overlap: clocks.some((a, i) => clocks.slice(i + 1).some(b => a.box.left < b.box.right && b.box.left < a.box.right)),
              outside: clocks.some(({box}) => box.left < edge.left - 0.5 || box.right > edge.right + 0.5)
            };
          });
          expect(overlap, labels.join(' | ')).toBe(false);
          expect(outside, labels.join(' | ')).toBe(false);
          if (labels.length) for (const label of labels) expect(label).toMatch(meridiem);
        }
        const traffic = page.getByRole('region', {name: lang === 'en' ? 'Traffic' : '流量', exact: true});
        await traffic.getByRole('application').focus();
        await expect(traffic.getByRole('status')).toContainText(meridiem);
        await expect(traffic.getByRole('status')).toContainText(/\d:\d{2}:\d{2}/);
      });
    });
  }

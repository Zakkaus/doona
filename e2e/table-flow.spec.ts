import {expect, mockBackend, test, box} from './fixtures';
import type {Page} from '@playwright/test';

async function feed(page: Page, kind: 'events' | 'logs', count: number) {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = kind === 'events';
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const frame = (id: number) =>
    kind === 'logs'
      ? {id: `log:${id}`, event: 'log', data: {ts: runtime.observed_at, level: 'info', target: 'honk::dns', message: `Record ${id}`, fields: null}}
      : {id: `event:${id}`, event: 'stream.ready', data: {...data, instance_id: `Record ${id}`}};
  await page.addInitScript(
    ({kind, records}) => {
      const fetch = window.fetch;
      const encode = (record: unknown) => {
        const r = record as {id: string; event: string; data: unknown};
        return new TextEncoder().encode(`id: ${r.id}\nevent: ${r.event}\ndata: ${JSON.stringify(r.data)}\n\n`);
      };
      window.fetch = (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (!new URL(url, location.href).pathname.endsWith(`/api/v1/${kind}`)) return fetch(input, init);
        const body = new ReadableStream({
          start(controller) {
            for (const record of records) controller.enqueue(encode(record));
            (window as unknown as {appendRecord: (record: unknown) => void}).appendRecord = record => controller.enqueue(encode(record));
          }
        });
        return Promise.resolve(new Response(body, {headers: {'Content-Type': 'text/event-stream'}}));
      };
    },
    {kind, records: [...(kind === 'logs' ? [{id: 'ready:0', event: 'stream.ready', data}] : []), ...Array.from({length: count}, (_, i) => frame(i + 1))]}
  );
  await page.goto(`/#/${kind}`);
  const grid = page.getByRole('grid', {name: kind === 'logs' ? 'Logs' : 'Events', exact: true});
  await expect(grid).toHaveAttribute('aria-rowcount', String(Math.min(count, kind === 'logs' ? 1000 : 200) + 1));
  return {grid, frame};
}

for (const viewport of [
  {width: 1440, height: 900},
  {width: 1700, height: 1150},
  {width: 768, height: 1024},
  {width: 390, height: 844}
]) {
  test.describe(`${viewport.width}px flow`, () => {
    test.use({viewport});
    for (const kind of ['events', 'logs'] as const) {
      test(`${kind} scroll with the page, keep headings and virtualise rows`, async ({page}) => {
        const {grid, frame} = await feed(page, kind, kind === 'logs' ? 2000 : 200);
        const mounted = grid.locator('[role=row][data-key]');
        const geometry = () => grid.evaluate(el => ({height: el.clientHeight, overflow: el.scrollHeight - el.clientHeight, top: el.scrollTop}));
        await expect.poll(async () => (await geometry()).height).toBeGreaterThan(viewport.height);
        await expect.poll(async () => (await geometry()).overflow).toBeLessThanOrEqual(1);
        expect(await mounted.count()).toBeLessThan(150);
        await page.evaluate(() => window.scrollTo(0, 2400));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
        const heading = grid.getByRole('columnheader').first();
        await expect.poll(async () => Math.round((await box(heading)).y)).toBe(64);
        expect((await geometry()).top).toBe(0);
        expect(await mounted.count()).toBeLessThan(150);
        const visible = await mounted.evaluateAll(rows =>
          rows
            .filter(row => row.getBoundingClientRect().top >= 110 && row.getBoundingClientRect().bottom <= innerHeight)
            .map(row => ({key: row.getAttribute('data-key')!, top: row.getBoundingClientRect().top, index: Number(row.getAttribute('aria-rowindex'))}))
        );
        expect(visible.length).toBeGreaterThan(0);
        const held = visible[0];
        await page.evaluate(record => (window as unknown as {appendRecord: (record: unknown) => void}).appendRecord(record), frame(2001));
        await expect(grid.locator(`[data-key="${held.key}"]`)).toHaveAttribute('aria-rowindex', String(held.index + 1));
        await expect.poll(() => grid.locator(`[data-key="${held.key}"]`).evaluate(el => el.getBoundingClientRect().top)).toBe(held.top);
        // Keyboard navigation crosses the virtual window without selecting on focus.
        const row = grid.locator(`[data-key="${held.key}"]`);
        await row.click();
        await expect(page.locator('.rp-table-detail')).toBeInViewport();
        await page.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(page.locator('.rp-table-detail')).toBeEmpty();
        await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-key]')?.getAttribute('data-key'))).toBe(held.key);
        await page.keyboard.press('PageDown');
        await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-key]')?.getAttribute('data-key'))).not.toBe(held.key);
        const nextIndex = await page.evaluate(() => Number(document.activeElement?.closest('[data-key]')?.getAttribute('aria-rowindex')));
        expect(nextIndex - held.index - 1).toBeGreaterThan(1);
        expect(nextIndex - held.index - 1).toBeLessThanOrEqual(Math.ceil(viewport.height / 40));
        await page.keyboard.press('End');
        const last = kind === 'logs' ? 'log:1002' : 'event:2';
        await expect(grid.locator(`[data-key="${last}"]`)).toBeInViewport();
        await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-key]')?.getAttribute('data-key'))).toBe(last);
        await page.keyboard.press('Home');
        const first = grid.locator(`[data-key="${kind === 'logs' ? 'log:2001' : 'event:2001'}"]`);
        await expect(first).toBeInViewport();
        await expect.poll(async () => (await box(first)).y).toBeGreaterThanOrEqual(101);
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await expect(page.locator('.rp-table-detail')).toContainText(kind === 'logs' ? 'Record 1002' : 'Record 2');
        expect(await mounted.count()).toBeLessThan(150);
        expect((await geometry()).top).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });
    }
  });
}

for (const viewport of [
  {width: 390, height: 844},
  {width: 1440, height: 900}
]) {
  test.describe(`${viewport.width}px detail`, () => {
    test.use({viewport});
    for (const kind of ['events', 'logs'] as const) {
      test(`${kind} reveal End above the open detail`, async ({page}) => {
        const {grid} = await feed(page, kind, 200);
        const selectedKey = kind === 'logs' ? 'log:200' : 'event:200';
        const selected = grid.locator(`[data-key="${selectedKey}"]`);
        await selected.click();
        await page.keyboard.press('End');
        const lastKey = kind === 'logs' ? 'log:1' : 'event:1';
        const last = grid.locator(`[data-key="${lastKey}"]`);
        await expect(last).toBeFocused();
        const detail = page.locator('.rp-table-detail');
        await expect
          .poll(async () => {
            const row = await box(last);
            const panel = await box(detail);
            return panel.y - row.y - row.height;
          })
          .toBeGreaterThanOrEqual(0);
      });
      test(`${kind} restore focus after the selected row is unmounted`, async ({page}) => {
        const {grid} = await feed(page, kind, 200);
        const selectedKey = kind === 'logs' ? 'log:200' : 'event:200';
        const selected = grid.locator(`[data-key="${selectedKey}"]`);
        await selected.click();
        await page.keyboard.press('End');
        await expect(grid.locator(`[data-key="${kind === 'logs' ? 'log:1' : 'event:1'}"]`)).toBeFocused();
        const detail = page.locator('.rp-table-detail');
        await expect(selected).toHaveCount(0);
        await page.keyboard.press('Tab');
        await expect(detail.getByRole('button', {name: 'Close', exact: true})).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(detail).toBeEmpty();
        await expect(selected).toBeFocused();
        await expect(selected).toHaveAttribute('data-focus-visible');
        await expect.poll(async () => (await box(selected)).y).toBeGreaterThanOrEqual(101);
        await page.keyboard.press('ArrowDown');
        await expect(grid.locator(`[data-key="${kind === 'logs' ? 'log:199' : 'event:199'}"]`)).toBeFocused();
      });
    }
    test('logs return focus to the grid when the selected record is evicted', async ({page}) => {
      const {grid, frame} = await feed(page, 'logs', 1000);
      await grid.locator('[data-key="log:1000"]').focus();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      const detail = page.locator('.rp-table-detail');
      await expect(detail).toContainText('Record 1');
      await detail.getByRole('button', {name: 'Close', exact: true}).focus();
      await page.evaluate(record => (window as unknown as {appendRecord: (record: unknown) => void}).appendRecord(record), frame(1001));
      await expect(detail).toBeEmpty();
      await expect.poll(() => grid.evaluate(el => el.contains(document.activeElement))).toBe(true);
    });
  });
}

test('navigation releases hover and press when the pointer leaves after a route change', async ({page}) => {
  await page.setViewportSize({width: 1700, height: 1150});
  await mockBackend(page);
  await page.goto('/#/events');
  const logs = page.locator('.rp-nav[href="#/logs"]');
  const events = page.locator('.rp-nav[href="#/events"]');
  await logs.click();
  await events.click();
  await page.locator('.rp-nav[href="#/overview"]').hover();
  await expect(events).toHaveAttribute('aria-current', 'page');
  for (const attr of ['data-hovered', 'data-pressed', 'data-focus-visible']) await expect(logs).not.toHaveAttribute(attr);
});

for (const kind of ['events', 'logs'] as const) {
  test(`${kind} fit a single row without an empty band`, async ({page}) => {
    const {grid, frame} = await feed(page, kind, 1);
    await expect(grid.getByRole('rowheader')).toHaveCount(1);
    expect((await box(grid)).height).toBe(77);
    expect(await grid.evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
    await page.evaluate(record => (window as unknown as {appendRecord: (record: unknown) => void}).appendRecord(record), frame(2));
    await expect(grid.getByRole('rowheader').first()).toHaveText('Record 2');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}

// Counts, per React commit, the components that rendered a mounted row element. A fiber still in the tree from the
// previous commit was not rendered again; one swapped in for it was, when React marked it as having performed work.
function countRowRenders() {
  const target = window as unknown as {rowRenders: number};
  target.rowRenders = 0;
  let previous = new WeakSet<object>();
  type Fiber = {tag: number; flags: number; stateNode: unknown; child: Fiber | null; sibling: Fiber | null; return: Fiber | null};
  (window as unknown as {__REACT_DEVTOOLS_GLOBAL_HOOK__: object}).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject: () => 1,
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_: number, root: {current: Fiber}) {
      const seen = new WeakSet<object>();
      const rendered = (fiber: Fiber) => !previous.has(fiber) && (fiber.flags & 1) === 1;
      const visit = (start: Fiber | null) => {
        for (let fiber = start; fiber; fiber = fiber.sibling) {
          seen.add(fiber);
          const node = fiber.stateNode;
          if (node instanceof Element && node.matches('[role=row][data-key]')) {
            let owner = fiber.return;
            // Function, forwardRef and memo components.
            while (owner && ![0, 11, 14, 15].includes(owner.tag)) owner = owner.return;
            if (owner && rendered(owner)) target.rowRenders++;
          }
          visit(fiber.child);
        }
      };
      visit(root.current.child);
      previous = seen;
    }
  };
}

for (const kind of ['events', 'logs'] as const) {
  test(`${kind} render each mounted row once per published batch`, async ({page}) => {
    await page.addInitScript(countRowRenders);
    const {grid, frame} = await feed(page, kind, kind === 'logs' ? 1200 : 300);
    const mounted = grid.locator('[role=row][data-key]');
    await expect.poll(() => mounted.count()).toBeGreaterThan(5);
    for (let i = 1; i <= 3; i++) {
      // The list holds as many records as it keeps, so a record in replaces one out and the row count stays the same.
      await page.waitForTimeout(500);
      await page.evaluate(() => ((window as unknown as {rowRenders: number}).rowRenders = 0));
      await page.evaluate(record => (window as unknown as {appendRecord: (record: unknown) => void}).appendRecord(record), frame(5000 + i));
      await expect(grid.getByRole('rowheader').first()).toHaveText(`Record ${5000 + i}`);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => (window as unknown as {rowRenders: number}).rowRenders)).toBeLessThanOrEqual(await mounted.count());
    }
  });
}

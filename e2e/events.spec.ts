import {downloadText, expect, expectLoadFailures, fulfillStream, mockBackend, scrollTableToEnd, test, box} from './fixtures';

test('event kind selection exports only the visible records', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  capabilities.resources.events.kinds = ['stream.ready', 'runtime.updated'];
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const events = [
    {id: 'events:1', event: 'stream.ready', data},
    {id: 'events:2', event: 'runtime.updated', data: {...data, href: '/api/v1/runtime'}}
  ];
  await page.route('**/api/v1/events', route => fulfillStream(route, events));
  await page.goto('/#/events');
  const grid = page.getByRole('grid', {name: 'Events', exact: true});
  await expect(grid.getByRole('gridcell', {name: 'Stream ready', exact: true})).toBeVisible();
  await expect(grid.getByRole('gridcell', {name: 'Runtime updated', exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'Exclude runtime updates Kind', exact: true}).click();
  await expect(page.getByRole('option', {name: 'Flow updated', exact: true})).toHaveCount(0);
  await page.getByRole('option', {name: 'Runtime updated', exact: true}).click();
  await expect(grid.getByRole('rowheader')).toHaveCount(1);
  await expect(grid.getByRole('gridcell', {name: 'Stream ready', exact: true})).toHaveCount(0);
  await expect(grid.getByRole('rowheader')).toContainText('/api/v1/runtime');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export JSON', exact: true}).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^doona-events-.*\.json$/);
  expect(JSON.parse(await downloadText(download))).toEqual([events[1]]);
});

test('runtime heartbeats cannot evict other events from the default feed or export', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const ready = {id: 'ready:1', event: 'stream.ready', data};
  await page.route('**/api/v1/events', route =>
    fulfillStream(route, [
      ready,
      ...Array.from({length: 220}, (_, id) => ({
        id: `runtime:${id}`,
        event: 'runtime.updated',
        data: {...data, href: '/api/v1/runtime'}
      }))
    ])
  );
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/events');
  const grid = page.getByRole('grid', {name: 'Events', exact: true});
  await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
  await scrollTableToEnd(grid);
  const summary = grid.getByRole('columnheader', {name: /^Summary /});
  await expect(summary).toBeInViewport({ratio: 1});
  await expect(grid.getByRole('rowheader')).toHaveText([data.instance_id]);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export JSON', exact: true}).click();
  expect(JSON.parse(await downloadText(await downloading))).toEqual([ready]);
});

test('a single event takes one row, not a blank one beneath it', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  const runtime = await api.runtime();
  await page.route('**/api/v1/events', route =>
    fulfillStream(route, [{id: 'events:1', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}}])
  );
  await page.goto('/#/events');
  const table = page.locator('.rp-table', {has: page.getByRole('grid', {name: 'Events', exact: true})});
  await expect(table.getByRole('rowheader')).toHaveCount(1);
  await expect.poll(async () => (await box(table)).height).toBeLessThanOrEqual(2 + 37 + 40 + 1);
});

test('events say where a reconnect could not recover what was sent meanwhile', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  expectLoadFailures(page, /\/api\/v1\/events/);
  let baselines = 0;
  await page.route('**/api/v1/events', async route => {
    const cursor = route.request().headers()['last-event-id'];
    if (cursor === 'ready:1') return route.fulfill({status: 409, json: {error: {code: 'event_cursor_expired', message: 'Cursor expired'}, request_id: 'e2e'}});
    // A resumed stream repeats the cursor it resumed from.
    await fulfillStream(route, [{id: cursor ?? `ready:${++baselines}`, event: 'stream.ready', data}]);
  });
  await page.goto('/#/events');
  const grid = page.getByRole('grid', {name: 'Events', exact: true});
  await expect(grid.getByRole('rowheader')).toHaveText(['Events lost: those sent while disconnected cannot be recovered', data.instance_id]);
});

test('a long gap summary on a phone keeps its help button in view', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const id = `flow-${'7f3a9c2e'.repeat(6)}`;
  await page.route('**/api/v1/events', route =>
    fulfillStream(route, [{id: 'gap:1', event: 'flow.gap', data: {...data, resource_id: id, reason: 'buffer_overflow', dropped_records: '123456'}}])
  );
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/events');
  const grid = page.getByRole('grid', {name: 'Events', exact: true});
  await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
  await scrollTableToEnd(grid);
  const cell = grid.getByRole('rowheader');
  await expect(cell).toContainText(id);
  const help = cell.getByRole('button', {name: 'About records reached the retention limit', exact: true});
  await expect(help).toBeInViewport({ratio: 1});
  const [helpBox, cellBox] = [await box(help), await box(cell)];
  expect(helpBox.x + helpBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width);
  await help.click();
  await expect(page.getByRole('dialog').getByText('Some flow records could not be kept.', {exact: false})).toBeVisible();
});

test('an event row links the flow it names, the configuration and the recording settings', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const flow = (await api.flows()).flows[0].id;
  // Back on the page reopens the stream; each opening gets the same events.
  await page.route(/\/api\/v1\/events(\?.*)?$/, route =>
    fulfillStream(route, [
      {id: 'events:1', event: 'flow.updated', data: {...data, resource_id: flow, revision: 1, href: `/api/v1/flows/${flow}`}},
      {id: 'events:2', event: 'generation.changed', data: {...data, previous_generation_id: '40', generation_id: '41'}},
      {id: 'events:3', event: 'flow.gap', data: {...data, resource_id: null, reason: 'evicted', dropped_records: '2'}}
    ])
  );
  await page.goto('/#/events');
  const grid = page.getByRole('grid', {name: 'Events', exact: true});
  await grid.getByRole('gridcell', {name: 'Flow updated', exact: true}).click();
  await page.getByRole('link', {name: 'View flow record', exact: true}).click();
  await expect(page).toHaveURL(new RegExp(`#/flows\\?tab=records&id=${flow}$`));
  await expect(page.locator('.rp-panel')).toBeVisible();
  await page.goBack();
  await grid.getByRole('gridcell', {name: 'Configuration activated', exact: true}).click();
  await page.getByRole('link', {name: 'View configuration', exact: true}).click();
  await expect(page).toHaveURL(/#\/config$/);
  await page.goBack();
  await grid.getByRole('gridcell', {name: 'Flow records lost', exact: true}).click();
  await page.getByRole('link', {name: 'Recording settings', exact: true}).click();
  await expect(page).toHaveURL(/#\/settings\?card=runtime$/);
});

test('an event row copies its record as the export writes it without opening the detail', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  capabilities.resources.events.kinds = ['stream.ready', 'runtime.updated'];
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const ready = {id: 'events:1', event: 'stream.ready', data};
  await page.route('**/api/v1/events', route => fulfillStream(route, [ready]));
  await page.goto('/#/events');
  const grid = page.getByRole('grid', {name: 'Events', exact: true});
  await grid.getByRole('button', {name: 'Copy record', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Record copied'})).toBeVisible();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(ready);
  await expect(page.locator('.rp-table-detail')).toBeEmpty();
});

test('an event detail closes from its top-right icon button or Escape, and its actions are M and level', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const flow = (await api.flows()).flows[0].id;
  await page.route(/\/api\/v1\/events(\?.*)?$/, route =>
    fulfillStream(route, [{id: 'events:1', event: 'flow.gap', data: {...data, resource_id: flow, reason: 'evicted', dropped_records: '2'}}])
  );
  await page.goto('/#/events');
  const grid = page.getByRole('grid', {name: 'Events', exact: true});
  const detail = page.locator('.rp-table-detail');
  const cell = grid.getByRole('gridcell', {name: 'Flow records lost', exact: true});
  await cell.click();
  const close = detail.getByRole('button', {name: 'Close', exact: true});
  await expect(close).toBeVisible();
  await expect(close).toHaveClass(/\bicon\b/);
  await expect(close).toHaveText('');
  const control = await detail.evaluate(el => Number.parseFloat(getComputedStyle(el).getPropertyValue('--rp-control')));
  const edge = await detail.evaluate(el => {
    const style = getComputedStyle(el);
    // The scrollbar gutter takes the right of the padding box; the content ends one padding in from what is left.
    return el.getBoundingClientRect().left + el.clientLeft + el.clientWidth - Number.parseFloat(style.paddingRight);
  });
  const [closeBox, fields] = [await box(close), await box(detail.locator('.rp-kv').first())];
  expect(Math.abs(closeBox.x + closeBox.width - edge)).toBeLessThanOrEqual(1);
  expect(closeBox.height).toBeCloseTo(control, 0);
  expect(fields.x + fields.width).toBeLessThanOrEqual(closeBox.x);
  // The first row of the detail holds the first line of the fields and the close button.
  expect(Math.abs(closeBox.y - fields.y)).toBeLessThanOrEqual(1);
  const actions = await detail
    .locator('.rp-cluster')
    .getByRole('link')
    .evaluateAll(links =>
      links.map(link => {
        const rect = link.getBoundingClientRect();
        return {height: rect.height, centre: rect.top + rect.height / 2};
      })
    );
  expect(actions).toHaveLength(2);
  for (const action of actions) {
    expect(action.height).toBeCloseTo(control, 0);
    expect(Math.abs(action.centre - actions[0].centre)).toBeLessThanOrEqual(1);
  }
  await close.click();
  await expect(detail).toBeEmpty();
  await expect.poll(() => grid.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await cell.click();
  await expect(detail).toContainText('Flow records lost');
  await page.keyboard.press('Escape');
  await expect(detail).toBeEmpty();
  await expect.poll(() => grid.evaluate(el => el.contains(document.activeElement))).toBe(true);
});

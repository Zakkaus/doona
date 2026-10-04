import {downloadText, expect, expectLoadFailures, fulfillStream, mockBackend, scrollTableToEnd, tableGeometry, test} from './fixtures';

test('logs filter the stream, pause incoming rows, export and clear', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const records = [
    {id: 'log:1', level: 'info', target: 'honk::dns', message: 'DNS answered'},
    {id: 'log:2', level: 'warn', target: 'honk::dns', message: 'DNS slow'},
    {id: 'log:3', level: 'error', target: 'honk::routing', message: 'Route failed'}
  ];
  let sent = 0;
  await page.route('**/api/v1/logs?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const levels = ['trace', 'debug', 'info', 'warn', 'error'];
    // A resumed stream continues after the cursor the client sends, as a real backend would.
    const after = Number(route.request().headers()['last-event-id']?.split(':')[1] ?? 0);
    const selected = records.filter(
      record =>
        Number(record.id.split(':')[1]) > after &&
        levels.indexOf(record.level) >= levels.indexOf(params.get('level')!) &&
        record.target.startsWith(params.get('target') ?? '')
    );
    await fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data},
      ...selected.map(record => ({
        id: record.id,
        event: 'log',
        data: {ts: runtime.observed_at, level: record.level, target: record.target, message: record.message, fields: null}
      }))
    ]);
    sent++;
  });
  await page.goto('/#/logs');
  const rows = page.getByRole('grid', {name: 'Logs'}).getByRole('rowheader');
  await expect(rows).toHaveText(['Route failed', 'DNS slow', 'DNS answered']);
  await page.getByRole('button', {name: 'Info Level', exact: true}).click();
  await page.getByRole('option', {name: 'Warning', exact: true}).click();
  await expect(rows).toHaveText(['Route failed', 'DNS slow']);
  await page.getByRole('searchbox', {name: 'Module', exact: true}).fill('honk::dns');
  await expect(rows).toHaveText(['DNS slow']);
  await page.getByRole('switch', {name: 'Pause', exact: true}).press('Space');
  records.push({id: 'log:4', level: 'warn', target: 'honk::dns', message: 'Held while paused'});
  const before = sent;
  await expect.poll(() => sent).toBeGreaterThan(before);
  // Paused freezes the list and says how much arrived meanwhile; that shows on resume rather than being lost.
  await expect(rows).toHaveText(['DNS slow']);
  await expect(page.getByText('Paused: 1 new record', {exact: true})).toBeVisible();
  await page.getByRole('switch', {name: 'Pause', exact: true}).press('Space');
  await expect(rows).toHaveText(['Held while paused', 'DNS slow']);
  records.push({id: 'log:5', level: 'warn', target: 'honk::dns', message: 'Received after resume'});
  await expect(rows).toHaveText(['Received after resume', 'Held while paused', 'DNS slow']);
  await page.getByRole('switch', {name: 'Pause', exact: true}).press('Space');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export', exact: true}).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^honk-log-.*\.txt$/);
  expect((await downloadText(download)).trim().split('\n')).toEqual([
    `${runtime.observed_at} WARN  honk::dns DNS slow`,
    `${runtime.observed_at} WARN  honk::dns Held while paused`,
    `${runtime.observed_at} WARN  honk::dns Received after resume`
  ]);
  await page.getByRole('button', {name: 'Clear', exact: true}).filter({hasText: 'Clear'}).click();
  await expect(rows.filter({hasText: /DNS slow|Received after resume/})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Export', exact: true})).toBeDisabled();
});

test('the log stream holds still placeholder rows under the header until it opens', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  let release = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route('**/api/v1/logs?*', async route => {
    await held;
    await fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}},
      {id: 'log:1', event: 'log', data: {ts: runtime.observed_at, level: 'info', target: 'dns', message: 'DNS answered', fields: null}},
      {id: 'log:2', event: 'log', data: {ts: runtime.observed_at, level: 'warn', target: 'dns', message: 'DNS slow', fields: null}}
    ]);
  });
  await page.goto('/#/logs');
  const skeleton = page.locator('.rp-table-skeleton');
  await expect(skeleton.getByRole('status')).toHaveText('Loading…');
  // Reduced motion (the suite's default) keeps the bars still.
  await expect(skeleton.locator('.rp-skeleton-text').first()).toHaveCSS('animation-name', 'none');
  const before = await tableGeometry(page);
  release();
  // A flow table grows with its rows, so two records take the two placeholder rows' place.
  await expect(page.getByRole('grid', {name: 'Logs'}).locator('[role=row][data-key]')).toHaveCount(2);
  const after = await tableGeometry(page);
  expect(Math.abs(after.row - before.row)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.header - before.header)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
});

test('phone logs keep the message visible and reveal its full text and fields', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  const message = 'A long diagnostic message '.repeat(20) + 'final detail';
  await page.route('**/api/v1/logs?*', route =>
    fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}},
      {id: 'log:1', event: 'log', data: {ts: runtime.observed_at, level: 'warn', target: 'dns', message, fields: {attempts: 2}}}
    ])
  );
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/logs');
  const grid = page.getByRole('grid', {name: 'Logs', exact: true});
  await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
  // The activity heatmap mounts with the first record and pushes the list down; scroll once it has, or the list
  // ends up half below the viewport.
  await grid.scrollIntoViewIfNeeded();
  await scrollTableToEnd(grid);
  await expect(grid.getByRole('columnheader', {name: /^Message /})).toBeInViewport({ratio: 1});
  // The truncated cell carries the tooltip once it has measured its overflow.
  const cell = grid.getByRole('rowheader').locator('.rp-truncate');
  await expect.poll(() => cell.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(async () => {
    // Leave and re-enter: a pointer that never moved raises no new hover after the measurement.
    await page.mouse.move(0, 0);
    await cell.hover();
    await expect(page.getByRole('tooltip')).toContainText(message, {timeout: 1500});
  }).toPass();
  await expect(page.getByRole('tooltip')).toContainText('attempts=2');
});

test('logs mark the records a reconnect could not recover', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  const ready = {id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}};
  const log = (id: string, message: string) => ({id, event: 'log', data: {ts: runtime.observed_at, level: 'info', target: 'dns', message, fields: null}});
  expectLoadFailures(page, /\/api\/v1\/logs/);
  let opened = 0;
  await page.route('**/api/v1/logs?*', async route => {
    const cursor = route.request().headers()['last-event-id'];
    if (cursor === 'log:1') return route.fulfill({status: 409, json: {error: {code: 'event_cursor_expired', message: 'Cursor expired'}, request_id: 'e2e'}});
    await fulfillStream(route, cursor ? [ready] : opened++ ? [ready, log('log:9', 'After the gap')] : [ready, log('log:1', 'Before the gap')]);
  });
  await page.goto('/#/logs');
  const rows = page.getByRole('grid', {name: 'Logs'}).getByRole('rowheader');
  await expect(rows).toHaveText(['After the gap', 'Logs lost: records sent while disconnected cannot be recovered', 'Before the gap']);
});

test('logs state the level the engine records and mark the levels below it', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  await page.route('**/api/v1/logs?*', route =>
    fulfillStream(route, [{id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}}])
  );
  await page.goto('/#/logs');
  const level = (await api.runtimeSettings()).log!.level;
  expect(level).toBe('info');
  await expect(page.getByText('Engine records: Info and above', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Info Level', exact: true}).click();
  await expect(page.getByRole('option', {name: 'Debug: lower the log level in Settings first', exact: true})).toBeVisible();
  await expect(page.getByRole('option', {name: 'Warning', exact: true})).toBeVisible();
});

test('the module filter is hidden when the backend does not filter logs by target', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.logs.filters = ['level'];
  const runtime = await api.runtime();
  const streams: URLSearchParams[] = [];
  await page.route('**/api/v1/logs?*', route => {
    streams.push(new URL(route.request().url()).searchParams);
    return fulfillStream(route, [{id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}}]);
  });
  await page.goto('/#/logs');
  await expect(page.getByRole('button', {name: 'Info Level', exact: true})).toBeVisible();
  await expect(page.getByRole('searchbox', {name: 'Module', exact: true})).toHaveCount(0);
  await expect.poll(() => streams.length).toBeGreaterThan(0);
  expect(streams.every(params => !params.has('target'))).toBe(true);
});

test('an empty log list says when the configuration forbids recording', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const runtime = await api.runtime();
  handlers['GET runtime/settings'] = async () => {
    const settings = await api.runtimeSettings();
    return {...settings, recording: {...settings.recording!, logs: {allowed: false, mode: 'off', active: false}}};
  };
  // The empty text shows only while the stream is open, and a routed response always ends, so the page's own fetch
  // answers the log stream with a ready frame and keeps it open.
  const ready = `event: stream.ready\nid: ready:0\ndata: ${JSON.stringify({instance_id: runtime.instance_id, observed_at: runtime.observed_at})}\n\n`;
  await page.addInitScript(frame => {
    const fetch = window.fetch;
    window.fetch = (input, init) => {
      if (!String(input instanceof Request ? input.url : input).includes('/api/v1/logs')) return fetch(input, init);
      const body = new ReadableStream({start: controller => controller.enqueue(new TextEncoder().encode(frame))});
      return Promise.resolve(new Response(body, {headers: {'Content-Type': 'text/event-stream'}}));
    };
  }, ready);
  await page.goto('/#/logs');
  await expect(page.getByText('Log recording is disabled in the configuration', {exact: true})).toBeVisible();
});

test('the log toolbar opens the recording settings', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/logs');
  await page.getByRole('button', {name: 'Recording settings', exact: true}).click();
  await expect(page).toHaveURL(/#\/settings\?card=runtime$/);
  await expect(page.getByRole('heading', {name: 'Temporary runtime overrides', exact: true})).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/#\/logs$/);
});

test('a log row copies its record as the export writes it without opening the detail', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  await page.route('**/api/v1/logs?*', route =>
    fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}},
      {id: 'log:1', event: 'log', data: {ts: runtime.observed_at, level: 'warn', target: 'honk::dns', message: 'DNS slow', fields: {attempts: 2}}}
    ])
  );
  await page.goto('/#/logs');
  const grid = page.getByRole('grid', {name: 'Logs', exact: true});
  await expect(grid.getByRole('rowheader')).toHaveText(['DNS slow attempts=2']);
  await grid.getByRole('button', {name: 'Copy record', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Record copied'})).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${runtime.observed_at} WARN  honk::dns DNS slow {"attempts":2}`);
  await expect(page.locator('.rp-table-detail')).toBeEmpty();
});

test('the log list stays in place when the first records arrive', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  let release!: () => void;
  const opened = new Promise<void>(resolve => (release = resolve));
  await page.route('**/api/v1/logs?*', async route => {
    await opened;
    await fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}},
      {id: 'log:1', event: 'log', data: {ts: runtime.observed_at, level: 'warn', target: 'honk::dns', message: 'DNS slow', fields: null}}
    ]);
  });
  await page.goto('/#/logs');
  const header = page.getByRole('grid', {name: 'Logs'}).getByRole('columnheader').first();
  const top = () => header.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
  await expect(header).toBeVisible();
  const before = await top();
  release();
  await expect(page.getByRole('grid', {name: 'Logs'}).getByRole('rowheader')).toHaveText(['DNS slow']);
  await expect(page.getByRole('group', {name: 'Log activity over time'})).toBeVisible();
  expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
});

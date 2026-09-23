import {downloadText, expect, fulfillStream, mockBackend, test} from './fixtures';

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
  expect((await table.boundingBox())!.height).toBeLessThanOrEqual(2 + 37 + 40 + 1);
});

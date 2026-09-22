import {downloadText, expect, fulfillStream, mockBackend, test} from './fixtures';

test('event kind selection exports only the visible records', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
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
  await expect(grid.getByRole('gridcell', {name: 'Runtime updated', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'All kinds Kind', exact: true}).click();
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

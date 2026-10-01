import {expect, fulfillStream, mockBackend, test} from './fixtures';

// On a phone a table keeps its columns' minimum widths and scrolls sideways (src/ui/Table.tsx); wider screens fit the
// columns to the table as before.
const message = 'Health check failed. node=jp-01 error=connect timeout after 5000 ms while dialing the upstream';

async function logs(page: import('@playwright/test').Page) {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  await page.route('**/api/v1/logs?*', route =>
    fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}},
      {id: 'log:1', event: 'log', data: {ts: runtime.observed_at, level: 'warn', target: 'health', message, fields: null}}
    ])
  );
  await page.goto('/#/logs');
  const grid = page.getByRole('grid', {name: 'Logs', exact: true});
  await grid.scrollIntoViewIfNeeded();
  await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
  return grid;
}

test.describe('390px', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true});

  test('the logs table scrolls sideways to its whole message column', async ({page}) => {
    const grid = await logs(page);
    // A virtualised grid is its own scroller.
    const scroll = () => grid.evaluate(el => ({width: el.scrollWidth, client: el.clientWidth, left: el.scrollLeft}));
    await expect.poll(async () => (await scroll()).width - (await scroll()).client).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    for (const name of [/^Time /, /^Level /, /^Module /]) await expect(grid.getByRole('columnheader', {name})).toBeVisible();
    expect((await scroll()).left).toBe(0);
    // A one-row flow table can sit behind the phone dock; centre it before sending a wheel gesture.
    await grid.evaluate(el => el.scrollIntoView({block: 'center'}));
    const box = (await grid.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(2000, 0);
    await expect.poll(async () => (await scroll()).left).toBeGreaterThan(0);
    const cell = grid.getByRole('rowheader');
    await expect(cell).toContainText(message.slice(0, 20));
    // The message cell and its header sit wholly inside the scrolled grid, the header over its column.
    const [cellBox, gridBox, headerBox] = [
      (await cell.boundingBox())!,
      (await grid.boundingBox())!,
      (await grid.getByRole('columnheader', {name: /^Message /}).boundingBox())!
    ];
    expect(cellBox.x).toBeGreaterThanOrEqual(gridBox.x);
    expect(cellBox.x + cellBox.width).toBeLessThanOrEqual(gridBox.x + gridBox.width + 1);
    expect(Math.round(headerBox.x)).toBe(Math.round(cellBox.x));
    expect(Math.round(headerBox.width)).toBe(Math.round(cellBox.width));
    // What the column still cuts, a tap discloses under the table.
    await cell.tap();
    await expect(page.locator('.rp-table-detail')).toContainText(message);
  });
});

test('at 1440px the logs table fits its columns without scrolling', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  const grid = await logs(page);
  await expect.poll(() => grid.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  for (const name of [/^Time /, /^Level /, /^Module /, /^Message /]) await expect(grid.getByRole('columnheader', {name})).toBeInViewport({ratio: 1});
});

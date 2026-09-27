import type {Locator, Page} from '@playwright/test';
import {expect, fulfillStream, mockBackend, scrollTableToEnd, test} from './fixtures';

// A column still cuts text wider than itself, on a phone as elsewhere; a pressed row discloses the whole record
// under the table (DataTable `detail`), by pointer or by Enter and Space on the focused row.
test.use({viewport: {width: 390, height: 844}, storage: {'doona-lang': 'en'}});

const cut = (cell: Locator) => cell.locator('.rp-truncate').evaluate(el => el.scrollWidth > el.clientWidth);

async function disclose(page: Page, grid: Locator, text: string) {
  // The text column comes last; a phone scrolls to it before the grid renders it.
  await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
  await scrollTableToEnd(grid);
  const row = grid.getByRole('row').filter({hasText: text.slice(0, 20)});
  await expect(row).toHaveCount(1);
  expect(await cut(row.getByRole('rowheader')), 'the message is cut in the table').toBe(true);
  const detail = page.locator('.rp-table-detail');
  await expect(detail).toHaveAttribute('aria-live', 'polite');
  await expect(detail).toBeEmpty();
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(detail).toContainText(text);
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'false');
  await expect(detail).toBeEmpty();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(detail).toContainText(text);
  await page.keyboard.press('Space');
  await expect(detail).toBeEmpty();
}

test('an Events row discloses its whole summary', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  capabilities.resources.events.kinds = ['flow.gap'];
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  await page.route('**/api/v1/events', route =>
    fulfillStream(route, [
      {
        id: 'events:1',
        event: 'flow.gap',
        data: {...data, resource_id: 'flows-recorder-primary', reason: 'buffer_overflow', dropped_records: '12'}
      }
    ])
  );
  await page.goto('/#/events');
  await disclose(
    page,
    page.getByRole('grid', {name: 'Events', exact: true}),
    'flows-recorder-primary, reason: records reached the retention limit, records dropped since recording started: 12'
  );
});

async function logRow(page: Page) {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  await page.route('**/api/v1/logs?*', async route => {
    const resumed = !!route.request().headers()['last-event-id'];
    await fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data},
      ...(resumed
        ? []
        : [
            {
              id: 'log:1',
              event: 'log',
              data: {
                ts: runtime.observed_at,
                level: 'error',
                target: 'honk::group',
                message: 'Health check failed.',
                fields: {node: 'jp-01', error: 'connect timeout after 5000 ms'}
              }
            }
          ])
    ]);
  });
  await page.goto('/#/logs');
}
const logText = 'Health check failed. node=jp-01 error=connect timeout after 5000 ms';

test('a Logs row discloses its whole message', async ({page}) => {
  await logRow(page);
  await disclose(page, page.getByRole('grid', {name: 'Logs', exact: true}), logText);
});

// A phone has no pointer: the narrowest supported width, a CJK locale, and a tap.
test.describe('by touch', () => {
  test.use({viewport: {width: 320, height: 640}, hasTouch: true, isMobile: true, storage: {'doona-lang': 'zh-CN'}});
  test('a tapped Logs row discloses its whole message', async ({page}) => {
    await logRow(page);
    const grid = page.getByRole('grid', {name: '日志', exact: true});
    await expect(grid.locator('[role=row][data-key]').first()).toBeVisible();
    await scrollTableToEnd(grid);
    const row = grid.getByRole('row').filter({hasText: logText.slice(0, 20)});
    await expect(row).toHaveCount(1);
    expect(await cut(row.getByRole('rowheader')), 'the message is cut in the table').toBe(true);
    const detail = page.locator('.rp-table-detail');
    await expect(detail).toBeEmpty();
    // Tap the message itself: a tap on the row's middle would scroll the grid back to where the message is not drawn.
    await row.getByRole('rowheader').tap();
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await expect(detail).toContainText(logText);
    await row.getByRole('rowheader').tap();
    await expect(detail).toBeEmpty();
  });
});

test('the DNS log keeps its relative time whole', async ({page}) => {
  await page.goto('/#/dns?tab=log');
  const grid = page.getByRole('tabpanel', {name: 'Resolution log'}).getByRole('grid');
  const rows = grid.locator('[role=row][data-key]');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const time = rows.nth(i).locator('[role=gridcell]').first().locator('.rp-truncate');
    expect(await time.evaluate(el => `${el.textContent} ${el.scrollWidth <= el.clientWidth ? 'whole' : 'cut'}`)).toMatch(/ whole$/);
  }
});

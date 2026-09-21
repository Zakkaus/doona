import type {Locator} from '@playwright/test';
import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

// The flat list exercises the virtualizer; grouping (the default) gets its own test below.
// At 1440px the detail opens beside the table and the table keeps its main columns.
test.use({
  viewport: {width: 1440, height: 900},
  storage: {'doona-mock-big': '100', 'doona-connections-view': JSON.stringify({hidden: [], sort: null, group: 'none'})}
});

async function expectRowInView(row: Locator) {
  await expect(row).toBeInViewport();
  await expect
    .poll(() =>
      row.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const grid = element.closest('[role="grid"], [role="treegrid"]')!;
        const header = grid.querySelector('[role="columnheader"]')!.getBoundingClientRect();
        return rect.top >= header.bottom && rect.bottom <= grid.getBoundingClientRect().bottom;
      })
    )
    .toBe(true);
}

test('English Started values fit without truncation', async ({page}) => {
  await page.goto('/#/connections?id=c-0241');
  const row = page.locator('.rp-table [data-key="c-0241"]');
  const started = row.getByRole('gridcell').last().locator('.cell');
  await expect(started).toContainText('minutes ago');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const widths = await started.evaluate(element => ({available: element.clientWidth, text: element.scrollWidth}));
  expect(widths.text).toBeLessThanOrEqual(widths.available);
});

test('a column can be resized with the keyboard', async ({page}) => {
  await page.goto('/#/connections');
  const header = page.getByRole('columnheader', {name: 'Target'});
  const resizer = header.getByRole('slider');
  await expect(header).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // The header re-renders while columns are being fitted; focus is retried until it sticks.
  await expect
    .poll(async () => {
      await resizer.focus();
      return resizer.evaluate(element => element === document.activeElement);
    })
    .toBe(true);
  await page.keyboard.press('Enter');
  const width = () => header.evaluate(element => element.getBoundingClientRect().width);
  const original = await width();
  await page.keyboard.press('ArrowRight');
  await expect.poll(width).toBeGreaterThan(original);
  const expanded = await width();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(width).toBeLessThan(expanded);
});

test('connection selection follows clicks, arrows and Home/End across virtual rows', async ({page}) => {
  await page.goto('/#/connections');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await page.locator('.rp-table [data-key="c-0002"]').click();
  await expect(selected).toHaveAttribute('data-key', 'c-0002');
  await expect(page.locator('.rp-panel .rp-h3')).toHaveText('cdn.bilibili.com');
  await page.keyboard.press('ArrowDown');
  await expect(selected).toHaveAttribute('data-key', 'c-0003');
  await page.keyboard.press('ArrowUp');
  await expect(selected).toHaveAttribute('data-key', 'c-0002');
  await page.keyboard.press('End');
  await expect(selected).toHaveAttribute('aria-rowindex', '1001');
  await expectRowInView(selected);
  await page.keyboard.press('ArrowUp');
  await expect(selected).toHaveAttribute('aria-rowindex', '1000');
  await expectRowInView(selected);
  await page.keyboard.press('Home');
  await expect(selected).toHaveAttribute('data-key', 'c-0001');
  await selected.focus();
  await page.keyboard.press('d');
  await expect(page.locator('.rp-table [role=row]:focus').getByRole('rowheader')).toHaveText('doubleclick.net');
  await page.keyboard.press('Home');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
  await expect(selected).toHaveAttribute('aria-rowindex', '22');
  await expectRowInView(selected);
  expect(await page.locator('.rp-table [role="row"]').count()).toBeLessThan(60);
});

test('connection filtering narrows the collection and renders an empty result', async ({page}) => {
  await page.goto('/#/connections');
  const grid = page.getByRole('grid', {name: 'Connections'});
  const filter = page.locator('.rp-toolbar input');
  await expect(grid).toHaveAttribute('aria-rowcount', '1001');
  await filter.fill('api.telegram.org');
  await expect(grid).toHaveAttribute('aria-rowcount', '151');
  await expect(grid.getByRole('rowheader').first()).toHaveText('api.telegram.org');
  await expect(grid.getByRole('rowheader').filter({hasNotText: 'api.telegram.org'})).toHaveCount(0);
  expect(await page.locator('.rp-table [role="row"]').count()).toBeLessThan(60);
  await filter.fill('no-such-connection.invalid');
  await expect(page.locator('.rp-table .rp-empty')).toBeVisible();
  await expect(grid).toHaveAttribute('aria-rowcount', '1');
  await filter.fill('');
  await expect(grid).toHaveAttribute('aria-rowcount', '1001');
  expect(await page.locator('.rp-table [role="row"]').count()).toBeLessThan(60);
});

test('activating a checked source or rule removes that filter', async ({page}) => {
  await page.goto('/#/connections');
  const pick = page.getByRole('button', {name: 'Pick', exact: true});
  const grid = page.getByRole('grid', {name: 'Connections'});
  await expect(grid).toHaveAttribute('aria-rowcount', '1001');
  await pick.click();
  const source = page.getByRole('menuitemradio').first();
  const sourceName = await source.locator('.rp-il').innerText();
  await source.click();
  await expect(page.locator('.rp-toolbar input')).toHaveValue(sourceName);
  await pick.click();
  const selectedSource = page.getByRole('menuitemradio').filter({hasText: sourceName});
  await expect(selectedSource).toHaveAttribute('aria-checked', 'true');
  await selectedSource.click();
  await expect(page.locator('.rp-toolbar input')).toHaveValue('');
  await expect(grid).toHaveAttribute('aria-rowcount', '1001');
  await pick.click();
  const rule = page.getByRole('menuitemradio').filter({hasText: 'domain('}).first();
  const ruleName = await rule.locator('.rp-il').innerText();
  await rule.click();
  await expect(page).toHaveURL(/rule=/);
  await pick.click();
  const selectedRule = page.getByRole('menuitemradio').filter({hasText: ruleName});
  await expect(selectedRule).toHaveAttribute('aria-checked', 'true');
  await selectedRule.click();
  await expect(page).not.toHaveURL(/rule=/);
  await expect(grid).toHaveAttribute('aria-rowcount', '1001');
});

test('connection selection survives a runtime poll', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/connections');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await page.locator('.rp-table [data-key="c-0002"]').click();
  const age = await selected.getByRole('gridcell').last().textContent();
  await page.clock.fastForward(6000);
  await expect(selected).toHaveAttribute('data-key', 'c-0002');
  await expect(selected.getByRole('gridcell').last()).not.toHaveText(age!);
  await expect(page.locator('.rp-panel .rp-h3')).toHaveText('cdn.bilibili.com');
});

test('connection deep links reveal selected rows, including same-route query changes', async ({page}) => {
  await page.goto('/#/connections?id=c-0500');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await expect(selected).toHaveAttribute('data-key', 'c-0500');
  await expectRowInView(selected);
  await expect(page.locator('.rp-panel .rp-h3')).toHaveText('doubleclick.net');
  await page.evaluate(() => {
    location.hash = '#/connections?id=c-0001';
  });
  await expect(selected).toHaveAttribute('data-key', 'c-0001');
  await expectRowInView(selected);
});

test('1000 connections keep the DOM bounded at the top, middle and bottom', async ({page}) => {
  await page.goto('/#/connections');
  const grid = page.getByRole('grid', {name: 'Connections'});
  await expect(grid).toHaveAttribute('aria-rowcount', '1001');
  await expect(page.locator('.rp-toolbar .rp-badge')).toHaveText('The connection list is truncated; only some records are shown.');
  for (const [fraction, key] of [
    [0, 'c-0001'],
    [0.5, 'c-0667'],
    [1, 'c-0400']
  ] as const) {
    await grid.evaluate((element, fraction) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction;
    }, fraction);
    await expect(page.locator(`.rp-table [data-key="${key}"]`)).toBeInViewport();
    expect(await page.locator('.rp-table [role="row"]').count()).toBeLessThan(60);
  }
});

test('column visibility, sorting and grouping persist without expanding the virtual DOM', async ({page}) => {
  await page.goto('/#/connections');
  const grid = page.getByRole('grid', {name: 'Connections'}).or(page.getByRole('treegrid', {name: 'Connections'}));
  await page.getByRole('button', {name: 'Columns', exact: true}).click();
  await page.getByRole('menuitemcheckbox', {name: 'Rule', exact: true}).click();
  await expect(page.getByRole('menuitemcheckbox', {name: 'Rule', exact: true})).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(grid.getByRole('columnheader', {name: 'Rule', exact: true})).toHaveCount(0);
  const target = grid.getByRole('columnheader', {name: 'Target'});
  await target.click();
  await expect(target).toHaveAttribute('aria-sort', 'ascending');
  await expect(grid.getByRole('rowheader').first()).toHaveText('1.1.1.1:53');
  await target.click();
  await expect(target).toHaveAttribute('aria-sort', 'descending');
  await expect(grid.getByRole('rowheader').first()).toHaveText('doubleclick.net');
  await page.getByRole('button', {name: 'Group by'}).click();
  await page.getByRole('option', {name: 'Outbound', exact: true}).click();
  await expect(grid.locator('[role=row][aria-level="1"]').first()).toContainText('block');
  await grid.locator('[role=row][aria-level="2"]').first().click();
  await expect(grid.locator('[aria-selected=true]')).toHaveAttribute('aria-level', '2');
  await page.reload();
  await expect(target).toHaveAttribute('aria-sort', 'descending');
  await expect(grid.getByRole('columnheader', {name: 'Rule', exact: true})).toHaveCount(0);
  await expect(grid.locator('[role=row][aria-level="1"]').first()).toBeVisible();
  for (const fraction of [0, 0.5, 1]) {
    await grid.evaluate((element, fraction) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction;
    }, fraction);
    await expect(grid.locator('[role=row][aria-level="2"]').first()).toBeAttached();
    expect(await grid.getByRole('row').count()).toBeLessThan(60);
  }
  await page.getByRole('button', {name: 'Group by'}).click();
  await page.getByRole('option', {name: 'By client', exact: true}).click();
  await grid.evaluate(element => {
    element.scrollTop = 0;
  });
  await expect(grid.locator('[role=row][aria-level="1"]').first()).toContainText('10.0.0.');
});

test('group slots stay expanded and unselectable across virtual keyboard navigation', async ({page}) => {
  await page.goto('/#/connections');
  await page.getByRole('button', {name: 'Group by'}).click();
  await page.getByRole('option', {name: 'By client', exact: true}).click();
  const grid = page.getByRole('treegrid', {name: 'Connections'});
  const groups = grid.locator('[role=row][aria-level="1"]');
  const selected = grid.locator('[aria-selected="true"]');
  await expect(grid).toHaveAttribute('aria-rowcount', '1005');
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true');
  await groups.first().click({force: true});
  await expect(selected).toHaveCount(0);
  await grid.locator('[data-key="c-0001"]').getByRole('rowheader').click();
  await page.keyboard.press('ArrowLeft');
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('End');
  await expect(selected).toHaveAttribute('data-key', 'c-0400');
  await expectRowInView(selected);
  await page.keyboard.press('Home');
  await expect(selected).toHaveAttribute('data-key', 'c-0001');
  await page.evaluate(() => {
    location.hash = '#/connections?id=c-0002';
  });
  await expect(selected).toHaveAttribute('data-key', 'c-0002');
  await expectRowInView(selected);
  await selected.getByRole('rowheader').click();
  await page.keyboard.press('ArrowUp');
  await expect(selected).toHaveAttribute('data-key', 'c-0397');
  await page.keyboard.press('ArrowDown');
  await expect(selected).toHaveAttribute('data-key', 'c-0002');
  await expect(grid.locator('[role=row][aria-level="1"]:not([aria-expanded="true"])')).toHaveCount(0);
  await expect(grid.locator('[role=rowheader]:not(:has(> .cell)), [role=gridcell]:not(:has(> .cell))')).toHaveCount(0);
  expect(await grid.getByRole('row').count()).toBeLessThan(60);
});

test.describe('short connection lists', () => {
  test.use({storage: {'doona-connections-view': JSON.stringify({hidden: ['dst'], sort: null, group: 'none'})}});

  test('virtualizes immediately and keeps first-visible sizing and type-ahead', async ({page}) => {
    await page.goto('/#/connections');
    const grid = page.getByRole('grid', {name: 'Connections'});
    await expect(grid).toHaveAttribute('aria-rowcount', '9');
    expect(await grid.evaluate(element => element.tagName)).toBe('DIV');
    const source = grid.getByRole('columnheader', {name: 'Source'});
    const chain = grid.getByRole('columnheader', {name: 'Chain'});
    await expect(source).toBeVisible();
    await expect.poll(async () => (await source.boundingBox())!.width / (await chain.boundingBox())!.width).toBeCloseTo(128 / 168, 2);
    await expect(grid.locator('[data-key="1"]').getByRole('rowheader')).toHaveText('10.0.0.12');
    await grid.locator('[data-key="1"]').focus();
    await page.keyboard.press('d');
    await expect(grid.locator('[role=row]:focus')).toHaveAttribute('data-key', '4');
    await expect(grid.locator('[role=rowheader]:not(:has(> .cell)), [role=gridcell]:not(:has(> .cell))')).toHaveCount(0);
  });
});

test.describe('default view', () => {
  test.use({storage: {'doona-mock-big': '100'}, viewport: {width: 1024, height: 768}});

  test('groups by client with counts and opens the selection beside the table', async ({page}) => {
    await page.goto('/#/connections');
    const grid = page.getByRole('treegrid', {name: 'Connections'});
    const groups = grid.locator('[role=row][aria-level="1"]');
    await expect(groups.first()).toContainText('10.0.0.');
    await expect(groups.first()).toContainText('active');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await grid.locator('[role=row][aria-level="2"]').first().click();
    await expect(page).toHaveURL(/#\/connections\?id=c-\d+$/);
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(/#\/connections$/);
    await page.setViewportSize({width: 1440, height: 900});
    await grid.locator('[role=row][aria-level="2"]').first().click();
    await expect(page.locator('.rp-panel').getByRole('heading')).toBeVisible();
    await page.locator('.rp-panel').getByRole('button', {name: 'Only this client', exact: true}).click();
    await expect(page.locator('.rp-toolbar input')).toHaveValue(/^10\.0\.0\.\d+$/);
    await expect(groups).toHaveCount(1);
  });
});

test('closing a connection removes it from the list and clears the selection', async ({page}) => {
  await page.goto('/#/connections?id=c-0001');
  const panel = page.locator('.rp-panel');
  await expect(panel.getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await panel.getByRole('button', {name: 'Close connection', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Closed api.telegram.org');
  await expect(page).toHaveURL(/#\/connections$/);
  await expect(page.locator('.rp-table [data-key="c-0001"]')).toHaveCount(0);
  // A kernel-observed connection is refused by the backend, and the row stays.
  await page.goto('/#/connections?id=c-0002');
  await panel.getByRole('button', {name: 'Close connection', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('cannot be closed');
  await expect(page.locator('.rp-table [data-key="c-0002"]')).toHaveCount(1);
});

test('the connection list exports the filtered rows as CSV', async ({page}) => {
  await page.goto('/#/connections');
  await page.locator('.rp-toolbar input').fill('api.telegram.org');
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export CSV', exact: true}).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^connections-.*\.csv$/);
  // The download stream is read chunk by chunk; the spec stays free of Node typings.
  const stream = await file.createReadStream();
  const decoder = new TextDecoder();
  let body = '';
  for await (const chunk of stream as AsyncIterable<Uint8Array>) body += decoder.decode(chunk, {stream: true});
  const lines = body.trim().split('\n');
  expect(lines[0]).toBe('id,target,domain,source,network,state,outbound,chain,rule,upload_bytes,download_bytes,started_at');
  expect(lines.length).toBe(151);
  expect(lines.slice(1).every(line => line.includes('api.telegram.org'))).toBe(true);
});

test('connection filters live in the URL and survive a reload', async ({page}) => {
  await page.goto('/#/connections');
  await page.getByRole('radio', {name: 'UDP', exact: true}).click();
  await expect(page).toHaveURL(/network=udp/);
  await page.reload();
  await expect(page.getByRole('radio', {name: 'UDP', exact: true})).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page).not.toHaveURL(/network=/);
});

test('close all with a rule filter closes the listed rows only', async ({page}) => {
  await page.goto('/#/connections');
  const grid = page.getByRole('grid', {name: 'Connections'}).or(page.getByRole('treegrid', {name: 'Connections'}));
  const listed = async () => Number(await grid.getAttribute('aria-rowcount')) - 1;
  await expect.poll(listed).toBeGreaterThan(0);
  const total = await listed();
  await page.getByRole('button', {name: 'Pick', exact: true}).click();
  // The telegram rule routes through a proxy group, so its connections are userspace-observed and closable.
  await page.getByRole('menu').getByRole('menuitemradio').filter({hasText: 'telegram'}).first().click();
  await expect(page).toHaveURL(/rule=/);
  await expect.poll(listed).toBeLessThan(total);
  const shown = await listed();
  expect(shown).toBeGreaterThan(0);
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  const toast = page.locator('.rp-toast');
  await expect(toast).toContainText(/Closed \d+, skipped \d+/);
  const [, closed, skipped] = /Closed (\d+), skipped (\d+)/.exec((await toast.textContent()) ?? '')!.map(Number);
  expect(closed).toBeGreaterThan(0);
  expect(closed + skipped).toBe(shown);
  // The page lists at most 1000 rows, so the unfiltered count can only bound what was closed.
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page).not.toHaveURL(/rule=/);
  await expect.poll(listed).toBeGreaterThanOrEqual(total - closed);
});

test('a linked filter clears when the address loses it', async ({page}) => {
  await page.goto('/#/connections?q=hk-01');
  const filter = page.getByRole('searchbox', {name: 'Filter'});
  await expect(filter).toHaveValue('hk-01');
  await page.goto('/#/connections');
  await expect(filter).toHaveValue('');
});

test('source edits debounce requests and keep rows on the settled source', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const responses: Record<string, unknown> = {
    '/capabilities': capabilities,
    '/version': await api.version(),
    '/runtime': await api.runtime(),
    '/groups': await api.groups(),
    '/nodes': await api.nodes()
  };
  const sources: Array<string | null> = [];
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/connections') {
      const src = url.searchParams.get('src');
      sources.push(src);
      return route.fulfill({json: await api.connections({src: src ?? undefined})});
    }
    return route.fulfill({json: responses[path]});
  });
  await page.goto('/#/connections?src=10.0.0.12');
  const grid = page.getByRole('grid', {name: 'Connections'});
  await expect(grid.getByRole('rowheader').first()).toHaveText('api.telegram.org');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  sources.length = 0;
  const field = page.getByRole('searchbox', {name: 'Filter'});
  await field.fill('10.0.0.2');
  await page.clock.runFor(100);
  await field.fill('10.0.0.7');
  await page.clock.runFor(100);
  expect(sources).toEqual([]);
  await expect(field).toHaveValue('10.0.0.7');
  await expect(grid.getByRole('rowheader').first()).toHaveText('api.telegram.org');
  await page.clock.runFor(250);
  await expect.poll(() => sources).toEqual(['10.0.0.7']);
  await expect(grid.getByRole('rowheader').first()).toHaveText('cdn.bilibili.com');
});

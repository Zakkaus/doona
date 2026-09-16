import type {Locator} from '@playwright/test';
import {expect, test} from './fixtures';

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-mock-big', '100'));
});

async function expectRowInView(row: Locator) {
  await expect(row).toBeInViewport();
  await expect
    .poll(() =>
      row.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const grid = element.closest('[role="grid"]')!;
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

test('connection selection follows clicks, arrows and Home/End across virtual rows', async ({page}) => {
  await page.goto('/#/connections');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await page.locator('.rp-table [data-key="c-0002"]').click();
  await expect(selected).toHaveAttribute('data-key', 'c-0002');
  await expect(page.locator('.rp-card .rp-h3')).toHaveText('cdn.bilibili.com');
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

test('connection selection survives a runtime poll', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/connections');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await page.locator('.rp-table [data-key="c-0002"]').click();
  const age = await selected.getByRole('gridcell').last().textContent();
  await page.clock.fastForward(6000);
  await expect(selected).toHaveAttribute('data-key', 'c-0002');
  await expect(selected.getByRole('gridcell').last()).not.toHaveText(age!);
  await expect(page.locator('.rp-card .rp-h3')).toHaveText('cdn.bilibili.com');
});

test('connection deep links reveal selected rows, including same-route query changes', async ({page}) => {
  await page.goto('/#/connections?id=c-0500');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await expect(selected).toHaveAttribute('data-key', 'c-0500');
  await expectRowInView(selected);
  await expect(page.locator('.rp-card .rp-h3')).toHaveText('doubleclick.net');
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
  await expect(page.locator('.rp-note')).toHaveText('The connection list is truncated; only some records are shown.');
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
  await page.getByRole('option', {name: 'Source', exact: true}).click();
  await grid.evaluate(element => {
    element.scrollTop = 0;
  });
  await expect(grid.locator('[role=row][aria-level="1"]').first()).toContainText('10.0.0.');
});

import type {Locator, Page} from '@playwright/test';
import {expect, isLive, mockBackend, test} from './fixtures';

test('search shortcut moves focus into a dismissible dialog', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  await page.keyboard.press('Control+K');
  const dialog = page.locator('.rp-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('tab order reaches the first navigation link', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  // Allow header controls, but fail if navigation is skipped or starts midway.
  for (let tabs = 0; tabs < 12; tabs++) {
    await page.keyboard.press('Tab');
    if (await page.locator('.rp-nav:focus').count()) break;
  }
  await expect(page.locator('.rp-nav').first()).toBeFocused();
});

test('shortcut help and page sequences respect focus and the sequence deadline', async ({page}) => {
  await page.clock.install();
  await page.goto('/#/activity');
  // The shortcut listener mounts with the shell; a key pressed before that is lost.
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', {name: 'Keyboard shortcuts'});
  await expect(help).toBeVisible();
  const goTo = help.locator('.rp-row', {hasText: 'Connections'});
  await expect(goTo.locator('kbd')).toHaveText(['G', 'C']);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('g');
  await page.clock.fastForward(801);
  await page.keyboard.press('c');
  await expect(page).toHaveURL(/#\/activity$/);
  await page.keyboard.press('g');
  await page.keyboard.press('c');
  await expect(page).toHaveURL(/#\/connections$/);
  // The shortcut opens the traffic tab; the filter lives in the list.
  await page.getByRole('tab', {name: 'Connections', exact: true}).click();
  const input = page.getByRole('searchbox', {name: 'Filter', exact: true});
  await input.focus();
  await page.keyboard.type('g a?');
  await expect(input).toHaveValue('g a?');
  await expect(page).toHaveURL(/#\/connections\?tab=list$/);
  await expect(help).toBeHidden();
});

test('the shortcut help fits a 1280x720 window, and g d and g v open DNS and Events', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto('/#/activity');
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', {name: 'Keyboard shortcuts'});
  await expect(help.getByRole('heading', {name: 'Keyboard shortcuts'})).toBeInViewport({ratio: 1});
  for (const name of ['General', 'Tables and lists', 'Configuration editor', 'Go to page'])
    await expect(help.getByRole('heading', {name, exact: true})).toBeVisible();
  const rows = help.locator('.rp-row');
  await expect(rows).toHaveCount(23);
  for (const row of await rows.all()) await expect(row).toBeInViewport({ratio: 1});
  await expect(help.getByRole('button', {name: 'Close', exact: true})).toBeInViewport({ratio: 1});
  expect(await help.evaluate(dialog => dialog.scrollHeight <= dialog.clientHeight)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/#\/dns(\?|$)/);
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('v');
  await expect(page).toHaveURL(/#\/events(\?|$)/);
});

test('g r opens Rules instead of refreshing, while a lone r still refreshes', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-strip')).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/#\/rules$/);
  await expect(page.locator('.rp-toast')).toHaveCount(0);
  await page.keyboard.press('r');
  await expect(page.locator('.rp-toast.positive')).toContainText('Data refreshed');
  await expect(page).toHaveURL(/#\/rules$/);
});

test('/ on a page without a filter field cancels a pending g', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-strip')).toBeVisible();
  await expect(page.locator('.rp-content input[type="search"]')).toHaveCount(0);
  await page.keyboard.press('g');
  await page.keyboard.press('/');
  await page.keyboard.press('c');
  // The refresh lands after `c` was handled, so the address below is the one `c` left.
  await page.keyboard.press('r');
  await expect(page.locator('.rp-toast.positive')).toContainText('Data refreshed');
  await expect(page).toHaveURL(/#\/activity$/);
});

test('chart data tooltips are reachable without pointer interaction', async ({page}) => {
  await page.goto('/#/activity');
  const traffic = page.getByRole('region', {name: 'Traffic', exact: true});
  const chart = traffic.getByRole('application');
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await expect(traffic.locator('.rp-charttip-bounded')).toBeVisible();
  await expect(traffic.locator('.rp-charttip-bounded li').first()).toContainText(/\d/);
  // A live backend that has carried no traffic since it started has no donut to step through.
  const donut = page.locator('.rp-donut');
  if (isLive && !(await donut.count())) return;
  await donut.getByRole('application').focus();
  await page.keyboard.press('ArrowRight');
  await expect(donut.locator('.rp-charttip-bounded')).toBeVisible();
  await expect(donut.locator('.rp-charttip-bounded li')).toContainText(/\d/);
  // The chart is a single tab stop: the next Tab leaves it.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.rp-donut .box'))).toBe(false);
});

test('slash focuses the page filter and r refreshes everything', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  const filter = page.locator('.rp-content input[type="search"]').first();
  await expect(filter).toBeVisible();
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  await page.keyboard.press('/');
  await expect(filter).toBeFocused();
  await filter.fill('10.0');
  // Inside a field the keys type; nothing else fires.
  await page.keyboard.press('r');
  await expect(filter).toHaveValue('10.0r');
  await page.keyboard.press('Escape');
  await page.locator('body').click({position: {x: 5, y: 5}});
  await page.keyboard.press('r');
  await expect(page.locator('.rp-toast.positive')).toContainText('Data refreshed');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', {name: 'Keyboard shortcuts'})).toContainText('Tables and lists');
});

test('idle traffic has distinct fractional rate labels', async ({page}) => {
  const backend = await mockBackend(page);
  const runtime = await backend.api.runtime();
  runtime.traffic.rates = {window_seconds: 10, upload_bytes_per_second: '0', download_bytes_per_second: '0'};
  backend.handlers['GET runtime'] = async () => runtime;
  const history = await backend.api.trafficHistory();
  backend.handlers['GET runtime/traffic/history'] = async () => ({
    ...history,
    samples: history.samples.map(sample => ({...sample, upload_bytes_per_second: '0', download_bytes_per_second: '0'}))
  });
  await page.goto('/#/activity');
  const traffic = page.getByRole('region', {name: 'Traffic', exact: true});
  await expect(traffic.locator('.rp-area-y-ticks text')).toHaveText(['600 B/s', '1.2 KB/s']);
});

test('charts are named and icon buttons show their tooltip on keyboard focus', async ({page}) => {
  await page.goto('/#/activity');
  // The three cards' charts take focus under their card's name; the tile sparks are decoration and do not.
  const names = ['Traffic', 'Memory', 'Outbound downloads'];
  await expect(page.getByRole('application', {name: 'Traffic', exact: true})).toBeVisible();
  // Live, the donut exists only once the backend has carried traffic.
  if (isLive && !(await page.locator('.rp-donut').count())) names.pop();
  for (const name of names) await expect(page.getByRole('application', {name, exact: true})).toBeVisible();
  await expect(page.getByRole('application')).toHaveCount(names.length);
  await page.locator('.rp-search').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.rp-actions button[aria-label]:focus')).toHaveCount(1);
  await expect(page.getByRole('tooltip')).toBeVisible();
});

// A column resizer in a grid with no rows used to hold focus on every Tab.
async function tabThroughEmptyTable(page: Page, table: Locator, start: Locator) {
  await expect(table.locator('.rp-table-empty')).toBeVisible();
  await start.focus();
  const inTable = () => table.evaluate(element => element.contains(document.activeElement));
  let entered = false;
  for (let i = 0; i < 20 && !entered; i++) {
    await page.keyboard.press('Tab');
    entered = await inTable();
  }
  expect(entered).toBe(true);
  await page.keyboard.press('Tab');
  expect(await inTable()).toBe(false);
}

test('Tab leaves a resizable table that has no rows', async ({page}) => {
  await page.goto('/#/connections?tab=list&q=no-such-connection');
  await tabThroughEmptyTable(page, page.getByRole('treegrid', {name: 'Connections'}), page.getByRole('searchbox', {name: 'Filter'}));
});

test('Tab leaves an empty resizable table in flat mode', async ({page}) => {
  const {api} = await mockBackend(page);
  await api.flushDnsCache();
  await page.goto('/#/dns?tab=cache');
  const tab = page.getByRole('tab', {name: 'Cache', exact: true});
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await tabThroughEmptyTable(page, page.getByRole('grid'), tab);
});

test('Escape on a menu or dialog opened from a table row returns focus to its trigger', async ({page}) => {
  const reach = async (row: import('@playwright/test').Locator, name: string) => {
    await row.focus();
    const trigger = row.getByRole('button', {name, exact: true});
    for (let i = 0; i < 12 && !(await trigger.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('ArrowRight');
    await expect(trigger).toBeFocused();
    return trigger;
  };
  await page.goto('/#/nodes');
  const menu = await reach(page.getByRole('row', {name: /harbor/}), 'More actions for harbor');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(menu).toBeFocused();

  await page.goto('/#/rules?tab=list&view=advanced');
  const edit = await reach(page.getByRole('row', {name: /domain\(geosite:telegram\)/}), 'Edit rule');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', {name: 'Edit rule'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name: 'Edit rule'})).toBeHidden();
  await expect(edit).toBeFocused();
});

test('keyboard focus draws one ring on the focused tab', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  const tab = page.getByRole('tab', {name: 'Connections', exact: true});
  await tab.focus();
  await page.keyboard.press('ArrowLeft');
  const focused = page.getByRole('tab').and(page.locator(':focus'));
  await expect(focused).toHaveCSS('outline-style', 'solid');
  await expect(page.locator('.rp-tabs')).toHaveAttribute('data-focus-visible', 'true');
  await expect(page.locator('.rp-tabs')).toHaveCSS('outline-style', 'none');
});

test('segmented and table wrappers leave the ring on the focused control', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  const group = page.getByRole('radiogroup', {name: 'Network protocol'});
  await group.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio').and(page.locator(':focus'))).toHaveCSS('outline-style', 'solid');
  await expect(group).toHaveCSS('outline-style', 'none');
  const grid = page.getByRole('treegrid', {name: 'Connections'});
  const row = grid.locator('[role=row][data-key]:not([data-disabled])').first();
  await row.focus();
  await page.keyboard.press('ArrowRight');
  const focused = grid.locator(':focus');
  await expect(focused).toHaveCSS('outline-style', 'solid');
  await expect(row).toHaveCSS('outline-style', 'none');
  await expect(grid).toHaveCSS('outline-style', 'none');
  await expect(page.locator('.rp-table')).toHaveCSS('outline-style', 'none');
});

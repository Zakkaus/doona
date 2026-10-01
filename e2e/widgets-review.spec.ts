import {panel, editPanel} from './widget-helpers';
import {test, expect, mockBackend, expectLoadFailures} from './fixtures';
import {defaults, defaultWidget} from '../src/shell/widgets/layout';

test.use({widgets: true, serviceWorkers: 'block'});

test('metric forms change the renderer without acquiring history for key-value cards', async ({page}) => {
  const backend = await mockBackend(page);
  await page.addInitScript(
    value => localStorage.setItem('doona-widgets', JSON.stringify({...value, items: [{id: 'speed', size: 'medium', form: 'kv'}]})),
    defaults()
  );
  await page.goto('/#/settings');
  await expect(panel(page).locator('.rp-kv')).toBeVisible();
  await expect(panel(page).locator('svg.rp-activity-surface, .rp-compact-chart')).toHaveCount(0);
  expect(backend.requests.filter(request => /traffic\/history/.test(request.url()))).toHaveLength(0);
  await editPanel(page);
  const dialog = page.getByRole('dialog', {name: 'Edit widgets'});
  await dialog.getByRole('radio', {name: 'Sparkline', exact: true}).click();
  await expect(dialog.locator('.rp-widget-canvas .rp-compact-chart svg').first()).toBeVisible();
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(panel(page).locator('.rp-compact-chart svg').first()).toBeVisible();
});

test('panel mode and global target stage one shared draft until Apply', async ({page}) => {
  const backend = await mockBackend(page);
  await page.addInitScript(value => localStorage.setItem('doona-widgets', JSON.stringify(value)), {
    ...defaults(),
    items: [defaultWidget('mode')],
    size: {width: 480, height: 640}
  });
  await page.goto('/#/activity');
  await panel(page).getByRole('radio', {name: 'Direct', exact: true}).click();
  await expect(panel(page).getByRole('button', {name: 'Apply', exact: true})).toBeEnabled();
  await expect(page.locator('main').getByRole('radio', {name: 'Direct', exact: true})).toBeChecked();
  expect(backend.requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  await panel(page).getByRole('button', {name: 'Apply', exact: true}).click();
  await expect.poll(() => backend.requests.filter(request => request.method() !== 'GET').length).toBeGreaterThan(0);
});

test('visible panels keep the gallery code unloaded until editing', async ({page}) => {
  const loaded: string[] = [];
  page.on('request', request => loaded.push(request.url()));
  await page.goto('/#/settings');
  await expect(panel(page).locator('.rp-widget-cell').first()).toBeVisible();
  expect(loaded.some(url => /Editors/.test(url))).toBe(false);
  await editPanel(page);
  await expect(page.locator('.rp-widget-gallery')).toBeVisible();
  expect(loaded.some(url => /Editors/.test(url))).toBe(true);
});

test('a failed editor chunk keeps the application shell available', async ({page}) => {
  const failed = /Editors-.*\.js/;
  expectLoadFailures(page, failed);
  await page.addInitScript(() => sessionStorage.setItem('doona-stale-reload', String(Date.now())));
  let missing = true;
  await page.route(failed, route => (missing ? route.abort() : route.continue()));
  await page.goto('/#/settings');
  await editPanel(page);
  const reload = page.getByRole('button', {name: 'Reload', exact: true}).first();
  await expect(reload).toBeVisible();
  await expect(page.locator('nav.rp-side')).toBeVisible();
  missing = false;
  await reload.click();
  await expect(panel(page).locator('.rp-widget-cell').first()).toBeVisible();
  await page.locator('.rp-nav[href="#/activity"]').click();
  await expect(page.locator('main h1')).toHaveText('Activity');
});

test('ranking instances retain independent device and domain selections', async ({page}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('ranking-seeded')) return;
    sessionStorage.setItem('ranking-seeded', '1');
    localStorage.setItem(
      'doona-dashboard',
      JSON.stringify({
        version: 1,
        original: false,
        items: [
          {id: 'ranking', size: 'medium', form: 'ranked', by: 'domain'},
          {id: 'ranking', instance: 'second', size: 'medium', form: 'ranked', by: 'dev'}
        ]
      })
    );
  });
  await page.goto('/#/activity');
  const first = page.locator('[data-instance="ranking"]');
  const second = page.locator('[data-instance="second"]');
  await expect(first.getByRole('radio', {name: 'Domains', exact: true})).toBeChecked();
  await expect(second.getByRole('radio', {name: 'Devices', exact: true})).toBeChecked();
  await first.getByRole('radio', {name: 'Devices', exact: true}).click();
  await second.getByRole('radio', {name: 'Domains', exact: true}).click();
  await page.reload();
  await expect(first.getByRole('radio', {name: 'Devices', exact: true})).toBeChecked();
  await expect(second.getByRole('radio', {name: 'Domains', exact: true})).toBeChecked();
});

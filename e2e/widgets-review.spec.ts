import {panel, editPanel, pickWidget} from './widget-helpers';
import {test, expect, mockBackend, expectLoadFailures} from './fixtures';
import {defaults, defaultWidget} from '../src/shell/widgets/layout';
import {readMode} from '../src/dae/outboundMode';

test.use({widgets: true, serviceWorkers: 'block'});

test('a backend without outbound traffic does not ask for it for connection statistics', async ({page}) => {
  const {capabilities, requests} = await mockBackend(page);
  capabilities.resources.runtime_outbounds.available = false;
  await page.addInitScript(value => localStorage.setItem('doona-widgets', JSON.stringify(value)), {
    ...defaults(),
    items: [{...defaultWidget('connectionOutbounds'), form: 'kv'}]
  });
  await page.goto('/#/settings');
  await expect(panel(page).locator('.rp-kv').first()).toBeVisible();
  expect(requests.filter(request => new URL(request.url()).pathname === '/api/v1/runtime/outbounds')).toEqual([]);
});

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
  await pickWidget(page);
  await dialog.getByRole('radio', {name: 'Sparkline', exact: true}).click();
  const preview = dialog.locator('.rp-widget-canvas');
  await expect(preview.locator('.rp-compact-chart')).toBeVisible();
  await expect(preview.locator('.rp-kv')).toHaveCount(0);
  // The canvas uses cached live readings, not gallery samples; an uncharted key-value card has no history to draw.
  await expect(preview.locator('.rp-compact-chart svg')).toHaveCount(0);
  expect(backend.requests.filter(request => /traffic\/history/.test(request.url()))).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(panel(page).locator('.rp-compact-chart svg').first()).toBeVisible();
});

test('panel mode stages a draft until Apply and writes the chosen mode', async ({page}) => {
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
  await expect.poll(async () => readMode((await backend.api.config()).sources.find(source => source.kind === 'main')!.content!).mode).toBe('direct');
  await expect(page.locator('main').getByRole('radio', {name: 'Direct', exact: true})).toBeChecked();
});

for (const host of ['panel', 'dashboard'] as const) {
  for (const width of [1280, 390]) {
    test(`standalone Global outbound in the ${host} at ${width}px applies without reflow and clears its draft`, async ({page}) => {
      await page.setViewportSize({width, height: 844});
      const backend = await mockBackend(page);
      await page.addInitScript(
        ({host, layout, item}) => {
          localStorage.setItem('doona-widgets', JSON.stringify({...layout, visible: host === 'panel', items: [item]}));
          localStorage.setItem('doona-dashboard', JSON.stringify({version: 2, sections: [{id: 'quick', items: [item]}]}));
        },
        {host, layout: defaults(), item: defaultWidget('global')}
      );
      await page.goto(host === 'panel' ? '/#/settings' : '/#/activity');
      if (host === 'panel' && width === 390) await page.getByRole('button', {name: 'Show widgets', exact: true}).click();
      const widget = host === 'panel' ? page.locator('.rp-widget[aria-label="Global outbound"]') : page.locator('[data-instance="global"] .rp-card');
      const label = widget.getByText('Global outbound', {exact: true});
      const target = widget.getByRole('button', {name: 'Global outbound', exact: true});
      const apply = widget.getByRole('button', {name: 'Apply', exact: true});
      await expect(target).toBeEnabled();
      await expect(apply).toBeVisible();
      await expect(apply).toBeDisabled();
      await page.evaluate(() => document.fonts.ready);
      const before = (await widget.boundingBox())!;
      // The picker is as wide as its widest outbound, so whether the title shares the line is settled before a draft: the
      // dashboard card, alone in quick's first track, stacks the title above the large picker and Apply, which stay on
      // one line.
      const inline = host === 'panel';
      const section = page.locator('.rp-dash-section').filter({has: widget});
      if (host === 'dashboard') await expect(section).toHaveAttribute('data-controls', inline ? 'inline' : 'stacked');
      const line = async () => {
        const boxes = await Promise.all([label, target, apply].map(control => control.boundingBox()));
        const centers = boxes.map(box => box!.y + box!.height / 2).slice(inline ? 0 : 1);
        expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
        if (!inline) expect(boxes[0]!.y + boxes[0]!.height).toBeLessThanOrEqual(boxes[1]!.y);
        expect(boxes[2]!.height).toBe(boxes[1]!.height);
        expect(boxes[2]!.x).toBeGreaterThanOrEqual(boxes[1]!.x + boxes[1]!.width);
        return boxes;
      };
      const idleBoxes = await line();
      await target.click();
      await page.getByRole('searchbox', {name: 'Filter outbounds', exact: true}).fill('gaming');
      await page.getByRole('menuitemradio', {name: 'gaming', exact: true}).click();
      await expect(target).toContainText('gaming');
      expect(backend.requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
      await expect(apply).toBeEnabled();
      // Another outbound moves nothing: the picker keeps its width and Apply its place.
      expect(await line()).toEqual(idleBoxes);
      expect((await widget.boundingBox())!.height).toBe(before.height);
      if (host === 'dashboard') await expect(section).toHaveAttribute('data-controls', inline ? 'inline' : 'stacked');
      await apply.click();
      await expect
        .poll(async () => readMode((await backend.api.config()).sources.find(source => source.kind === 'main')!.content!))
        .toEqual({
          mode: 'global',
          target: 'gaming'
        });
      await expect(apply).toBeVisible();
      await expect(apply).toBeDisabled();
      expect(await line()).toEqual(idleBoxes);
      expect((await widget.boundingBox())!.height).toBe(before.height);
      expect(backend.requests.filter(request => request.method() === 'PUT' && request.url().includes('/config/sources/'))).toHaveLength(1);
      if (host === 'panel' && width === 390) {
        await page.getByRole('dialog').getByRole('button', {name: 'Close', exact: true}).click();
      }
      const destination = host === 'panel' ? 'Activity' : 'Settings';
      const navigation = width === 390 ? page.getByRole('navigation', {name: 'Sections'}) : page.locator('.rp-side');
      await navigation.getByRole('link', {name: destination, exact: true}).click();
      if (host === 'dashboard' && width === 390) {
        await page.getByRole('navigation', {name: 'Settings', exact: true}).getByRole('link', {name: 'Settings', exact: true}).click();
      }
      await expect(page.locator('main h1')).toHaveText(destination);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    });
  }
}

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

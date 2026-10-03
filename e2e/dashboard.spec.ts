import {test, expect, box, fulfillStream, loadCatalogues, mockBackend} from './fixtures';
import type {Locator, Page} from '@playwright/test';
import {translate} from '../src/i18n';
const open = (page: Page) => page.getByRole('button', {name: 'Edit dashboard', exact: true}).click();
const tile = (page: Page, id: string) => page.locator(`.rp-dashboard-cell[data-instance="${id}"]`);
const order = (page: Page) =>
  page.locator("[data-profile='metrics'] > .rp-dashboard-cell").evaluateAll(cells => cells.map(cell => (cell as HTMLElement).dataset.instance));
const settings = async (page: Page, id: string) => {
  await tile(page, id).getByRole('button', {name: 'Widget settings', exact: true}).click();
  return page.getByRole('dialog');
};
// A segmented choice in the settings, or its picker when the choices do not fit the popover.
const pick = async (page: Page, label: string, option: string) => {
  const dialog = page.getByRole('dialog').first();
  const radio = dialog.getByRole('radio', {name: option, exact: true});
  if (await radio.isVisible()) return radio.click();
  await dialog.getByRole('button', {name: new RegExp(`${label}$`)}).click();
  await page.getByRole('option', {name: option, exact: true}).click();
};
// Escape goes to what holds focus, once a picker's popover has closed and handed focus back to the settings. Pressing
// it on the dialog element would move focus there first, and react-aria's useDialog blurs and refocuses a dialog that
// holds focus itself 500 ms after it opens; a key landing in that gap reached the body and left the settings open.
const close = async (page: Page) => {
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('[role="dialog"]:focus-within')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
};
const seed = (page: Page, layout: unknown) =>
  page.addInitScript(value => {
    if (localStorage.getItem('doona-dashboard') === null) localStorage.setItem('doona-dashboard', value);
  }, JSON.stringify(layout));
const height = async (locator: Locator) => (await box(locator)).height;
const boxes = (page: Page, profile: string) =>
  page.locator(`[data-profile='${profile}'] > .rp-dashboard-cell`).evaluateAll(cells =>
    Object.fromEntries(
      cells.map(cell => {
        const r = cell.getBoundingClientRect();
        return [(cell as HTMLElement).dataset.instance, [r.x, r.y, r.width, r.height].map(Math.round)];
      })
    )
  );
// A keyboard reaches a card's edge handle as a person does: from its row, by Tab.
const focusHandle = async (page: Page, id: string, name: string) => {
  const handle = tile(page, id).getByRole('slider', {name, exact: true});
  await tile(page, id).focus();
  for (let i = 0; i < 5 && !(await handle.evaluate(node => node === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(handle).toBeFocused();
};

test('drags a card into a new place, moves it by keyboard, resizes one card and keeps the draft until Done', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-card')).toBeVisible();
  await open(page);
  // A pointer drag by the handle: the gap-line indicator shows the slot, and the drop moves the card there.
  const handle = tile(page, 'download').locator('[slot="drag"]');
  const target = await box(tile(page, 'connections'));
  const start = await box(handle);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 20, {steps: 4});
  await page.mouse.move(target.x + target.width * 0.85, target.y + target.height / 2, {steps: 12});
  await expect(page.locator('.rp-canvas-drop[data-drop-target]')).toHaveCount(1);
  await page.mouse.up();
  expect(await order(page)).toEqual(['upload', 'connections', 'download', 'latency', 'cpu']);
  // The keyboard: Enter picks the card up, an arrow chooses the slot, Enter drops it.
  await tile(page, 'cpu').locator('[slot="drag"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rp-canvas-drop[data-drop-target]')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect.poll(() => order(page)).not.toEqual(['upload', 'connections', 'download', 'latency', 'cpu']);
  // One resize changes only that card's width.
  const widths = () =>
    page
      .locator('.rp-dashboard-cell')
      .evaluateAll(cells => cells.map(cell => [(cell as HTMLElement).dataset.instance, Math.round(cell.getBoundingClientRect().width)]));
  const before = Object.fromEntries(await widths());
  await settings(page, 'upload');
  await pick(page, 'Width', '1/2');
  await close(page);
  const after = Object.fromEntries(await widths());
  for (const id of Object.keys(before)) if (id !== 'upload') expect(after[id], id).toBe(before[id]);
  expect(after.upload).toBeGreaterThan(before.upload);
  // Cancel asks before dropping the changed draft and restores the saved page; Done keeps the draft through a reload.
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  expect(await order(page)).toEqual(['download', 'upload', 'connections', 'latency', 'cpu']);
  await open(page);
  await (await settings(page, 'cpu')).getByRole('button', {name: 'Move up', exact: true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(['download', 'upload', 'connections', 'cpu', 'latency']);
  // Restore defaults changes the draft only.
  await open(page);
  await page.getByRole('button', {name: 'Restore defaults', exact: true}).click();
  expect(await order(page)).toEqual(['download', 'upload', 'connections', 'latency', 'cpu']);
  await page.getByRole('button', {name: 'Done', exact: true}).click();
});

test('the gallery adds a card to the extensions section and counts placed instances', async ({page}) => {
  await page.goto('/#/activity');
  await open(page);
  await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  const gallery = page.getByRole('dialog', {name: 'Widget gallery'});
  const item = gallery.locator(".rp-widget-gallery-tile[data-module='sourceHealth']");
  await expect(item.getByRole('heading', {name: 'Source health', exact: true})).toBeVisible();
  await expect(item).toContainText('0/3 placed');
  await item.getByRole('button', {name: 'Add Source health', exact: true}).click();
  await expect(item).toContainText('1/3 placed');
  await gallery.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(page.locator("[data-profile='extensions'] > [data-module='sourceHealth']")).toHaveCount(1);
});

test('the group card shows the first manual group and changes group in place', async ({page}) => {
  await page.goto('/#/activity');
  await open(page);
  await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  await page.getByRole('dialog', {name: 'Widget gallery'}).getByRole('button', {name: 'Add Group quick switch', exact: true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  const card = page.locator("[data-module='group']");
  await card.scrollIntoViewIfNeeded();
  const picker = card.getByRole('button', {name: /^Group/});
  await expect(picker).toBeEnabled();
  await expect(card.getByRole('button', {name: /^Selected member/})).toBeVisible();
  await picker.click();
  await page.getByRole('menuitemradio').nth(1).click();
  await expect.poll(() => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('doona-dashboard') ?? '{}')))).toContain('"group"');
});

test('packs short cards beside a tall one, ends columns level and lines columns up across sections', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  const extensions = [
    {id: 'nodeLatency', form: 'dots', size: 'large'},
    {id: 'dnsAnswers', form: 'donut', size: 'medium'},
    {id: 'policyGroups', form: 'kv', size: 'medium'}
  ];
  const item = (id: string, form = 'kv') => ({id, form, size: 'medium'});
  const saved = {
    version: 2,
    sections: [
      {id: 'traffic', items: [item('history', 'area'), item('outbounds', 'donut')]},
      {id: 'details', items: [item('ranking', 'ranked'), item('memory', 'area'), item('notices')]},
      {id: 'extensions', items: extensions}
    ]
  };
  // Seeded before the first load: a reload after it would cancel the card chunks still in flight and log them as errors.
  await page.addInitScript(value => {
    if (localStorage.getItem('doona-dashboard') === null) localStorage.setItem('doona-dashboard', value);
  }, JSON.stringify(saved));
  await page.goto('/#/activity');
  await expect(tile(page, 'policyGroups').locator('.rp-card')).toBeVisible();
  const boxes = () =>
    page.locator('.rp-dashboard-cell').evaluateAll(cells =>
      Object.fromEntries(
        cells.map(cell => {
          // The card, not its cell: a card that does not fill its grown cell leaves the same band as before.
          const box = cell.querySelector('.rp-card')!.getBoundingClientRect();
          return [(cell as HTMLElement).dataset.instance, {left: box.left, right: box.right, top: box.top + scrollY, bottom: box.bottom + scrollY}];
        })
      )
    );
  const check = (box: Awaited<ReturnType<typeof boxes>>) => {
    // The short cards stack beside the tall one with one kit gap, and the column ends level with it.
    expect(box.policyGroups.left).toBeCloseTo(box.dnsAnswers.left, 0);
    expect(box.policyGroups.top - box.dnsAnswers.bottom).toBeCloseTo(12, 0);
    expect(box.policyGroups.bottom).toBeCloseTo(box.nodeLatency.bottom, 0);
    // The last column of traffic, details and extensions is one column.
    for (const id of ['outbounds', 'dnsAnswers']) {
      expect(box[id].left, id).toBeCloseTo(box.notices.left, 0);
      expect(box[id].right, id).toBeCloseTo(box.notices.right, 0);
    }
  };
  const settled = async () => {
    const box = await boxes();
    return Math.round(Math.abs(box.policyGroups.top - box.dnsAnswers.bottom - 12) + Math.abs(box.policyGroups.bottom - box.nodeLatency.bottom));
  };
  await expect.poll(settled).toBe(0);
  const live = await boxes();
  check(live);
  await open(page);
  await expect(tile(page, 'dnsAnswers').locator('.rp-dashboard-tools')).toBeVisible();
  await expect.poll(settled).toBe(0);
  const edit = await boxes();
  check(edit);
  // Edit mode adds a drop area for each empty section above, so boxes compare from the first card down.
  const shift = edit.history.top - live.history.top;
  for (const id of Object.keys(live))
    for (const key of ['left', 'right', 'top', 'bottom'] as const)
      expect(edit[id][key] - (key === 'top' || key === 'bottom' ? shift : 0), `${id} ${key}`).toBeCloseTo(live[id][key], 0);
  // The edit tools are a chip over the card's top edge, inside its inline end and above its title.
  const card = await box(tile(page, 'dnsAnswers').locator('.rp-card'));
  const tools = await box(tile(page, 'dnsAnswers').locator('.rp-dashboard-tools'));
  const title = await box(tile(page, 'dnsAnswers').getByRole('heading').first());
  expect(tools.y).toBeLessThan(card.y);
  expect(tools.y + tools.height).toBeGreaterThan(card.y);
  expect(tools.x + tools.width).toBeLessThanOrEqual(card.x + card.width);
  expect(title.y).toBeGreaterThanOrEqual(tools.y + tools.height);
});

test.describe('status details link', () => {
  test.use({storage: {'doona-lang': 'zh-TW'}, viewport: {width: 1440, height: 900}});
  test.beforeAll(loadCatalogues);

  test('one feature off is the only link and the first row stays inline', async ({page}) => {
    await page.goto('/#/activity');
    const summary = translate('zh-TW', 'act.limited', {n: 1});
    const links = tile(page, 'status').getByRole('link');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveText(summary);
    await expect(links).toHaveAccessibleName(summary);
    const quick = page.locator('[data-profile="quick"]');
    await expect(quick).toHaveAttribute('data-controls', 'inline');
    const lines = await quick.locator('.rp-control-card > .rp-row').evaluateAll(rows =>
      rows.map(row => {
        const title = row.firstElementChild!.getBoundingClientRect();
        const controls = row.lastElementChild!.getBoundingClientRect();
        return {
          top: row.getBoundingClientRect().top,
          centres: Math.abs(title.top + title.height / 2 - controls.top - controls.height / 2),
          end: Math.abs(row.getBoundingClientRect().right - controls.right)
        };
      })
    );
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(Math.abs(line.top - lines[0].top)).toBeLessThanOrEqual(1);
      expect(line.centres).toBeLessThanOrEqual(1);
      expect(line.end).toBeLessThanOrEqual(1);
    }
    await links.click();
    await expect(page).toHaveURL(/#\/overview$/);
  });

  test('no features off shows only View details', async ({page}) => {
    const backend = await mockBackend(page);
    backend.capabilities.resources.events.available = true;
    backend.capabilities.resources.flows.recording = 'on';
    const runtime = await backend.api.runtime();
    await page.route('**/api/v1/events', route =>
      fulfillStream(route, [{id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}}])
    );
    await page.goto('/#/activity');
    const details = translate('zh-TW', 'act.viewDetails');
    const links = tile(page, 'status').getByRole('link');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveText(details);
    await expect(links).toHaveAccessibleName(details);
    await links.click();
    await expect(page).toHaveURL(/#\/overview$/);
  });
});

// A control card's title is never cut to an ellipsis: a row whose titles do not all fit whole stacks instead.
for (const lang of ['zh-TW', 'en'] as const)
  test.describe(`control card titles ${lang}`, () => {
    test.use({storage: {'doona-lang': lang}});
    test.beforeAll(loadCatalogues);
    for (const editing of [false, true])
      test(`stay whole from 1100 to 1920px${editing ? ' while editing' : ''}`, async ({page}) => {
        await page.setViewportSize({width: 1100, height: 900});
        await page.goto('/#/activity');
        const titles = page.locator('[data-profile="quick"] .rp-control-card > .rp-row > .rp-qlabel > .rp-truncate');
        await expect(titles).toHaveCount(2);
        if (editing) {
          await page.getByRole('button', {name: translate(lang, 'dashboard.edit'), exact: true}).click();
          await expect(page.locator('.rp-dashboard-body .rp-control-card')).toHaveCount(3);
        }
        for (let width = 1100; width <= 1920; width += 40) {
          await page.setViewportSize({width, height: 900});
          // A new width lays the cards out again in the next frame.
          await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
          const cut = await titles.evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth).map(node => node.textContent));
          expect(cut, `${width}px`).toEqual([]);
        }
      });
  });

// Control cards in a row share one of two layouts and one height, and end at their content, at every width.
for (const lang of ['en', 'zh-TW'])
  test.describe(`control cards ${lang}`, () => {
    test.use({storage: {'doona-lang': lang}});
    test('share their layout and height in a row', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('.rp-control-card')).toHaveCount(3);
      for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({width, height: 900});
        const cards = () =>
          page.locator('.rp-control-card').evaluateAll(nodes =>
            nodes.map(node => {
              // The layout the section would choose now: inline when every card's line fits while probing.
              const section = node.closest<HTMLElement>('.rp-dash-section')!;
              const chosen = section.dataset.controls;
              section.dataset.controls = 'probe';
              const fits = [...section.querySelectorAll('.rp-control-card > .rp-row')].every(row => row.scrollWidth <= row.clientWidth + 0.5);
              section.dataset.controls = chosen;
              const card = node.getBoundingClientRect();
              const row = node.querySelector(':scope > .rp-row')!;
              const first = row.firstElementChild!.getBoundingClientRect();
              const last = row.lastElementChild!.getBoundingClientRect();
              const style = getComputedStyle(node);
              const inner = card.bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth);
              const mode =
                Math.abs(first.top + first.height / 2 - (last.top + last.height / 2)) < 4 ? 'inline' : last.top >= first.bottom - 1 ? 'stacked' : 'other';
              return {
                top: Math.round(card.top),
                height: card.height,
                mode,
                settled: mode === (fits ? 'inline' : 'stacked'),
                empty: inner - row.getBoundingClientRect().bottom
              };
            })
          );
        // A new width lays the cards out again in the next frame, so the layout left from the previous width is waited out.
        await expect.poll(async () => (await cards()).every(card => card.settled && Math.abs(card.empty) <= 1), `${width}px`).toBe(true);
        const all = await cards();
        for (const card of all)
          for (const other of all.filter(other => Math.abs(other.top - card.top) <= 1)) {
            expect(other.mode, `${width}px layout`).toBe(card.mode);
            expect(Math.abs(other.height - card.height), `${width}px height`).toBeLessThanOrEqual(1);
          }
        // One column keeps every card on one line, as the phone layout did.
        if (lang === 'zh-TW' && width === 390) expect(all.map(card => card.mode)).toEqual(['inline', 'inline', 'inline']);
      }
    });
  });

test('sets height by settings: a value tile keeps its type, a chart takes the step', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
  await open(page);
  // Value tiles: each height step changes the tile, never its type.
  const cpu = tile(page, 'cpu');
  const type = () => cpu.locator('.rp-big').evaluate(node => getComputedStyle(node).fontSize);
  const font = await type();
  const steps: number[] = [];
  for (const step of ['Short', 'Standard', 'Tall']) {
    await settings(page, 'cpu');
    await pick(page, 'Height', step);
    await close(page);
    await expect(cpu).toHaveAttribute('data-height', step.toLowerCase());
    steps.push(await height(cpu.locator('.rp-card')));
    expect(await type()).toBe(font);
  }
  // A short tile still matches the standard tiles in its row.
  expect(steps[0]).toBeLessThanOrEqual(steps[1]);
  expect(steps[2]).toBeGreaterThan(steps[1] + 16);
  // Memory, short and tall, differ visibly in its chart.
  const memory = tile(page, 'memory');
  const chart = memory.locator('.rp-activity-surface');
  await settings(page, 'memory');
  await pick(page, 'Height', 'Short');
  await close(page);
  const short = await height(chart);
  await settings(page, 'memory');
  await pick(page, 'Height', 'Tall');
  await close(page);
  await expect.poll(() => height(chart)).toBeGreaterThan(short * 1.5);
});

// Width and height steps chosen in a card's settings.
const choose = async (page: Page, choices: Array<[string, string, string]>) => {
  for (const [id, label, option] of choices) {
    await settings(page, id);
    await pick(page, label, option);
    await close(page);
  }
};

test('sets width by settings, the same width in every section, and keeps it', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
  await open(page);
  const memory = tile(page, 'memory');
  const download = tile(page, 'download');
  // A half in the details section is a half in the metrics section.
  await choose(page, [
    ['memory', 'Height', 'Tall'],
    ['memory', 'Width', '1/2'],
    ['download', 'Width', '1/2']
  ]);
  expect(Math.abs((await box(memory)).width - (await box(download)).width)).toBeLessThanOrEqual(1);
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect(memory).toHaveAttribute('data-width', '1/2');
  await expect(memory).toHaveAttribute('data-height', 'tall');
  await expect(download).toHaveAttribute('data-width', '1/2');
});

test('sets width and height by edge drag and keys, and keeps them', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
  await open(page);
  const cpu = tile(page, 'cpu');
  await choose(page, [
    ['cpu', 'Height', 'Tall'],
    ['download', 'Width', '1/2']
  ]);
  // The width handle snaps a drag to the nearest width and applies it under the pointer.
  const upload = tile(page, 'upload');
  await upload.hover();
  const handle = upload.getByRole('slider', {name: 'Resize width', exact: true});
  const start = await box(handle);
  const section = await box(page.locator("[data-profile='metrics']"));
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + section.width / 3, start.y + start.height / 2, {steps: 10});
  await expect(upload).toHaveAttribute('data-resizing', '');
  await page.mouse.up();
  await expect(upload).toHaveAttribute('data-width', '1/2');
  await expect(upload).not.toHaveAttribute('data-resizing');
  // The keys: an arrow on a focused handle takes the next step.
  await focusHandle(page, 'cpu', 'Resize height');
  await page.keyboard.press('ArrowUp');
  await expect(cpu).toHaveAttribute('data-height', 'standard');
  await focusHandle(page, 'cpu', 'Resize width');
  await page.keyboard.press('ArrowRight');
  await expect(cpu).toHaveAttribute('data-width', '1/4');
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect(cpu).toHaveAttribute('data-height', 'standard');
  await expect(cpu).toHaveAttribute('data-width', '1/4');
  await expect(upload).toHaveAttribute('data-width', '1/2');
});

test('a list height is its row count and survives a reload', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await seed(page, {
    version: 3,
    sections: [
      {
        id: 'extensions',
        items: [
          {id: 'nodeLatency', form: 'ranked', size: 'medium', width: 'full', rows: 3},
          {id: 'sourceHealth', form: 'kv', size: 'medium', width: '1/2'}
        ]
      }
    ]
  });
  await page.goto('/#/activity');
  const rows = tile(page, 'nodeLatency').locator('.rp-list > .rp-kv');
  await expect(rows).toHaveCount(3);
  await open(page);
  await settings(page, 'nodeLatency');
  await pick(page, 'Height', '8 rows');
  await expect(rows).toHaveCount(8);
  await close(page);
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect(rows).toHaveCount(8);
  // The list's own count stays on offer as Auto after another is chosen, and its handle names it.
  await open(page);
  await settings(page, 'nodeLatency');
  await pick(page, 'Height', '6 rows');
  await expect(rows).toHaveCount(6);
  await close(page);
  await expect(tile(page, 'nodeLatency').getByRole('slider', {name: 'Resize height', exact: true})).toHaveAttribute('aria-valuetext', '6 rows');
  // A list that had no limit reports every row.
  await expect(tile(page, 'sourceHealth').getByRole('slider', {name: 'Resize height', exact: true})).toHaveAttribute('aria-valuetext', 'All rows');
});

test('a value tile beside a card of another height keeps its own height and its sparkline fills it', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const item = (id: string, extra: object = {}) => ({id, form: 'sparkline', size: 'medium', ...extra});
  await seed(page, {
    version: 3,
    sections: [{id: 'metrics', items: [item('cpu', {width: '1/4'}), {id: 'memory', form: 'area', size: 'medium', width: '1/2', height: 'tall'}]}]
  });
  await page.goto('/#/activity');
  const card = tile(page, 'cpu').locator('.rp-card');
  await expect(tile(page, 'memory').locator('.rp-activity-surface')).toBeVisible();
  await expect.poll(async () => (await box(tile(page, 'memory'))).height - (await box(card)).height).toBeGreaterThan(40);
  // No empty band: the sparkline reaches the card's inner end.
  const inner = await card.evaluate(node => node.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(node).paddingBlockEnd));
  const spark = await box(tile(page, 'cpu').locator('.rp-spark'));
  expect(Math.abs(spark.y + spark.height - inner)).toBeLessThanOrEqual(2);
});

test('a short tile with nothing below it keeps its own row height at 1152 px', async ({page}) => {
  await page.setViewportSize({width: 1152, height: 900});
  const item = (id: string) => ({id, form: id === 'latency' ? 'kv' : 'sparkline', size: 'medium'});
  await seed(page, {version: 2, sections: [{id: 'metrics', items: ['download', 'connections', 'cpu', 'upload', 'latency'].map(item)}]});
  await page.goto('/#/activity');
  await expect(tile(page, 'latency').locator('.rp-tile-body')).toBeVisible();
  const cpu = await box(tile(page, 'cpu'));
  const upload = await box(tile(page, 'upload'));
  const latency = await box(tile(page, 'latency'));
  expect(latency.y).toBeGreaterThan(cpu.y + cpu.height);
  expect(Math.abs(upload.y - cpu.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(upload.height - cpu.height)).toBeLessThanOrEqual(1);
});

test('value tiles in one row share one layout at every width from 1024 to 1440 px', async ({page}) => {
  await page.goto('/#/activity');
  await expect(tile(page, 'latency').locator('.rp-tile-body')).toBeVisible();
  for (let width = 1024; width <= 1440; width += 8) {
    await page.setViewportSize({width, height: 900});
    await expect
      .poll(
        () =>
          page.locator("[data-profile='metrics'] > .rp-dashboard-cell").evaluateAll(cells => {
            const rows = new Map<number, Set<string>>();
            for (const cell of cells) {
              const body = cell.querySelector('.rp-tile-body');
              if (!body) continue;
              const top = Math.round(cell.getBoundingClientRect().top);
              rows.set(top, (rows.get(top) ?? new Set()).add(getComputedStyle(body).display));
            }
            return [...rows.values()].every(modes => modes.size === 1);
          }),
        `${width}px`
      )
      .toBe(true);
  }
});

test('row hints name the space left and take a card that fits', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const item = (id: string, extra: object = {}) => ({id, form: id === 'latency' ? 'kv' : 'sparkline', size: 'medium', ...extra});
  await seed(page, {
    version: 3,
    sections: [
      {id: 'metrics', items: [item('download'), item('upload', {width: '1/2'}), item('connections'), item('latency'), item('cpu')]},
      {id: 'extensions', items: [{id: 'memory', form: 'area', size: 'medium', width: '2/3'}]}
    ]
  });
  await page.goto('/#/activity');
  await open(page);
  // Download, upload and connections fill nine tenths of the row; latency and CPU start a row with three fifths left.
  const hint = page.locator("[data-profile='metrics'] ~ .rp-dashboard-gap");
  await expect(hint).toHaveCount(1);
  await expect(hint).toHaveText('3/5 remaining');
  const cpu = await box(tile(page, 'cpu'));
  const space = await box(hint);
  expect(space.x).toBeGreaterThan(cpu.x + cpu.width);
  expect(Math.abs(space.y - cpu.y)).toBeLessThanOrEqual(1);
  // Two thirds is wider than the space: over it, the space refuses the card and says why, and the drop changes nothing.
  await tile(page, 'memory').hover();
  const wide = await box(tile(page, 'memory').locator('[slot="drag"]'));
  await page.mouse.move(wide.x + wide.width / 2, wide.y + wide.height / 2);
  await page.mouse.down();
  await page.mouse.move(wide.x + 20, wide.y + 20, {steps: 4});
  await page.mouse.move(space.x + space.width / 2, space.y + space.height / 2, {steps: 12});
  await expect(hint).toHaveAttribute('data-refused');
  await expect(hint.getByRole('status')).toHaveText('Too wide for this space');
  await page.mouse.up();
  await expect(page.locator("[data-profile='extensions'] > [data-module='memory']")).toHaveCount(1);
  await expect(hint).not.toHaveAttribute('data-refused');
  await tile(page, 'download').hover();
  const drag = await box(tile(page, 'download').locator('[slot="drag"]'));
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(drag.x + 20, drag.y + 20, {steps: 4});
  await page.mouse.move(space.x + space.width / 2, space.y + space.height / 2, {steps: 12});
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['upload', 'connections', 'latency', 'cpu', 'download']);
});

test("a phone resizes height only, by the handle's keys", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/activity');
  const cpu = tile(page, 'cpu');
  await expect(cpu.locator('.rp-tile-body')).toBeVisible();
  await open(page);
  await expect(cpu.getByRole('slider', {name: 'Resize width', exact: true})).toBeHidden();
  await focusHandle(page, 'cpu', 'Resize height');
  await page.keyboard.press('ArrowDown');
  await expect(cpu).toHaveAttribute('data-height', 'tall');
});

// The chosen card takes a width no wider than its Auto footprint, so nothing else needs to move. Quick's 3:2:2 and
// traffic's 2:1 tracks share their gaps in proportion, as the fraction grid must too. Status's narrowest width, a
// third, is wider than its two sevenths, so it starts a row and the row it left may end higher.
for (const [profile, id, width, choice] of [
  ['metrics', 'upload', 1440, '1/5'],
  ['metrics', 'upload', 1280, '1/5'],
  ['metrics', 'upload', 1024, '1/3'],
  ['metrics', 'upload', 768, '1/3'],
  ['quick', 'status', 1440, '1/3'],
  ['quick', 'status', 1180, '1/3'],
  ['traffic', 'outbounds', 1280, '1/3'],
  ['traffic', 'outbounds', 1180, '1/3'],
  ['traffic', 'outbounds', 1024, '1/3']
] as const)
  test(`choosing one card's width keeps every other Auto card in its section where it was and as large: ${profile} at ${width} px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/#/activity');
    await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
    await open(page);
    const before = await boxes(page, profile);
    await settings(page, id);
    await pick(page, 'Width', choice);
    await close(page);
    await expect(tile(page, id)).toHaveAttribute('data-width', choice);
    await expect(page.locator(`[data-profile='${profile}']`)).toHaveAttribute('data-grid', 'fraction');
    const after = await boxes(page, profile);
    const kept = (value: number[]) => (profile === 'quick' ? value.slice(0, 3) : value);
    for (const other of Object.keys(before)) if (other !== id) expect(kept(after[other]), other).toEqual(kept(before[other]));
  });

test("a row hint measures a card at the width the hint's section gives it", async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const item = (id: string, extra: object = {}) => ({id, form: id === 'latency' ? 'kv' : 'sparkline', size: 'medium', ...extra});
  await seed(page, {
    version: 3,
    sections: [
      {id: 'metrics', items: ['download', 'upload', 'connections', 'latency', 'cpu'].map(id => item(id))},
      {id: 'extensions', items: [item('download', {instance: 'download-2', width: '1/4'}), {id: 'memory', form: 'area', size: 'medium', width: '1/2'}]}
    ]
  });
  await page.goto('/#/activity');
  await open(page);
  const hint = page.locator("[data-profile='extensions'] ~ .rp-dashboard-gap");
  await expect(hint).toHaveText('1/4 remaining');
  // CPU is a fifth of the metrics row but a third of the extensions row, so the quarter left refuses it.
  await tile(page, 'cpu').hover();
  const drag = await box(tile(page, 'cpu').locator('[slot="drag"]'));
  const space = await box(hint);
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(drag.x + 20, drag.y + 20, {steps: 4});
  await page.mouse.move(space.x + space.width / 2, space.y + space.height / 2, {steps: 12});
  await expect(hint).toHaveAttribute('data-refused');
  await page.mouse.up();
  await expect(page.locator("[data-profile='metrics'] > [data-module='cpu']")).toHaveCount(1);
});

test('in the editor a card whose content grows grows its cell and covers no other card', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const item = (id: string) => ({id, form: id === 'sourceHealth' ? 'kv' : 'sparkline', size: 'medium', width: '1/2'});
  await seed(page, {version: 3, sections: [{id: 'extensions', items: [item('sourceHealth'), item('cpu'), item('connections')]}]});
  await page.goto('/#/activity');
  await open(page);
  const card = tile(page, 'sourceHealth').locator('.rp-card').first();
  await expect(card).toBeVisible();
  // A style change on a card with no chart is no DOM change: only the card's own size tells packing.
  await card.evaluate(node => ((node as HTMLElement).style.minHeight = '480px'));
  await expect
    .poll(async () => {
      const grown = await box(card);
      const cell = await box(tile(page, 'sourceHealth'));
      const others = await Promise.all(['cpu', 'connections'].map(id => box(tile(page, id))));
      const covered = others.some(other => other.x < grown.x + grown.width && grown.x < other.x + other.width && other.y < grown.y + grown.height);
      return grown.height > 400 && cell.y + cell.height >= grown.y + grown.height - 1 && !covered;
    })
    .toBe(true);
});

test('a value tile reflows by size: a chosen width widens its sparkline, a tall tile stacks it under the value', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const item = (id: string, extra: object) => ({id, form: 'sparkline', size: 'medium', ...extra});
  await seed(page, {
    version: 3,
    sections: [
      {
        id: 'metrics',
        items: [
          item('download', {width: '1/4'}),
          item('upload', {width: '1/2'}),
          item('cpu', {width: '1/2', height: 'tall'}),
          item('connections', {width: '1/2'})
        ]
      }
    ]
  });
  await page.goto('/#/activity');
  const part = async (id: string, selector: string) => box(tile(page, id).locator(selector).first());
  await expect(tile(page, 'connections').locator('.rp-spark svg')).toBeVisible();
  // Standard height: the sparkline fills the line after the value, so a half has the wider one.
  for (const id of ['download', 'upload']) {
    await expect(tile(page, id)).toHaveAttribute('data-tile', 'inline');
    const body = await part(id, '.rp-tile-body');
    const spark = await part(id, '.rp-spark');
    const value = await part(id, '.rp-tile-val');
    expect(Math.abs(body.x + body.width - (spark.x + spark.width)), id).toBeLessThanOrEqual(1);
    expect(spark.x - (value.x + value.width), id).toBeLessThanOrEqual(13);
  }
  const quarter = await part('download', '.rp-spark');
  const half = await part('upload', '.rp-spark');
  expect(half.width).toBeGreaterThan(quarter.width * 2);
  expect(Math.abs(half.height - quarter.height)).toBeLessThanOrEqual(1);
  // Tall: the tile stacks, its sparkline spanning the card under the value and filling the height; a standard tile in
  // its row stays on one line.
  await expect(tile(page, 'connections')).toHaveAttribute('data-tile', 'inline');
  for (const id of ['cpu']) {
    await expect(tile(page, id)).toHaveAttribute('data-tile', 'stacked');
    const body = await part(id, '.rp-tile-body');
    const spark = await part(id, '.rp-spark');
    const value = await part(id, '.rp-tile-val');
    expect(Math.abs(spark.width - body.width), id).toBeLessThanOrEqual(1);
    expect(spark.y, id).toBeGreaterThanOrEqual(value.y + value.height);
    expect(Math.abs(body.y + body.height - (spark.y + spark.height)), id).toBeLessThanOrEqual(1);
    expect(spark.height, id).toBeGreaterThan(half.height * 1.8);
  }
  const font = (id: string) =>
    tile(page, id)
      .locator('.rp-big')
      .evaluate(node => getComputedStyle(node).fontSize);
  expect(await font('cpu')).toBe(await font('download'));
});

test('the gallery shows each size of a widget and adds it at the size chosen', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await open(page);
  await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  const gallery = page.getByRole('dialog', {name: 'Widget gallery'});
  const item = gallery.locator(".rp-widget-gallery-tile[data-module='connections']");
  const thumbs = item.locator('.rp-widget-gallery-preset');
  await expect(thumbs).toHaveCount(4);
  await expect(thumbs.locator('.rp-label')).toHaveText(['1/4', '1/2', 'Full width', '1/2, Tall']);
  const [quarter, half, full] = await Promise.all([0, 1, 2].map(i => box(thumbs.nth(i))));
  const frame = await box(item.locator('.rp-widget-gallery-presets'));
  expect(quarter.width).toBeLessThan(half.width);
  expect(Math.abs(full.width - frame.width)).toBeLessThanOrEqual(1);
  // Each thumbnail is the real card, drawn at the size it stands for.
  await expect(thumbs.nth(3).locator('.rp-dashboard-cell[data-height="tall"] .rp-tile-body')).toBeVisible();
  await item.getByRole('button', {name: 'Add Active connections at 1/2, Tall', exact: true}).click();
  await gallery.getByRole('button', {name: 'Close', exact: true}).click();
  const added = page.locator("[data-profile='extensions'] > [data-module='connections']");
  await expect(added).toHaveAttribute('data-width', '1/2');
  await expect(added).toHaveAttribute('data-height', 'tall');
  // A list's thumbnail shows the rows the card will.
  await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  const list = gallery.locator(".rp-widget-gallery-tile[data-module='nodeLatency'] .rp-widget-gallery-preset").filter({hasText: '1/2, 8 rows'});
  const rows = ':is(.rp-markerplot [data-row], .rp-list > .rp-kv)';
  await expect(list.locator(rows).first()).toBeVisible();
  const shown = await list.locator(rows).count();
  expect(shown).toBeGreaterThan(3);
  await gallery.getByRole('button', {name: 'Add Node latency at 1/2, 8 rows', exact: true}).click();
  await gallery.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(page.locator("[data-profile='extensions'] > [data-module='nodeLatency']").last().locator(rows)).toHaveCount(shown);
});

test('each removal keeps its own Undo until its card could no longer come back', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const cpu = (instance?: string) => ({id: 'cpu', form: 'sparkline', size: 'medium', ...(instance ? {instance} : {})});
  await seed(page, {
    version: 3,
    sections: [
      {id: 'metrics', items: [cpu()]},
      {id: 'extensions', items: [cpu('cpu-2'), cpu('cpu-3')]}
    ]
  });
  await page.goto('/#/activity');
  await open(page);
  for (const id of ['cpu-2', 'cpu-3']) {
    await tile(page, id).hover();
    await tile(page, id).getByRole('button', {name: 'Remove CPU usage', exact: true}).click();
    await expect(tile(page, id)).toHaveCount(0);
  }
  const undo = page.locator('.rp-toasts').getByRole('button', {name: 'Undo', exact: true, includeHidden: true});
  await expect(undo).toHaveCount(2);
  // A new CPU card takes one freed place; undoing one removal fills the last, so the other Undo goes away.
  await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  const gallery = page.getByRole('dialog', {name: 'Widget gallery'});
  await gallery.getByRole('button', {name: 'Add CPU usage at 1/4', exact: true}).click();
  await gallery.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(undo).toHaveCount(2);
  await page.getByRole('button', {name: 'Undo', exact: true}).first().click();
  const cards = page.locator(".rp-dashboard-cell[data-module='cpu']");
  await expect(cards).toHaveCount(3);
  await expect(undo).toHaveCount(0);
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect(cards).toHaveCount(3);
});

test('removes a card from its tools in one press, says so and undoes it; at rest the tools leave every title whole', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
  await open(page);
  // At rest no tools cover a title, and no title truncates; a narrow latency caption leaves the view by design.
  const tools = tile(page, 'connections').locator('.rp-dashboard-tools');
  await expect(tools).toHaveCSS('opacity', '0');
  const cut = await page
    .locator('.rp-dash-section .rp-card :is(.rp-tile-caption, .rp-truncate, .rp-h3)')
    .evaluateAll(nodes =>
      nodes
        .filter(node => getComputedStyle(node).overflow !== 'visible' && node.clientWidth > 1 && node.scrollWidth > node.clientWidth + 1)
        .map(node => node.textContent)
    );
  expect(cut).toEqual([]);
  await tile(page, 'connections').hover();
  await expect(tools).toHaveCSS('opacity', '1');
  await tile(page, 'connections').getByRole('button', {name: 'Remove Active connections', exact: true}).click();
  await expect(tile(page, 'connections')).toHaveCount(0);
  const notice = page.getByRole('alertdialog').filter({hasText: 'Active connections removed'});
  await expect(notice).toBeVisible();
  await notice.getByRole('button', {name: 'Undo', exact: true}).click();
  await expect.poll(() => order(page)).toEqual(['download', 'upload', 'connections', 'latency', 'cpu']);
  await expect(notice).toHaveCount(0);
});

test('after a removal the next card under the mouse shows no tools until the mouse moves', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
  await open(page);
  await expect(page.locator('.rp-dashboard-tools').first()).toBeAttached();
  const [first, second] = (await order(page)).slice(0, 2) as string[];
  await tile(page, first).hover();
  const remove = await box(tile(page, first).getByRole('button', {name: /^Remove /}));
  const [x, y] = [remove.x + remove.width / 2, remove.y + remove.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(tile(page, first)).toHaveCount(0);
  // A second press at the same spot, with no movement in between, finds nothing to remove.
  await page.mouse.down();
  await page.mouse.up();
  await expect(tile(page, second)).toHaveCount(1);
  await expect(tile(page, second).locator('.rp-dashboard-tools')).toHaveCSS('opacity', '0');
  await page.mouse.move(x + 6, y + 6);
  await expect(tile(page, second).locator('.rp-dashboard-tools')).toHaveCSS('opacity', '1');
});

// What a card shows: its visible words outside its charts, whose ticks follow the live data, with numbers masked, and
// its controls by role and name.
const showing = (page: Page) =>
  page.locator('.rp-dash-section > .rp-dashboard-cell').evaluateAll(cells =>
    Object.fromEntries(
      cells.map(cell => {
        const card = cell.querySelector('.rp-card')!;
        const mask = (text: string) => text.replace(/[\d.,:]+/g, '#');
        const seen = (node: Element) => node.checkVisibility({visibilityProperty: true, opacityProperty: true}) && node.getBoundingClientRect().width > 0;
        const words: string[] = [];
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent!.trim();
          if (text && seen(node.parentElement!) && !node.parentElement!.closest('svg')) words.push(mask(text));
        }
        const controls = [...card.querySelectorAll('button, a[href], input, select, [role]')]
          .filter(seen)
          .map(node => `${node.getAttribute('role') ?? node.tagName.toLowerCase()} ${mask(node.getAttribute('aria-label') ?? '')}`);
        return [(cell as HTMLElement).dataset.instance, {words, controls}];
      })
    )
  );
// Every card drawn with its content: scrolled into view once and past its chart placeholder.
const settle = async (page: Page) => {
  for (const cell of await page.locator('.rp-dash-section > .rp-dashboard-cell').all()) {
    await cell.scrollIntoViewIfNeeded();
    await expect(cell.locator('.rp-chart-wait')).toHaveCount(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
};
for (const width of [1280, 390])
  test(`edit mode shows every card's content and controls as the page does at ${width} px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/activity');
    await expect(page.locator("[data-profile='details'] .rp-card")).toHaveCount(3);
    await settle(page);
    const view = await showing(page);
    expect(Object.keys(view).length).toBeGreaterThanOrEqual(13);
    await open(page);
    await expect(page.locator('.rp-dashboard-tools')).toHaveCount(Object.keys(view).length);
    await settle(page);
    expect(await showing(page)).toEqual(view);
  });

// The editor draws its own cells, so a chart there is drawn from the history its card already holds: no read comes in
// while the clock is held, and every chart still has its line. The latency line is the card's own record of node reads.
const charted = ['download', 'upload', 'connections', 'latency', 'cpu', 'history', 'memory'];
const charts = (page: Page) =>
  page.evaluate(
    ids =>
      Object.fromEntries(
        ids.map(id => {
          const curve = document.querySelector(`.rp-dashboard-cell[data-instance="${id}"] .rp-area-curve`);
          const plot = curve?.closest('svg')?.getBoundingClientRect();
          const points = (curve?.getAttribute('d')?.match(/[MLC]/g) ?? []).length;
          return [id, plot && plot.width > 0 && plot.height > 0 && points >= 2 ? 'drawn' : `missing ${points} ${plot?.width}x${plot?.height}`];
        })
      ),
    charted
  );
const drawn = Object.fromEntries(charted.map(id => [id, 'drawn']));
const holdReads = async (page: Page) => {
  await page.clock.install({time: new Date('2026-09-16T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-16T00:00:01Z'));
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'latency').locator('.rp-big')).toHaveText(/ms/);
  await page.clock.runFor(61000);
  await expect.poll(() => charts(page)).toEqual(drawn);
};
// The editor runs on timers; a quarter second at a time stays far short of the next node read, thirty seconds on.
const tick = (page: Page, check: () => Promise<void>) =>
  expect(async () => {
    await page.clock.runFor(250);
    await check();
  }).toPass();
// A restored session loads the Activity chunk with the shell; a tab without a profile first asks whether it is hosted,
// and the page would suspend on the chunk behind a paused clock.
test.describe(() => {
  test.use({storage: {'doona-api': 'mock'}, signedIn: 'legacy'});
  test('every chart a card draws on the page it draws in the editor, from the history it holds', async ({page}) => {
    await holdReads(page);
    await open(page);
    const tools = page.locator('.rp-dashboard-tools');
    await tick(page, async () => {
      await expect(tools.first()).toBeVisible({timeout: 100});
      await expect(page.locator('.rp-chart-wait')).toHaveCount(0, {timeout: 100});
    });
    expect(await charts(page)).toEqual(drawn);
    await page.getByRole('button', {name: 'Done', exact: true}).click();
    await tick(page, () => expect(tools).toHaveCount(0, {timeout: 100}));
    expect(await charts(page)).toEqual(drawn);
  });
  // A first visit has no history: the CPU and latency lines draw from the first two reads, within two seconds of the
  // page opening, on the page and in the editor.
  test('a first visit draws the CPU and latency lines within two seconds, on the page and in the editor', async ({page}) => {
    const first = (state: Record<string, string>) => ({cpu: state.cpu, latency: state.latency});
    await page.clock.install({time: new Date('2026-09-16T00:00:00Z')});
    await page.clock.pauseAt(new Date('2026-09-16T00:00:00.100Z'));
    await page.setViewportSize({width: 1280, height: 1000});
    await page.goto('/#/activity');
    await expect(tile(page, 'latency').locator('.rp-big')).toHaveText(/ms/);
    await page.clock.runFor(1900);
    await expect.poll(async () => first(await charts(page))).toEqual({cpu: 'drawn', latency: 'drawn'});
    await open(page);
    await tick(page, () => expect(page.locator('.rp-dashboard-tools').first()).toBeVisible({timeout: 100}));
    expect(first(await charts(page))).toEqual({cpu: 'drawn', latency: 'drawn'});
  });
  test('the latency card draws its line at every height, in the editor and on the page', async ({page}) => {
    await holdReads(page);
    await page.clock.resume();
    const line = tile(page, 'latency').locator('.rp-spark');
    for (const step of ['Short', 'Tall', 'Standard']) {
      await open(page);
      await choose(page, [['latency', 'Height', step]]);
      await expect(tile(page, 'latency')).toHaveAttribute('data-height', step.toLowerCase());
      for (const mode of ['editor', 'page']) {
        if (mode === 'page') await page.getByRole('button', {name: 'Done', exact: true}).click();
        const plot = await box(line);
        expect(plot.width * plot.height, `${step} ${mode}`).toBeGreaterThan(0);
        expect((await charts(page)).latency, `${step} ${mode}`).toBe('drawn');
      }
    }
  });
});

// One card's height is its own: its neighbours keep theirs, and the card that follows takes the space beside it.
test('one card set tall or dragged taller grows alone and the next card fills the space beside it', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const item = (id: string) => ({id, form: id === 'latency' ? 'kv' : 'sparkline', size: 'medium'});
  await seed(page, {version: 3, sections: [{id: 'metrics', items: ['download', 'upload', 'connections', 'cpu', 'latency', 'memory'].map(item)}]});
  await page.goto('/#/activity');
  await expect(tile(page, 'memory').locator('.rp-card')).toBeVisible();
  await open(page);
  const heights = async () => {
    const all = await boxes(page, 'metrics');
    return Object.fromEntries(Object.entries(all as Record<string, number[]>).map(([id, [, , , h]]) => [id, h]));
  };
  await expect(tile(page, 'memory').locator('.rp-dashboard-tools')).toHaveCount(1);
  const before = await heights();
  await choose(page, [['download', 'Height', 'Tall']]);
  await expect(tile(page, 'download')).toHaveAttribute('data-height', 'tall');
  await expect.poll(async () => (await heights()).download).toBeGreaterThan(before.download + 20);
  const after = await heights();
  for (const id of ['upload', 'connections', 'cpu', 'latency']) expect(Math.abs(after[id] - before[id]), id).toBeLessThanOrEqual(1);
  const download = await box(tile(page, 'download'));
  const memory = await box(tile(page, 'memory'));
  expect(memory.y).toBeLessThan(download.y + download.height);
  // A drag on one card's bottom edge changes that card alone.
  const upload = tile(page, 'upload');
  await upload.hover();
  const handle = await box(upload.getByRole('slider', {name: 'Resize height', exact: true}));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 80, {steps: 8});
  await page.mouse.up();
  await expect(upload).toHaveAttribute('data-height', 'tall');
  await expect.poll(async () => (await heights()).upload).toBeGreaterThan(after.upload + 20);
  const dragged = await heights();
  for (const id of ['connections', 'cpu', 'latency']) expect(Math.abs(dragged[id] - before[id]), id).toBeLessThanOrEqual(1);
});

// A value tile's smallest height is one cell: value and sparkline on one line, as tall as the page's short tile.
test('a value tile dragged to its smallest is one cell high and the tools leave its caption whole', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  const cell = tile(page, 'connections');
  await expect(cell.locator('.rp-tile-body')).toBeVisible();
  await open(page);
  await cell.hover();
  const handle = await box(cell.getByRole('slider', {name: 'Resize height', exact: true}));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 300, {steps: 10});
  await page.mouse.up();
  await expect(cell).toHaveAttribute('data-height', 'short');
  await expect(cell).toHaveAttribute('data-tile', 'inline');
  const value = await box(cell.locator('.rp-tile-val'));
  const spark = await box(cell.locator('.rp-spark'));
  expect(spark.x).toBeGreaterThanOrEqual(value.x + value.width);
  expect(spark.y).toBeLessThan(value.y + value.height);
  await cell.hover();
  const tools = await box(cell.locator('.rp-dashboard-tools'));
  const caption = cell.locator('.rp-tile-caption');
  const words = await box(caption);
  expect(words.y >= tools.y + tools.height || words.x + words.width <= tools.x).toBe(true);
  expect(await caption.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const editing = (await box(cell)).height;
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await expect(cell.locator('.rp-dashboard-tools')).toHaveCount(0);
  expect(Math.abs((await box(cell)).height - editing)).toBeLessThanOrEqual(2);
});

// A chart takes the card's content width and the height its step gives it, in the editor and on the page alike.
test('a chart set tall, by settings or by its edge, fills the card it grew', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  const card = tile(page, 'history');
  await expect(card.locator('.rp-legend + div svg')).toBeVisible();
  const plot = () =>
    card.locator('.rp-card').evaluate(node => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const chart = node.querySelector('.rp-legend + div')!.getBoundingClientRect();
      return {
        width: chart.width,
        inner:
          box.width -
          Number.parseFloat(style.paddingInlineStart) -
          Number.parseFloat(style.paddingInlineEnd) -
          2 * Number.parseFloat(style.borderInlineStartWidth),
        height: chart.height,
        gap: box.bottom - Number.parseFloat(style.paddingBlockEnd) - Number.parseFloat(style.borderBlockEndWidth) - chart.bottom
      };
    });
  const check = async () => {
    await expect.poll(async () => (await plot()).height).toBeGreaterThanOrEqual(2 * 120 - 2);
    const chart = await plot();
    expect(Math.abs(chart.width - chart.inner)).toBeLessThanOrEqual(2);
    expect(Math.abs(chart.gap)).toBeLessThanOrEqual(2);
  };
  await open(page);
  await choose(page, [['history', 'Height', 'Tall']]);
  await check();
  await choose(page, [['history', 'Height', 'Standard']]);
  await expect(card).toHaveAttribute('data-height', 'standard');
  await card.hover();
  const handle = await box(card.getByRole('slider', {name: 'Resize height', exact: true}));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 80, {steps: 8});
  await page.mouse.up();
  await expect(card).toHaveAttribute('data-height', 'tall');
  await check();
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await expect(card.locator('.rp-dashboard-tools')).toHaveCount(0);
  await check();
});

// The editor's controls take the library's sizes: the page row is L, a card's tools and every overlay are M.
test('the editor page row, card tools, settings and gallery are all M, segmented controls included', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
  await open(page);
  // Each visible control once: a segmented group counts as one control, not as the buttons inside it, and a gallery
  // thumbnail's inert scaled preview counts none.
  const sizes = (scope: Locator) =>
    scope
      .locator(':is(.rp-btn, .rp-seg, .rp-selectbtn):not(.rp-seg .rp-btn, [inert] *)')
      .evaluateAll(nodes =>
        nodes
          .filter(node => node.checkVisibility({visibilityProperty: true}))
          .map(node => [node.getAttribute('data-size'), Math.round(node.getBoundingClientRect().height)])
      );
  const row = page.locator('.rp-page-actions');
  await expect(row.getByRole('button', {name: 'Done', exact: true})).toBeVisible();
  expect(new Set((await sizes(row)).map(String))).toEqual(new Set(['M,32']));
  await tile(page, 'cpu').hover();
  const tools = tile(page, 'cpu').locator('.rp-dashboard-tools');
  await expect(tools).toHaveCSS('opacity', '1');
  expect(new Set((await sizes(tools)).map(([, size]) => size))).toEqual(new Set([32]));
  expect((await sizes(tools)).every(([size]) => size === null || size === 'M')).toBe(true);
  // In the settings every segmented control is M, as everywhere, and so are the other controls.
  const dialog = await settings(page, 'cpu');
  const all = await sizes(dialog);
  const segmented = await sizes(dialog.locator('.rp-segfit'));
  expect(segmented.length).toBeGreaterThan(0);
  expect(new Set(segmented.map(String))).toEqual(new Set(['M,32']));
  expect(all.filter(([size]) => size === 'L')).toHaveLength(0);
  expect(new Set(all.map(String))).toEqual(new Set(['M,32']));
  await close(page);
  await row.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  const gallery = page.getByRole('dialog');
  await expect(gallery.locator('.rp-btn').first()).toBeVisible();
  expect(new Set((await sizes(gallery)).map(String))).toEqual(new Set(['M,32']));
});

for (const width of [1280, 390])
  test(`the gallery's add buttons share one line in each row of items at ${width} px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/activity');
    await open(page);
    await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
    const gallery = page.getByRole('dialog', {name: 'Widget gallery'});
    const tiles = gallery.locator('.rp-widget-gallery-tile');
    await expect(tiles.first()).toBeVisible();
    // Every item draws its thumbnails once it nears the viewport, so each is brought near before measuring.
    for (const item of await tiles.all()) await item.scrollIntoViewIfNeeded();
    await expect(gallery.locator('.rp-widget-gallery-preset').first()).toBeVisible();
    const rows = await tiles.evaluateAll(items => {
      const byRow = new Map<number, Array<{top: number; height: number}>>();
      for (const item of items) {
        const tile = item.getBoundingClientRect();
        const add = item.querySelector(':scope > .rp-cluster button')!.getBoundingClientRect();
        const row = byRow.get(Math.round(tile.top)) ?? [];
        row.push({top: add.top - tile.top, height: add.height});
        byRow.set(Math.round(tile.top), row);
      }
      return [...byRow.values()];
    });
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      for (const add of row) {
        expect(Math.abs(add.top - row[0].top), JSON.stringify(row)).toBeLessThanOrEqual(0.5);
        expect(add.height).toBe(row[0].height);
      }
    }
  });

// A full row of Auto control cards first gives each card its line whole, then shares the rest by the footprints (3:2:2
// here), so the row is one line wherever every line fits; where they do not, every card in the row stacks together.
test.describe('control row zh-TW', () => {
  test.use({storage: {'doona-lang': 'zh-TW'}});
  const quick = (page: Page) => page.locator("[data-profile='quick']");
  const lines = (page: Page) =>
    quick(page)
      .locator('.rp-control-card > .rp-row')
      .evaluateAll(rows =>
        rows.map(row => {
          const box = row.getBoundingClientRect();
          const title = row.firstElementChild!.getBoundingClientRect();
          const controls = row.lastElementChild!.getBoundingClientRect();
          const label = row.querySelector('.rp-truncate');
          return {
            top: box.top,
            centres: Math.abs(title.top + title.height / 2 - controls.top - controls.height / 2),
            end: Math.abs(box.right - controls.right),
            cut: label !== null && label.scrollWidth > label.clientWidth,
            stacked: controls.top >= title.bottom - 1
          };
        })
      );
  const cells = (page: Page) =>
    quick(page)
      .locator(':scope > .rp-dashboard-cell')
      .evaluateAll(nodes => nodes.map(node => ({id: (node as HTMLElement).dataset.instance, left: node.getBoundingClientRect().left})));
  for (const width of [1440, 1475])
    test(`keeps the first row on one line at ${width} px`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      await page.goto('/#/activity');
      await expect(quick(page)).toHaveAttribute('data-controls', 'inline');
      await expect(quick(page)).toHaveAttribute('data-fit', '');
      const order = await cells(page);
      expect(order.map(cell => cell.id)).toEqual(['mode', 'global', 'status']);
      expect(order[0].left).toBeLessThan(order[1].left);
      expect(order[1].left).toBeLessThan(order[2].left);
      const all = await lines(page);
      expect(all).toHaveLength(3);
      for (const line of all) {
        expect(Math.abs(line.top - all[0].top)).toBeLessThanOrEqual(1);
        expect(line.centres).toBeLessThanOrEqual(1);
        expect(line.end).toBeLessThanOrEqual(1);
        expect(line.cut).toBe(false);
      }
    });
  // At M the row still fits at 1280 px; at 1200 px, with the sidebar shown, it does not.
  test('stacks every card of the first row together when the lines do not fit, at 1200 px', async ({page}) => {
    await page.setViewportSize({width: 1200, height: 900});
    await page.goto('/#/activity');
    await expect(quick(page)).toHaveAttribute('data-controls', 'stacked');
    await expect(quick(page)).not.toHaveAttribute('data-fit');
    expect((await cells(page)).map(cell => cell.id)).toEqual(['mode', 'global', 'status']);
    const all = await lines(page);
    expect(all).toHaveLength(3);
    for (const line of all) {
      expect(line.stacked).toBe(true);
      expect(line.cut).toBe(false);
    }
  });
});

test.describe('narrow cards at 1280', () => {
  test.use({viewport: {width: 1280, height: 900}});
  test('a donut legend at 1/3 keeps each name on the line of its value and share', async ({page}) => {
    const donuts = ['connectionOutbounds', 'dnsAnswers', 'connectionNetworks'];
    await seed(page, {version: 3, sections: [{id: 'extensions', items: donuts.map(id => ({id, form: 'donut', size: 'medium', width: '1/3'}))}]});
    await page.goto('/#/activity');
    for (const id of donuts) {
      const rows = page.locator(`.rp-dashboard-cell[data-instance="${id}"] .rp-donut .r`);
      await expect(rows.first()).toBeVisible();
      const split = await rows.evaluateAll(
        list =>
          list.filter(row => {
            const parts = [...row.children].filter(child => child.tagName === 'SPAN').map(child => child.getBoundingClientRect());
            const name = row.querySelector('.n')!;
            const lines = new Set([...name.getClientRects()].map(rect => Math.round(rect.top))).size;
            return lines > 1 || parts.some(part => part.top >= parts[0].bottom || part.bottom <= parts[0].top);
          }).length
      );
      expect(split, id).toBe(0);
    }
  });
  test('an area card at 1/5 keeps its time labels apart', async ({page}) => {
    await seed(page, {version: 3, sections: [{id: 'extensions', items: [{id: 'download', form: 'area', size: 'medium', width: '1/5', height: 'standard'}]}]});
    await page.goto('/#/activity');
    const ticks = page.locator('.rp-dashboard-cell[data-instance="download"] g:not(.rp-area-y-ticks) > text.rp-area-tick');
    await expect(ticks.first()).toBeVisible();
    const overlap = await ticks.evaluateAll(labels => {
      const boxes = labels.map(label => label.getBoundingClientRect());
      return boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right && b.left < a.right));
    });
    expect(overlap).toBe(false);
  });
});

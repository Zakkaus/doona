import {test, expect, box, expectTextInside, fulfillStream, loadCatalogues, mockBackend, settle as settleNetwork, settleFrames} from './fixtures';
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
  // A control that does not fit collapses to its picker in the frame after it mounts.
  await settleFrames(page, 1);
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

const edit = async (page: Page) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-card')).toBeVisible();
  await open(page);
  await expect(tile(page, 'cpu').locator('.rp-dashboard-tools')).toBeVisible();
};
const moveUp = async (page: Page, id: string) => {
  await (await settings(page, id)).getByRole('button', {name: 'Move up', exact: true}).click();
  await close(page);
};

test('drags a card by its handle into a new place and moves it by keyboard', async ({page}) => {
  await edit(page);
  // A pointer drag by the handle: the gap-line indicator shows the slot, and the drop moves the card there.
  const handle = tile(page, 'download').locator('[slot="drag"]');
  const target = await box(tile(page, 'connections'));
  const start = await box(handle);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 20, {steps: 4});
  await page.mouse.move(target.x + target.width * 0.85, target.y + target.height / 2, {steps: 12});
  // A drop lands in the slot of the last dragover, so wait for the slot after connections, not for any slot.
  await expect(page.locator('.rp-dashboard-cell[data-instance="connections"] + .rp-canvas-drop[data-drop-target]')).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['upload', 'connections', 'download', 'latency', 'cpu']);
  // The keyboard: Enter picks the card up, an arrow chooses the slot, Enter drops it.
  await tile(page, 'cpu').locator('[slot="drag"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rp-canvas-drop[data-drop-target]')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect.poll(() => order(page)).not.toEqual(['upload', 'connections', 'download', 'latency', 'cpu']);
});

test('one resize changes only that card width', async ({page}) => {
  await edit(page);
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
});

test('Cancel asks before dropping a changed draft and Done keeps the draft through a reload', async ({page}) => {
  await edit(page);
  await moveUp(page, 'cpu');
  await expect.poll(() => order(page)).toEqual(['download', 'upload', 'connections', 'cpu', 'latency']);
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect.poll(() => order(page)).toEqual(['download', 'upload', 'connections', 'latency', 'cpu']);
  await open(page);
  await moveUp(page, 'cpu');
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(['download', 'upload', 'connections', 'cpu', 'latency']);
});

test('Restore defaults changes the draft only', async ({page}) => {
  await edit(page);
  await moveUp(page, 'cpu');
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await open(page);
  await page.getByRole('button', {name: 'Restore defaults', exact: true}).click();
  await expect.poll(() => order(page)).toEqual(['download', 'upload', 'connections', 'latency', 'cpu']);
  await page.getByRole('button', {name: 'Done', exact: true}).click();
});

test('the gallery adds a card to the extensions section and counts placed instances', async ({page}) => {
  await page.goto('/#/activity');
  await open(page);
  await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  const gallery = page.getByRole('dialog', {name: 'Widget gallery'});
  const item = gallery.locator(".rp-widget-gallery-tile[data-module='sourceHealth']");
  await expect(item.getByRole('heading', {name: 'Source health', exact: true})).toBeVisible();
  await expect(gallery.locator(".rp-widget-gallery-tile[data-module='providerBudget']").getByRole('heading', {name: 'Subscription quota'})).toBeVisible();
  await expect(page.locator(".rp-dashboard-cell[data-module='providerBudget']")).toHaveCount(0);
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

  test('one feature off is the only link, on the status line', async ({page}) => {
    await page.goto('/#/activity');
    const summary = translate('zh-TW', 'act.limited', {n: 1});
    const links = tile(page, 'status').getByRole('link');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveText(summary);
    await expect(links).toHaveAccessibleName(summary);
    // At 1440px the status line fits its third: the light at the start and the link at the end of one line.
    const line = await tile(page, 'status')
      .locator('.rp-control-card > .rp-row')
      .evaluate(row => {
        const light = row.firstElementChild!.getBoundingClientRect();
        const link = row.lastElementChild!.getBoundingClientRect();
        return {centres: Math.abs(light.top + light.height / 2 - link.top - link.height / 2), end: Math.abs(row.getBoundingClientRect().right - link.right)};
      });
    expect(line.centres).toBeLessThanOrEqual(1);
    expect(line.end).toBeLessThanOrEqual(1);
    await links.click();
    await expect(page).toHaveURL(/#\/overview\?card=limits$/);
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

  test('the Settings switch hides the count on the status card and shows it again', async ({page}) => {
    const field = page.locator('[data-setting="limitNotice"]');
    const toggle = field.getByRole('switch', {name: translate('zh-TW', 'settings.limitNotice'), exact: true});
    // The input is hidden under its track, so a click goes to the switch as drawn.
    const flip = () => field.locator('.rp-switch').click();
    const links = tile(page, 'status').getByRole('link');
    await page.goto('/#/activity');
    await expect(links).toHaveText(translate('zh-TW', 'act.limited', {n: 1}));
    await page.goto('/#/settings?tab=appearance');
    await expect(toggle).toBeChecked();
    await flip();
    await expect(toggle).not.toBeChecked();
    await page.goto('/#/activity');
    await expect(links).toHaveText(translate('zh-TW', 'act.viewDetails'));
    await page.reload();
    await expect(links).toHaveText(translate('zh-TW', 'act.viewDetails'));
    await page.goto('/#/settings?tab=appearance');
    await expect(toggle).not.toBeChecked();
    await flip();
    await expect(toggle).toBeChecked();
    await page.goto('/#/activity');
    await expect(links).toHaveText(translate('zh-TW', 'act.limited', {n: 1}));
  });
});

// A control card's title is never cut to an ellipsis: a line too narrow for its whole label shows the icon alone.
for (const lang of ['zh-TW', 'en'] as const)
  test.describe(`control card titles ${lang}`, () => {
    test.use({storage: {'doona-lang': lang}});
    test.beforeAll(loadCatalogues);
    for (const [from, to] of [
      [1100, 1500],
      [1540, 1920]
    ])
      for (const editing of [false, true])
        test(`stay whole from ${from} to ${to}px${editing ? ' while editing' : ''}`, async ({page}) => {
          await page.setViewportSize({width: from, height: 900});
          await page.goto('/#/activity');
          const cards = page.locator('[data-profile="quick"] .rp-control-card');
          await expect(cards).toHaveCount(3);
          if (editing) {
            await page.getByRole('button', {name: translate(lang, 'dashboard.edit'), exact: true}).click();
            await expect(page.locator('.rp-dashboard-body .rp-control-card')).toHaveCount(3);
          }
          for (let width = from; width <= to; width += 40) {
            await page.setViewportSize({width, height: 900});
            // A new width lays the cards out again in the next frame.
            await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
            const cut = await cards.evaluateAll(nodes =>
              nodes
                .map(node => node.querySelector(":scope > .rp-row:not([data-step='icon']) > .rp-qlabel > .rp-truncate"))
                .filter(node => node !== null && node.scrollWidth > node.clientWidth)
                .map(node => node!.textContent)
            );
            expect(cut, `${width}px`).toEqual([]);
          }
        });
  });

// A control card's line never wraps. It shows its label whole while the line fits the card, then without the label's
// icon, then the icon alone, whose tooltip and the card's name keep the words; the labels of a row share one title line
// and the cards one height.
for (const lang of ['en', 'zh-TW'])
  test.describe(`control cards ${lang}`, () => {
    test.use({storage: {'doona-lang': lang}});
    test('keep one line by their own width, a title line and a height in a row', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('.rp-control-card')).toHaveCount(3);
      for (const width of [390, 768, 1024, 1100, 1280, 1440, 1920]) {
        await page.setViewportSize({width, height: 900});
        const cards = () =>
          page.locator('.rp-control-card').evaluateAll(nodes =>
            nodes.map(node => {
              const card = node.getBoundingClientRect();
              const row = node.querySelector<HTMLElement>(':scope > .rp-row')!;
              const step = row.dataset.step;
              // The step the line needs: its parts whole, as wide as they are, against the room the card gives.
              const room = row.clientWidth;
              row.dataset.probe = '';
              const whole = row.getBoundingClientRect().width;
              const head = row.firstElementChild!;
              const icon = head.firstElementChild!.getBoundingClientRect().width + parseFloat(getComputedStyle(head).columnGap);
              delete row.dataset.probe;
              const needed = !head.matches('.rp-qlabel') ? undefined : whole <= room + 0.5 ? 'full' : whole - icon <= room + 0.5 ? 'bare' : 'icon';
              const middles = [...row.children].map(part => {
                const box = part.getBoundingClientRect();
                return box.top + box.height / 2;
              });
              // The label's words, or the light's, give the title line.
              const words = node.querySelector(":scope > .rp-row:not([data-step='icon']) > .rp-qlabel > .rp-truncate, .rp-light > span");
              const range = document.createRange();
              if (words) range.selectNodeContents(words);
              const style = getComputedStyle(node);
              const inner = card.bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth);
              return {
                top: Math.round(card.top),
                height: card.height,
                step,
                settled: step === needed,
                spread: Math.max(...middles) - Math.min(...middles),
                title: words ? range.getBoundingClientRect().top : null,
                empty: inner - row.getBoundingClientRect().bottom
              };
            })
          );
        // A new width lays the cards out again in the next frame, so the layout left from the previous width is waited out.
        await expect
          .poll(async () => {
            const all = await cards();
            return all.every(card => card.settled || card.step === undefined) && all.every(card => Math.abs(card.empty) <= 1);
          }, `${width}px`)
          .toBe(true);
        const all = await cards();
        for (const card of all) {
          expect(card.spread, `${width}px one line`).toBeLessThanOrEqual(1);
          for (const other of all.filter(other => Math.abs(other.top - card.top) <= 1)) {
            expect(Math.abs(other.height - card.height), `${width}px height`).toBeLessThanOrEqual(1);
            if (card.title !== null && other.title !== null) expect(Math.abs(other.title - card.title), `${width}px title line`).toBeLessThanOrEqual(1);
          }
        }
        // On a phone every Chinese label shows whole.
        if (lang === 'zh-TW' && width === 390) expect(all.map(card => card.step)).toEqual(['full', 'full', undefined]);
      }
    });
  });

// Width and height steps chosen in a card's settings.
const choose = async (page: Page, choices: Array<[string, string, string]>) => {
  for (const [id, label, option] of choices) {
    await settings(page, id);
    await pick(page, label, option);
    await close(page);
  }
};
const editSmall = async (page: Page) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-tile-body')).toBeVisible();
  await open(page);
  await expect(tile(page, 'cpu').locator('.rp-dashboard-tools')).toBeVisible();
};

test('sets height by settings: a value tile keeps its type', async ({page}) => {
  await editSmall(page);
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
});

test('sets height by settings: a chart takes the step', async ({page}) => {
  await editSmall(page);
  // Memory, short and tall, differ visibly in its chart.
  const chart = tile(page, 'memory').locator('.rp-activity-surface');
  await choose(page, [['memory', 'Height', 'Short']]);
  const short = await height(chart);
  await choose(page, [['memory', 'Height', 'Tall']]);
  await expect.poll(() => height(chart)).toBeGreaterThan(short * 1.5);
});

test('sets width by settings, the same width in every section, and keeps it', async ({page}) => {
  await editSmall(page);
  const memory = tile(page, 'memory');
  const download = tile(page, 'download');
  // A half in the details section is a half in the metrics section.
  await choose(page, [
    ['memory', 'Width', '1/2'],
    ['download', 'Width', '1/2']
  ]);
  expect(Math.abs((await box(memory)).width - (await box(download)).width)).toBeLessThanOrEqual(1);
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect(memory).toHaveAttribute('data-width', '1/2');
  await expect(download).toHaveAttribute('data-width', '1/2');
});

test('sets height by settings and keeps it', async ({page}) => {
  await editSmall(page);
  const memory = tile(page, 'memory');
  await choose(page, [['memory', 'Height', 'Tall']]);
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect(memory).toHaveAttribute('data-height', 'tall');
});

test('sets width by edge drag and keeps it', async ({page}) => {
  await editSmall(page);
  await choose(page, [['download', 'Width', '1/2']]);
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
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.reload();
  await expect(upload).toHaveAttribute('data-width', '1/2');
});

test('sets width and height by keys on the edge handles, and keeps them', async ({page}) => {
  await editSmall(page);
  const cpu = tile(page, 'cpu');
  await choose(page, [['cpu', 'Height', 'Tall']]);
  // An arrow on a focused handle takes the next step.
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

test('a stored width or row count a card no longer offers reads as the nearest one and the card stays', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await seed(page, {
    version: 3,
    sections: [
      {
        id: 'extensions',
        items: [
          {id: 'dnsAnswers', form: 'ranked', size: 'medium', width: 'full', rows: 8},
          {id: 'traffic', form: 'kv', size: 'medium', width: '2/3'}
        ]
      }
    ]
  });
  await page.goto('/#/activity');
  for (const id of ['dnsAnswers', 'traffic']) await expect(tile(page, id)).toHaveAttribute('data-width', '1/2');
  await open(page);
  // A split of fixed categories has no row count to choose, and no width past a half.
  await expect(tile(page, 'dnsAnswers').getByRole('slider', {name: 'Resize height', exact: true})).toHaveCount(0);
  const dialog = await settings(page, 'dnsAnswers');
  await expect(dialog.getByRole('radio', {name: '1/2', exact: true})).toBeVisible();
  await expect(dialog.getByRole('radio', {name: '2/3', exact: true})).toHaveCount(0);
  await close(page);
});

// Off the default layout, offered by the gallery, and whole at their narrowest widths on a desktop and a phone.
test('outbound failures, node availability and DNS latency are off the default layout and in the gallery', async ({page}) => {
  const added = ['outboundErrors', 'nodeAvailability', 'dnsLatency'];
  await page.goto('/#/activity');
  await expect(page.locator('.rp-dashboard-cell').first()).toBeVisible();
  for (const id of added) await expect(page.locator(`.rp-dashboard-cell[data-module="${id}"]`)).toHaveCount(0);
  await open(page);
  await page.getByRole('button', {name: 'Widget gallery', exact: true}).click();
  const gallery = page.getByRole('dialog', {name: 'Widget gallery'});
  for (const [id, name] of [
    ['outboundErrors', 'Outbound failures'],
    ['nodeAvailability', 'Node availability'],
    ['dnsLatency', 'DNS latency']
  ])
    await expect(gallery.locator(`.rp-widget-gallery-tile[data-module='${id}']`).getByRole('heading', {name, exact: true})).toBeVisible();
});
test('outbound failures, node availability and DNS latency stay whole at their narrowest widths', async ({page}) => {
  const added = ['outboundErrors', 'nodeAvailability', 'dnsLatency'];
  await seed(page, {
    version: 3,
    sections: [
      {
        id: 'extensions',
        items: [
          {id: 'outboundErrors', form: 'ranked', size: 'medium', width: '1/3', rows: 3},
          {id: 'nodeAvailability', form: 'kv', size: 'medium', width: '1/5'},
          {id: 'dnsLatency', form: 'dots', size: 'medium', width: '1/3', height: 'tall'}
        ]
      }
    ]
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/#/activity');
    // Only the two outbounds whose failures the mock counts; one strip per upstream the mock's lookups reach
    // (mock/network.ts), and three node counts.
    await expect(tile(page, 'outboundErrors').locator('.rp-bar .l')).toHaveText(['proxy', 'gaming']);
    await expect(tile(page, 'dnsLatency').locator('.rp-strip-row')).toHaveCount(3);
    await expect(tile(page, 'nodeAvailability').locator('.rp-kv > div')).toHaveCount(3);
    for (const id of added) {
      const card = tile(page, id).locator('.rp-module-content');
      expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth), `${id} at ${width}`).toBe(true);
      const cut = await card
        .locator('.rp-kv .k, .rp-kv .v, .rp-bar .l > *, .rp-strip-row .name')
        .evaluateAll(list =>
          list.filter(el => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis').map(el => el.textContent)
        );
      expect(cut, `${id} at ${width}`).toEqual([]);
    }
  }
});

test('a full-width list of four rows or more takes two columns, the first filled first, and no name is cut', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await seed(page, {
    version: 3,
    sections: [
      {
        id: 'details',
        items: [
          {id: 'ranking', form: 'ranked', size: 'medium', width: 'full', rows: 8},
          {id: 'memory', form: 'area', size: 'medium', width: '1/2'},
          {id: 'notices', form: 'kv', size: 'medium', width: '1/2'}
        ]
      },
      {
        id: 'extensions',
        items: [
          {id: 'policyGroups', form: 'kv', size: 'medium', width: 'full', rows: 8},
          {id: 'policyGroups', instance: 'policyGroups-3', form: 'kv', size: 'medium', width: 'full', rows: 3},
          {id: 'sourceHealth', form: 'kv', size: 'medium', width: 'full'}
        ]
      }
    ]
  });
  await page.goto('/#/activity');
  await expect(tile(page, 'policyGroups').locator('.rp-columns > *')).toHaveCount(8);
  await expect(tile(page, 'policyGroups-3').locator('.rp-columns > *')).toHaveCount(3);
  for (const [id, columns] of [
    ['ranking', 2],
    ['policyGroups', 2],
    ['policyGroups-3', 1],
    ['sourceHealth', 1]
  ] as const) {
    const list = tile(page, id).locator('.rp-columns > *');
    await expect(list.nth(columns === 2 ? 3 : 0)).toBeVisible();
    const rows = await list.count();
    const lefts = await list.evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().left)));
    expect(new Set(lefts).size, id).toBe(columns);
    // Column by column: the first half of the rows sits in the first column.
    expect(
      lefts.slice(0, Math.ceil(rows / 2)).every(left => left === Math.min(...lefts)),
      id
    ).toBe(true);
    const names = await tile(page, id)
      .locator('.rp-kv .k, .rp-bar .l > *')
      .evaluateAll(list => list.map(el => ({fits: el.scrollWidth <= el.clientWidth, overflow: getComputedStyle(el).textOverflow})));
    expect(names.length, id).toBeGreaterThan(0);
    expect(
      names.filter(name => !name.fits || name.overflow === 'ellipsis'),
      id
    ).toEqual([]);
  }
  // Notices take their content's height; the row takes its tallest card's and both cards fill it.
  const [memory, notices] = await Promise.all(['memory', 'notices'].map(id => height(tile(page, id).locator('section').first())));
  expect(Math.abs(memory - notices)).toBeLessThanOrEqual(1);
});

test('an area chart marks its peak and average on its plot at every width, a compact chart lists them beside it when wide', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  await seed(page, {
    version: 3,
    sections: [
      {
        id: 'extensions',
        items: [
          {id: 'history', form: 'area', size: 'medium', width: 'full'},
          {id: 'speed', form: 'area', size: 'medium', width: '2/3'},
          {id: 'cpu', form: 'sparkline', size: 'medium', width: 'full'},
          {id: 'memory', form: 'area', size: 'medium', width: '1/2'}
        ]
      }
    ]
  });
  await page.goto('/#/activity');
  // Each area chart's legend is its series' names and live values; every series marks its average and peak on its plot,
  // and the chart says them in its description, with no figures written on the card.
  for (const id of ['history', 'speed', 'memory']) {
    await expect(tile(page, id).locator('.rp-area-marks'), id).toHaveCount(2);
    await expect(tile(page, id).locator('.rp-facts'), id).toHaveCount(0);
    await expect(tile(page, id).locator('.rp-legend .it'), id).toHaveCount(2);
  }
  await expect(tile(page, 'history').locator('svg.rp-activity-surface desc')).toHaveText(
    /^Download peak: .+Download average: .+Upload peak: .+Upload average: /
  );
  // A compact chart two thirds of its row or wider lists them beside it.
  await expect(tile(page, 'cpu').locator('.rp-facts dt')).toHaveCount(2);
  await expect(tile(page, 'cpu').locator('.rp-facts')).toBeVisible();
  // Nothing overflows its card at the narrower widths.
  for (const width of [1280, 390]) {
    await page.setViewportSize({width, height: 1000});
    // Charts measure their box after a resize, so the check waits for them to settle.
    await expect
      .poll(
        () =>
          page
            .locator('.rp-dashboard-cell section')
            .evaluateAll(cards =>
              cards.filter(card => card.scrollWidth > card.clientWidth + 1).map(card => card.closest<HTMLElement>('[data-instance]')?.dataset.instance)
            ),
        {message: String(width)}
      )
      .toEqual([]);
    for (const id of ['history', 'speed', 'memory']) await expectTextInside(tile(page, id).locator('section').first());
  }
  await expect(tile(page, 'memory').locator('.rp-area-marks')).toHaveCount(2);
});

test('the default traffic card stacks a plot for each series with one legend line at every width', async ({page}) => {
  await page.goto('/#/activity');
  const history = tile(page, 'history');
  for (const width of [1024, 1280, 1440, 390]) {
    await page.setViewportSize({width, height: 1000});
    await expect(history.locator('svg.rp-activity-surface')).toBeVisible();
    await expect(history.locator('.rp-facts')).toHaveCount(0);
    await settleFrames(page);
    // The chart draws again at its box's new size a frame after the resize.
    await expect
      .poll(() =>
        history.locator('.rp-area-plot').evaluate(box => {
          const [outer, svg] = [box, box.querySelector('svg')!].map(el => el.getBoundingClientRect());
          return Math.max(Math.abs(outer.width - svg.width), Math.abs(outer.height - svg.height));
        })
      )
      .toBeLessThanOrEqual(1);
    const layout = await history.evaluate(cell => {
      const entries = [...cell.querySelectorAll('.rp-legend .it')].map(entry => entry.getBoundingClientRect());
      const svg = cell.querySelector('svg.rp-activity-surface')!.getBoundingClientRect();
      // The gridlines of the two plots: each plot's top, middle and bottom.
      const grid = [...cell.querySelectorAll('.rp-area-grid line')].map(line => line.getBoundingClientRect().top - svg.top).sort((a, b) => a - b);
      const times = [...cell.querySelectorAll('.rp-area-x-ticks text')].map(text => text.getBoundingClientRect().top - svg.top);
      return {lines: new Set(entries.map(entry => Math.round(entry.top))).size, grid, times};
    });
    expect(layout.lines, `${width} legend lines`).toBe(1);
    expect(layout.grid, String(width)).toHaveLength(6);
    // Two plots of one height, one gap apart, the time labels under the lower one only.
    const [upper, lower] = [layout.grid.slice(0, 3), layout.grid.slice(3)];
    expect(Math.abs(upper[2] - upper[0] - (lower[2] - lower[0])), String(width)).toBeLessThanOrEqual(1);
    expect(lower[0] - upper[2], String(width)).toBeGreaterThan(4);
    for (const top of layout.times) expect(top, String(width)).toBeGreaterThan(lower[2]);
    await expectTextInside(history.locator('section').first());
  }
});

test('memory is a value tile like the traffic tiles, its figures beside the sparkline on wide cards', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const memory = (instance: string, width: string) => ({id: 'memory', instance, form: 'sparkline', size: 'medium', width});
  const item = (id: string, extra: object) => ({id, form: 'sparkline', size: 'medium', ...extra});
  await seed(page, {
    version: 3,
    sections: [
      {
        id: 'extensions',
        items: [
          memory('memory', '1/2'),
          item('download', {width: '1/2'}),
          memory('memory-2', '2/3'),
          item('upload', {width: '1/3'}),
          memory('memory-3', 'full')
        ]
      }
    ]
  });
  await page.goto('/#/activity');
  for (const id of ['memory', 'memory-2', 'memory-3']) {
    await expect(tile(page, id).locator('.rp-tile-body .rp-spark')).toBeVisible();
    await expect(tile(page, id).locator('span.rp-tile-head')).toHaveText('Memory');
  }
  // A half, as the download beside it, draws no figures and has the download's height.
  await expect(tile(page, 'memory').locator('.rp-facts')).toBeHidden();
  expect(Math.abs((await height(tile(page, 'memory'))) - (await height(tile(page, 'download'))))).toBeLessThanOrEqual(1);
  for (const id of ['memory-2', 'memory-3']) {
    const strip = tile(page, id).locator('.rp-facts');
    await expect(strip).toBeVisible();
    await expect(strip.locator('dt')).toHaveText(['Resident memory peak', 'Resident memory average']);
    expect((await box(strip)).height, id).toBeLessThanOrEqual((await box(tile(page, id).locator('.rp-tile-body .rp-spark'))).height + 1);
    await expectTextInside(tile(page, id).locator('section').first());
  }
  // Two thirds beside a third keeps one height across the row.
  expect(Math.abs((await height(tile(page, 'memory-2'))) - (await height(tile(page, 'upload'))))).toBeLessThanOrEqual(1);
});

test('source lists meter each reported quota and memory meters its cgroup limit, at their narrowest width', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const backend = await mockBackend(page);
  const long = `subscription-${'n'.repeat(51)}`;
  backend.handlers['GET providers'] = async () => {
    const list = await backend.api.providers();
    const harbor = list.providers.find(provider => provider.id === 'harbor')!;
    const unlimited = {...harbor, id: 'open', name: 'open', traffic: {...harbor.traffic!, total_bytes: null}};
    return {...list, providers: [{...harbor, id: 'long', name: long}, unlimited, ...list.providers]};
  };
  let memory = await backend.api.runtimeMemory();
  backend.handlers['GET runtime/memory'] = async () => memory;
  const items = ['sourceHealth', 'providerBudget', 'memory'].map(id => ({id, form: 'kv', size: 'medium', width: '1/3'}));
  await seed(page, {version: 3, sections: [{id: 'extensions', items}]});
  await page.goto('/#/activity');
  const sources = tile(page, 'sourceHealth');
  const quota = tile(page, 'providerBudget');
  // An allowance gets a meter; none (unlimited) or no traffic at all gets none, and the quota widget lists subscriptions.
  await expect(sources.locator('.rp-entry')).toHaveCount(4);
  await expect(sources.getByRole('meter')).toHaveCount(2);
  await expect(quota.locator('.rp-entry')).toHaveCount(3);
  await expect(quota.getByRole('meter')).toHaveCount(2);
  await expect(quota.locator('.rp-entry').nth(1).getByRole('meter')).toHaveCount(0);
  await expect(quota.getByRole('meter', {name: long, exact: true})).toHaveAttribute('aria-valuetext', /\S \/ \S/);
  for (const card of [sources, quota]) {
    expect(long).toHaveLength(64);
    const name = card.getByText(long, {exact: true});
    await expect(name).toBeVisible();
    expect(await name.evaluate(el => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== 'ellipsis')).toBe(true);
  }
  const card = tile(page, 'memory');
  await expect(card.getByRole('meter')).toHaveAttribute('aria-valuetext', /\S \/ \S/);
  await expect(card.locator('.rp-badge')).toHaveCount(0);
  for (const id of ['sourceHealth', 'providerBudget', 'memory']) await expectTextInside(tile(page, id).locator('section').first());
  // Without a limit there is nothing to meter against; OOM kills are named once there were some.
  memory = {...memory, cgroup: {...memory.cgroup!, limit_bytes: null, events: {...memory.cgroup!.events!, oom_kill: '2'}}};
  // Reloading while lazy chunks still load cancels them, and WebKit can fail the reload itself.
  await settleNetwork(page);
  await page.reload();
  await expect(card.locator('.rp-badge')).toHaveText('OOM kills: 2');
  await expect(card.getByRole('meter')).toHaveCount(0);
  // The capabilities list the limit, so a null one is none set; a zero or an absent one is not reported.
  await expect(card.locator('.rp-kv')).toContainText(/cgroup limit\s*No limit/);
  for (const limit of ['0', undefined]) {
    memory = {...memory, cgroup: {...memory.cgroup!, limit_bytes: limit as string}};
    if (limit === undefined) delete (memory.cgroup as {limit_bytes?: string | null}).limit_bytes;
    await settleNetwork(page);
    await page.reload();
    await expect(card.locator('.rp-kv')).toContainText(/cgroup limit\s*Not reported/);
    await expect(card.getByRole('meter')).toHaveCount(0);
  }
});

test('a tall CPU tile keeps its height while its first samples arrive', async ({page}) => {
  // Runtime polls every five seconds; the line needs two known samples after two unknown ones.
  test.slow();
  await page.setViewportSize({width: 1280, height: 1000});
  const backend = await mockBackend(page);
  let polls = 0;
  backend.handlers['GET runtime'] = async () => {
    const runtime = await backend.api.runtime();
    polls++;
    return {...runtime, process: {...runtime.process, cpu_percent: polls < 3 ? null : polls * 5}};
  };
  await seed(page, {version: 3, sections: [{id: 'metrics', items: [{id: 'cpu', form: 'sparkline', size: 'medium', height: 'tall'}]}]});
  await page.goto('/#/activity');
  const card = tile(page, 'cpu').locator('section').first();
  const spark = tile(page, 'cpu').locator('.rp-spark');
  // Under two samples the sparkline's box draws its baseline; from the second it draws the line.
  await expect(spark.locator('svg line')).toHaveCount(1);
  const heights = [await height(card)];
  await expect.poll(() => polls, {timeout: 15000}).toBeGreaterThanOrEqual(3);
  heights.push(await height(card));
  await expect(spark.locator('svg.rp-activity-surface')).toBeVisible({timeout: 15000});
  heights.push(await height(card));
  expect(new Set(heights).size, heights.join()).toBe(1);
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
  await expect(cpu.locator('[data-pack="tile"]')).toBeVisible();
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
    await expect(tile(page, 'cpu').locator('[data-pack="tile"]')).toBeVisible();
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
  // Standard height: the sparkline fills the line from the column after the widest value's room (98px and the 12px
  // gap), whatever the value shown, so a half has the wider one.
  for (const id of ['download', 'upload']) {
    await expect(tile(page, id)).toHaveAttribute('data-tile', 'inline');
    const body = await part(id, '.rp-tile-body');
    const spark = await part(id, '.rp-spark');
    const value = await part(id, '.rp-tile-val');
    expect(Math.abs(body.x + body.width - (spark.x + spark.width)), id).toBeLessThanOrEqual(1);
    expect(Math.abs(spark.x - Math.max(body.x + 110, value.x + value.width + 12)), id).toBeLessThanOrEqual(1);
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
// Every card drawn with its content: scrolled into view once and past its chart placeholder. The scroll runs in the page
// in one step: a cell the dashboard redraws while Playwright waits for it to hold still is detached under the action.
const settle = async (page: Page) => {
  for (const cell of await page.locator('.rp-dash-section > .rp-dashboard-cell').all()) {
    await cell.evaluate(element => element.scrollIntoView({block: 'nearest'}));
    await expect(cell.locator('.rp-chart-wait')).toHaveCount(0);
    // A chart draws its plot once it has read a box with a width, a frame or two after it replaces its placeholder.
    await expect(cell.locator('.rp-area-plot:not(:has(> svg:not([width="0"])))')).toHaveCount(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
};
for (const width of [1280, 390])
  test(`edit mode shows every card's content and controls as the page does at ${width} px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/activity');
    // The startup Skeleton draws the same sections and cards, so the page is in once it has gone.
    await expect(page.locator('.rp-content .rp-page-skeleton')).toHaveCount(0);
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
    card.locator('section.rp-card').evaluate(node => {
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
        // The plot ends the card.
        gap: box.bottom - Number.parseFloat(style.paddingBlockEnd) - Number.parseFloat(style.borderBlockEndWidth) - chart.bottom
      };
    });
  const check = async () => {
    // The chart follows its card's new height in the next frame.
    await expect.poll(async () => (await plot()).height).toBeGreaterThanOrEqual(2 * 144 - 2);
    await expect.poll(async () => Math.abs((await plot()).gap)).toBeLessThanOrEqual(2);
    const chart = await plot();
    expect(Math.abs(chart.width - chart.inner)).toBeLessThanOrEqual(2);
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

// The editor's controls take the library's default size M: the page row, a card's tools and every overlay.
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

// The control cards take the thirds of the rows below from 1100px, each on one line: a card whose line does not fit its
// third first drops its label's icon, then shows the icon alone.
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
            step: (row as HTMLElement).dataset.step
          };
        })
      );
  const cells = (page: Page, profile = 'quick') =>
    page
      .locator(`[data-profile='${profile}'] > .rp-dashboard-cell`)
      .evaluateAll(nodes =>
        nodes.map(node => ({id: (node as HTMLElement).dataset.instance, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right}))
      );
  for (const width of [1440, 1475])
    test(`puts the first row on the column lines of the details row at ${width} px`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      await page.goto('/#/activity');
      await expect(quick(page).locator('.rp-control-card')).toHaveCount(3);
      const order = await cells(page);
      expect(order.map(cell => cell.id)).toEqual(['mode', 'global', 'status']);
      const details = await cells(page, 'details');
      order.forEach((cell, i) => {
        expect(Math.abs(cell.left - details[i].left)).toBeLessThanOrEqual(1);
        expect(Math.abs(cell.right - details[i].right)).toBeLessThanOrEqual(1);
      });
      // The mode card's Chinese line is 18px wider than a third holds, and fits without its icon; the global and status
      // lines fit whole.
      const all = await lines(page);
      expect(all.map(line => line.step)).toEqual(['bare', 'full', undefined]);
      for (const line of all) {
        expect(line.centres).toBeLessThanOrEqual(1);
        expect(line.end).toBeLessThanOrEqual(1);
        expect(line.cut).toBe(false);
      }
    });
  // At 1280px the mode card's third holds its icon alone, the segmented control turned into its picker beside Apply.
  test('shows a narrow card by its icon, its label the tooltip and the name, at 1280 px', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 900});
    await page.goto('/#/activity');
    await expect(quick(page).locator('.rp-control-card')).toHaveCount(3);
    const all = await lines(page);
    expect(all.map(line => line.step)).toEqual(['icon', 'full', undefined]);
    for (const line of all) {
      expect(line.centres).toBeLessThanOrEqual(1);
      expect(line.end).toBeLessThanOrEqual(1);
    }
    const card = quick(page).locator('.rp-control-card').first();
    await expect(card).toHaveAccessibleName('出站模式');
    await expect(card.locator('.rp-segpick')).toBeVisible();
    await page.mouse.move(0, 0);
    await card.locator('.rp-qicon').hover();
    await expect(page.getByRole('tooltip')).toHaveText('出站模式');
  });
  test('keeps the first row on one line where every line fits, at 1024 px', async ({page}) => {
    await page.setViewportSize({width: 1024, height: 900});
    await page.goto('/#/activity');
    await expect(quick(page).locator('.rp-control-card')).toHaveCount(3);
    const all = await lines(page);
    expect(all).toHaveLength(3);
    for (const line of all) {
      expect(line.centres).toBeLessThanOrEqual(1);
      expect(line.end).toBeLessThanOrEqual(1);
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
  test('a donut at 2/3 grows past one at 1/3 and caps its legend', async ({page}) => {
    await seed(page, {
      version: 3,
      sections: [
        {
          id: 'extensions',
          items: [
            {id: 'connectionOutbounds', form: 'donut', size: 'medium', width: '1/3'},
            {id: 'connectionOutbounds', instance: 'wide', form: 'donut', size: 'medium', width: '2/3'}
          ]
        }
      ]
    });
    await page.goto('/#/activity');
    await expect(tile(page, 'wide').locator('.rp-donut svg')).toBeVisible();
    const measure = (id: string) =>
      tile(page, id).evaluate(cell => ({
        card: cell.getBoundingClientRect().width,
        ring: cell.querySelector('.rp-donut .box')!.getBoundingClientRect().width,
        legend: cell.querySelector('.rp-donut .lst')!.getBoundingClientRect().width
      }));
    const [third, wide] = [await measure('connectionOutbounds'), await measure('wide')];
    expect(wide.ring).toBeGreaterThan(third.ring);
    for (const card of [third, wide]) {
      expect(card.legend).toBeLessThanOrEqual(card.card);
      expect(card.legend).toBeLessThanOrEqual(360);
    }
  });
  test('node latency at 1/2 puts the lowest and highest on one line above three rows', async ({page}) => {
    await seed(page, {version: 3, sections: [{id: 'extensions', items: [{id: 'nodeLatency', form: 'dots', size: 'medium', width: '1/2', rows: 3}]}]});
    await page.goto('/#/activity');
    const plot = tile(page, 'nodeLatency').locator('.rp-markerplot');
    await expect(plot.locator('[data-row]')).toHaveCount(3);
    const layout = await plot.evaluate(element => ({
      tops: [...element.querySelectorAll('.head .rp-kv > div')].map(pair => Math.round(pair.getBoundingClientRect().top)),
      summary: element.querySelector('.head')!.getBoundingClientRect().height,
      rows: [...element.querySelectorAll('[data-row]')].reduce((sum, row) => sum + row.getBoundingClientRect().height, 0)
    }));
    expect(layout.tops).toHaveLength(2);
    expect(layout.tops[0]).toBe(layout.tops[1]);
    expect(layout.summary).toBeLessThan(layout.rows);
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

import {test, expect} from './fixtures';
import type {Page} from '@playwright/test';
const open = (page: Page) => page.getByRole('button', {name: 'Edit dashboard', exact: true}).click();
const tile = (page: Page, id: string) => page.locator(`.rp-dashboard-cell[data-instance="${id}"]`);
const order = (page: Page) =>
  page.locator("[data-profile='metrics'] > .rp-dashboard-cell").evaluateAll(cells => cells.map(cell => (cell as HTMLElement).dataset.instance));
const settings = async (page: Page, id: string) => {
  await tile(page, id).getByRole('button', {name: 'Widget settings', exact: true}).click();
  return page.getByRole('dialog');
};

test('drags a card into a new place, moves it by keyboard, resizes one card and keeps the draft until Done', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/activity');
  await expect(tile(page, 'cpu').locator('.rp-card')).toBeVisible();
  await open(page);
  // A pointer drag by the handle: the gap-line indicator shows the slot, and the drop moves the card there.
  const handle = tile(page, 'download').locator('[slot="drag"]');
  const target = (await tile(page, 'connections').boundingBox())!;
  const start = (await handle.boundingBox())!;
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
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect.poll(() => order(page)).not.toEqual(['upload', 'connections', 'download', 'latency', 'cpu']);
  // One resize changes only that card's width.
  const widths = () =>
    page
      .locator('.rp-dashboard-cell')
      .evaluateAll(cells => cells.map(cell => [(cell as HTMLElement).dataset.instance, Math.round(cell.getBoundingClientRect().width)]));
  const before = Object.fromEntries(await widths());
  await (await settings(page, 'upload')).getByRole('radio', {name: 'Large', exact: true}).click();
  await page.keyboard.press('Escape');
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
  await page.goto('/#/activity');
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
  await page.evaluate(value => localStorage.setItem('doona-dashboard', value), JSON.stringify(saved));
  await page.reload();
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
  // The edit tools sit inside the card's header row, clear of its title.
  const card = (await tile(page, 'dnsAnswers').locator('.rp-card').boundingBox())!;
  const tools = (await tile(page, 'dnsAnswers').locator('.rp-dashboard-tools').boundingBox())!;
  const title = (await tile(page, 'dnsAnswers').getByRole('heading').first().boundingBox())!;
  expect(tools.y).toBeGreaterThanOrEqual(card.y);
  expect(tools.x + tools.width).toBeLessThanOrEqual(card.x + card.width);
  expect(title.x + title.width).toBeLessThanOrEqual(tools.x);
});

// Control cards in a row share one of two layouts and one height, and end at their content, at every width.
for (const lang of ['en', 'zh-TW'])
  test(`control cards in a row share their layout and height ${lang}`, async ({page}) => {
    await page.addInitScript(lang => localStorage.setItem('doona-lang', lang), lang);
    await page.goto('/#/activity');
    await expect(page.locator('.rp-control-card')).toHaveCount(3);
    for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({width, height: 900});
      const cards = () =>
        page.locator('.rp-control-card').evaluateAll(nodes =>
          nodes.map(node => {
            const card = node.getBoundingClientRect();
            const row = node.querySelector(':scope > .rp-row')!;
            const first = row.firstElementChild!.getBoundingClientRect();
            const last = row.lastElementChild!.getBoundingClientRect();
            const style = getComputedStyle(node);
            const inner = card.bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth);
            const mode =
              Math.abs(first.top + first.height / 2 - (last.top + last.height / 2)) < 4 ? 'inline' : last.top >= first.bottom - 1 ? 'stacked' : 'other';
            return {top: Math.round(card.top), height: card.height, mode, empty: inner - row.getBoundingClientRect().bottom};
          })
        );
      await expect.poll(async () => (await cards()).every(card => card.mode !== 'other' && Math.abs(card.empty) <= 1), `${width}px`).toBe(true);
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

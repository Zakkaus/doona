import {test, expect, mockBackend, moreAction, settle, box} from './fixtures';
import {ApiError} from '../src/api/error';
import {defaults, type Layout} from '../src/shell/widgets/layout';
import type {Page} from '@playwright/test';
import {pickWidget} from './widget-helpers';

test.use({widgets: true});
const save = (page: Page, layout: Layout) =>
  page.addInitScript(value => {
    if (!localStorage.getItem('doona-widgets')) localStorage.setItem('doona-widgets', JSON.stringify(value));
  }, layout);
// Wide enough for a segmented control's options to show in a row rather than in its overflow menu.
const wide = {width: 480, height: 640};
const floating = (page: Page) => page.locator('.rp-floating-frame .rp-floating-panel');
const editor = (page: Page) => page.getByRole('dialog', {name: 'Edit widgets', exact: true});
const openEditor = async (page: Page) => {
  await moreAction(page.locator('.rp-widget-header'), 'Edit widgets', 'Panel options');
  await expect(editor(page).locator('.rp-widget-preview .rp-sortable-row').first()).toBeVisible();
};
const expectSelectionClearance = async (page: Page) => {
  const selected = page.locator('.rp-widget-preview .rp-sortable-row[data-selected]');
  await selected.scrollIntoViewIfNeeded();
  const geometry = await selected.evaluate(el => {
    const row = el.getBoundingClientRect();
    const frame = getComputedStyle(el, '::before');
    const scale = Number(getComputedStyle(el.closest('.rp-widget-preview')!).zoom);
    const gap = (-Number.parseFloat(frame.top) - Number.parseFloat(frame.borderTopWidth)) * scale;
    const content = el.querySelector('.rp-widget')!.getBoundingClientRect();
    const edge = {left: row.left - gap, top: row.top - gap, right: row.right + gap, bottom: row.bottom + gap};
    const tools = el.querySelector('.rp-dashboard-tools')!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el.querySelector('.rp-widget-label')!);
    const boxes = [...range.getClientRects(), ...[...el.querySelectorAll('figure, .rp-kv')].map(node => node.getBoundingClientRect())];
    const overlap = boxes.some(box => tools.left < box.right && tools.right > box.left && tools.top < box.bottom && tools.bottom > box.top);
    const clipped = [];
    for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).overflow === 'visible') continue;
      const box = ancestor.getBoundingClientRect();
      if (edge.left < box.left || edge.right > box.right || edge.top < box.top || edge.bottom > box.bottom) clipped.push(ancestor.className);
    }
    return {gaps: [content.left - edge.left, content.top - edge.top, edge.right - content.right, edge.bottom - content.bottom], overlap, clipped};
  });
  for (const gap of geometry.gaps) expect(gap).toBeGreaterThanOrEqual(8);
  expect(geometry.overlap).toBe(false);
  expect(geometry.clipped).toEqual([]);
};
const expectPanelPreview = async (page: Page) => {
  const preview = page.locator('.rp-widget-preview');
  const live = await box(floating(page));
  const scale = await preview.evaluate(el => Number(getComputedStyle(el).zoom));
  const room = await page.locator('.rp-widget-preview-space').evaluate(el => {
    const style = getComputedStyle(el);
    return el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  });
  expect((await box(preview)).width).toBeCloseTo(Math.min(room, live.width), 0);
  expect((await box(preview)).width / scale).toBeCloseTo(live.width, 0);
  const sections = floating(page).locator('.rp-widget[aria-label]');
  for (let i = 0; i < (await sections.count()); i++) {
    const actual = await box(sections.nth(i));
    const copy = await box(preview.locator('.rp-widget[aria-label]').nth(i));
    expect(Math.abs(copy.height / scale - actual.height)).toBeLessThanOrEqual(2);
  }
};
test('edits a draft, cancels changes, saves sizes and order, and restores defaults', async ({page}) => {
  await page.goto('/#/settings');
  await openEditor(page);
  await expectPanelPreview(page);
  await pickWidget(page);
  await editor(page).getByRole('radio', {name: 'Key-value list', exact: true}).click();
  await editor(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(floating(page).locator('figure').first()).toBeVisible();
  await openEditor(page);
  await pickWidget(page);
  await editor(page).getByRole('radio', {name: 'Large', exact: true}).click();
  await editor(page).locator('.rp-widget-inspector').getByRole('button', {name: 'Move down', exact: true}).click();
  await editor(page).locator('.rp-widget-gallery').getByRole('button', {name: 'Add Recent notices', exact: true}).focus();
  await page.keyboard.press('Enter');
  await editor(page).getByRole('button', {name: 'Save', exact: true}).click();
  await page.reload();
  await expect(page.locator('[data-widget-id="speed"]')).toHaveAttribute('data-size', 'large');
  await expect(page.locator('[data-widget-id="notices"]')).toBeVisible();
  await expect(page.locator('[data-widget-id]').first()).toHaveAttribute('data-widget-id', 'memory');
  await openEditor(page);
  await editor(page).getByRole('button', {name: 'Restore defaults'}).click();
  await editor(page).getByRole('button', {name: 'Save', exact: true}).click();
  await expect(page.locator('[data-widget-id="notices"]')).toHaveCount(0);
});

test.describe('medium-width widget editor', () => {
  test.use({viewport: {width: 1150, height: 900}, storage: {'doona-lang': 'zh-TW', 'doona-scheme': 'dark'}});
  test('keeps the library, preview and inspector readable beside a resized panel', async ({page}) => {
    await save(page, {
      ...defaults(),
      size: {width: 640, height: 640},
      items: [
        {id: 'speed', size: 'medium', form: 'sparkline'},
        {id: 'memory', size: 'medium', form: 'kv'},
        {id: 'divider', size: 'medium', form: 'kv'}
      ]
    });
    await page.goto('/#/settings');
    await moreAction(page.locator('.rp-widget-header'), '編輯小工具', '面板選項');
    const dialog = page.getByRole('dialog', {name: '編輯小工具', exact: true});
    const library = dialog.locator('.rp-widget-gallery-tile[data-module="speed"]');
    await expect(library.locator('.rp-compact-chart')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectPanelPreview(page);
    await pickWidget(page);
    const liveWidth = (await box(floating(page))).width;
    const sectionHeight = (await box(floating(page).locator('.rp-widget').first())).height;
    const labels = dialog.locator('.rp-widget-gallery-tile > h3, .rp-widget-inspector h3, .rp-widget-inspector .rp-module-option > .rp-label');
    for (const label of await labels.all()) {
      const geometry = await label.evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return {text: el.textContent, scroll: el.scrollWidth, client: el.clientWidth, lines: new Set([...range.getClientRects()].map(rect => rect.top)).size};
      });
      expect(geometry.scroll, geometry.text!).toBeLessThanOrEqual(geometry.client);
      expect(geometry.lines, geometry.text!).toBe(1);
    }
    expect((await box(library)).width).toBeGreaterThanOrEqual(300);
    expect((await box(dialog.locator('.rp-widget-canvas'))).width).toBeGreaterThanOrEqual(280);
    expect((await box(dialog.locator('.rp-widget-inspector'))).width).toBeGreaterThanOrEqual(240);
    const body = dialog.locator('.rp-dialog-body');
    expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const footer = await box(dialog.locator('.foot'));
    expect((await box(body)).y + (await box(body)).height).toBeLessThanOrEqual(footer.y);
    const frame = library.locator('.rp-widget-gallery-frame');
    expect((await box(frame)).height).toBeCloseTo((await box(frame.locator(':scope > *'))).height, 0);
    const canvas = dialog.locator('.rp-widget-canvas');
    const tracks = await dialog.locator('.rp-widget-editor-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').map(Number.parseFloat));
    expect((await box(canvas)).width).toBeCloseTo(tracks[1], 0);
    const nestedScrollers = await body.evaluate(root =>
      [...root.querySelectorAll<HTMLElement>('*')]
        .filter(el => {
          let count = 0;
          for (let parent: HTMLElement | null = el; parent && root.contains(parent); parent = parent.parentElement) {
            if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight + 1) count++;
          }
          return count > 1;
        })
        .map(el => el.className)
    );
    expect(nestedScrollers, 'At most one vertical scroll container in each column').toEqual([]);
    for (const control of await body.locator('button:not([inert] button), [role="radio"]:not([inert] *)').all()) {
      await control.scrollIntoViewIfNeeded();
      const bounds = await box(control);
      expect(bounds.y + bounds.height, (await control.textContent()) ?? '').toBeLessThanOrEqual(footer.y);
    }
    await expectSelectionClearance(page);
    await expect(dialog.locator('.rp-widget-canvas .rp-widget[aria-label="分隔線"] .rp-widget-label')).toHaveCount(0);
    await page.setViewportSize({width: 390, height: 844});
    const preview = dialog.locator('.rp-widget-preview');
    const space = dialog.locator('.rp-widget-preview-space');
    const room = await space.evaluate(el => {
      const style = getComputedStyle(el);
      return el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    });
    await expect.poll(async () => (await box(preview)).width).toBeCloseTo(room, 0);
    const scale = await preview.evaluate(el => Number(getComputedStyle(el).zoom));
    expect(scale).toBeLessThan(1);
    expect(await preview.evaluate(el => (el as HTMLElement).offsetWidth)).toBeCloseTo(liveWidth, 0);
    expect(Math.abs((await box(preview.locator('.rp-widget').first())).height / scale - sectionHeight)).toBeLessThanOrEqual(2);
    expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expectSelectionClearance(page);
  });
});
test('group quick switch shares network scope, keeps release and enforces capabilities', async ({page}) => {
  await save(page, {...defaults(), items: [{id: 'group', form: 'text', size: 'medium', group: 'auto'}], size: wide});
  const backend = await mockBackend(page);
  await page.goto('/#/policies');
  const widget = page.locator('[data-widget-id="group"]');
  const card = page.getByRole('region', {name: 'auto', exact: true});
  await widget.getByRole('radio', {name: 'TCP', exact: true}).click();
  await card.getByRole('button', {name: /^Current/}).click();
  await expect(card.getByRole('radio', {name: 'TCP', exact: true})).toBeChecked();
  await widget.getByRole('button', {name: 'Selected member', exact: true}).click();
  await page.getByRole('menuitemradio', {name: 'us-01', exact: true}).click();
  await expect(widget.getByRole('button', {name: 'Back to automatic'})).toBeVisible();
  const write = backend.requests.find(request => request.method() === 'PUT' && request.url().includes('/selection'));
  expect(write?.postDataJSON()).toEqual({member_id: 'us-01', network: 'tcp'});
  await widget.getByRole('button', {name: 'Back to automatic'}).click();
  await expect(widget.getByRole('button', {name: 'Back to automatic'})).toHaveCount(0);
  backend.capabilities.resources.groups.selection = false;
  await page.reload();
  await expect(widget.getByRole('button', {name: 'Selected member', exact: true})).toBeDisabled();
});

test('validates group identity on the active backend without losing its stored ID', async ({page}) => {
  await save(page, {...defaults(), items: [{id: 'group', form: 'text', size: 'medium', group: 'absent'}]});
  const backend = await mockBackend(page);
  await page.goto('/#/settings');
  // A stored group the backend lacks falls back to its first manual group without asking for the missing one.
  await expect(page.locator('[data-widget-id="group"]').getByRole('button', {name: /^Selected member/})).toBeVisible();
  expect(backend.requests.some(request => request.url().includes('/groups/absent'))).toBe(false);
});

for (const height of [960, 320])
  test(`the floating mode row at panel height ${height} lines up Apply and keeps the panel's insets even`, async ({page}) => {
    await save(page, {...defaults(), size: {width: 360, height}});
    await mockBackend(page);
    await page.goto('/#/settings');
    const widget = floating(page).locator('[data-widget-id="mode"]');
    await widget.getByRole('radio', {name: 'Global', exact: true}).click();
    await settle(page);
    const seg = await box(widget.locator('.rp-seg'));
    const apply = await box(widget.getByRole('button', {name: 'Apply', exact: true}));
    expect(Math.abs(apply.height - seg.height)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(apply.y + apply.height / 2 - (seg.y + seg.height / 2))).toBeLessThanOrEqual(0.5);
    // The selected last segment keeps the control's own inset on its top, bottom and end.
    const insets = await widget.locator('.rp-seg').evaluate(el => {
      const track = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const frame = el.querySelector('[data-selected]')!.getBoundingClientRect();
      return {
        padding: [style.paddingTop, style.paddingBottom, style.paddingRight].map(Number.parseFloat),
        actual: [frame.top - track.top, track.bottom - frame.bottom, track.right - frame.right]
      };
    });
    for (const [i, gap] of insets.actual.entries()) expect(Math.abs(gap - insets.padding[i]), `${insets.actual}`).toBeLessThanOrEqual(0.5);
    // Scrolled to its end, the list's last row ends as far from the panel's border as the header starts from it.
    await floating(page)
      .locator('.rp-widget-body')
      .evaluate(el => el.scrollTo(0, el.scrollHeight));
    const edges = await floating(page).evaluate(panel => {
      const border = Number.parseFloat(getComputedStyle(panel).borderTopWidth);
      const outer = panel.getBoundingClientRect();
      const head = panel.querySelector('.rp-widget-header')!.getBoundingClientRect();
      const last = [...panel.querySelectorAll('.rp-widget-cell')].at(-1)!.getBoundingClientRect();
      return {top: head.top - outer.top - border, bottom: outer.bottom - border - last.bottom};
    });
    expect(Math.abs(edges.top - edges.bottom), `${edges.top} ${edges.bottom}`).toBeLessThanOrEqual(0.5);
  });

test.describe('phone sheet insets', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true});
  test("the sheet's list ends as far from the bottom edge as its header starts from the top", async ({page}) => {
    await mockBackend(page);
    await page.goto('/#/overview');
    await page.getByRole('button', {name: 'Show widgets', exact: true}).click();
    const sheet = page.locator('.rp-drawer');
    await expect(sheet.locator('.rp-widget-cell').first()).toBeVisible();
    await sheet.locator('.rp-widget-body').evaluate(el => el.scrollTo(0, el.scrollHeight));
    const edges = await sheet.evaluate(el => {
      const outer = el.getBoundingClientRect();
      const head = el.querySelector('.rp-dialog > .rp-row')!.getBoundingClientRect();
      const last = [...el.querySelectorAll('.rp-widget-cell')].at(-1)!.getBoundingClientRect();
      return {top: head.top - outer.top, bottom: outer.bottom - last.bottom};
    });
    expect(Math.abs(edges.top - edges.bottom), `${edges.top} ${edges.bottom}`).toBeLessThanOrEqual(1);
  });
});

test('the editor opens with nothing selected and its preview edge sets the panel width on save', async ({page}) => {
  await save(page, {...defaults(), size: {width: 320, height: 640}});
  await page.goto('/#/settings');
  await openEditor(page);
  await expect(editor(page).locator('.rp-sortable-row[data-selected]')).toHaveCount(0);
  await expect(editor(page).locator('.rp-widget-inspector')).toContainText('Select a widget to edit its settings');
  const preview = editor(page).locator('.rp-widget-preview');
  const width = () => preview.evaluate(el => (el as HTMLElement).offsetWidth);
  const handle = editor(page).getByRole('button', {name: 'Resize panel width', exact: true});
  const drag = async (dx: number) => {
    const scale = await preview.evaluate(el => Number(getComputedStyle(el).zoom));
    const start = await box(handle);
    const at = {x: start.x + start.width / 2, y: start.y + start.height / 2};
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + dx * scale, at.y, {steps: 4});
    await page.mouse.up();
  };
  expect(await width()).toBe(320);
  await drag(40);
  await expect.poll(width).toBe(360);
  // Cancel discards the width with the rest of the draft.
  await editor(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(editor(page)).toHaveCount(0);
  expect((await box(floating(page))).width).toBe(320);
  await openEditor(page);
  expect(await width()).toBe(320);
  // The edge stops at the panel's own limits, and steps by keyboard.
  await drag(-200);
  await expect.poll(width).toBe(280);
  await handle.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(width).toBe(360);
  await editor(page).getByRole('button', {name: 'Save', exact: true}).click();
  await expect.poll(async () => (await box(floating(page))).width).toBe(360);
  await page.reload();
  await expect.poll(async () => (await box(floating(page))).width).toBe(360);
  await openEditor(page);
  expect(await width()).toBe(360);
  await expectPanelPreview(page);
});

test('segmented outbound mode applies once and persists across reload', async ({page}) => {
  await save(page, {...defaults(), items: [{id: 'mode', form: 'text', size: 'medium'}], size: wide});
  const backend = await mockBackend(page);
  await page.goto('/#/activity');
  const widget = page.locator('[data-widget-id="mode"]');
  await widget.getByRole('radio', {name: 'Direct', exact: true}).click();
  await widget.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'reloaded: Direct'})).toBeVisible();
  await expect(page.locator('main').getByRole('radio', {name: 'Direct', exact: true})).toBeChecked();
  expect(backend.requests.filter(r => r.method() === 'PUT' && r.url().includes('/config/sources/'))).toHaveLength(1);
  await page.reload();
  await expect(widget.getByRole('radio', {name: 'Direct', exact: true})).toBeChecked();
  await expect(widget.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
});

test('a pending mode write blocks both hosts and a failed write keeps their shared draft', async ({page}) => {
  await save(page, {...defaults(), items: [{id: 'mode', form: 'text', size: 'medium'}], size: wide});
  const backend = await mockBackend(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  backend.handlers['PUT config/sources/src-main'] = async () => {
    await held;
    throw new ApiError(503, 'unavailable', 'Mode storage unavailable');
  };
  await page.goto('/#/activity');
  const widget = page.locator('[data-widget-id="mode"]');
  const request = page.waitForRequest(r => r.method() === 'PUT' && r.url().includes('/config/sources/'));
  await widget.getByRole('radio', {name: 'Direct', exact: true}).click();
  await widget.getByRole('button', {name: 'Apply', exact: true}).click();
  await request;
  await expect(widget.getByRole('radio', {name: 'Direct', exact: true})).toBeDisabled();
  await expect(page.locator('[data-instance="mode"]').getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  release();
  await expect(page.locator('.rp-toast.negative', {hasText: 'Mode storage unavailable'})).toBeVisible();
  await expect(widget.getByRole('radio', {name: 'Direct', exact: true})).toBeEnabled();
  await expect(page.locator('main').getByRole('radio', {name: 'Direct', exact: true})).toBeChecked();
  expect(backend.requests.filter(r => r.method() === 'PUT' && r.url().includes('/config/sources/'))).toHaveLength(1);
  expect((await backend.api.config()).sources.find(source => source.kind === 'main')!.content).not.toContain('-> direct # doona: outbound mode');
});

test('hidden widgets leave their editor unloaded', async ({page}) => {
  await save(page, {...defaults(), visible: false});
  const chunks: string[] = [];
  await page.route(/\/assets\/(Editors)-[^/]+\.js$/, async route => {
    chunks.push(route.request().url());
    await route.continue();
  });
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', {name: 'Settings', exact: true, level: 1})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Show widgets', exact: true})).toBeVisible();
  expect(chunks).toEqual([]);
});

test('the anchored panel resizes by keyboard within its limits and keeps the size after a reload', async ({page}) => {
  await page.goto('/#/settings');
  const before = await box(floating(page));
  await floating(page).getByRole('button', {name: 'Resize widgets panel', exact: true}).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await box(floating(page))).width).toBe(before.width + 48);
  await page.reload();
  await expect.poll(async () => (await box(floating(page))).width).toBe(before.width + 48);
  await openEditor(page);
  await expectPanelPreview(page);
  await editor(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  // The header moves the panel: dragged where its own controls are not, and by arrow keys on its move handle.
  const start = await box(floating(page));
  const name = await box(floating(page).locator('.rp-widget-backend'));
  const actions = await box(floating(page).locator('.rp-widget-actions'));
  const grip = {x: (name.x + name.width + actions.x) / 2, y: actions.y + actions.height / 2};
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x - 60, grip.y - 40, {steps: 4});
  await page.mouse.up();
  await expect.poll(async () => (await box(floating(page))).x).toBe(start.x - 60);
  expect((await box(floating(page))).y).toBe(start.y - 40);
  await floating(page).getByRole('button', {name: 'Move panel', exact: true}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(floating(page).getByRole('status')).toHaveText('Panel moved');
  await page.reload();
  await expect.poll(async () => (await box(floating(page))).x).toBe(start.x - 44);
  // Collapsing leaves the header alone, one control high on one row, without the resized body; expanding restores
  // the stored size.
  await floating(page).getByRole('button', {name: 'Resize widgets panel', exact: true}).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  const sized = await box(floating(page));
  // Every header item keeps its place in the panel, and the collapsed panel is the header with one inset all round.
  const items = () =>
    floating(page).evaluate(panel => {
      const origin = panel.getBoundingClientRect();
      return [...panel.querySelectorAll('.rp-widget-header > .rp-widget-backend, .rp-widget-actions > *')]
        .map(item => item.getBoundingClientRect())
        .filter(box => box.width > 0)
        .map(box => [box.left - origin.left, box.top - origin.top, box.width, box.height].map(Math.round));
    });
  const expanded = await items();
  await floating(page).getByRole('button', {name: 'Collapse widgets', exact: true}).click();
  await expect(floating(page).locator('.rp-widget-speed')).toBeVisible();
  expect(await items()).toEqual(expanded);
  const header = await box(floating(page).locator('.rp-widget-header'));
  const panel = await box(floating(page));
  expect(header.height).toBe(32);
  const insets = [header.x - panel.x, header.y - panel.y, panel.x + panel.width - header.x - header.width, panel.y + panel.height - header.y - header.height];
  for (const inset of insets) expect(Math.abs(inset - insets[0]), `${insets}`).toBeLessThanOrEqual(0.5);
  for (const part of ['.rp-widget-backend', '.rp-widget-speed', '.rp-widget-actions']) {
    const rect = await box(floating(page).locator(part));
    expect(Math.abs(rect.y + rect.height / 2 - (header.y + header.height / 2))).toBeLessThanOrEqual(1);
    expect(rect.x + rect.width, part).toBeLessThanOrEqual(header.x + header.width + 0.5);
  }
  await expect(floating(page).getByRole('button', {name: 'Resize widgets panel', exact: true})).toHaveCount(0);
  await floating(page).getByRole('button', {name: 'Expand widgets', exact: true}).click();
  await expect.poll(async () => (await box(floating(page))).height).toBe(sized.height);
  // Dragging the header opens a dock slot in the sidebar's lower half; only the slot is a drop target. Dropped there,
  // the panel docks as the sidebar's last section, at its foot with the engine and its version as its foot; it stays
  // docked after a reload and floats again from its menu.
  const head = await box(floating(page).locator('.rp-widget-header'));
  const side = page.locator('nav.rp-side');
  const sideBox = await box(side);
  const slot = side.locator('.rp-dock-slot');
  await expect(slot).toBeHidden();
  // The header's free stretch between the backend light and its buttons.
  await page.mouse.move(head.x + head.width / 4, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(head.x - 40, head.y, {steps: 2});
  await expect(slot).toHaveText('Drop here to dock');
  await expect.poll(async () => (await slot.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(sideBox.y + sideBox.height * 0.45);
  const target = await box(slot);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {steps: 6});
  await expect(slot).toHaveAttribute('data-dock-target', '');
  expect(await side.evaluate(nav => getComputedStyle(nav).outlineStyle)).toBe('none');
  await page.mouse.up();
  const dock = side.locator('.rp-side-dock');
  await expect(side.getByRole('status').last()).toHaveText('Widgets docked in the sidebar');
  await page.reload();
  await expect(dock.locator('.rp-widget-cell').first()).toBeVisible();
  await expect(floating(page)).toHaveCount(0);
  await expect(dock.locator('.rp-version-text')).not.toBeEmpty();
  const foot = await side.evaluate(nav => nav.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(nav).paddingBottom));
  const docked = await box(dock);
  expect(Math.abs(docked.y + docked.height - foot)).toBeLessThanOrEqual(1);
  expect(docked.height).toBeLessThanOrEqual(sideBox.height * 0.45);
  const dockHeader = dock.locator('.rp-widget-header');
  const groupHeader = side.locator('.rp-disclosure-trigger').first();
  const groupBox = await box(groupHeader);
  expect(Math.abs((await box(dockHeader)).height - groupBox.height)).toBeLessThanOrEqual(1);
  const groupStart = await groupHeader.evaluate(el => el.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(el).paddingInlineStart));
  expect(Math.abs((await box(dock.getByRole('heading', {name: 'Activity widgets', exact: true}))).x - groupStart)).toBeLessThanOrEqual(1);
  expect(Math.abs((await box(dock.locator('.rp-widget-label').first())).x - groupStart)).toBeLessThanOrEqual(1);
  await expect.poll(() => dock.locator('.rp-widget-body').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const chevron = await box(groupHeader.locator('svg'));
  for (const icon of await dockHeader.locator('svg').all()) {
    const bounds = await box(icon);
    expect(Math.abs(bounds.width - chevron.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.height - chevron.height)).toBeLessThanOrEqual(1);
  }
  // The group boundary resizes by keyboard and pointer, keeping the height after a reload.
  const resize = dock.getByRole('button', {name: 'Resize widgets panel', exact: true});
  await expect(resize).toHaveCSS('cursor', 'ns-resize');
  await resize.focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
  await expect.poll(async () => Math.round((await box(dock)).height)).toBe(Math.round(docked.height) - 32);
  await page.reload();
  await expect.poll(async () => Math.round((await box(dock)).height)).toBe(Math.round(docked.height) - 32);
  const edge = await box(resize);
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2 + 24, {steps: 4});
  await page.mouse.up();
  await expect.poll(async () => Math.round((await box(dock)).height)).toBe(Math.round(docked.height) - 56);
  await page.reload();
  await expect.poll(async () => Math.round((await box(dock)).height)).toBe(Math.round(docked.height) - 56);
  // Collapsed, the live rates take the title's place on the header's centre line, download first.
  await dock.getByRole('button', {name: 'Collapse widgets', exact: true}).click();
  await expect(dock.getByRole('heading', {name: 'Activity widgets', exact: true})).toHaveCount(0);
  const dockSpeed = dock.locator('.rp-widget-speed');
  await expect(dockSpeed).toContainText('Download');
  await expect(dockSpeed.locator('.rp-widget-speed-value')).toHaveCount(2);
  await expect(dockSpeed.locator('svg')).toHaveCount(2);
  expect(await dockSpeed.evaluate(el => el.textContent!.indexOf('Download') < el.textContent!.indexOf('Upload'))).toBe(true);
  const collapsedHeader = await box(dockHeader);
  const speedBox = await box(dockSpeed);
  expect(Math.abs(speedBox.y + speedBox.height / 2 - (collapsedHeader.y + collapsedHeader.height / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(speedBox.x - groupStart)).toBeLessThanOrEqual(1);
  await dock.getByRole('button', {name: 'Expand widgets', exact: true}).click();
  await expect(dock.getByRole('heading', {name: 'Activity widgets', exact: true})).toBeVisible();
  await moreAction(dock, 'Undock', 'Panel options');
  await expect(floating(page).locator('.rp-widget-cell').first()).toBeVisible();
  await expect(dock).toHaveCount(0);
  // A collapsed panel moved to the top edge expands downwards, whole inside the viewport, its chevron pointing down.
  await floating(page).getByRole('button', {name: 'Collapse widgets', exact: true}).click();
  const bar = await box(floating(page).locator('.rp-widget-header'));
  const barGrip = {x: bar.x + bar.width / 2 - 40, y: bar.y + bar.height / 2};
  await page.mouse.move(barGrip.x, barGrip.y);
  await page.mouse.down();
  await page.mouse.move(barGrip.x, 0, {steps: 6});
  await page.mouse.up();
  const top = await box(floating(page));
  await floating(page).getByRole('button', {name: 'Expand widgets', exact: true}).click();
  await expect.poll(async () => (await box(floating(page))).height).toBeGreaterThan(top.height + 100);
  const grown = await box(floating(page));
  expect(grown.y).toBe(top.y);
  expect(grown.y + grown.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => String(getSelection()))).toBe('');
});

test('an unpinned panel collapses on another page and a pinned one stays open', async ({page}) => {
  await page.goto('/#/settings');
  const pin = floating(page).getByRole('button', {name: 'Pin panel', exact: true});
  await expect(pin).toBeVisible();
  await page.goto('/#/connections');
  await expect(floating(page).getByRole('button', {name: 'Expand widgets', exact: true})).toBeVisible();
  await floating(page).getByRole('button', {name: 'Expand widgets', exact: true}).click();
  await pin.click();
  await expect(floating(page).getByRole('button', {name: 'Unpin panel', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/settings');
  await settle(page);
  await page.reload();
  await page.goto('/#/connections');
  await expect(floating(page).getByRole('button', {name: 'Collapse widgets', exact: true})).toBeVisible();
});

test.describe('header and edge at 1440', () => {
  test.use({viewport: {width: 1440, height: 900}});
  const handle = (page: Page) => page.locator('.rp-edge-handle');
  const options = (page: Page) => floating(page).getByRole('button', {name: 'Panel options', exact: true});
  test('edit stays in the menu, header speeds fit, and the menu sets hiding at an edge', async ({page}) => {
    const backend = await mockBackend(page);
    backend.handlers['GET runtime'] = async () => {
      const runtime = await backend.api.runtime();
      return {...runtime, traffic: {...runtime.traffic, rates: {upload_bytes_per_second: '999000000', download_bytes_per_second: '3500000'}}};
    };
    await page.goto('/#/settings');
    const header = floating(page).locator('.rp-widget-header');
    await expect(header.getByRole('button', {name: 'Edit widgets', exact: true})).toHaveCount(0);
    const sizes = await header.getByRole('button').evaluateAll(buttons => buttons.map(button => `${button.clientWidth}x${button.clientHeight}`));
    expect(sizes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(sizes).size).toBe(1);
    // Content actions first, then the window controls with collapse last; the tab order is the visual order.
    const order = await header
      .locator('.rp-widget-actions button')
      .evaluateAll(items => items.map(item => [item.getBoundingClientRect().left, item.getAttribute('aria-label')]));
    expect(order.map(([, name]) => name)).toEqual(['Panel options', 'Pin panel', 'Collapse widgets']);
    expect(order.map(([left]) => left)).toEqual(order.map(([left]) => left).sort((a, b) => Number(a) - Number(b)));
    await openEditor(page);
    await editor(page).getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(editor(page)).toHaveCount(0);
    await header.getByRole('button', {name: 'Collapse widgets', exact: true}).click();
    const speeds = header.locator('.rp-widget-speed-value');
    await expect(speeds).toHaveText(['3.5 MB/s', '999 MB/s']);
    await expect(header.locator('.rp-widget-speed')).toContainText('Download');
    for (const speed of await speeds.all()) expect(await speed.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await options(page).click();
    await expect(page.getByRole('menuitem', {name: 'Edit widgets'})).toBeVisible();
    const edge = page.getByRole('menuitemcheckbox', {name: 'Hide at edge', exact: true});
    await expect(edge).toHaveAttribute('aria-checked', 'false');
    await edge.click();
    await expect(edge).toHaveAttribute('aria-checked', 'true');
    // The open menu keeps the panel out; closed by a click away, the panel hides behind its handle.
    await expect(floating(page)).toBeVisible();
    await page.mouse.click(400, 400);
    await expect(floating(page)).toBeHidden();
    await page.reload();
    await expect(handle(page)).toHaveAttribute('data-edge', 'right');
    await expect(floating(page)).toBeHidden();
  });
  for (const [edge, layout] of [
    ['right', {}],
    ['left', {offset: {x: 5000, y: 300}}],
    ['top', {offset: {x: 560, y: 0, top: true as const}, collapsed: true}],
    ['bottom', {offset: {x: 560, y: 0}, collapsed: true}]
  ] as const)
    test(`a panel near the ${edge} edge hides there behind its handle`, async ({page}) => {
      await save(page, {...defaults(), ...layout, edge: true});
      await page.goto('/#/settings');
      await expect(handle(page)).toHaveAttribute('data-edge', edge);
      await expect(floating(page)).toBeHidden();
      const tab = await box(handle(page));
      const reach = {right: tab.x + tab.width - 1440, left: tab.x, top: tab.y, bottom: tab.y + tab.height - 900}[edge];
      expect(Math.abs(reach)).toBeLessThanOrEqual(1);
      await expect(handle(page).locator('.rp-light')).toBeVisible();
      await expect(handle(page).locator('.rp-widget-speed')).toContainText('Download');
      const geometry = await handle(page).evaluate((el, side) => {
        const style = getComputedStyle(el);
        const header = el.querySelector('.rp-widget-header')!;
        const content = [...header.children].reduce((width, child) => width + child.getBoundingClientRect().width, 0);
        const corners = {
          left: [style.borderTopLeftRadius, style.borderBottomLeftRadius],
          right: [style.borderTopRightRadius, style.borderBottomRightRadius],
          top: [style.borderTopLeftRadius, style.borderTopRightRadius],
          bottom: [style.borderBottomLeftRadius, style.borderBottomRightRadius]
        };
        return {
          contentWidth:
            content +
            parseFloat(getComputedStyle(header).columnGap) +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            parseFloat(style.borderLeftWidth) +
            parseFloat(style.borderRightWidth),
          corners: corners[side],
          border: style.getPropertyValue(`border-${side}-width`)
        };
      }, edge);
      expect(Math.abs(tab.width - geometry.contentWidth)).toBeLessThanOrEqual(2);
      expect(tab.width).toBeLessThan(208 * 0.75);
      expect(geometry.corners).toEqual(['0px', '0px']);
      expect(geometry.border).toBe('0px');
    });
  test('the hidden summary is narrower than the docked collapsed row', async ({page}) => {
    await save(page, {...defaults(), docked: true, collapsed: true, edge: true});
    await page.goto('/#/settings');
    const row = await box(page.locator('.rp-side-dock .rp-widget-header'));
    await moreAction(page.locator('.rp-side-dock'), 'Undock', 'Panel options');
    await expect(floating(page)).toBeHidden();
    const summary = await box(handle(page));
    expect(summary.width).toBeLessThan(row.width * 0.75);
    expect(Math.abs(summary.height - row.height)).toBeLessThanOrEqual(1);
  });
  test('hover and keyboard focus show the hidden panel; leaving or Escape hides it again', async ({page}) => {
    await save(page, {...defaults(), edge: true});
    await page.goto('/#/settings');
    await expect(floating(page)).toBeHidden();
    await handle(page).hover();
    await expect(floating(page)).toBeVisible();
    // Out, the panel is the target and its handle is gone.
    await expect(handle(page)).toBeHidden();
    await floating(page).locator('.rp-panel-head').hover();
    await page.mouse.move(400, 400);
    await expect(floating(page)).toBeHidden();
    await expect(handle(page)).toBeVisible();
    // Focus moved while the reader uses the keyboard brings the panel out and into focus.
    await page.keyboard.press('Tab');
    await handle(page).focus();
    await expect(floating(page)).toBeVisible();
    await expect(floating(page).getByRole('button', {name: 'Move panel', exact: true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(floating(page)).toBeHidden();
    await expect(handle(page)).toBeFocused();
  });
  test('the summary keeps its edge when the window resizes', async ({page}) => {
    await save(page, {...defaults(), edge: true});
    await page.goto('/#/settings');
    await expect(handle(page)).toHaveAttribute('data-edge', 'right');
    await page.setViewportSize({width: 1200, height: 800});
    await expect.poll(async () => Math.round((await box(handle(page))).x + (await box(handle(page))).width)).toBe(1200);
    await expect(floating(page)).toBeHidden();
  });
  test('a panel out under the pointer hides once moving to another page collapses it away from the pointer', async ({page}) => {
    await save(page, {...defaults(), edge: true});
    await page.goto('/#/settings');
    await handle(page).hover();
    const cell = floating(page).locator('.rp-widget-cell').last();
    await cell.hover();
    await page.evaluate(() => (location.hash = '#/overview'));
    await expect(floating(page).locator('.rp-widget-cell')).toHaveCount(0);
    await expect(floating(page)).toBeHidden();
    await expect(handle(page)).toBeVisible();
  });
  test('a drag that carries the pointer outside the panel keeps it out until the drag ends', async ({page}) => {
    await save(page, {...defaults(), edge: true});
    await page.goto('/#/settings');
    await handle(page).hover();
    // Hovering waits for the panel to finish sliding out, so the press lands on its header.
    await floating(page).locator('.rp-panel-head').hover();
    const head = await box(floating(page).locator('.rp-widget-header'));
    await page.mouse.move(head.x + head.width / 4, head.y + head.height / 2);
    await page.mouse.down();
    // The panel stops at the window's corner while the pointer goes on, past the hide delay.
    await page.mouse.move(1430, 890, {steps: 4});
    const out = await box(floating(page));
    expect(out.x + out.width < 1430 || out.y + out.height < 890).toBe(true);
    await page.waitForTimeout(600);
    await expect(floating(page)).toBeVisible();
    await page.mouse.up();
    await page.mouse.move(400, 400);
    await expect(floating(page)).toBeHidden();
  });
  test('Escape in a text field in the panel stays with the field', async ({page}) => {
    await save(page, {...defaults(), edge: true});
    await page.goto('/#/settings');
    await handle(page).hover();
    await floating(page).locator('.rp-panel-head').hover();
    await floating(page)
      .locator('.rp-widget-body')
      .evaluate(body => body.append(Object.assign(document.createElement('input'), {ariaLabel: 'Probe'})));
    await floating(page).getByRole('textbox', {name: 'Probe'}).focus();
    await page.keyboard.press('Escape');
    await expect(floating(page)).toBeVisible();
    await floating(page).getByRole('button', {name: 'Move panel', exact: true}).focus();
    await page.keyboard.press('Escape');
    await expect(floating(page)).toBeHidden();
  });
  for (const [name, layout] of [
    ['pinned', {pinned: true}],
    ['docked', {docked: true}]
  ] as const)
    test(`a ${name} panel ignores hiding at an edge`, async ({page}) => {
      await save(page, {...defaults(), ...layout, edge: true});
      await page.goto('/#/settings');
      await expect(
        page
          .locator(name === 'docked' ? '.rp-side-dock' : '.rp-floating-panel')
          .locator('.rp-widget-cell')
          .first()
      ).toBeVisible();
      await expect(handle(page)).toHaveCount(0);
    });
});

test.describe('edge on touch at 1024', () => {
  test.use({viewport: {width: 1024, height: 768}, hasTouch: true});
  test('a tap on the handle shows the hidden panel and a tap outside hides it', async ({page}) => {
    await save(page, {...defaults(), edge: true});
    await page.goto('/#/settings');
    const handle = page.locator('.rp-edge-handle');
    await expect(floating(page)).toBeHidden();
    await handle.tap();
    await expect(floating(page)).toBeVisible();
    await expect(handle).toBeHidden();
    // A tap inside the panel keeps it out.
    const head = await box(floating(page).locator('.rp-widget-header'));
    await page.touchscreen.tap(head.x + head.width / 4, head.y + head.height / 2);
    await expect(floating(page)).toBeVisible();
    const main = await box(page.locator('main'));
    await page.touchscreen.tap(main.x + 8, main.y + 8);
    await expect(floating(page)).toBeHidden();
    await expect(handle).toBeVisible();
  });
  test('with a menu open, one tap outside closes the menu and hides the panel', async ({page}) => {
    await save(page, {...defaults(), edge: true});
    await page.goto('/#/settings');
    const handle = page.locator('.rp-edge-handle');
    await handle.tap();
    await floating(page).getByRole('button', {name: 'Panel options', exact: true}).tap();
    await expect(page.getByRole('menu')).toBeVisible();
    const main = await box(page.locator('main'));
    await page.touchscreen.tap(main.x + 8, main.y + 8);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(floating(page)).toBeHidden();
    await expect(handle).toBeVisible();
  });
});

test('editor previews never rewrite a saved latency group, even without cached groups', async ({page}) => {
  await save(page, {...defaults(), collapsed: true, items: [{id: 'latency', form: 'kv', size: 'medium', group: 'custom-only'}]});
  await page.goto('/#/settings');
  await openEditor(page);
  await expect(editor(page).locator('.rp-sortable-row')).toHaveCount(1);
  await editor(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(editor(page)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('doona-widgets') ?? '{}').items[0].group)).toBe('custom-only');
});

const darkTraditional = {
  'doona-lang': 'zh-TW',
  'doona-scheme': 'dark',
  'doona-profiles': JSON.stringify([{id: 'demo', name: 'Demo', api: 'mock', token: ''}]),
  'doona-profile': 'demo'
};

for (const width of [1280, 390]) {
  test.describe(`sidebar widget content box at ${width}`, () => {
    test.use({viewport: {width, height: 1100}, storage: darkTraditional});
    test('aligns embedded content to section text and chevron edges without changing the phone host', async ({page}) => {
      await save(page, {
        ...defaults(),
        docked: true,
        items: [...defaults().items, {id: 'download', size: 'small', form: 'kv'}, {id: 'upload', size: 'small', form: 'kv'}]
      });
      await page.goto('/#/activity');
      await page.getByRole('button', {name: '登入', exact: true}).click();
      const side = page.locator('nav.rp-side');
      const dock = side.locator('.rp-side-dock');
      if (width === 390) {
        await expect(side).toBeHidden();
        await expect(dock).toHaveCount(0);
        await page.getByRole('button', {name: '顯示小工具', exact: true}).click();
        const sheet = page.locator('.rp-drawer');
        await expect(sheet.locator('.rp-widget-label').first()).toBeVisible();
        // The sheet is still entering: compare all edges in one frame, not across its moving transform.
        const edges = await sheet
          .locator('.rp-widget-label, .rp-compact-chart, .rp-compact-chart > div:not(.rp-legend), .rp-kv.row > div, .rp-hrule')
          .evaluateAll(items => {
            const content = items[0].getBoundingClientRect();
            return items.map(item => {
              const bounds = item.getBoundingClientRect();
              return [Math.abs(bounds.left - content.left), Math.abs(bounds.right - content.right)];
            });
          });
        for (const edge of edges) for (const gap of edge) expect(gap).toBeLessThanOrEqual(1);
        return;
      }
      await expect(dock.locator('.rp-widget-label').first()).toBeVisible();
      const group = side.getByRole('button', {name: '路由', exact: true});
      const title = await box(group.locator('.rp-disclosure-title'));
      const chevron = await box(group.locator('svg'));
      const left = title.x;
      const right = chevron.x + chevron.width;
      expect(Math.abs((await box(dock.locator('.rp-dock-title'))).x - left)).toBeLessThanOrEqual(1);
      await expect(dock.locator('.rp-compact-chart svg.rp-activity-surface')).toHaveCount(2);
      for (const item of await dock
        .locator(
          '.rp-widget-header, .rp-widget-label, .rp-legend .it, .rp-compact-chart, .rp-compact-chart > div:not(.rp-legend), .rp-compact-chart svg.rp-activity-surface, .rp-kv > div, .rp-hrule, .rp-segfit, .rp-seg'
        )
        .all()) {
        const bounds = await box(item);
        const name = await item.evaluate(el => `${el.className}: ${el.textContent}`);
        expect(Math.abs(bounds.x - left), name).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.x + bounds.width - right), name).toBeLessThanOrEqual(1);
      }
      const apply = await box(dock.getByRole('button', {name: '套用', exact: true}));
      const segmented = await box(dock.locator('.rp-segfit'));
      expect(Math.abs(apply.x - left)).toBeLessThanOrEqual(1);
      expect(Math.abs(apply.x + apply.width - right)).toBeLessThanOrEqual(1);
      expect(Math.abs(apply.height - segmented.height)).toBeLessThanOrEqual(0.5);
      for (const value of await dock.locator('.rp-kv .v, .rp-legend b').all()) {
        const bounds = await box(value);
        expect(Math.abs(bounds.x + bounds.width - right), (await value.textContent()) ?? undefined).toBeLessThanOrEqual(1);
        const textRight = await value.evaluate(el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect().right;
        });
        expect(Math.abs(textRight - right), (await value.textContent()) ?? undefined).toBeLessThanOrEqual(1);
      }
      const collapse = await box(dock.locator('.rp-widget-collapse svg'));
      expect(Math.abs(collapse.x + collapse.width - right)).toBeLessThanOrEqual(1);
      const navIcon = await box(side.locator('.rp-nav > svg').first());
      expect(Math.abs((await box(dock.locator('.rp-version .rp-light'))).x - navIcon.x)).toBeLessThanOrEqual(1);
      for (const plot of await dock.locator('.rp-compact-chart svg.rp-activity-surface').all()) {
        const ink = await plot.evaluate(el => {
          const path = el.querySelector('path')!;
          const bounds = path.getBBox();
          return {left: bounds.x, right: bounds.x + bounds.width, width: el.getBoundingClientRect().width};
        });
        expect(Math.abs(ink.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(ink.right - ink.width)).toBeLessThanOrEqual(1);
      }
    });
  });
}

test.describe('sidebar read-only mode', () => {
  test.use({viewport: {width: 1280, height: 1100}, storage: {'doona-lang': 'zh-TW', 'doona-scheme': 'dark'}});
  test('fills the content box with the mode explanation trigger at the segmented control height', async ({page}) => {
    const {api, handlers} = await mockBackend(page);
    const config = await api.config();
    for (const source of config.sources) source.writable = false;
    handlers['GET config'] = async () => config;
    await save(page, {...defaults(), docked: true});
    await page.goto('/#/activity');
    const dock = page.locator('.rp-side-dock');
    const trigger = dock.getByRole('button', {name: '檢視唯讀原因', exact: true});
    await expect(trigger).toBeVisible();
    const content = await box(dock.locator('.rp-widget-label').first());
    const segmented = await box(dock.locator('.rp-segfit'));
    const action = await box(trigger);
    expect(Math.abs(action.x - content.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(action.x + action.width - content.x - content.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(action.height - segmented.height)).toBeLessThanOrEqual(0.5);
    await trigger.click();
    await expect(page.getByRole('dialog', {name: '檢視唯讀原因', exact: true})).toBeVisible();
  });
});

test.describe('phone sheet', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true});
  test('the sheet header carries the backend light and starts at the content inset', async ({page}) => {
    await page.goto('/#/overview');
    await page.getByRole('button', {name: 'Show widgets', exact: true}).click();
    const sheet = page.locator('.rp-drawer');
    await expect(sheet.locator('.rp-widget-cell').first()).toBeVisible();
    await expect(floating(page)).toHaveCount(0);
    const title = sheet.getByRole('heading', {level: 2});
    await expect(title.locator('.rp-light.ok')).toBeVisible();
    const head = await box(title);
    const first = await box(sheet.locator('.rp-widget-cell').first());
    expect(Math.abs(head.x - first.x)).toBeLessThanOrEqual(1);
    const close = await box(sheet.getByRole('button', {name: 'Close', exact: true}));
    expect(Math.abs(head.y + head.height / 2 - (close.y + close.height / 2))).toBeLessThanOrEqual(1);
  });
});
// Tablets float the panel and move it by touch; docking needs the sidebar.
for (const viewport of [
  {width: 768, height: 1024},
  {width: 1024, height: 768}
])
  test.describe(`tablet ${viewport.width}`, () => {
    test.use({viewport, hasTouch: true});
    test('floats the panel and a touch drag on its header moves it', async ({page}) => {
      await page.goto('/#/overview');
      await expect(floating(page).locator('.rp-widget-cell').first()).toBeVisible();
      await expect(page.locator('.rp-drawer')).toHaveCount(0);
      const start = await box(floating(page));
      const head = await box(floating(page).locator('.rp-widget-header'));
      const x = head.x + head.width / 4;
      const y = head.y + head.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
      for (let step = 1; step <= 4; step++)
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - 15 * step, y: y - 10 * step}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await expect.poll(async () => (await box(floating(page))).x).toBeCloseTo(start.x - 60, 0);
      expect((await box(floating(page))).y).toBeCloseTo(start.y - 40, 0);
      await floating(page).getByRole('button', {name: 'Panel options', exact: true}).click();
      await expect(page.getByRole('menuitem', {name: 'Dock in sidebar', exact: true})).toHaveCount(viewport.width >= 1024 ? 1 : 0);
    });
  });

// A short window makes both the links and the docked panel scroll, so each has its scrollbar.
test.describe('sidebar scrollbars at 1280x640', () => {
  test.use({viewport: {width: 1280, height: 640}, storage: darkTraditional});
  test("the scrollbars keep the top bar's inline gap from the links and the panel, and the mode control splits evenly", async ({page}) => {
    await save(page, {...defaults(), docked: true});
    await page.goto('/#/activity');
    await page.getByRole('button', {name: '登入', exact: true}).click();
    const side = page.locator('nav.rp-side');
    const dock = side.locator('.rp-side-dock');
    await expect(dock.locator('.rp-widget-label').first()).toBeVisible();
    const segments = await dock.locator('.rp-seg .rp-btn').all();
    expect(segments).toHaveLength(3);
    const widths = [];
    for (const segment of segments) {
      const bounds = await box(segment);
      const text = await segment.evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        return rect.left + rect.width / 2;
      });
      expect(Math.abs(text - (bounds.x + bounds.width / 2)), (await segment.textContent()) ?? undefined).toBeLessThanOrEqual(1);
      widths.push(bounds.width);
    }
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const gap = await page.evaluate(() => {
      const bar = document.querySelector('.rp-top')!;
      const inline = window.innerWidth - bar.lastElementChild!.getBoundingClientRect().right;
      // The scrollbar's inner edge, and the right edge of what the scroller holds.
      const clear = (scroller: HTMLElement, items: Element[]) => {
        const bounds = scroller.getBoundingClientRect();
        const scrolls = scroller.scrollHeight > scroller.clientHeight && scroller.offsetWidth - scroller.clientWidth > 0;
        return {bar: scrolls, gap: bounds.left + scroller.clientWidth - Math.max(...items.map(item => item.getBoundingClientRect().right))};
      };
      const links = document.querySelector<HTMLElement>('.rp-side-links')!;
      const body = document.querySelector<HTMLElement>('.rp-side-dock .rp-widget-body')!;
      return {
        inline,
        links: clear(links, [...links.querySelectorAll('.rp-nav')]),
        panel: clear(body, [...body.querySelectorAll('.rp-widget-body-content, .rp-seg, .rp-btn')])
      };
    });
    expect(gap.inline).toBeGreaterThan(0);
    expect(gap.links.bar).toBe(true);
    expect(gap.panel.bar).toBe(true);
    expect(gap.links.gap).toBeGreaterThanOrEqual(gap.inline);
    expect(gap.panel.gap).toBeGreaterThanOrEqual(gap.inline);
  });
});

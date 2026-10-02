import {test, expect, mockBackend, moreAction, settle, box} from './fixtures';
import {ApiError} from '../src/api/error';
import {defaults, type Layout} from '../src/shell/widgets/layout';
import type {Page} from '@playwright/test';

test.use({widgets: true});
const save = (page: Page, layout: Layout) =>
  page.addInitScript(value => {
    if (!localStorage.getItem('doona-widgets')) localStorage.setItem('doona-widgets', JSON.stringify(value));
  }, layout);
// Wide enough for a segmented control's options to show in a row rather than in its overflow menu.
const wide = {width: 480, height: 640};
const floating = (page: Page) => page.locator('.rp-floating-panel');
const editor = (page: Page) => page.getByRole('dialog', {name: 'Edit widgets', exact: true});
const openEditor = async (page: Page) => {
  await moreAction(page.locator('.rp-widget-header'), 'Edit widgets', 'Panel options');
  await expect(editor(page).locator('.rp-widget-inspector button').first()).toBeVisible();
};
test('edits a draft, cancels changes, saves sizes and order, and restores defaults', async ({page}) => {
  await page.goto('/#/settings');
  await openEditor(page);
  await editor(page).getByRole('radio', {name: 'Key-value list', exact: true}).click();
  await editor(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(floating(page).locator('figure').first()).toBeVisible();
  await openEditor(page);
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
  await expect(page.locator('main').getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
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
  // The divider above the docked section sets its height by arrow keys, kept after a reload.
  await dock.getByRole('button', {name: 'Resize widgets panel', exact: true}).focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
  await expect.poll(async () => Math.round((await box(dock)).height)).toBe(Math.round(docked.height) - 32);
  await page.reload();
  await expect.poll(async () => Math.round((await box(dock)).height)).toBe(Math.round(docked.height) - 32);
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
    const speeds = header.locator('.rp-widget-speed > span');
    await expect(speeds).toHaveText(['↑ 999 MB/s', '↓ 3.5 MB/s']);
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
      await expect(handle(page).locator('.rp-widget-speed')).toContainText('↓');
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
  test('the hidden summary is narrower than the unchanged docked collapsed row', async ({page}) => {
    await save(page, {...defaults(), docked: true, collapsed: true, edge: true});
    await page.goto('/#/settings');
    const row = await box(page.locator('.rp-side-dock .rp-widget-header'));
    await moreAction(page.locator('.rp-side-dock'), 'Undock', 'Panel options');
    await expect(floating(page)).toBeHidden();
    const summary = await box(handle(page));
    expect(row.width).toBe(208);
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

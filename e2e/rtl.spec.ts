import type {Locator, Page} from '@playwright/test';
import {detail, expect, test} from './fixtures';

// No right-to-left language ships yet, so these specs make the engine report every locale as right to left. The app's
// direction and React Aria's both read Intl.Locale's text info, so the first-paint stamp, the shell and React Aria's
// popovers and keys all turn right to left, as they would for Arabic. The override lives in this spec only.
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Intl.Locale.prototype, 'getTextInfo', {configurable: true, value: () => ({direction: 'rtl'})});
  });
});

const box = async (locator: Locator) => (await locator.boundingBox())!;

// The sine of an element's turn. The down chevron turned to the right has -1, turned to the left 1.
const turn = (locator: Locator) =>
  locator.evaluate(el => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return Math.round(m.b);
  });

// Whether a value's first character is drawn left of its last, as in left-to-right text.
const readsLeftToRight = (locator: Locator) =>
  locator.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, node => (node.textContent!.trim().length > 1 ? 1 : 3));
    const text = walker.nextNode() as Text | null;
    if (!text) return null;
    const content = text.textContent!;
    const first = content.search(/\S/);
    const last = content.trimEnd().length - 1;
    const rect = (at: number) => {
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      return range.getBoundingClientRect();
    };
    return rect(first).left < rect(last).left;
  });

// A domain, an address with or without a port, or a hash, alone in its cell.
const technical = /^\s*(\[?[0-9a-f:.]+\]?(:\d+)?|[\w-]+(\.[\w-]+)+(:\d+)?|[0-9a-f]{8,})\s*$/i;

async function expectRtlLayout(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal page overflow').toBeLessThanOrEqual(0);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // The side navigation and the page title sit at the inline start, which is the right.
  const width = page.viewportSize()!.width;
  const nav = await box(page.locator('nav.rp-side'));
  expect(nav.x + nav.width).toBeGreaterThan(width - 2);
  expect(nav.x).toBeGreaterThan(width / 2);
  const main = await box(page.locator('.rp-main'));
  const title = await box(page.locator('.rp-h1'));
  expect(main.x + main.width - (title.x + title.width), 'title gap on the right').toBeLessThan(title.x - main.x);
}

// Below the side navigation's breakpoint the top bar's overflow menu lists its rows with a chevron pointing into each
// submenu; right to left it points left.
async function expectMirroredChevron(page: Page) {
  const size = page.viewportSize()!;
  await page.setViewportSize({width: 800, height: size.height});
  await page.locator('.rp-top').getByRole('button', {name: 'More options'}).click();
  const chevron = page.locator('.rp-subitem .rp-chev-end').first();
  await expect(chevron).toBeVisible();
  expect(await turn(chevron)).toBe(1);
  await page.keyboard.press('Escape');
  await page.setViewportSize(size);
}

async function expectTechnicalCell(cells: Locator) {
  const cell = cells.filter({hasText: technical}).first();
  await expect(cell).toBeVisible();
  expect(await readsLeftToRight(cell), `${await cell.textContent()} reads left to right`).toBe(true);
}

// A detail value keeps its own order but lines up with its label at the inline start.
async function expectValueAtRight(value: Locator) {
  const gap = await value.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return el.getBoundingClientRect().right - range.getBoundingClientRect().right;
  });
  expect(gap).toBeLessThanOrEqual(1);
}

test.describe('right to left at 1280px', () => {
  test.use({viewport: {width: 1280, height: 900}});

  test('overview lays out from the right and keeps technical values left to right', async ({page}) => {
    await page.goto('/#/overview');
    await expect(page.locator('.rp-content > *').first()).toBeVisible();
    await expectRtlLayout(page);
    await expectTechnicalCell(page.locator('.rp-kv .v'));
    await expectValueAtRight(page.locator('.rp-kv .v').filter({hasText: technical}).first());
    await expectMirroredChevron(page);
  });

  test.describe('connections', () => {
    // The flat list, whose rows can be selected.
    test.use({storage: {'doona-mock-big': '100', 'doona-connections-view': JSON.stringify({hidden: [], sort: null, group: 'none'})}});

    test('connections put the detail panel on the left and keep destinations left to right', async ({page}) => {
      await page.goto('/#/connections?tab=list');
      const cells = page.locator('.rp-table :is([role=rowheader], [role=gridcell])');
      await expect(cells.first()).toBeVisible();
      await expectRtlLayout(page);
      await expectTechnicalCell(cells);
      await expectMirroredChevron(page);
      await page.locator('.rp-table [data-key="c-0002"]').click();
      const panel = detail(page);
      await expect(panel).toBeVisible();
      const list = await box(page.locator('.rp-with-panel > :first-child'));
      const aside = await box(panel);
      expect(aside.x + aside.width).toBeLessThanOrEqual(list.x + 1);
      await expectRtlLayout(page);
    });
  });

  test('rules keep rule text left to right', async ({page}) => {
    await page.goto('/#/rules?tab=list');
    const cells = page.locator('.rp-table :is([role=rowheader], [role=gridcell])');
    await expect(cells.first()).toBeVisible();
    await expectRtlLayout(page);
    const rule = page
      .locator('.rp-table .rp-code')
      .filter({hasText: /\w\.\w/})
      .first();
    await expect(rule).toBeVisible();
    expect(await readsLeftToRight(rule)).toBe(true);
    await expect(rule).toHaveCSS('direction', 'ltr');
    await expectMirroredChevron(page);
  });

  test('config keeps the source editor left to right', async ({page}) => {
    await page.goto('/#/config?tab=source');
    const editor = page.locator('.cm-editor').first();
    await expect(editor).toBeVisible();
    await expectRtlLayout(page);
    await expect(editor).toHaveCSS('direction', 'ltr');
    const line = page.locator('.cm-line').filter({hasText: /\w{2}/}).first();
    expect(await readsLeftToRight(line)).toBe(true);
    await expectMirroredChevron(page);
  });

  test('the segmented slider sits under the selected segment', async ({page}) => {
    await page.goto('/#/activity');
    const seg = page.getByRole('radiogroup', {name: 'History range'});
    await expect(seg).toBeVisible();
    const under = async () => {
      const slider = await box(seg.locator('> .rp-slider'));
      const selected = await box(seg.locator('[data-selected]'));
      return Math.round(Math.abs(slider.x + slider.width / 2 - (selected.x + selected.width / 2)));
    };
    await expect.poll(under).toBeLessThanOrEqual(1);
    await seg.getByRole('radio').last().click();
    await expect(seg.getByRole('radio').last()).toBeChecked();
    await expect.poll(under).toBeLessThanOrEqual(1);
  });
});

test.describe('right to left at 390px', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('the overflow menu opens inside the screen with mirrored chevrons and arrow keys', async ({page}) => {
    await page.goto('/#/overview');
    await expect(page.locator('.rp-content > *').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The first section of the bottom bar is at the inline start.
    const links = page.getByRole('navigation', {name: 'Sections'}).getByRole('link');
    expect((await box(links.first())).x).toBeGreaterThan((await box(links.last())).x);

    await page.locator('.rp-top').getByRole('button', {name: 'More options'}).click();
    const rows = page.locator('.rp-subitem');
    // Four submenu rows and the Backend row, which opens a popover and has no chevron.
    await expect(rows).toHaveCount(5);
    for (const row of await rows.all()) {
      const {x, width} = await box(row);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(390);
      // The row reads from the right: its icon comes before its label.
      expect((await box(row.locator('.ic'))).x).toBeGreaterThan((await box(row.locator('.rp-truncate'))).x);
    }
    // Each submenu's chevron points left.
    const chevrons = rows.locator('.rp-chev-end');
    await expect(chevrons).toHaveCount(4);
    for (const chevron of await chevrons.all()) expect(await turn(chevron)).toBe(1);
    // Into a submenu is the left arrow, and back out of it, which its chevron points to, the right.
    await page.getByRole('menuitem', {name: 'Theme'}).focus();
    await page.keyboard.press('ArrowLeft');
    const back = page.locator('.rp-drill-back .rp-chev-start');
    await expect(back).toBeVisible();
    expect(await turn(back)).toBe(-1);
    await expect(page.getByRole('menuitemradio', {name: 'Light'})).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rows).toHaveCount(5);
    await expect(page.getByRole('menuitem', {name: 'Theme'})).toBeFocused();
  });
});

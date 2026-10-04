import type {Locator, Page} from '@playwright/test';
import {expect, loadCatalogues, mockBackend, routes, settle, settleFrames, test} from './fixtures';
import {translate} from '../src/i18n';
import {defaultWidget, defaults, type Layout} from '../src/shell/widgets/layout';

// Every segmented control is S2's default M (32px, the touch height on a phone), its selected item fills it, and every control on its row is as tall and centred on the same line, on every page, in
// the widget panel and while editing the dashboard.
test.beforeAll(loadCatalogues);
const t = (key: Parameters<typeof translate>[1]) => translate('zh-TW', key);
// The default panel with a group switch, whose network choice is a segmented control too.
const panelLayout = (docked: boolean): Layout => ({...defaults(), items: [...defaults().items, defaultWidget('group')], docked: docked || undefined});
const save = (page: Page, layout: Layout) =>
  page.addInitScript(value => {
    if (!localStorage.getItem('doona-widgets')) localStorage.setItem('doona-widgets', JSON.stringify(value));
  }, layout);

// Failures for every segmented control under the scope; how many were measured comes back so a scope cannot pass empty.
async function segmentedGeometry(scope: Locator) {
  return scope.evaluate(root => {
    const sizes = getComputedStyle(document.documentElement);
    const control = parseFloat(sizes.getPropertyValue('--rp-control'));
    const rows = '.rp-toolbar, .rp-tabhead, .rp-page-actions, .rp-row, .rp-cluster, .rp-field-row';
    const controls = '.rp-btn, .rp-input, .rp-selectbtn, .rp-select, .rp-switch, .rp-tab, .rp-segfit';
    const failures: string[] = [];
    let measured = 0;
    const off = (a: number, b: number) => Math.abs(a - b) > 0.5;
    for (const fit of root.querySelectorAll<HTMLElement>('.rp-segfit')) {
      if (!fit.checkVisibility()) continue;
      const seg = fit.querySelector<HTMLElement>(':scope > .rp-seg')!;
      const name = seg.getAttribute('aria-label');
      if (seg.dataset.size !== 'M') failures.push(`${name}: size ${seg.dataset.size}`);
      const collapsed = fit.hasAttribute('data-collapsed');
      // A collapsed control shows its picker over the hidden track at the same height.
      const shown = collapsed ? fit.querySelector<HTMLElement>('.rp-segpick .rp-selectbtn')! : seg;
      const box = shown.getBoundingClientRect();
      measured++;
      if (off(seg.getBoundingClientRect().height, control)) failures.push(`${name}: track ${seg.getBoundingClientRect().height}`);
      if (off(box.height, control)) failures.push(`${name}: shown ${box.height}`);
      if (!collapsed) {
        const selected = seg.querySelector<HTMLElement>('.rp-btn[data-selected]')!.getBoundingClientRect();
        if (off(selected.height, control) || off(selected.top, box.top)) failures.push(`${name}: selected ${selected.top} ${selected.height}`);
      }
      const centre = box.top + box.height / 2;
      for (let row = fit.parentElement?.closest<HTMLElement>(rows); row; row = row.parentElement?.closest<HTMLElement>(rows)) {
        for (const control of row.querySelectorAll<HTMLElement>(controls)) {
          // A help trigger is inline with its label at S2 size XS, not a control of the row.
          if (control === fit || fit.contains(control) || control.closest('.rp-segfit') || control.matches('.rp-help') || !control.checkVisibility()) continue;
          const other = control.getBoundingClientRect();
          if (other.height === 0 || other.bottom <= box.top || other.top >= box.bottom) continue;
          const label = control.getAttribute('aria-label') ?? control.textContent?.trim();
          if (off(other.height, box.height)) failures.push(`${name}: ${label} height ${other.height}`);
          if (off(other.top + other.height / 2, centre)) failures.push(`${name}: ${label} centre ${other.top + other.height / 2} vs ${centre}`);
        }
      }
    }
    return {measured, failures};
  });
}

async function expectSegmented(scope: Locator, where: string, minimum = 1) {
  await expect
    .poll(async () => {
      const {measured, failures} = await segmentedGeometry(scope);
      return measured >= minimum ? failures : [`${where}: ${measured} segmented controls`];
    })
    .toEqual([]);
}

for (const [width, phone] of [
  [1280, false],
  [390, true]
] as const) {
  test.describe(`segmented controls at ${width}`, () => {
    test.use({viewport: {width, height: 900}, hasTouch: phone, storage: {'doona-lang': 'zh-TW'}});

    test('every route and tab', async ({page}) => {
      test.setTimeout(180000);
      for (const route of routes) {
        await page.goto(`/#/${route}`);
        await expect(page.locator('.rp-content h1')).toBeVisible();
        await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        const tabs = page.locator('.rp-content [data-page-tabrow] [role=tab]');
        const count = await tabs.count();
        for (let index = -1; index < count; index++) {
          if (index >= 0) await tabs.nth(index).click();
          await settleFrames(page);
          await expectSegmented(page.locator('body'), `${route}/${index}`, 0);
        }
      }
    });

    test('dashboard editing and card settings', async ({page}) => {
      await page.goto('/#/activity');
      await settle(page);
      await expectSegmented(page.locator('.rp-content'), 'activity', 2);
      // The control cards share one row with the outbound mode switch, so each of their controls is M.
      const control = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rp-control')));
      const heights = await page
        .locator('.rp-control-card :is(.rp-btn, .rp-selectbtn, .rp-seg):not(.rp-seg .rp-btn)')
        .evaluateAll(nodes => nodes.filter(node => node.checkVisibility()).map(node => node.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThanOrEqual(3);
      expect(heights.filter(height => Math.abs(height - control) > 0.5)).toEqual([]);
      await page.getByRole('button', {name: t('dashboard.edit'), exact: true}).click();
      await expect(page.locator('.rp-dashboard-tools').first()).toBeVisible();
      await settleFrames(page);
      await expectSegmented(page.locator('.rp-content'), 'dashboard edit', 2);
      await page
        .locator('.rp-dashboard-cell')
        .first()
        .getByRole('button', {name: t('widgets.inspector'), exact: true})
        .click();
      await expectSegmented(page.getByRole('dialog').first(), 'card settings');
    });

    test.describe('widget panel', () => {
      test.use({widgets: true});
      if (phone)
        test('widget sheet', async ({page}) => {
          await save(page, panelLayout(false));
          await mockBackend(page);
          await page.goto('/#/overview');
          await page.getByRole('button', {name: t('widgets.show'), exact: true}).click();
          const sheet = page.locator('.rp-drawer');
          await expect(sheet.locator('.rp-widget-cell').first()).toBeVisible();
          await expectSegmented(sheet, 'sheet', 2);
        });
      else
        for (const docked of [false, true])
          test(`${docked ? 'docked' : 'floating'} widget panel`, async ({page}) => {
            await save(page, panelLayout(docked));
            await mockBackend(page);
            await page.goto('/#/settings');
            const panel = page.locator(docked ? '.rp-side-dock' : '.rp-floating-frame .rp-floating-panel');
            await expect(panel.locator('[data-widget-id="mode"] .rp-seg')).toBeVisible();
            // The docked list scrolls; the group switch below the mode card reads once it is in view.
            await panel.locator('[data-widget-id="group"]').scrollIntoViewIfNeeded();
            await expectSegmented(panel, docked ? 'docked' : 'floating', 2);
            // Global mode adds its target row; the switch and Apply keep one height wherever they wrap.
            await panel.locator('[data-widget-id="mode"] .rp-seg .rp-btn').last().click();
            await settle(page);
            await expectSegmented(panel, docked ? 'docked global' : 'floating global', 2);
          });
    });
  });
}

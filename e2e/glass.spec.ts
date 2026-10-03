import type {Locator} from '@playwright/test';
import {expect, test} from './fixtures';

for (const scheme of ['light', 'dark']) {
  test(`glass ${scheme} frosts sticky headers and floating surfaces`, async ({page}) => {
    await page.addInitScript(value => {
      localStorage.setItem('doona-palette', 'glass/glass');
      localStorage.setItem('doona-scheme', value);
      localStorage.setItem('doona-mock-big', '29');
    }, scheme);
    await page.goto('/#/nodes?provider=harbor');
    const table = page.locator('.rp-table').nth(1);
    const header = table.getByRole('columnheader').first();
    await expect(header).toBeVisible();
    await table.evaluate(element => (element.scrollTop = 160));
    const surface = await header.evaluate(element => {
      const table = element.closest('.rp-table')!;
      const style = getComputedStyle(element);
      return {
        scrolled: table.scrollTop > 0,
        sticky: getComputedStyle(element).position === 'sticky',
        filter: style.backdropFilter,
        background: style.backgroundColor,
        top: element.getBoundingClientRect().top - table.getBoundingClientRect().top
      };
    });
    expect(surface.scrolled).toBe(true);
    expect(surface.sticky).toBe(true);
    expect(surface.top).toBeGreaterThanOrEqual(0);
    const alpha = surface.background.startsWith('rgba(') ? Number(surface.background.match(/,\s*([\d.]+)\)$/)?.[1]) : 1;
    expect(surface.filter !== 'none' || alpha === 1).toBe(true);

    const chrome = await page.locator('.rp-shell').evaluate(element => getComputedStyle(element, '::after').backdropFilter);
    expect(chrome).not.toBe('none');
    await page.getByRole('button', {name: /Group$/}).click();
    const menu = page.locator('.rp-popover').first();
    await expect(menu).toBeVisible();
    expect(await menu.evaluate(element => getComputedStyle(element).backdropFilter)).not.toBe('none');
    await page.keyboard.press('Escape');

    await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
    const dialog = page.locator('.rp-modal');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => getComputedStyle(element).backdropFilter)).not.toBe('none');
  });
}

test.describe('floating widget panel', () => {
  test.use({widgets: true, storage: {'doona-palette': 'glass/glass', 'doona-scheme': 'dark'}});
  test('glass frosts it lighter than a popover, with the same rim', async ({page}) => {
    await page.goto('/#/nodes?provider=harbor');
    const panel = page.locator('.rp-floating-frame .rp-floating-panel');
    await expect(panel).toBeVisible();
    await page.getByRole('button', {name: /Group$/}).click();
    const popover = page.locator('.rp-popover').first();
    await expect(popover).toBeVisible();
    const material = (locator: Locator) =>
      locator.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          filter: style.backdropFilter,
          alpha: Number(style.backgroundColor.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1),
          rim: getComputedStyle(element, '::after').content
        };
      });
    const [frosted, floating] = [await material(panel), await material(popover)];
    expect(frosted.filter).not.toBe('none');
    expect(frosted.alpha).toBeLessThan(floating.alpha);
    expect(frosted.rim).toBe(floating.rim);
  });
});

import {expect, test} from './fixtures';

for (const scheme of ['light', 'dark']) {
  test(`glass ${scheme} frosts sticky headers and floating surfaces`, async ({page}) => {
    await page.addInitScript(value => {
      localStorage.setItem('doona-palette', 'glass/glass');
      localStorage.setItem('doona-scheme', value);
      localStorage.setItem('doona-mock-big', '29');
    }, scheme);
    await page.goto('/#/nodes?provider=sub-c');
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

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
    const table = page.locator('.rp-table').first();
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

// Router UIs such as LuCI embed doona in an iframe with rounded corners. Chrome then dropped the chrome sheet's concave
// clip and blurred the whole content box away, while hit testing still found the page under it.
test.describe('embedded in a rounded iframe', () => {
  test.use({storage: {'doona-palette': 'glass/glass', 'doona-scheme': 'light'}});
  test('glass leaves the page title painted', async ({page}) => {
    await page.setViewportSize({width: 1240, height: 700});
    await page.route('**/embed.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><style>body{margin:0}iframe{display:block;width:1180px;height:650px;border:1px solid #ccc;border-radius:4px}</style><iframe src="/#/activity"></iframe>'
      })
    );
    await page.goto('/embed.html');
    const title = page.frameLocator('iframe').getByRole('heading', {level: 1});
    await expect(title).toHaveText('Activity');
    // The darkest pixel of the title's box as the screen shows it, whatever covers the heading: ink when painted, the
    // pale sheet when covered.
    const shot = await title.screenshot();
    const darkest = await page.evaluate(
      async src => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const {data} = context.getImageData(0, 0, image.width, image.height);
        let min = 255;
        for (let i = 0; i < data.length; i += 4) min = Math.min(min, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        return min;
      },
      `data:image/png;base64,${shot.toString('base64')}`
    );
    expect(darkest).toBeLessThan(100);
  });
});

import type {Page} from '@playwright/test';
import {expect, test} from './fixtures';

const flavours = ['glass', 'frosted', 'float', 'tinted'] as const;

// The opaque check reads rgb() as alpha 1 and rgba() by its last channel.
const surface = (page: Page, selector: string, pseudo?: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element, pseudo) => {
      const style = getComputedStyle(element, pseudo);
      const alpha = style.backgroundColor.startsWith('rgba(') ? Number(style.backgroundColor.match(/,\s*([\d.]+)\)$/)?.[1]) : 1;
      return {filter: style.backdropFilter, alpha};
    }, pseudo);

test('the palette menu offers the four Glass materials, and Settings has no material switch', async ({page}) => {
  await page.goto('/#/settings');
  await page.locator('.rp-top').getByRole('button', {name: 'Palette', exact: true}).click();
  for (const name of ['Glass', 'Frosted', 'Float', 'Tinted']) await expect(page.getByRole('menuitemradio', {name: new RegExp(`^${name}`)})).toHaveCount(1);
  await page.getByRole('menuitemradio', {name: /^Float/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-flavour', 'float');
  const card = page.getByRole('region', {name: 'Appearance', exact: true});
  await expect(card.getByRole('button', {name: /Palette/})).toBeVisible();
  await expect(card.getByRole('radiogroup', {name: /material/i})).toHaveCount(0);
});

// Glass kept its material in doona-glass before each material was a palette; the first paint moves it once.
for (const [material, flavour] of [
  ['frosted', 'frosted'],
  ['tinted', 'tinted'],
  ['clear', 'glass']
] as const)
  test(`a stored ${material} Glass material becomes the ${flavour} palette`, async ({page}) => {
    await page.addInitScript(value => {
      if (sessionStorage.getItem('migrated')) return;
      sessionStorage.setItem('migrated', '1');
      localStorage.setItem('doona-palette', 'glass/glass');
      localStorage.setItem('doona-glass', value);
    }, material);
    await page.goto('/#/activity');
    await expect(page.locator('html')).toHaveAttribute('data-flavour', flavour);
    expect(await page.evaluate(() => [localStorage.getItem('doona-palette'), localStorage.getItem('doona-glass')])).toEqual([`glass/${flavour}`, null]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-flavour', flavour);
  });

for (const flavour of flavours)
  test(`${flavour} frosts the chrome, cards and menus as its material says`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem('doona-palette', `glass/${value}`), flavour);
    await page.goto('/#/nodes?provider=harbor');
    await expect(page.locator('.rp-card').first()).toBeVisible();
    const chrome = await surface(page, '.rp-shell', '::after');
    const card = await surface(page, '.rp-card');
    if (flavour === 'tinted') {
      expect(chrome.filter).toBe('none');
      expect(card.filter).toBe('none');
      expect(card.alpha).toBeGreaterThanOrEqual(0.85);
    } else {
      expect(chrome.filter).toContain('blur');
      expect(card.filter).toContain('blur');
      expect(card.alpha).toBeLessThan(0.7);
    }
    await page.getByRole('button', {name: /Group$/}).click();
    await expect(page.locator('.rp-popover').first()).toBeVisible();
    expect((await surface(page, '.rp-popover')).filter === 'none').toBe(flavour === 'tinted');
  });

// Float detaches the top bar: a rounded, blurred bar inset from the viewport, with the content starting below it.
test('float draws an inset top bar and keeps the content clear of it', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-palette', 'glass/float'));
  await page.goto('/#/activity');
  const title = page.getByRole('heading', {level: 1});
  await expect(title).toHaveText('Activity');
  const bar = await page.locator('.rp-top').evaluate(element => {
    const style = getComputedStyle(element, '::before');
    const box = element.getBoundingClientRect();
    return {
      top: parseFloat(style.top),
      left: parseFloat(style.left),
      radius: parseFloat(style.borderTopLeftRadius),
      filter: style.backdropFilter,
      bottom: box.bottom
    };
  });
  expect(bar.top).toBeGreaterThan(0);
  expect(bar.left).toBeGreaterThan(0);
  expect(bar.radius).toBeGreaterThan(0);
  expect(bar.filter).toContain('blur');
  expect((await title.boundingBox())!.y).toBeGreaterThan(bar.bottom);
});

// Chromium refracts through the lens filters; the floating panel and menus reference them, and they exist once.
test.describe('glass lens', () => {
  test.skip(({browserName}) => browserName !== 'chromium', 'only Chromium applies an SVG filter in backdrop-filter');
  test.use({widgets: true, storage: {'doona-palette': 'glass/glass'}});
  test('bends the floating panel and menus', async ({page}) => {
    await page.goto('/#/nodes?provider=harbor');
    await expect(page.locator('html')).toHaveAttribute('data-lens', '');
    await expect(page.locator('svg filter#doona-lens feDisplacementMap')).toHaveCount(1);
    await expect(page.locator('svg filter#doona-lens-sm')).toHaveCount(1);
    const panel = page.locator('.rp-floating-frame .rp-floating-panel');
    await expect(panel).toBeVisible();
    expect((await surface(page, '.rp-floating-frame .rp-floating-panel')).filter).toContain('url("#doona-lens")');
    await page.getByRole('button', {name: /Group$/}).click();
    await expect(page.locator('.rp-popover').first()).toBeVisible();
    expect((await surface(page, '.rp-popover')).filter).toContain('url("#doona-lens-sm")');
  });
});
test.describe('glass lens elsewhere', () => {
  test.use({widgets: true, storage: {'doona-palette': 'glass/frosted'}});
  test('stays off in the other materials', async ({page}) => {
    await page.goto('/#/activity');
    await expect(page.locator('.rp-floating-frame .rp-floating-panel')).toBeVisible();
    expect((await surface(page, '.rp-floating-frame .rp-floating-panel')).filter).not.toContain('url(');
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

// Reduce Transparency and Increase Contrast turn every material solid. Playwright cannot emulate the first media
// feature, so the Chromium DevTools protocol sets both.
test.describe('reduce transparency and increase contrast', () => {
  test.skip(({browserName}) => browserName !== 'chromium', 'the media features are emulated through CDP');
  for (const feature of ['prefers-reduced-transparency', 'prefers-contrast'])
    for (const flavour of flavours)
      test(`${feature} makes ${flavour} solid`, async ({page}) => {
        await page.addInitScript(value => localStorage.setItem('doona-palette', `glass/${value}`), flavour);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', {features: [{name: feature, value: feature === 'prefers-contrast' ? 'more' : 'reduce'}]});
        await page.goto('/#/nodes?provider=harbor');
        await expect(page.locator('.rp-card').first()).toBeVisible();
        const opaque = {filter: 'none', alpha: 1};
        // The sidebar and top bar sit on the shell's chrome sheet.
        expect(await surface(page, '.rp-shell', '::after')).toMatchObject(opaque);
        expect(await surface(page, '.rp-card')).toMatchObject(opaque);
        await page.getByRole('button', {name: /Group$/}).click();
        await expect(page.locator('.rp-popover').first()).toBeVisible();
        expect(await surface(page, '.rp-popover')).toMatchObject(opaque);
      });
});

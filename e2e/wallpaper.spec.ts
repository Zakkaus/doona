import type {Page} from '@playwright/test';
import {expect, test} from './fixtures';

// The Glass palettes take a custom wallpaper from Settings > Appearance; it stays in this browser's IndexedDB.
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('doona-palette')) localStorage.setItem('doona-palette', 'glass/glass');
  });
});

const appearance = (page: Page) => page.getByRole('region', {name: 'Appearance', exact: true});
const row = (page: Page) => appearance(page).getByRole('group', {name: 'Wallpaper'});
const wall = (page: Page) => page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);

// The committed wallpaper record's veil, as data-wallpaper names it, or null without one. A read waits for an earlier write to commit; before the app has
// created the database, the open is abandoned so the probe does not create it without the store.
const saved = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>(resolve => {
        const open = indexedDB.open('doona-wallpaper', 1);
        open.onupgradeneeded = () => open.transaction!.abort();
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction('wallpaper').objectStore('wallpaper').get('current');
          get.onsuccess = () => (db.close(), resolve(get.result ? (get.result.veil ? 'veil' : 'plain') : null));
        };
      })
  );

// The button opens the browser's picker; the file is then handed to its input, as the picker would.
async function upload(page: Page, color = '#3a7bd5') {
  const chooser = page.waitForEvent('filechooser');
  await row(page).getByRole('button', {name: 'Choose image'}).click();
  const input = (await chooser).element();
  await input.evaluate(async (input: HTMLInputElement, color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.fillRect(0, 0, 320, 200);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
    const files = new DataTransfer();
    files.items.add(new File([blob], 'wall.png', {type: 'image/png'}));
    input.files = files.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }, color);
  await expect(page.locator('html')).toHaveAttribute('data-wallpaper', /veil|plain/);
  await expect.poll(() => saved(page)).not.toBeNull();
}

test('the wallpaper row shows only with a Glass palette', async ({page}) => {
  await page.goto('/#/settings');
  await expect(row(page)).toBeVisible();
  await page.evaluate(() => localStorage.setItem('doona-palette', 'rose-pine/moon'));
  await page.reload();
  await expect(appearance(page).getByRole('button', {name: /Palette/})).toBeVisible();
  await expect(row(page)).toHaveCount(0);
});

test('a chosen image becomes the wallpaper, survives a reload and gives way to the default', async ({page}) => {
  await page.goto('/#/settings');
  const before = await wall(page);
  expect(before).toContain('radial-gradient');
  await upload(page);
  expect(await wall(page)).toContain('blob:');
  expect(await wall(page)).not.toContain('radial-gradient');
  // The grain stays on top of the image.
  expect(await wall(page)).toMatch(/^url\("data:image\/svg/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'veil');
  expect(await wall(page)).toContain('blob:');
  await row(page).getByRole('button', {name: 'Use default'}).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-wallpaper');
  expect(await wall(page)).toBe(before);
  await expect.poll(() => saved(page)).toBeNull();
  await page.reload();
  expect(await wall(page)).toBe(before);
});

test('the veil switch removes the scrim and its slider, and the slider sets its strength', async ({page}) => {
  await page.goto('/#/settings');
  await upload(page);
  const slider = row(page).getByRole('slider', {name: 'Dim'});
  await expect(slider).toHaveValue('0.6');
  expect(await wall(page)).toContain('linear-gradient(rgba(255, 255, 255, 0.6)');
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('html')).toHaveAttribute('style', /--rp-veil-alpha: 0\.58/);
  expect(await wall(page)).toContain('rgba(255, 255, 255, 0.58)');
  await row(page).getByText('Readability veil').click();
  await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'plain');
  await expect(slider).toHaveCount(0);
  expect(await wall(page)).not.toContain('gradient');
  expect(await wall(page)).toContain('blob:');
  await expect.poll(() => saved(page)).toBe('plain');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'plain');
});

test('a palette outside the Glass family never shows the image', async ({page}) => {
  await page.goto('/#/settings');
  await upload(page);
  await page.evaluate(() => localStorage.setItem('doona-palette', 'rose-pine/moon'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-family', 'rose-pine');
  expect(await wall(page)).not.toContain('blob:');
});

test('forced colours keep the solid recipe without the image', async ({page}) => {
  await page.goto('/#/settings');
  await upload(page);
  await page.emulateMedia({forcedColors: 'active'});
  expect(await wall(page)).not.toContain('blob:');
});

// At the default strength, label and secondary text keep 4.5:1 on every Glass surface over a pure white and a pure
// black image: the card over the content column over the veiled image, the chrome over the veiled image, and label
// text on the column. Fills are composited as colours; the blur of a uniform image leaves its colour.
test('the default veil keeps label and secondary text at 4.5:1 over a white and a black image', async ({page}) => {
  await page.goto('/#/settings');
  await upload(page);
  const failures = await page.evaluate(() => {
    const root = document.documentElement;
    const alpha = Number(root.style.getPropertyValue('--rp-veil-alpha'));
    const rgb = (value: string) => {
      const probe = document.createElement('i');
      probe.style.color = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      const channels = color.match(/[\d.]+/g)!.map(Number);
      return color.startsWith('color(') ? channels.map((channel, i) => (i < 3 ? channel * 255 : channel)) : channels;
    };
    const over = ([r, g, b, a = 1]: number[], below: number[]) => [r, g, b].map((channel, i) => channel * a + below[i] * (1 - a));
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.map(c => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (fg: number[], bg: number[]) => {
      const [hi, lo] = [luminance(over(fg, bg)), luminance(bg)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const failures: string[] = [];
    for (const flavour of ['glass', 'frosted', 'tinted'])
      for (const scheme of ['light', 'dark']) {
        Object.assign(root.dataset, {flavour, scheme});
        const veil = scheme === 'light' ? [255, 255, 255, alpha] : [0, 0, 0, alpha];
        for (const image of [
          [255, 255, 255],
          [0, 0, 0]
        ]) {
          const wall = over(veil, image);
          const column = over(rgb('var(--rp-column)'), wall);
          const grounds = {card: over(rgb('var(--rp-card-fill)'), column), chrome: over(rgb('var(--rp-chrome)'), wall)};
          const texts = {label: rgb('var(--rp-text)'), secondary: rgb('var(--rp-subtle)')};
          const checks: Array<[string, number]> = [[`label on column`, ratio(texts.label, column)]];
          for (const [ground, bg] of Object.entries(grounds))
            for (const [text, fg] of Object.entries(texts)) checks.push([`${text} on ${ground}`, ratio(fg, bg)]);
          for (const [name, value] of checks) if (value < 4.5) failures.push(`${flavour} ${scheme} image ${image[0]}: ${name} ${value.toFixed(2)}`);
        }
      }
    return failures;
  });
  expect(failures).toEqual([]);
});

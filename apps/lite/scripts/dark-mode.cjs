const {chromium, expect} = require('@playwright/test');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');

async function contrast(locator, foreground, background) {
  return locator.evaluate(
    (element, {foreground, background}) => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      const luminance = color => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).reduce((sum, value, index) => {
          const channel = value / 255;
          return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
        }, 0);
      };
      const a = luminance(style[foreground]);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    },
    {foreground, background}
  );
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const mode of ['dark', 'system']) {
      const page = await browser.newPage({colorScheme: 'dark', locale: 'en-US', reducedMotion: 'reduce'});
      await page.addInitScript(mode => {
        localStorage.setItem('doona-lite.theme', mode);
        localStorage.setItem('doona-lite.locale', 'en');
        window.themeFrames = [];
        const sample = () => {
          if (document.documentElement) window.themeFrames.push(getComputedStyle(document.documentElement).backgroundColor);
          requestAnimationFrame(sample);
        };
        document.addEventListener('DOMContentLoaded', sample, {once: true});
      }, mode);
      await page.goto(base);
      await waitForDemo(page);
      await page.evaluate(() => (location.hash = 'routing'));
      await page.getByRole('radio', {name: 'Text', exact: true}).click();
      const editor = page.locator('.cm-editor:visible');
      await editor.locator('.cm-content').click();
      const surface = await editor.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(await contrast(editor.locator('.cm-cursor').first(), 'borderLeftColor', surface), `${mode}: editor cursor`).toBeGreaterThanOrEqual(3);
      await page.keyboard.press('Control+f');
      const search = editor.locator('.cm-panel.cm-search');
      await expect(search).toBeVisible();
      const panelBackground = await search.evaluate(element => getComputedStyle(element.parentElement).backgroundColor);
      expect(panelBackground, `${mode}: search panel follows the editor surface`).toBe(surface);
      expect(await contrast(search, 'color', panelBackground), `${mode}: editor search text`).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape');
      await page.getByRole('radio', {name: 'Visual', exact: true}).click();
      await page.evaluate(() => (location.hash = 'groups'));
      await page.getByRole('button', {name: 'Create group', exact: true}).click();
      const field = page.getByRole('dialog').locator('.astryx-text-input').first();
      const fieldBackground = await field.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(await contrast(field, 'borderTopColor', fieldBackground), `${mode}: input boundary`).toBeGreaterThanOrEqual(3);
      await page.keyboard.press('Escape');
      const darkBackground = await page.locator('html').evaluate(element => getComputedStyle(element).backgroundColor);
      expect(await page.evaluate(() => [...new Set(window.themeFrames)]), `${mode}: first paint and navigation`).toEqual([darkBackground]);
      if (mode === 'system') {
        await page.emulateMedia({colorScheme: 'light'});
        await expect(page.locator('html')).not.toHaveCSS('background-color', darkBackground);
        await page.emulateMedia({colorScheme: 'dark'});
        await expect(page.locator('html')).toHaveCSS('background-color', darkBackground);
      }
      await page.close();
      console.log(`PASS ${mode}: cursor, search, input contrast, first paint, route switches and system preference`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

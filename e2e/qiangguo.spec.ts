import {expect, test} from './fixtures';

// The China palette's top bar sits on the hero at the top of the page; pinned over a scrolled page it takes the plain
// top of the sky, so no slice of the flag or the square rides over the content.
for (const [name, viewport] of [
  ['1280x800', {width: 1280, height: 800}],
  ['390x844', {width: 390, height: 844}]
] as const)
  test.describe(name, () => {
    test.use({viewport});

    test('the China palette keeps the top bar pinned and drops the hero from it once the page scrolls', async ({page}) => {
      await page.addInitScript(() => localStorage.setItem('doona-palette', 'qiangguo/qiangguo'));
      await page.goto('/#/overview');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(300);
      const bar = page.locator('.rp-top');
      await expect(bar).toHaveCSS('position', 'sticky');
      expect(await bar.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('url(');
      await page.evaluate(() => window.scrollBy(0, 300));
      await expect(bar).toHaveCSS('background-color', 'rgb(184, 20, 27)');
      expect(await bar.evaluate(element => getComputedStyle(element).backgroundImage)).not.toContain('url(');
      expect(await bar.evaluate(element => element.getBoundingClientRect().top)).toBe(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => bar.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('url(');
    });
  });

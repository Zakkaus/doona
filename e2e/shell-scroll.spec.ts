import {expect, settle, test} from './fixtures';
import type {Page} from '@playwright/test';

// The top bar and the side navigation hold still while the page scrolls under them. Chromium draws a sticky box on a
// fractional device pixel whenever the scroll offset is one, so at 125% its icons stepped a pixel up and down on every
// few pixels of scrolling while the layout boxes stayed put: the boxes are checked per frame, the pixels at 125%.

type Recorder = {chromeFrames: {frames: number[][]; id: number}};

async function open(page: Page, route: string) {
  await page.goto(`/#/${route}`);
  await expect(page.locator('.rp-content h1')).toBeVisible();
  await settle(page);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(120);
}

for (const scheme of ['light', 'dark'])
  test.describe(`${scheme} 1956x1021`, () => {
    test.use({viewport: {width: 1956, height: 1021}, storage: {'doona-scheme': scheme, 'doona-lang': 'zh-TW'}});
    for (const route of ['dns', 'activity'])
      test(`${route} keeps the top bar and the side navigation still through a wheel scroll`, async ({page}) => {
        await open(page, route);
        // The bars, the brand and the first and last navigation links, every frame.
        const watched = await page.evaluate(() => {
          const links = [...document.querySelectorAll('.rp-side .rp-nav')];
          const elements = [
            document.querySelector('.rp-top'),
            document.querySelector('.rp-side'),
            document.querySelector('.rp-top .rp-brand'),
            links[0],
            links.at(-1)
          ];
          const recorder = window as unknown as Recorder;
          const frames: number[][] = [];
          const record = () => {
            frames.push(
              elements.flatMap(element => {
                const box = element!.getBoundingClientRect();
                return [box.x, box.y, box.width, box.height];
              })
            );
            recorder.chromeFrames.id = requestAnimationFrame(record);
          };
          recorder.chromeFrames = {frames, id: requestAnimationFrame(record)};
          return elements.filter(Boolean).length;
        });
        expect(watched).toBe(5);
        const main = (await page.locator('.rp-main').boundingBox())!;
        await page.mouse.move(main.x + main.width / 2, main.y + 400);
        for (let step = 0; step < 12; step++) await page.mouse.wheel(0, 37);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
        for (let step = 0; step < 12; step++) await page.mouse.wheel(0, -23);
        const frames = await page.evaluate(() => {
          const {chromeFrames} = window as unknown as Recorder;
          cancelAnimationFrame(chromeFrames.id);
          return chromeFrames.frames;
        });
        expect(frames.length).toBeGreaterThan(5);
        const drift = frames[0].map((_, index) => Math.max(...frames.map(frame => Math.abs(frame[index] - frames[0][index]))));
        expect(Math.max(...drift)).toBeLessThanOrEqual(0.01);
      });
  });

test.describe('125% zoom', () => {
  // A 1956x1021 screen at 125%.
  test.use({viewport: {width: 1565, height: 817}, deviceScaleFactor: 1.25, storage: {'doona-scheme': 'dark', 'doona-lang': 'zh-TW'}});
  test('the top bar and the side navigation draw the same pixels at fractional scroll offsets', async ({page}) => {
    await open(page, 'dns');
    const top = (await page.locator('.rp-top').boundingBox())!;
    const side = (await page.locator('.rp-side').boundingBox())!;
    // One pixel in from the edge the page meets, which scrolls.
    side.width -= 1;
    const shots = () => Promise.all([top, side].map(clip => page.screenshot({clip, animations: 'disabled'})));
    const [topAtRest, sideAtRest] = await shots();
    // 101, 102 and 103 CSS pixels are 126.25, 127.5 and 128.75 device pixels.
    for (const offset of [101, 102, 103]) {
      await page.evaluate(offset => scrollTo(0, offset), offset);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(offset);
      const [topNow, sideNow] = await shots();
      expect(topNow.equals(topAtRest), `top bar at ${offset}`).toBe(true);
      expect(sideNow.equals(sideAtRest), `side navigation at ${offset}`).toBe(true);
    }
  });
});

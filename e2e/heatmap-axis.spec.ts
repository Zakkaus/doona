import {expect, test} from './fixtures';

// The log heatmap's time marks read at 12px and keep clear of each other at every width (src/ui/styles/charts.css).
for (const lang of ['en', 'zh-TW'])
  for (const width of [320, 390, 1440])
    test.describe(`${lang} at ${width}px`, () => {
      test.use({viewport: {width, height: 900}, storage: {'doona-lang': lang}});

      test('the heatmap axis marks are 12px and do not collide', async ({page}) => {
        await page.goto('/#/logs');
        const ends = page.locator('.rp-heatmap .times .ends');
        await expect(ends.locator('span')).toHaveCount(3);
        const {size, gaps, inside} = await ends.evaluate(element => {
          const box = element.getBoundingClientRect();
          const marks = [...element.children].map(mark => mark.getBoundingClientRect());
          return {
            size: getComputedStyle(element).fontSize,
            gaps: marks.slice(1).map((mark, i) => mark.left - marks[i]!.right),
            inside: marks.every(mark => mark.left >= box.left - 0.5 && mark.right <= box.right + 0.5)
          };
        });
        expect(size).toBe('12px');
        for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(16);
        expect(inside).toBe(true);
      });
    });

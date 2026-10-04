import {expect, test} from './fixtures';

// The log heatmap's time marks read at 12px and keep clear of each other at every width, in either clock (src/ui/styles/charts.css).
for (const lang of ['en', 'zh-TW'])
  for (const clock of ['24h', '12h'])
    for (const width of [320, 390, 1440])
      test.describe(`${lang} ${clock} at ${width}px`, () => {
        test.use({viewport: {width, height: 900}, storage: {'doona-lang': lang, 'doona-time-format': clock}});

        test('the heatmap axis marks are 12px and do not collide', async ({page}) => {
          await page.goto('/#/logs');
          const ends = page.locator('.rp-heatmap .times .ends');
          await expect(ends.locator('span')).toHaveCount(3);
          const {size, gaps, inside, shown} = await ends.evaluate(element => {
            const box = element.getBoundingClientRect();
            const marks = [...element.children].filter(mark => getComputedStyle(mark).visibility === 'visible').map(mark => mark.getBoundingClientRect());
            return {
              shown: marks.length,
              size: getComputedStyle(element).fontSize,
              gaps: marks.slice(1).map((mark, i) => mark.left - marks[i]!.right),
              inside: marks.every(mark => mark.left >= box.left - 0.5 && mark.right <= box.right + 0.5)
            };
          });
          expect(size).toBe('12px');
          // The middle mark gives way only to a longer 12-hour time.
          expect(shown).toBeGreaterThanOrEqual(clock === '24h' ? 3 : 2);
          for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(16);
          expect(inside).toBe(true);
        });
      });

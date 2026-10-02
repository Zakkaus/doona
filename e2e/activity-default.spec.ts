import {test, expect} from './fixtures';
import {cardBounds} from './activity-main-geometry';
const environment = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env;
const baseline = environment?.DOONA_ACTIVITY_BASELINE === '1';
const shots = environment?.DOONA_SHOT_DIR ?? 'shots';
for (const lang of ['en', 'zh-TW'])
  test.describe(`default Activity ${lang}`, () => {
    test.use({storage: {'doona-lang': lang}});
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844]
    ]) {
      test(`matches main ${width}`, async ({page}, info) => {
        await page.setViewportSize({width, height});
        await page.goto('/#/activity');
        const details = page.locator("[data-profile='details'] .rp-card");
        await expect(details).toHaveCount(3);
        await details.last().scrollIntoViewIfNeeded();
        await expect(page.locator("[data-profile='traffic'] svg").first()).toBeVisible();
        await page.locator('h1').scrollIntoViewIfNeeded();
        const cards = page.locator(".rp-dash-section:not([data-profile='extensions']) > .rp-dashboard-cell > .rp-card");
        await expect(cards).toHaveCount(13);
        const measure = () =>
          cards.evaluateAll(nodes =>
            nodes.map(node => {
              const b = node.getBoundingClientRect();
              return {x: b.x, y: b.y, width: b.width, height: b.height};
            })
          );
        for (const card of await cards.all()) {
          await card.scrollIntoViewIfNeeded();
          await expect(card.locator('.rp-chart-wait')).toHaveCount(0);
        }
        await page.locator('h1').scrollIntoViewIfNeeded();
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        const actual = await measure();
        await info.attach(`${lang}-${width}`, {body: JSON.stringify(actual), contentType: 'application/json'});
        await page.screenshot({path: `${shots}/activity-default-${baseline ? 'before' : 'after'}-${lang}-${width}.png`, fullPage: true});
        if (!baseline) {
          const expected = cardBounds[`${lang}-${width}`];
          expect(expected).toBeDefined();
          // Main's columns: each card's inline position and width, and which cards share a row. Heights follow the
          // fonts and the demo's live data, so they are checked against the editor rather than a stored number.
          actual.forEach((box, i) => {
            expect(Math.abs(box.x - expected[i][0]), `${i} x`).toBeLessThanOrEqual(1);
            expect(Math.abs(box.width - expected[i][2]), `${i} width`).toBeLessThanOrEqual(1);
            actual.forEach((other, j) => {
              if (expected[i][1] === expected[j][1]) expect(Math.abs(box.y - other.y), `${i} ${j} row`).toBeLessThanOrEqual(1);
            });
          });
          await page.getByRole('button', {name: lang === 'en' ? 'Edit dashboard' : '編輯儀表板', exact: true}).click();
          const editing = page.locator(".rp-dash-section:not([data-profile='extensions']) .rp-dashboard-body > .rp-card");
          await expect(editing).toHaveCount(13);
          const boxes = () =>
            editing.evaluateAll(nodes =>
              nodes.map(node => {
                const b = node.getBoundingClientRect();
                return {width: b.width, height: b.height};
              })
            );
          // The editor keeps every width and stays within 8 px of each live height.
          await expect
            .poll(async () => (await boxes()).every((box, i) => Math.abs(box.width - actual[i].width) <= 1 && Math.abs(box.height - actual[i].height) <= 8))
            .toBe(true);
        }
      });
    }
  });

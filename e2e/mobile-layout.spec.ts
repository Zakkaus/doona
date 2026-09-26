import {expect, routes, test} from './fixtures';

for (const width of [1280, 1024, 390, 320]) {
  test.describe(`${width}px layout`, () => {
    test.use({viewport: {width, height: width === 390 ? 844 : width === 320 ? 640 : 900}});

    for (const route of routes) {
      test(`${route} keeps content and controls inside the viewport`, async ({page}) => {
        await page.goto(`/#/${route}`);
        await expect(page.locator('.rp-content > *').first()).toBeVisible();
        await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);

        const check = async () => {
          const layout = await page.evaluate(() => {
            const facts = [...document.querySelectorAll<HTMLElement>('.rp-facts .rp-big')].map(value => ({
              text: value.textContent,
              height: value.getBoundingClientRect().height,
              lineHeight: parseFloat(getComputedStyle(value).lineHeight)
            }));
            const toolbar = [...document.querySelectorAll<HTMLElement>('.rp-toolbar')].flatMap(container =>
              [...container.querySelectorAll<HTMLElement>('button,[role=button]')]
                .filter(button => button.checkVisibility({visibilityProperty: true}))
                .map(button => {
                  const outer = container.getBoundingClientRect();
                  const inner = button.getBoundingClientRect();
                  return {label: button.textContent, within: inner.left >= outer.left - 1 && inner.right <= outer.right + 1};
                })
            );
            const segments = [...document.querySelectorAll<HTMLElement>('.rp-seg .rp-btn')].map(button => ({
              label: button.textContent,
              overflow: button.scrollWidth - button.clientWidth
            }));
            return {overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, facts, toolbar, segments};
          });
          expect(layout.overflow, `${route}: document width`).toBeLessThanOrEqual(0);
          for (const fact of layout.facts) expect(fact.height, `${route}: ${fact.text}`).toBeLessThanOrEqual(fact.lineHeight + 1);
          for (const button of layout.toolbar) expect(button.within, `${route}: toolbar button ${button.label}`).toBe(true);
          for (const button of layout.segments) expect(button.overflow, `${route}: segment ${button.label}`).toBeLessThanOrEqual(1);
        };

        await check();
        const tabs = page.locator('.rp-content [role=tab]');
        const count = await tabs.count();
        for (let index = 0; index < count; index++) {
          await tabs.nth(index).click();
          await check();
        }

        if (width <= 390) {
          const undersized = await page.locator('.rp-top .rp-btn.icon, .rp-hubbar > a, .rp-hubnav .rp-btn, .rp-content .rp-tab').evaluateAll(elements =>
            elements
              .filter(element => element.getClientRects().length)
              .map(element => {
                const box = element.getBoundingClientRect();
                return {label: element.getAttribute('aria-label') ?? element.textContent, width: box.width, height: box.height};
              })
              .filter(box => box.width < 36 || box.height < 36)
          );
          expect(undersized, `${route}: touch targets`).toEqual([]);
        }

        await page.keyboard.press('Control+K');
        const dialog = page.locator('.rp-modal');
        await expect(dialog).toBeVisible();
        const bounds = await dialog.evaluate(element => {
          const box = element.getBoundingClientRect();
          const body = element.querySelector<HTMLElement>('.rp-dialog')!;
          return {
            fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
            scrollable: body.scrollHeight <= body.clientHeight || getComputedStyle(body).overflowY === 'auto'
          };
        });
        expect(bounds.fits, `${route}: dialog bounds`).toBe(true);
        expect(bounds.scrollable, `${route}: dialog scrolling`).toBe(true);
      });
    }
  });
}

// A landscape phone (about 844x390) is too short for the sticky top bar to sit above the routing hub's own page
// switcher and tabs without filling the whole height before any page content shows.
test.describe('844x390 landscape', () => {
  test.use({viewport: {width: 844, height: 390}});

  for (const route of ['policies', 'nodes', 'rules'] as const)
    test(`${route} lets the top bar scroll away instead of pinning above the tabs`, async ({page}) => {
      await page.goto(`/#/${route}`);
      // The page's own content, not just its heading, decides whether there is anything to scroll to.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(390);
      await expect(page.locator('.rp-top')).toHaveCSS('position', 'static');
      const top = () => page.locator('.rp-top').evaluate(element => element.getBoundingClientRect().top);
      expect(await top()).toBe(0);
      await page.evaluate(() => window.scrollBy(0, 200));
      expect(await top()).toBeLessThan(0);
    });
});

// A portrait phone has the height to keep the top bar pinned, as it always has.
test.describe('390x844 portrait', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('policies keeps the top bar pinned', async ({page}) => {
    await page.goto('/#/policies');
    await expect(page.locator('.rp-content > *').first()).toBeVisible();
    await expect(page.locator('.rp-top')).toHaveCSS('position', 'sticky');
  });
});

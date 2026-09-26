import {expect, test} from './fixtures';

// The filter field: a fixed 240px box on desktop, the full toolbar row on phones, and an ellipsis rather than an
// abrupt cut mid-word when its placeholder or value still does not fit (src/features/connections/Connections.tsx).
test.describe('320px', () => {
  test.use({viewport: {width: 320, height: 700}});

  test('the filter field takes the toolbar row and ellipsises a value that does not fit', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    const field = page.getByRole('searchbox', {name: 'Filter'});
    await expect(field).toBeVisible();
    const box = await field.evaluate(el => el.closest('.rp-input')!.getBoundingClientRect());
    const toolbar = await page
      .locator('.rp-toolbar')
      .first()
      .evaluate(el => el.getBoundingClientRect());
    // Flexible now, not the fixed 240px box: it takes most of a 320px toolbar row instead of sharing it with, and
    // being squeezed narrower by, the controls beside it.
    expect(box.width).toBeGreaterThan(280);
    expect(box.width).toBeLessThanOrEqual(toolbar.width + 1);
    expect(await field.evaluate(el => getComputedStyle(el).textOverflow)).toBe('ellipsis');
    // A value longer than any placeholder (a pasted domain, say) still must not fit; it fades to an ellipsis, not an
    // abrupt cut mid-character.
    await field.fill('a-very-long-domain-name-that-does-not-fit-in-the-field-at-all.example.com');
    const overflow = await field.evaluate(el => el.scrollWidth > el.clientWidth);
    expect(overflow).toBe(true);
  });
});

test.describe('1280px', () => {
  test.use({viewport: {width: 1280, height: 900}});

  test('the filter field keeps its 240px width on desktop', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    const field = page.getByRole('searchbox', {name: 'Filter'});
    const width = await field.evaluate(el => Math.round(el.closest('.rp-input')!.getBoundingClientRect().width));
    expect(width).toBe(240);
  });
});

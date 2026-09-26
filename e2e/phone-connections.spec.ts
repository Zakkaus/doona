import {expect, test} from './fixtures';

// The filter field: a fixed 240px box on desktop, the toolbar row beside the filters menu on phones, and an ellipsis
// rather than an abrupt cut mid-word when its placeholder or value still does not fit
// (src/features/connections/Connections.tsx).
test.describe('320px', () => {
  test.use({viewport: {width: 320, height: 700}});

  test('the filter field takes the toolbar row and ellipsises a value that does not fit', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    const field = page.getByRole('searchbox', {name: 'Filter'});
    await expect(field).toBeVisible();
    const box = await field.evaluate(el => el.closest('.rp-input')!.getBoundingClientRect());
    const menu = (await page.getByRole('button', {name: 'Filters', exact: true}).boundingBox())!;
    const toolbar = await page
      .locator('.rp-toolbar')
      .first()
      .evaluate(el => el.getBoundingClientRect());
    // Flexible now, not the fixed 240px box: it takes what the filters menu leaves of the row.
    expect(box.x).toBeCloseTo(toolbar.x, 0);
    expect(menu.x + menu.width).toBeCloseTo(toolbar.x + toolbar.width, 0);
    expect(menu.x - (box.x + box.width)).toBeCloseTo(8, 0);
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

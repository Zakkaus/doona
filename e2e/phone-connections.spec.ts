import {expect, test, mockBackend, detail} from './fixtures';

// The filter field: a fixed 240px box on desktop, the toolbar row beside the filters menu on phones, and an ellipsis
// rather than an abrupt cut mid-word when its placeholder or value still does not fit
// (src/features/connections/Connections.tsx).
test.describe('320px', () => {
  test.use({viewport: {width: 320, height: 700}});

  test('the filter field takes the toolbar row and ellipsises a value that does not fit', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    const field = page.getByRole('searchbox', {name: 'Filter', exact: true});
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
    const field = page.getByRole('searchbox', {name: 'Filter', exact: true});
    const width = await field.evaluate(el => Math.round(el.closest('.rp-input')!.getBoundingClientRect().width));
    expect(width).toBe(240);
  });
});

// TextTooltip only reveals on an ancestor's :focus-visible, which a tap never produces (src/ui/Button.tsx). On a
// phone the detail drawer has vertical room to spare, so a value that would otherwise truncate wraps instead, and the
// full text is on screen without needing the tooltip at all.
test('the detail rule wraps on phones and truncates on desktop', async ({page}) => {
  const {api} = await mockBackend(page);
  const connections = await api.connections({detail: 'full', limit: 1000});
  const row = connections.tcp.find(row => row.rule_expression && row.chain.length)!;
  await page.goto(`/#/connections?id=${encodeURIComponent(row.id)}`);
  const rule = detail(page).locator('.rp-list .rp-truncate').first();
  for (const {width, whiteSpace} of [
    {width: 390, whiteSpace: 'normal'},
    {width: 1280, whiteSpace: 'nowrap'}
  ]) {
    await page.setViewportSize({width, height: 900});
    await expect(rule).toHaveText(row.rule_expression!);
    await expect.poll(() => rule.evaluate(el => getComputedStyle(el).whiteSpace)).toBe(whiteSpace);
  }
});

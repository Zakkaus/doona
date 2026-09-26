import {expect, test} from './fixtures';

// Below 600px the Connections toolbar keeps the filter field and folds the secondary filters into one menu beside it
// (src/features/connections/Connections.tsx), badged with how many are in force.
test.describe('390px', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('the filter field and the filters menu share one row', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    const field = page.getByRole('searchbox', {name: 'Filter'});
    const filters = page.getByRole('button', {name: 'Filters', exact: true});
    await expect(filters).toBeVisible();
    const [a, b] = [(await field.boundingBox())!, (await filters.boundingBox())!];
    expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(2);
    await expect(page.getByRole('radiogroup', {name: 'Network protocol'})).toHaveCount(0);
    await expect(page.locator('.rp-toolbar').first().locator('.rp-count')).toHaveCount(0);
  });

  test('a filter picked from the menu shows in its count and clears', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    await page.getByRole('button', {name: 'Filters', exact: true}).click();
    await page.getByRole('menuitem', {name: /^Network protocol/}).click();
    await page.getByRole('menuitemradio', {name: 'TCP'}).click();
    await expect(page).toHaveURL(/network=tcp/);
    const filters = page.getByRole('button', {name: 'Filters, 1 applied'});
    await expect(filters).toContainText('1');
    // The menu's rows show each filter's choice, and the "all" entry lifts one.
    await filters.click();
    await expect(page.getByRole('menuitem', {name: /^Network protocol/})).toContainText('TCP');
    await page.getByRole('menuitem', {name: /^Device/}).click();
    await page.getByRole('menuitemradio').nth(1).click();
    await expect(page).toHaveURL(/src=\d+\.\d+\.\d+\.\d+/);
    await expect(page.getByRole('button', {name: 'Filters, 2 applied'})).toBeVisible();
    await page.getByRole('button', {name: 'Filters, 2 applied'}).click();
    await page.getByRole('menuitem', {name: /^Device/}).click();
    await page.getByRole('menuitemradio', {name: 'All devices'}).click();
    await expect(page).not.toHaveURL(/src=/);
    await page.getByRole('button', {name: 'Clear filters'}).click();
    await expect(page.getByRole('button', {name: 'Filters', exact: true})).toBeVisible();
  });

  test('the menu works from the keyboard', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    await page.getByRole('button', {name: 'Filters', exact: true}).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', {name: /^Network protocol/})).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitemradio', {name: /^All/})).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/network=udp/);
    await expect(page.getByRole('button', {name: 'Filters, 1 applied'})).toBeFocused();
  });

  test('a filter that matches nothing keeps its query and a clear control', async ({page}) => {
    await page.goto('/#/connections?tab=list');
    const field = page.getByRole('searchbox', {name: 'Filter'});
    await field.fill('no-such-host.invalid');
    await expect(page.getByText('No matching connections')).toBeVisible();
    await expect(field).toHaveValue('no-such-host.invalid');
    await page.getByRole('button', {name: 'Clear filters'}).click();
    await expect(field).toHaveValue('');
    await expect(page.getByText('No matching connections')).toHaveCount(0);
  });
});

test('a wide screen keeps every filter in the toolbar', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/#/connections?tab=list');
  await expect(page.getByRole('radiogroup', {name: 'Network protocol'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Select'})).toBeVisible();
  await expect(page.getByRole('button', {name: /^Filters/})).toHaveCount(0);
});

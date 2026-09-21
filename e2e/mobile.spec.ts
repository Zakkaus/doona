import {expect, routes, test} from './fixtures';

test.use({viewport: {width: 390, height: 844}});

test('mobile page select exposes and opens every page without horizontal overflow', async ({page}) => {
  await page.goto('/#/activity');
  const select = page.locator('.rp-mobile-nav').getByRole('button');
  // The mock offers every route, so the select should preserve registry order.
  await select.click();
  const listed = await page.getByRole('option').evaluateAll(items => items.map(item => item.getAttribute('data-key')));
  await page.keyboard.press('Escape');
  const shown = routes.filter(route => listed.includes(route));
  expect(shown.length).toBe(listed.length);
  for (const [index, route] of shown.entries()) {
    await select.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(shown.length);
    await options.nth(index).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
  }
  await page.goto('/#/activity');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

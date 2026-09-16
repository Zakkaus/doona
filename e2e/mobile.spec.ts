import {expect, routes, test} from './fixtures';

test.use({viewport: {width: 390, height: 844}});

test('mobile page select exposes and opens every page without horizontal overflow', async ({page}) => {
  await page.goto('/#/overview');
  const select = page.locator('.rp-mobile-nav').getByRole('button');
  for (const [index, route] of routes.entries()) {
    await select.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(routes.length);
    await options.nth(index).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
  }
  await page.goto('/#/overview');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

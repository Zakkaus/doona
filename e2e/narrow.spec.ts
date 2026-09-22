import {expect, test} from './fixtures';
// The narrowest supported phone: every page fits without scrolling sideways.
test.use({viewport: {width: 320, height: 640}});
for (const route of ['activity', 'overview', 'connections', 'nodes', 'policies', 'rules', 'flows', 'dns', 'config', 'logs', 'events', 'settings']) {
  test(`no horizontal overflow at 320px on ${route}`, async ({page}) => {
    await page.goto(`/#/${route}`);
    await expect(page.locator('.rp-content > *').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

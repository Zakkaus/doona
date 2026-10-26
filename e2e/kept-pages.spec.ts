import type {Page, Request} from '@playwright/test';
import {poll} from '../src/store/cadence';
import {expect, mockBackend, test} from './fixtures';

test.use({viewport: {width: 1440, height: 1000}});

const open = async (page: Page, route: string) => {
  await page.locator(`.rp-nav[href="#/${route}"]`).click();
  await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
};
// The source tab, which a nav link would not open.
const openSource = async (page: Page) => {
  await page.evaluate(() => {
    location.hash = '#/config?tab=source';
  });
  await expect(page.locator('.rp-nav[href="#/config"]')).toHaveAttribute('aria-current', 'page');
};
const reads = (requests: Request[], path: string) =>
  requests.filter(request => request.method() === 'GET' && new URL(request.url()).pathname === `/api/v1/${path}`).length;

test('a page opened again keeps what the reader left in it, and only the shown page is exposed', async ({page}) => {
  await page.goto('/#/logs');
  const module = page.getByRole('searchbox', {name: 'Module', exact: true});
  await module.fill('honk::dns');
  await open(page, 'rules');
  // The hidden page stays in the DOM but out of the accessibility tree, and `/` finds the shown page's field only.
  await expect(module).toHaveCount(0);
  await expect(page.getByRole('heading', {level: 1})).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('grid', {name: 'Logs'})).toHaveCount(0);
  await page.locator('body').press('/');
  await expect(page.locator('.rp-content input[type="search"]:focus')).toHaveCount(0);
  await open(page, 'logs');
  await expect(module).toHaveValue('honk::dns');
  await page.locator('body').press('/');
  await expect(module).toBeFocused();
});

test('a hidden page stops reading its resources and reads them again when shown', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.clock.install();
  await page.goto('/#/connections');
  await expect(page.getByRole('main').getByRole('region', {name: 'Traffic per connection'})).toBeVisible();
  const shown = reads(requests, 'connections');
  expect(shown).toBeGreaterThan(0);
  await page.clock.fastForward(poll.live + 1000);
  await expect.poll(() => reads(requests, 'connections')).toBeGreaterThan(shown);
  await open(page, 'rules');
  await expect(page.getByRole('main').getByRole('tabpanel')).toBeVisible();
  const hidden = reads(requests, 'connections');
  const groups = reads(requests, 'groups');
  // Past the rules page's own poll of the groups, which shows the timers ran, the hidden list has not been read.
  await page.clock.fastForward(poll.inventory + 1000);
  await expect.poll(() => reads(requests, 'groups')).toBeGreaterThan(groups);
  expect(reads(requests, 'connections')).toBe(hidden);
  await open(page, 'connections');
  await expect.poll(() => reads(requests, 'connections')).toBeGreaterThan(hidden);
});

test('a discarded draft does not come back on a kept page or ask again from behind it', async ({page}) => {
  await page.goto('/#/config?tab=source');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n# draft to discard');
  await page.locator('.rp-nav[href="#/connections"]').click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('.rp-nav[href="#/connections"]')).toHaveAttribute('aria-current', 'page');
  // The configuration page is kept hidden without a draft, so leaving the next page asks nothing.
  await open(page, 'rules');
  await expect(dialog).toHaveCount(0);
  await openSource(page);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.cm-content')).not.toContainText('draft to discard');
  await open(page, 'connections');
  await expect(dialog).toHaveCount(0);
  // A draft kept on a page that stays shown still asks once.
  await openSource(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n# second draft');
  await page.locator('.rp-nav[href="#/rules"]').click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page.locator('.cm-content')).toContainText('second draft');
});

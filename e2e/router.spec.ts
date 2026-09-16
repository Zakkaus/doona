import {expect, test} from './fixtures';

test('same-route query changes selection through browser history', async ({page}) => {
  await page.goto('/#/flows?id=flow-1');
  const selected = page.locator('.rp-table [aria-selected="true"]');
  await expect(selected).toHaveAttribute('data-key', 'flow-1');
  await page.evaluate(() => {
    location.hash = '#/flows?id=flow-2';
  });
  await expect(selected).toHaveAttribute('data-key', 'flow-2');
  await page.goBack();
  await expect(selected).toHaveAttribute('data-key', 'flow-1');
  await page.goForward();
  await expect(selected).toHaveAttribute('data-key', 'flow-2');
});

test('connection deep link initializes the source filter', async ({page}) => {
  await page.goto('/#/connections?src=192.168.1.2');
  await expect(page.locator('.rp-toolbar input')).toHaveValue('192.168.1.2');
});

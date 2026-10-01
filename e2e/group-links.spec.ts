import type {Page} from '@playwright/test';
import {expect, mockBackend, test} from './fixtures';

async function focusedGroup(page: Page, name: string) {
  await expect(page).toHaveURL(new RegExp(`#/policies\\?group=${name}$`));
  const card = page.getByRole('region', {name, exact: true});
  const heading = card.getByRole('heading', {name, exact: true});
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect
    .poll(async () => {
      const title = await heading.boundingBox();
      const bar = await page.getByRole('banner').boundingBox();
      return title!.y >= bar!.y + bar!.height;
    })
    .toBe(true);
  await expect(card).toHaveAttribute('data-highlighted', 'true');
  await expect(card).not.toHaveAttribute('data-highlighted', 'true', {timeout: 5000});
  await expect(heading).toBeFocused();
}

for (const keyboard of [false, true]) {
  test(`Nodes group tags jump with ${keyboard ? 'keyboard' : 'pointer'} across their whole surface`, async ({page}) => {
    await mockBackend(page);
    await page.goto('/#/nodes?provider=inline');
    const link = page.getByRole('group', {name: 'Groups', exact: true}).first().getByRole('link', {name: 'proxy', exact: true});
    await expect(link).toHaveCSS('user-select', 'none');
    if (keyboard) {
      const row = link.locator('xpath=ancestor::tr');
      await row.focus();
      for (let index = 0; index < 4; index++) await page.keyboard.press('ArrowRight');
      await expect(link).toBeFocused();
      await page.keyboard.press('Enter');
    } else await link.click({position: {x: 3, y: 3}});
    await focusedGroup(page, 'proxy');
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
  });
}
for (const width of [1280, 390])
  for (const route of ['connections?id=1', 'flows?tab=records&id=flow-1']) {
    test(`${width}px ${route} outbound group tag focuses its Policies card`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      const {api, handlers} = await mockBackend(page);
      handlers['GET flows/flow-1'] = () => api.flow('flow-1');
      await page.goto('/#/' + route);
      const panel = width === 390 ? page.getByRole('dialog') : page.locator('.rp-panel');
      const link = panel.getByRole('link', {name: 'proxy', exact: true});
      await expect(link).toHaveCSS('user-select', 'none');
      await link.focus();
      await page.keyboard.press('Enter');
      await focusedGroup(page, 'proxy');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
test('Policies nested group Tags jump between cards', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/policies?group=proxy');
  await page.getByRole('region', {name: 'proxy', exact: true}).getByRole('link', {name: 'auto', exact: true}).click();
  await focusedGroup(page, 'auto');
});

import {detail, expect, mockBackend, test, moreAction} from './fixtures';
const top = (page: import('@playwright/test').Page) => page.locator('.rp-top');
test.use({viewport: {width: 1440, height: 900}});
test('show matched rule opens the rule list on that rule', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/connections?id=1');
  await moreAction(detail(page), 'Show matched rule');
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=r5$/);
  const selected = page.getByRole('tabpanel', {name: 'Routing rules'}).locator('[role=row][aria-selected=true]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText('domain(geosite:telegram)');
});

test('without a writable configuration showing the matched rule only reads', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.resources.config.writable = false;
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await expect(detail(page).getByRole('link', {name: /in the rule list$/})).toBeVisible();
  await moreAction(detail(page), 'Show matched rule');
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=r5$/);
});

test('reload asks for confirmation, then reloads the engine and reports the operation', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/connections');
  await top(page).getByRole('button', {name: 'Reload honk', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Reload honk?'});
  await expect(dialog).toContainText('Held rules are not written.');
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Reload honk', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive', {hasText: 'Reload'})).toBeVisible();
  expect(requests.filter(request => request.method() !== 'GET').map(request => new URL(request.url()).pathname)).toEqual([expect.stringMatching(/reload$/)]);
});

test('cancelling the reload confirmation reloads nothing', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/connections');
  await top(page).getByRole('button', {name: 'Reload honk', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Reload honk?'});
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

test('the reload arrows turn once a second, like an indeterminate progress circle, and stay still with reduced motion', async ({page}) => {
  await mockBackend(page);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/#/connections');
  const reload = top(page).getByRole('button', {name: 'Reload honk', exact: true});
  const timing = () =>
    reload.evaluate(button =>
      button
        .querySelector('.rp-spin-on-press')!
        .getAnimations()
        .map(animation => animation.effect!.getTiming().duration)
    );
  const cancel = page.getByRole('dialog', {name: 'Reload honk?'}).getByRole('button', {name: 'Cancel', exact: true});
  await reload.click();
  expect(await timing()).toEqual([1000]);
  await cancel.click();
  await expect.poll(timing).toEqual([]);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await reload.click();
  expect(await timing()).toEqual([]);
  await cancel.click();
});

test('the matched rule is edited from a connection: only its outbound changes, on its own line', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const before = (await api.config()).sources.find(source => source.id === 'src-main')!.content!;
  await page.goto('/#/connections?id=1');
  await moreAction(detail(page), "Edit matched rule's outbound settings");
  await expect(page).toHaveURL(/#\/rules\?.*edit=/);
  const dialog = page.getByRole('dialog', {name: 'Edit rule'});
  await expect(dialog.locator('.rp-code')).toContainText('domain(geosite:telegram)');
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('gaming');
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await dialog.getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule change is in effect'})).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/edit=/);
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  expect(writes[0].url()).toMatch(/\/api\/v1\/config\/sources\/src-main$/);
  expect(writes[0].postDataJSON()).toEqual({content: before.replace('domain(geosite:telegram) -> telegram', 'domain(geosite:telegram) -> gaming')});
  await expect(page.getByRole('row', {name: /domain\(geosite:telegram\)/})).toContainText('gaming');
});

test('a routing rule edits its outbound from its own row, and a read-only file disables that with the reason', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const before = (await api.config()).sources.find(source => source.id === 'src-main')!.content!;
  await page.goto('/#/rules?tab=list&view=advanced');
  const row = page.getByRole('row', {name: /domain\(geosite:telegram\)/});
  await row.getByRole('button', {name: 'Edit rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit rule'});
  await expect(dialog.locator('.rp-code')).toContainText('domain(geosite:telegram)');
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('gaming');
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await dialog.getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule change is in effect'})).toBeVisible();
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  expect(writes[0].postDataJSON()).toEqual({content: before.replace('domain(geosite:telegram) -> telegram', 'domain(geosite:telegram) -> gaming')});
  // The same row in a file honk will not write keeps the action, disabled, and says why.
  const config = await api.config();
  handlers['GET config'] = async () => ({...config, sources: config.sources.map(source => ({...source, writable: false}))});
  await top(page).getByRole('button', {name: 'Refresh', exact: true}).click();
  const locked = row.getByRole('button', {name: 'Edit rule', exact: true});
  await expect(locked).toBeDisabled();
  await locked.locator('..').hover();
  await expect(page.getByRole('tooltip')).toHaveText('This file is read-only');
});

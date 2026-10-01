import {expect, mockBackend, test} from './fixtures';
import {writeMode} from '../src/dae/outboundMode';

test('the desktop appearance link focuses the only appearance editor', async ({page}) => {
  await page.goto('/#/activity');
  const top = page.locator('.rp-top');
  await expect(top.getByRole('button', {name: 'Language', exact: true})).toHaveCount(0);
  await expect(top.getByRole('button', {name: 'Palette', exact: true})).toHaveCount(0);
  await top.getByRole('link', {name: 'Appearance'}).click();
  await expect(page).toHaveURL(/#\/settings\?card=appearance$/);
  const card = page.getByRole('region', {name: 'Appearance'});
  await expect(card).toBeFocused();
  await card.getByRole('button', {name: /Wordmark$/}).click();
  await page.getByRole('option', {name: 'Plain', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-wordmark', 'plain');
});

for (const [label, hash, control] of [
  ['System status', '#/overview?card=status', 'Suspend'],
  ['Clear all cache', '#/dns?tab=cache', 'Clear all cache'],
  ['Refresh subscriptions', '#/nodes?tab=list', 'Refresh all subscriptions']
]) {
  test(`Settings jumps to ${label} without executing it`, async ({page}) => {
    const {requests} = await mockBackend(page);
    await page.goto('/#/settings?card=actions');
    const actions = page.getByRole('region', {name: 'Backend actions'});
    await expect(actions.getByRole('button', {name: label, exact: true})).toHaveCount(0);
    await actions.getByRole('link', {name: label, exact: true}).click();
    expect(new URL(page.url()).hash).toBe(hash);
    await expect(page.getByRole('button', {name: new RegExp(`^${control}`)}).first()).toBeVisible();
    expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  });
}

test('the close-all jump discards every previous connection filter and confirms the full scope', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/connections?tab=list&network=tcp&out=direct&rule=old&src=192.168.1.2&q=stale');
  await expect(page.getByRole('button', {name: 'Clear filters', exact: true})).toBeVisible();
  await page.locator('.rp-nav[href="#/settings"]').click();
  await page.getByRole('region', {name: 'Backend actions'}).getByRole('link', {name: 'Close all'}).click();
  const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(Object.fromEntries(params)).toEqual({tab: 'list', network: 'all', out: 'all', rule: 'all', src: '', q: ''});
  await expect(page.getByRole('button', {name: 'Clear filters', exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.getByRole('alertdialog')).toContainText('any device');
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

test('a managed outbound rule opens Activity with separate mode and target cards', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(await api.replaceConfigSource(main.id, writeMode(main.content, {mode: 'direct'}), `"${main.content_sha256}"`));
  const managed = (await api.rules()).rules.find(rule => rule.expression === 'l4proto(tcp, udp)')!;
  await page.goto('/#/rules?tab=list&view=advanced');
  const row = page.getByRole('row').filter({has: page.getByRole('link', {name: 'Edit outbound mode'})});
  await expect(row.getByRole('button', {name: /^(Edit outbound settings|Remove rule)$/})).toHaveCount(0);
  await row.getByRole('link', {name: 'Edit outbound mode'}).click();
  const card = page.getByRole('region', {name: 'Outbound mode', exact: true});
  await expect(card).toBeFocused();
  await expect(card.getByRole('radiogroup', {name: 'Outbound mode'})).toBeVisible();
  await expect(card.getByRole('button', {name: 'Global mode outbound', exact: true})).toHaveCount(0);
  const target = page.locator('.rp-quick > section').nth(1);
  await expect(target.getByRole('button', {name: 'Global mode outbound', exact: true})).toBeVisible();
  await expect(page.locator('.rp-quick > section')).toHaveCount(3);
  await page.goto(`/#/rules?tab=list&view=advanced&edit=${encodeURIComponent(managed.rule_id)}`);
  await expect(page).toHaveURL(/#\/activity\?card=mode$/);
  await expect(page.getByRole('dialog', {name: 'Edit rule'})).toHaveCount(0);
});

test('a stale token profile link cannot save a different profile', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/settings?card=backend&profile=missing&reason=rejected&return=%23%2Factivity');
  const card = page.getByRole('region', {name: 'Backend', exact: true});
  await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeDisabled();
  await expect(card.getByRole('alert')).toBeVisible();
});

test('forbidden recording links to the requirements without changing configuration', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const runtime = await api.runtimeSettings();
  for (const id of ['flows', 'logs', 'dns_log'] as const) runtime.recording![id] = {...runtime.recording![id]!, allowed: false, active: false};
  handlers['GET runtime/settings'] = async () => runtime;
  await page.goto('/#/settings?card=runtime');
  const group = page.getByRole('group', {name: 'Recording'});
  await expect(group.getByRole('link', {name: 'View enabling requirements'})).toHaveCount(3);
  for (const button of await group.getByRole('button').all()) await expect(button).toBeDisabled();
  await group.getByRole('link', {name: 'View enabling requirements'}).first().click();
  await expect(page).toHaveURL(/#\/overview\?card=limits$/);
  await expect(page.locator('section').filter({has: page.locator('#overview-limits')})).toBeFocused();
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

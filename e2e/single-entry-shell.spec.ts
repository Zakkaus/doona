import {expect, mockBackend, test, box} from './fixtures';
import {writeMode} from '../src/dae/outboundMode';

test('the desktop theme shortcut stays in sync with the appearance editor', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto('/#/activity');
  const top = page.locator('.rp-top');
  await expect(top.getByRole('button', {name: 'Language', exact: true})).toBeVisible();
  await expect(top.getByRole('button', {name: 'Palette', exact: true})).toBeVisible();
  await expect(top.getByRole('link', {name: 'Appearance'})).toHaveCount(0);
  await page.goto('/#/settings?card=appearance');
  await expect(page).toHaveURL(/#\/settings\?card=appearance$/);
  const card = page.getByRole('region', {name: 'Appearance'});
  await expect(card).toBeFocused();
  const scheme = card.getByRole('button', {name: /Color scheme$/});
  await scheme.click();
  await page.getByRole('option', {name: 'System', exact: true}).click();
  const theme = top.getByRole('button', {name: /^Theme:/});
  await theme.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Theme: System');
  await theme.focus();
  await theme.press('Enter');
  await expect(theme).toBeFocused();
  await expect(theme).toHaveAccessibleName('Theme: Dark');
  await expect(scheme).toContainText('Dark');
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await theme.press('Space');
  await expect(theme).toHaveAccessibleName('Theme: System');
  await expect(scheme).toContainText('System');
  await scheme.click();
  await page.getByRole('option', {name: 'Dark', exact: true}).click();
  await expect(theme).toHaveAccessibleName('Theme: Dark');
  await expect(top.locator('.rp-icon-stack')).toHaveAttribute('data-dark', 'true');
  await page.reload();
  await expect(theme).toHaveAccessibleName('Theme: Dark');
  await expect(scheme).toContainText('Dark');
  await card.getByRole('button', {name: /Wordmark$/}).click();
  await page.getByRole('option', {name: 'Plain', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-wordmark', 'plain');
});

test('full-scope connections respect filters added before confirmation', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/connections?tab=list&network=all&out=all&rule=all&src=&q=&scope=all');
  await page.getByRole('searchbox', {name: 'Filter', exact: true}).fill('telegram');
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.getByRole('alertdialog')).toContainText(/Closes the [\d,]+ listed connection/);
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

test('a managed outbound rule opens Activity with separate mode and target cards', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(await api.replaceConfigSource(main.id, writeMode(main.content, {mode: 'direct'}), `"${main.content_sha256}"`));
  const managed = (await api.rules()).rules.find(rule => rule.expression === 'l4proto(tcp, udp)')!;
  await page.goto('/#/rules?tab=list&view=advanced');
  const row = page.getByRole('row').filter({has: page.getByRole('link', {name: 'Edit outbound mode'})});
  await expect(row.getByRole('button', {name: /^(Edit rule|Remove rule)$/})).toHaveCount(0);
  const edit = row.getByRole('link', {name: 'Edit outbound mode'});
  const linkBox = await box(edit);
  const cellBox = await box(edit.locator('..').locator('..'));
  expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width);
  await edit.click();
  const card = page.getByRole('region', {name: 'Outbound mode', exact: true});
  await expect(card).toBeFocused();
  await expect(card.getByRole('radiogroup', {name: 'Outbound mode'})).toBeVisible();
  await expect(card.getByRole('button', {name: 'Global outbound', exact: true})).toHaveCount(0);
  const target = page.locator('[data-profile=quick] [data-module=global] > section');
  await expect(target.getByRole('button', {name: 'Global outbound', exact: true})).toBeVisible();
  await expect(page.locator('[data-profile=quick] > .rp-dashboard-cell')).toHaveCount(3);
  await page.goto(`/#/rules?tab=list&view=advanced&edit=${encodeURIComponent(managed.rule_id)}`);
  await expect(page).toHaveURL(/#\/activity\?card=mode$/);
  await expect(page.getByRole('dialog', {name: 'Edit rule'})).toHaveCount(0);
});

test('the outbound mode jump restores a removed card without changing the saved dashboard', async ({page}) => {
  const saved = JSON.stringify({version: 2, sections: []});
  await page.goto('/#/activity');
  await page.evaluate(value => localStorage.setItem('doona-dashboard', value), saved);
  await page.goto('/#/rules');
  await page.goto('/#/activity?card=mode');
  const card = page.getByRole('region', {name: 'Outbound mode', exact: true});
  await expect(card).toBeFocused();
  await expect(card.getByRole('radiogroup', {name: 'Outbound mode'})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('doona-dashboard'))).toBe(saved);
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
  runtime.recording!.dns_log = {...runtime.recording!.dns_log!, allowed: false, active: false};
  handlers['GET runtime/settings'] = async () => runtime;
  await page.goto('/#/settings?card=runtime');
  const group = page.getByRole('group', {name: 'Recording'});
  await expect(group.getByRole('link', {name: 'View enabling requirements'})).toHaveCount(1);
  await expect(group.getByRole('button', {name: /DNS log/})).toBeDisabled();
  const boxes = await group.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThanOrEqual(1);
  await group.getByRole('link', {name: 'View enabling requirements'}).first().click();
  await expect(page).toHaveURL(/#\/overview\?card=limits$/);
  const limits = page.locator('section').filter({has: page.locator('#overview-limits')});
  await expect(limits).toBeFocused();
  await limits.getByRole('button', {name: 'How to turn on'}).click();
  await expect(page.getByRole('dialog')).toContainText('record_dns_log: true');
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

test('late Overview data preserves focus after the status jump', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  handlers['GET datapath'] = async () => {
    await pending;
    return api.datapath();
  };
  await page.goto('/#/overview?card=status');
  const status = page.locator('#overview-status');
  await expect(status).toBeFocused();
  const suspend = page.getByRole('button', {name: 'Suspend', exact: true});
  await suspend.focus();
  release();
  await expect(page.getByRole('grid', {name: 'Attachments', exact: true})).toBeVisible();
  await expect(suspend).toBeFocused();
});

test('Settings preserves field focus when the card query stays the same', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/settings?card=backend');
  const card = page.getByRole('region', {name: 'Backend', exact: true});
  await expect(card).toBeFocused();
  const token = card.locator('[name=token]');
  await token.focus();
  await page.evaluate(() => {
    location.hash = '#/settings?card=backend&return=%23%2Factivity';
  });
  await expect(page).toHaveURL(/return=/);
  await expect(token).toBeFocused();
});

for (const width of [390, 768]) {
  test(`a cold recording requirements jump keeps its help above navigation at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/?scenario=faults#/settings?card=runtime');
    await page.getByRole('link', {name: 'View enabling requirements'}).click();
    const limits = page.locator('section').filter({has: page.locator('#overview-limits')});
    await expect(limits).toBeFocused();
    await expect(page.locator('.rp-body-wait')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const help = limits.getByRole('button', {name: 'How to turn on'});
    await expect
      .poll(async () => {
        const button = await box(help);
        const navigation = await box(page.locator('.rp-hubbar'));
        return button.y >= 0 && button.y + button.height <= navigation.y;
      })
      .toBe(true);
    await expect(limits).toBeFocused();
  });
}

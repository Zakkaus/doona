import {detail, expect, mockBackend, test} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});

test('a rule added from a connection is written before the rule it matched, in one request', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.id === 'src-main')!;
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await dialog.getByRole('radio', {name: 'Domain suffix', exact: true}).click();
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await expect(dialog.locator('.rp-code')).toHaveText('domain(suffix: api.telegram.org) -> gaming');
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule written'})).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  expect(writes[0].url()).toMatch(/\/api\/v1\/config\/sources\/src-main$/);
  expect(writes[0].headers()['if-match']).toBe(`"${main.content_sha256}"`);
  expect(writes[0].headers()['idempotency-key']).toBeTruthy();
  const lines = main.content!.split('\n');
  const matched = lines.findIndex(line => line.includes('domain(geosite: telegram)'));
  const indent = lines[matched].match(/^\s*/)![0];
  lines.splice(matched, 0, `${indent}domain(suffix: api.telegram.org) -> gaming`);
  expect(writes[0].postDataJSON()).toEqual({content: lines.join('\n')});
});

test('a refused write shows its diagnostics in the dialog and writes nothing', async ({page}) => {
  const {handlers, requests} = await mockBackend(page);
  handlers['POST config/validate'] = async () => ({
    valid: false,
    generation_id: '40',
    validated_at: new Date().toISOString(),
    diagnostics: [{level: 'error', source_id: 'src-main', line: 44, column: 3, span: null, code: 'unknown-outbound', message: 'no group gaming'}]
  });
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(dialog).toContainText('Validation found 1 error; nothing written');
  await expect(dialog).toContainText('config.dae line 44: Backend message: no group gaming');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
});

test('edit matched rule opens the rule list on that rule', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Edit matched rule', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=r5$/);
  const selected = page.getByRole('tabpanel', {name: 'Rule list'}).locator('[role=row][aria-selected=true]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText('domain(geosite: telegram)');
});

test('a connection with no recorded rule only adds, first in the list', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET connections'] = async () => {
    const list = await api.connections();
    return {...list, tcp: list.tcp.map(row => ({...row, rule_id: null, rule_expression: null, rule_source: 'unknown'}))};
  };
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await expect(detail(page).getByRole('button', {name: 'Edit matched rule', exact: true})).toHaveCount(0);
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Add rule'}).getByRole('button', {name: /Insert$/})).toContainText('First');
});

test('the rule actions are hidden when the configuration cannot be written', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.resources.config.writable = false;
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await expect(detail(page).getByRole('link', {name: /in the rule list$/})).toBeVisible();
  await expect(detail(page).getByRole('button', {name: 'Add rule', exact: true})).toHaveCount(0);
  await expect(detail(page).getByRole('button', {name: 'Edit matched rule', exact: true})).toHaveCount(0);
});

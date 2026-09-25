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
  await dialog.getByRole('button', {name: 'Apply now', exact: true}).click();
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
  await dialog.getByRole('button', {name: 'Apply now', exact: true}).click();
  await expect(dialog).toContainText('Validation found 1 error; nothing written');
  await expect(dialog).toContainText('config.dae line 44: Backend message: no group gaming');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
});

test('show matched rule opens the rule list on that rule', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Show matched rule', exact: true}).click();
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
  await expect(detail(page).getByRole('button', {name: 'Show matched rule', exact: true})).toHaveCount(0);
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
  await expect(detail(page).getByRole('button', {name: 'Show matched rule', exact: true})).toHaveCount(0);
});

for (const width of [360, 768, 1440])
  test(`the panel actions share one size, line up and keep even gaps at ${width}px`, async ({page}) => {
    await mockBackend(page);
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/connections?id=1');
    const close = detail(page).getByRole('button', {name: 'Close connection', exact: true});
    await expect(close).toBeVisible();
    const boxes = await detail(page)
      .getByRole('button', {name: /^(Add rule|Show matched rule|View flow|Only this device|Close connection)$/})
      .evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON() as DOMRect));
    expect(boxes).toHaveLength(5);
    // One button style: a quiet button beside a filled one reads as a misaligned label.
    const fills = await detail(page)
      .getByRole('button', {name: /^(Add rule|Show matched rule|View flow|Only this device)$/})
      .evaluateAll(buttons => buttons.map(button => getComputedStyle(button).backgroundColor));
    expect(new Set(fills).size).toBe(1);
    expect(new Set(boxes.map(box => box.height)).size).toBe(1);
    const lines: DOMRect[][] = [];
    for (const box of boxes) {
      const line = lines.find(line => Math.abs(line[0].top - box.top) <= 1);
      if (line) line.push(box);
      else lines.push([box]);
    }
    const gaps = lines.flatMap(line => line.slice(1).map((box, i) => box.left - line[i].right));
    const leading = lines.slice(1).map((line, i) => line[0].top - lines[i][0].bottom);
    for (const gap of [...gaps, ...leading]) expect(Math.abs(gap - gaps[0])).toBeLessThanOrEqual(1);
    expect(lines.every(line => Math.abs(line[0].left - boxes[0].left) <= 1)).toBe(true);
    // The destructive action ends the group on a line of its own.
    expect(lines.at(-1)).toEqual([boxes[4]]);
  });

const top = (page: import('@playwright/test').Page) => page.locator('.rp-top');
async function hold(page: import('@playwright/test').Page, id: string) {
  await page.goto(`/#/connections?id=${id}`);
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await dialog.getByRole('button', {name: 'Hold', exact: true}).click();
  await expect(dialog).toHaveCount(0);
}

test('held rules wait for one apply from the top bar, which writes them in one request', async ({page}) => {
  const {requests} = await mockBackend(page);
  await hold(page, '1');
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule held; not written yet'})).toBeVisible();
  await hold(page, '2');
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  const apply = top(page).getByRole('button', {name: 'Apply and reload (2)', exact: true});
  await expect(apply.locator('.rp-held-count')).toHaveText('2');
  // The rule list shows what is held, and a held rule can be discarded there.
  await page.goto('/#/rules?tab=list');
  const held = page.getByRole('region', {name: 'Pending: 2'});
  await expect(held).toContainText('domain(full: api.telegram.org) -> proxy');
  await expect(held).toContainText('domain(full: cdn.bilibili.com) -> proxy');
  await apply.click();
  await expect(page.locator('.rp-toast.positive', {hasText: '2 rules written; reloading'})).toBeVisible();
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  const content = writes[0].postDataJSON().content as string;
  expect(content).toContain('domain(full: api.telegram.org) -> proxy');
  expect(content).toContain('domain(full: cdn.bilibili.com) -> proxy');
  await expect(held).toHaveCount(0);
  await expect(top(page).getByRole('button', {name: 'Refresh', exact: true})).toBeVisible();
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
});

test('a refused apply keeps the held rules and shows the diagnostics in the rule list', async ({page}) => {
  const {handlers, requests} = await mockBackend(page);
  handlers['POST config/validate'] = async () => ({
    valid: false,
    generation_id: '40',
    validated_at: new Date().toISOString(),
    diagnostics: [{level: 'error', source_id: 'src-main', line: 44, column: 3, span: null, code: 'unknown-outbound', message: 'no group proxy'}]
  });
  await hold(page, '1');
  await page.goto('/#/rules?tab=list');
  await top(page).getByRole('button', {name: 'Apply and reload (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'Validation found 1 error; nothing written'})).toBeVisible();
  const held = page.getByRole('region', {name: 'Pending: 1'});
  await expect(held).toContainText('config.dae line 44: Backend message: no group proxy');
  await expect(top(page).locator('.rp-held-count')).toHaveText('1');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await held.getByRole('button', {name: 'Discard held rule', exact: true}).click();
  await expect(held).toHaveCount(0);
  await expect(top(page).getByRole('button', {name: 'Refresh', exact: true})).toBeVisible();
});

test('with nothing held the top bar button re-reads the data and writes nothing', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  const before = requests.length;
  await top(page).getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Data refreshed.'})).toBeVisible();
  expect(requests.slice(before).some(request => request.url().includes('/connections'))).toBe(true);
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

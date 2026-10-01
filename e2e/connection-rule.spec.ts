import {detail, expect, expectLoadFailures, mockBackend, test, moreAction} from './fixtures';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import {sha256} from '../src/api/hash';

// The dialog starts with no outbound, so a rule is written only after one is chosen.
async function pick(dialog: import('@playwright/test').Locator, name: string) {
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await dialog.page().getByRole('option', {name, exact: true}).click();
}

test.use({viewport: {width: 1440, height: 900}});
// A reload the engine refused after the files were written.
const rejectedReload = () => ({
  operation_id: 'op-rejected',
  kind: 'reload',
  status: 'failed',
  created_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  result: null,
  error: {code: 'reload_rejected', message: 'Reload rejected', details: {written: true, committed: false}}
});

test('a rule added from a connection is written before the rule it matched, in one request', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.id === 'src-main')!;
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await pick(dialog, 'proxy');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await page.getByRole('option', {name: 'Domain keyword', exact: true}).click();
  await expect(dialog.locator('.rp-code')).toHaveText('domain(keyword: api.telegram.org) -> proxy');
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await page.getByRole('option', {name: 'Domain suffix', exact: true}).click();
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('gaming');
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await expect(dialog.locator('.rp-code')).toHaveText('domain(suffix: api.telegram.org) -> gaming');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'})).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  expect(writes[0].url()).toMatch(/\/api\/v1\/config\/sources\/src-main$/);
  expect(writes[0].headers()['if-match']).toBe(`"${main.content_sha256}"`);
  expect(writes[0].headers()['idempotency-key']).toBeTruthy();
  const lines = main.content!.split('\n');
  const matched = lines.findIndex(line => line.includes('domain(geosite:telegram)'));
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
  await pick(dialog, 'proxy');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toContainText('Validation found 1 error; nothing written');
  await expect(dialog).toContainText('config.dae line 44: Backend message: no group gaming');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
});

test('show matched rule opens the rule list on that rule', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/connections?id=1');
  await moreAction(detail(page), 'Show matched rule');
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=r5$/);
  const selected = page.getByRole('tabpanel', {name: 'Routing rules'}).locator('[role=row][aria-selected=true]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText('domain(geosite:telegram)');
});

test('a connection with no recorded rule adds before the fallback and says earlier rules may match first', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET connections'] = async () => {
    const list = await api.connections({detail: 'full', limit: 1000});
    return {...list, tcp: list.tcp.map(row => ({...row, rule_id: null, rule_expression: null, rule_source: 'unknown'}))};
  };
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await detail(page).getByRole('button', {name: 'More actions', exact: true}).click();
  await expect(page.getByRole('menuitem', {name: 'Show matched rule', exact: true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Last, before the fallback');
  await expect(dialog).toContainText('Earlier rules may still match this traffic first.');
  // First is still offered, and nothing comes before it.
  await dialog.getByRole('button', {name: /Insert$/}).click();
  await page.getByRole('option', {name: /^First/}).click();
  await expect(dialog).not.toContainText('Earlier rules may still match this traffic first.');
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

for (const width of [360, 768, 1440])
  test(`the panel shows one primary action beside a More menu of the same size at ${width}px`, async ({page}) => {
    await mockBackend(page);
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/connections?id=1');
    const add = detail(page).getByRole('button', {name: 'Add rule', exact: true});
    const more = detail(page).getByRole('button', {name: 'More actions', exact: true});
    await expect(add).toBeVisible();
    await expect(more).toBeVisible();
    await expect(
      detail(page).getByRole('button', {name: /^(Show matched rule|View flow|Trace this connection|Only this device|Close connection)$/})
    ).toHaveCount(0);
    const [primary, trigger] = [(await add.boundingBox())!, (await more.boundingBox())!];
    expect(trigger.height).toBe(primary.height);
    expect(Math.abs(trigger.y - primary.y)).toBeLessThanOrEqual(1);
    await more.click();
    // The destructive action ends the menu.
    await expect(page.getByRole('menu', {name: 'More actions'}).getByRole('menuitem')).toHaveText([
      'Show matched rule',
      "Edit matched rule's outbound settings",
      'View flow',
      'Trace this connection',
      'Only this device',
      'Close connection'
    ]);
  });

const top = (page: import('@playwright/test').Page) => page.locator('.rp-top');
async function hold(page: import('@playwright/test').Page, id: string) {
  await page.goto(`/#/connections?id=${id}`);
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  // The outbound each connection takes now: proxy for connection 1, direct for connection 2.
  await pick(dialog, id === '2' ? 'direct' : 'proxy');
  await dialog.getByRole('button', {name: 'Hold', exact: true}).click();
  await expect(dialog).toHaveCount(0);
}

test('held rules wait for one apply from the top bar, which writes them in one request', async ({page}) => {
  const {requests} = await mockBackend(page);
  await hold(page, '1');
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule held; not written yet'})).toBeVisible();
  await hold(page, '2');
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  const apply = top(page).getByRole('button', {name: 'Apply (2)', exact: true});
  await expect(apply.locator('.rp-held-count')).toHaveText('2');
  // Refresh stays a plain re-read beside it.
  await expect(top(page).getByRole('button', {name: 'Refresh', exact: true}).locator('.rp-held-count')).toHaveCount(0);
  // The rule list shows what is held, and a held rule can be discarded there.
  await page.goto('/#/rules?tab=list&view=advanced');
  const held = page.getByRole('region', {name: 'Pending: 2'});
  await expect(held).toContainText('domain(full: api.telegram.org) -> proxy');
  await expect(held).toContainText('domain(full: cdn.bilibili.com) -> direct');
  await apply.click();
  await expect(page.getByRole('dialog', {name: 'Reload honk?'})).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive', {hasText: '2 rules are in effect'})).toBeVisible();
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  const content = writes[0].postDataJSON().content as string;
  expect(content).toContain('domain(full: api.telegram.org) -> proxy');
  expect(content).toContain('domain(full: cdn.bilibili.com) -> direct');
  await expect(held).toHaveCount(0);
  await expect(top(page).getByRole('button', {name: 'Reload honk', exact: true})).toBeVisible();
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
  await page.goto('/#/rules?tab=list&view=advanced');
  await top(page).getByRole('button', {name: 'Apply (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'Validation found 1 error; nothing written'})).toBeVisible();
  const held = page.getByRole('region', {name: 'Pending: 1'});
  await expect(held).toContainText('config.dae line 44: Backend message: no group proxy');
  await expect(top(page).locator('.rp-held-count')).toHaveText('1');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await held.getByRole('button', {name: 'Discard held rule', exact: true}).click();
  await expect(held).toHaveCount(0);
  await expect(top(page).getByRole('button', {name: 'Reload honk', exact: true})).toBeVisible();
});

test('the held toast opens the held rules, which apply from their own section', async ({page}) => {
  const {requests} = await mockBackend(page);
  await hold(page, '1');
  await page.locator('.rp-toast.positive', {hasText: 'Rule held; not written yet'}).getByRole('button', {name: 'Review held rules', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&held=1$/);
  const held = page.getByRole('region', {name: 'Pending: 1'});
  await expect(held).toBeFocused();
  await held.getByRole('button', {name: 'Apply held rules', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: '1 rule is in effect'})).toBeVisible();
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(1);
  await expect(held).toHaveCount(0);
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
});

test('refresh re-reads the data and writes nothing, even with rules held', async ({page}) => {
  const {requests} = await mockBackend(page);
  await hold(page, '1');
  await page.goto('/#/connections?id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  const before = requests.length;
  await top(page).getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Data refreshed.'})).toBeVisible();
  expect(requests.slice(before).some(request => request.url().includes('/connections'))).toBe(true);
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  await expect(top(page).locator('.rp-held-count')).toHaveText('1');
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

test('reload with rules held reloads only and keeps them held', async ({page}) => {
  const {requests} = await mockBackend(page);
  await hold(page, '1');
  await top(page).getByRole('button', {name: 'Reload honk', exact: true}).click();
  await page.getByRole('dialog', {name: 'Reload honk?'}).getByRole('button', {name: 'Reload honk', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Reload'})).toBeVisible();
  expect(requests.filter(request => request.method() !== 'GET').map(request => new URL(request.url()).pathname)).toEqual([expect.stringMatching(/reload$/)]);
  await expect(top(page).getByRole('button', {name: 'Apply (1)', exact: true}).locator('.rp-held-count')).toHaveText('1');
  await page.goto('/#/rules?tab=list&view=advanced');
  await expect(page.getByRole('region', {name: 'Pending: 1'})).toContainText('domain(full: api.telegram.org) -> proxy');
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

test('the dialog shows the outbound the connection uses without choosing it', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/connections?id=2');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: cdn.bilibili.com)');
  await expect(dialog).toContainText('Current: direct');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeDisabled();
  // A rule to the outbound the traffic already takes is allowed, and the dialog says it changes nothing.
  const unchanged = dialog.getByText('This rule does not change where this traffic goes now.');
  await pick(dialog, 'direct');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: cdn.bilibili.com) -> direct');
  await expect(unchanged).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeEnabled();
  await pick(dialog, 'proxy');
  await expect(unchanged).toHaveCount(0);
});

test('the dialog says the rule goes before the matched rule when it does', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  const note = dialog.getByText('Placed before the rule that matches now.');
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await expect(note).toBeVisible();
});

test('the dialog says nothing about the matched rule when it cannot go before it', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  // Without the matched rule in the list, the rule goes before the fallback and nothing is said about the match.
  handlers['GET rules'] = async () => {
    const list = await api.rules();
    return {...list, rules: list.rules.filter(rule => rule.rule_id !== 'r5')};
  };
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toBeVisible();
  await expect(dialog.getByRole('button', {name: /Insert$/})).not.toContainText('Before the matched rule');
  await expect(dialog.getByText('Placed before the rule that matches now.')).toHaveCount(0);
});

test('a matched rule gone after a reload is not retargeted until the dialog says so', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const [rules, config] = await Promise.all([api.rules(), api.config()]);
  let reads = 0;
  // The rules first come from generation 40; the configuration is already 41, where the matched rule is gone.
  handlers['GET rules'] = async () => (reads++ ? {...rules, generation_id: '41', rules: rules.rules.filter(rule => rule.rule_id !== 'r5')} : rules);
  handlers['GET config'] = async () => ({...config, generation_id: '41'});
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await pick(dialog, 'proxy');
  await dialog.getByRole('button', {name: 'Hold', exact: true}).click();
  await expect(dialog).toContainText('The matched rule changed; the rule will be inserted at the position shown below.');
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Last, before the fallback');
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Hold', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/rules?tab=list&view=advanced');
  await expect(page.getByRole('region', {name: 'Pending: 1'})).toContainText('Last, before the fallback');
});

test('an apply that fails in a later file keeps what it could not write and says what it wrote', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page, {includedRule: true});
  // The mock's include holds bare rules, which doona cannot place; give it a routing section so both files take rules.
  const wrap = (text: string) => 'routing {\n' + text + '}\n';
  handlers['GET config'] = async () => {
    const config = await api.config();
    const sources = config.sources.map(async source =>
      source.id === 'src-rules' ? {...source, content: wrap(source.content!), content_sha256: await sha256(wrap(source.content!))} : source
    );
    return {...config, sources: await Promise.all(sources)};
  };
  handlers['GET rules'] = async () => {
    const list = await api.rules();
    return {
      ...list,
      rules: list.rules.map(rule => (rule.source?.source_id === 'src-rules' ? {...rule, source: {...rule.source, line: rule.source.line + 1}} : rule))
    };
  };
  handlers['PUT config/sources/src-rules'] = async () => {
    throw new ApiError(422, 'validation_failed', 'invalid', null, {
      diagnostics: [{level: 'error', source_id: 'src-rules', line: 7, column: 1, span: null, code: 'unknown-outbound', message: 'no group proxy'}]
    });
  };
  const connections = await createMockApi().connections();
  const inInclude = [...connections.tcp, ...connections.udp].find(row => row.rule_id === 'r7')!;
  await hold(page, '1');
  await hold(page, inInclude.id);
  await page.goto('/#/rules?tab=list&view=advanced');
  const held = page.getByRole('region', {name: 'Pending: 2'});
  await expect(held).toContainText('Writes 2 files');
  await top(page).getByRole('button', {name: 'Apply (2); writes 2 files', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: '1 rule written; 1 still held'})).toBeVisible();
  const pending = page.getByRole('region', {name: 'Pending: 1'});
  await expect(pending).toContainText('rules.dae line 7: Backend message: no group proxy');
  expect(requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname)).toEqual([
    '/api/v1/config/sources/src-main',
    '/api/v1/config/sources/src-rules'
  ]);
});

// A request that waits until the test lets it through.
function gate() {
  let open: () => void = () => {};
  const shut = new Promise<void>(resolve => (open = resolve));
  return {wait: () => shut, open: () => open()};
}

test('rules the backend displays with their outbound are still placed', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET rules'] = async () => {
    const list = await api.rules();
    return {...list, rules: list.rules.map(rule => (rule.kind === 'rule' ? {...rule, expression: `${rule.expression} -> ${rule.outbound}`} : rule))};
  };
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await pick(dialog, 'proxy');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeEnabled();
});

test('closing the dialog while it reads the configuration writes nothing', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const read = gate();
  let slow = false;
  let reading = false;
  handlers['GET config'] = async () => {
    if (slow) {
      reading = true;
      await read.wait();
    }
    return api.config();
  };
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  slow = true;
  await pick(dialog, 'proxy');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect.poll(() => reading).toBe(true);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  slow = false;
  read.open();
  // The rule list is read again after the close; a write would come before that settles.
  await page.goto('/#/rules?tab=list&view=advanced');
  await expect(page.getByRole('tabpanel', {name: 'Routing rules'})).toContainText('domain(geosite:telegram)');
  await page.waitForTimeout(500);
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
});

test('a rule written whose reload failed is not held again and not offered for a second write', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const href = '/api/v1/operations/op-rejected';
  handlers['PUT config/sources/src-main'] = async request => ({
    ...(await api.replaceConfigSource('src-main', request.postDataJSON().content, request.headers()['if-match'])),
    operation_id: 'op-rejected',
    href
  });
  handlers['GET operations/op-rejected'] = async () => rejectedReload();
  // From the dialog: the rule is in the file, so the dialog closes rather than offering to insert it again.
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await pick(dialog, 'proxy');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  const notice = page.locator('.rp-toast.negative', {hasText: 'Written to the config file but not applied'});
  await expect(notice).toBeVisible();
  await expect(notice).not.toContainText('Could not write');
  await expect(dialog).toHaveCount(0);
  // From the top bar: the written rule leaves the held list.
  await hold(page, '2');
  await top(page).getByRole('button', {name: 'Apply (1)', exact: true}).click();
  await expect.poll(() => requests.filter(request => request.method() === 'PUT').length).toBe(2);
  await expect(notice).toBeVisible();
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
});

test('the dialog does not write while the top bar applies held rules', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const write = gate();
  let writing = false;
  handlers['PUT config/sources/src-main'] = async request => {
    writing = true;
    await write.wait();
    return api.replaceConfigSource('src-main', request.postDataJSON().content, request.headers()['if-match']);
  };
  await hold(page, '1');
  await top(page).getByRole('button', {name: 'Apply (1)', exact: true}).click();
  await expect.poll(() => writing).toBe(true);
  await page.goto('/#/connections?id=2');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeDisabled();
  write.open();
  await expect(page.locator('.rp-toast.positive', {hasText: '1 rule is in effect'})).toBeVisible();
  await pick(dialog, 'proxy');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeEnabled();
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(1);
});

test('held rules cannot be discarded while they are applied', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const write = gate();
  let writing = false;
  handlers['PUT config/sources/src-main'] = async request => {
    writing = true;
    await write.wait();
    return api.replaceConfigSource('src-main', request.postDataJSON().content, request.headers()['if-match']);
  };
  await hold(page, '1');
  await hold(page, '2');
  await page.goto('/#/rules?tab=list&view=advanced');
  const held = page.getByRole('region', {name: 'Pending: 2'});
  const discard = held.getByRole('button', {name: 'Discard held rule', exact: true});
  await expect(discard).toHaveCount(2);
  await top(page).getByRole('button', {name: 'Apply (2)', exact: true}).click();
  await expect.poll(() => writing).toBe(true);
  for (const button of await discard.all()) await expect(button).toBeDisabled();
  write.open();
  await expect(page.locator('.rp-toast.positive', {hasText: '2 rules are in effect'})).toBeVisible();
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(1);
});

test('a rule written whose operation the backend forgot is not held again', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  handlers['PUT config/sources/src-main'] = async request => ({
    ...(await api.replaceConfigSource('src-main', request.postDataJSON().content, request.headers()['if-match'])),
    operation_id: 'op-gone',
    href: '/api/v1/operations/op-gone'
  });
  handlers['GET operations/op-gone'] = async () => {
    throw new ApiError(404, 'resource_not_found', 'Operation not found');
  };
  await hold(page, '1');
  await top(page).getByRole('button', {name: 'Apply (1)', exact: true}).click();
  await expect(page.locator('.rp-toast', {hasText: 'Could not confirm the result of the operation'})).toBeVisible();
  // The write was accepted, so the rule is in the file and is not offered for a second write.
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(1);
});

test('a rule written whose operation poll kept failing is not held again', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  handlers['PUT config/sources/src-main'] = async request => ({
    ...(await api.replaceConfigSource('src-main', request.postDataJSON().content, request.headers()['if-match'])),
    operation_id: 'op-unreachable',
    href: '/api/v1/operations/op-unreachable'
  });
  let polls = 0;
  await page.route('**/api/v1/operations/op-unreachable', route => {
    polls++;
    return route.abort();
  });
  expectLoadFailures(page, /\/operations\/op-unreachable$/);
  await page.clock.install();
  await hold(page, '1');
  await top(page).getByRole('button', {name: 'Apply (1)', exact: true}).click();
  await expect.poll(() => requests.filter(request => request.method() === 'PUT').length).toBe(1);
  // The poll gives up after its retries, which back off from one second.
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.clock.fastForward(2 ** attempt * 1000);
    await expect.poll(() => polls).toBe(attempt);
  }
  await expect(page.locator('.rp-toast', {hasText: 'Could not confirm the result of the operation'})).toBeVisible();
  // The write was accepted, so the rule is in the file and is not offered for a second write.
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(1);
});

test('an apply whose later file is written but not reloaded counts every rule written', async ({page}) => {
  const {api, handlers} = await mockBackend(page, {includedRule: true});
  // As in the later-file test above: the include takes rules once it has a routing section.
  const wrap = (text: string) => 'routing {\n' + text + '}\n';
  handlers['GET config'] = async () => {
    const config = await api.config();
    const sources = config.sources.map(async source =>
      source.id === 'src-rules' ? {...source, content: wrap(source.content!), content_sha256: await sha256(wrap(source.content!))} : source
    );
    return {...config, sources: await Promise.all(sources)};
  };
  handlers['GET rules'] = async () => {
    const list = await api.rules();
    return {
      ...list,
      rules: list.rules.map(rule => (rule.source?.source_id === 'src-rules' ? {...rule, source: {...rule.source, line: rule.source.line + 1}} : rule))
    };
  };
  handlers['PUT config/sources/src-rules'] = async () => ({
    operation_id: 'op-rejected',
    kind: 'reload',
    status: 'queued',
    href: '/api/v1/operations/op-rejected',
    retryAfter: 0
  });
  handlers['GET operations/op-rejected'] = async () => rejectedReload();
  const connections = await createMockApi().connections();
  const inInclude = [...connections.tcp, ...connections.udp].find(row => row.rule_id === 'r7')!;
  await hold(page, '1');
  await hold(page, inInclude.id);
  await top(page).getByRole('button', {name: 'Apply (2); writes 2 files', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: '2 rules written; 0 still held'})).toBeVisible();
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
});

test('the dialog waits for the groups before it writes', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const groups = gate();
  handlers['GET groups'] = async () => {
    await groups.wait();
    return api.groups();
  };
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeDisabled();
  groups.open();
  await pick(dialog, 'proxy');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeEnabled();
});

test('the dialog preselects no outbound the groups may contradict before they are read', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const groups = gate();
  handlers['GET groups'] = async () => {
    await groups.wait();
    return api.groups();
  };
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  // The connection went through the proxy group, which is not listed until the groups arrive.
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org)');
  await expect(dialog.getByRole('button', {name: /Outbound$/})).not.toContainText('direct');
  groups.open();
  await expect(dialog).toContainText('Current: proxy');
  await pick(dialog, 'proxy');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  await expect(dialog.getByRole('button', {name: /Outbound$/})).toContainText('proxy');
});

test('a failed groups read shows in the dialog and is retried there', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let fail = true;
  handlers['GET groups'] = async () => {
    if (fail) throw new ApiError(503, 'temporarily_unavailable', 'Groups are unavailable');
    return api.groups();
  };
  await page.goto('/#/connections?id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('button', {name: 'Retry', exact: true})).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeDisabled();
  fail = false;
  await dialog.getByRole('button', {name: 'Retry', exact: true}).click();
  await pick(dialog, 'proxy');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeEnabled();
});

test.describe('phone', () => {
  test.use({viewport: {width: 360, height: 780}});
  test('the apply button and its count stay in the top bar', async ({page}) => {
    await mockBackend(page);
    await hold(page, '1');
    const apply = top(page).getByRole('button', {name: 'Apply (1)', exact: true});
    await expect(apply).toBeVisible();
    const count = apply.locator('.rp-held-count');
    await expect(count).toHaveText('1');
    const [badge, bar] = [(await count.boundingBox())!, (await top(page).boundingBox())!];
    expect(badge.x).toBeGreaterThanOrEqual(0);
    expect(badge.x + badge.width).toBeLessThanOrEqual(bar.width);
    expect(badge.y).toBeGreaterThanOrEqual(bar.y);
  });
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

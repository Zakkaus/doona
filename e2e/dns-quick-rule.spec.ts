import {detail, expect, mockBackend, test, rejectedReload, setupIncludedRouting} from './fixtures';
import {createMockApi} from '../src/api/mock';

type Page = import('@playwright/test').Page;
test.use({viewport: {width: 1440, height: 900}});
const dialogOf = (page: Page) => page.getByRole('dialog', {name: 'Add rule', exact: true});
const top = (page: Page) => page.locator('.rp-top');
const pick = async (page: Page, field: RegExp, option: string | RegExp) => {
  await dialogOf(page).getByRole('button', {name: field}).click();
  await page.getByRole('option', {name: option, exact: typeof option === 'string'}).click();
};
// The mock backend, answering the DNS queries the query tab sends as the demo does.
async function backend(page: Page, includedRule = false) {
  const mocked = await mockBackend(page, {includedRule});
  mocked.handlers['POST dns/query'] = async request => {
    const body = request.postDataJSON();
    return mocked.api.dnsQuery(body.domain, body.type);
  };
  return mocked;
}
// The query tab's result for example.org: one A answer, 192.0.2.14, from an upstream the configuration does not name.
async function query(page: Page) {
  await page.goto('/#/dns?tab=query&domain=example.org&type=A');
  await page.getByRole('button', {name: 'Query', exact: true}).click();
  const card = page.locator('.rp-card').filter({has: page.getByRole('heading', {name: 'example.org. A', exact: true})});
  await expect(card).toBeVisible();
  return card;
}
async function holdRequest(page: Page, action: string | RegExp) {
  const card = await query(page);
  await card.getByRole('button', {name: 'Add rule', exact: true}).click();
  await pick(page, /Action$/, action);
  await dialogOf(page).getByRole('button', {name: 'Hold', exact: true}).click();
  await expect(dialogOf(page)).toHaveCount(0);
}
async function holdRouting(page: Page, id: string) {
  await page.goto(`/#/connections?id=${id}`);
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(dialogOf(page).getByRole('button', {name: /Insert$/})).toContainText('Before the matched rule');
  await pick(page, /Outbound$/, 'proxy');
  await dialogOf(page).getByRole('button', {name: 'Hold', exact: true}).click();
  await expect(dialogOf(page)).toHaveCount(0);
}

test('the DNS log adds a rule for the selected record from its toolbar and its detail', async ({page}) => {
  await backend(page);
  await page.goto('/#/dns?tab=log');
  const add = page.locator('.rp-toolbar').getByRole('button', {name: 'Add rule', exact: true});
  await expect(add).toBeDisabled();
  const first = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]').first();
  // Once the records are listed, the disabled button gives its reason in a tooltip on the wrapper that stays hoverable.
  await expect(first).toBeVisible();
  // The toolbar may lay its actions out again as later records arrive, so the hover is retried until the tip shows.
  await expect(async () => {
    await page.mouse.move(0, 0);
    await add.locator('..').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Select a row first', {timeout: 1500});
  }).toPass();
  const name = (await first.getByRole('rowheader').innerText()).trim().replace(/\.$/, '');
  await first.click();
  await add.click();
  const dialog = dialogOf(page);
  await expect(dialog.getByRole('button', {name: /Rule list$/})).toContainText('DNS request rules');
  // The newest record was answered by udp://223.5.5.5, which the configuration names alidns with its port.
  await expect(dialog.locator('.rp-code')).toHaveText(`qname(full: ${name})`);
  await expect(dialog).toContainText('Current: alidns');
  await expect(dialog).not.toContainText('does not change');
  await pick(page, /Action$/, 'alidns');
  await expect(dialog.locator('.rp-code')).toHaveText(`qname(full: ${name}) -> alidns`);
  // The record type narrows the rule only when asked.
  // The input is hidden under its track, so a click goes to the switch as drawn.
  await dialog
    .locator('.rp-switch')
    .filter({hasText: /^Only (A|AAAA) queries$/})
    .click();
  await expect(dialog.locator('.rp-code')).toHaveText(new RegExp(`^qname\\(full: ${name.replace(/\./g, '\\.')}\\) && qtype\\((A|AAAA)\\) -> alidns$`));
  await pick(page, /Rule list$/, 'Routing rules');
  await expect(dialog.locator('.rp-code')).toHaveText(`domain(full: ${name})`);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  // The detail opens the same dialog, again with no action chosen.
  await page.locator('.rp-panel').getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(dialog.locator('.rp-code')).toHaveText(`qname(full: ${name})`);
  await expect(dialog).toContainText('Current: alidns');
});

test('a query result adds a response rule for an answered address, then queries again', async ({page}) => {
  const {api, requests} = await backend(page);
  const main = (await api.config()).sources.find(source => source.id === 'src-main')!;
  const card = await query(page);
  // The name starts a request rule; each A or AAAA answer starts one of its own.
  await card.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(dialogOf(page).locator('.rp-code')).toHaveText('qname(full: example.org)');
  await dialogOf(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await card.getByRole('button', {name: 'Add a rule for 192.0.2.14', exact: true}).click();
  const dialog = dialogOf(page);
  await expect(dialog.getByRole('button', {name: /Rule list$/})).toContainText('DNS response rules');
  await expect(dialog.getByRole('button', {name: /Insert$/})).toContainText('Last, before the fallback');
  await pick(page, /Action$/, /^alidns/);
  await expect(dialog.locator('.rp-code')).toHaveText('ip(192.0.2.14/32) -> alidns');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  const toast = page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'});
  await expect(toast).toBeVisible();
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes).toHaveLength(1);
  const lines = main.content!.split('\n');
  lines.splice(lines.indexOf('      fallback: accept'), 0, '      ip(192.0.2.14/32) -> alidns');
  expect(writes[0].postDataJSON()).toEqual({content: lines.join('\n')});
  await toast.getByRole('button', {name: 'Query again', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?.*tab=query/);
  await expect(page.locator('form').getByLabel('Domain', {exact: true})).toHaveValue('example.org');
  await expect(page.getByRole('heading', {name: 'example.org. A', exact: true})).toBeVisible();
  await expect.poll(() => requests.filter(request => new URL(request.url()).pathname === '/api/v1/dns/query').length).toBe(2);
});

test('Query again from another page opens DNS Query and runs the query there', async ({page}) => {
  const {requests} = await backend(page);
  const card = await query(page);
  await card.getByRole('button', {name: 'Add rule', exact: true}).click();
  await pick(page, /Action$/, /^reject/);
  await dialogOf(page).getByRole('button', {name: 'Apply', exact: true}).click();
  const toast = page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'});
  await expect(toast).toBeVisible();
  await page.locator('.rp-nav[href="#/settings"]').click();
  await expect(page.locator('#settings-backend')).toBeVisible();
  await toast.getByRole('button', {name: 'Query again', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?tab=query&domain=example\.org&type=A$/);
  await expect(page.locator('form').getByLabel('Domain', {exact: true})).toHaveValue('example.org');
  await expect(page.getByRole('heading', {name: 'example.org. A', exact: true})).toBeVisible();
  await expect.poll(() => requests.filter(request => new URL(request.url()).pathname === '/api/v1/dns/query').length).toBe(2);
});

test('a DNS rule written without DNS queries on offer does not offer to query again', async ({page}) => {
  const {api, handlers} = await backend(page);
  handlers['GET capabilities'] = async () => {
    const capabilities = await api.capabilities();
    capabilities.resources.events.available = false;
    capabilities.resources.dns_query = {...capabilities.resources.dns_query, available: false};
    return capabilities;
  };
  await page.goto('/#/dns?tab=log');
  const first = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]').first();
  await first.click();
  await page.locator('.rp-toolbar').getByRole('button', {name: 'Add rule', exact: true}).click();
  await pick(page, /Action$/, /^reject/);
  await dialogOf(page).getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Query again', exact: true})).toHaveCount(0);
});

test('the DNS cache adds a rule for the selected entry by its name and type', async ({page}) => {
  await backend(page);
  await page.goto('/#/dns?tab=cache');
  const add = page.locator('.rp-toolbar').getByRole('button', {name: 'Add rule', exact: true});
  await expect(add).toBeDisabled();
  const first = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]').first();
  const name = (await first.getByRole('rowheader').innerText()).trim().replace(/\.$/, '');
  await first.getByRole('rowheader').click();
  await add.click();
  const dialog = dialogOf(page);
  await expect(dialog.locator('.rp-code')).toHaveText(`qname(full: ${name})`);
  await expect(dialog.getByRole('switch', {name: /^Only \S+ queries$/})).toBeVisible();
  // An entry is listed without its answers, so only a request or routing rule is offered.
  await dialog.getByRole('button', {name: /Rule list$/}).click();
  await expect(page.getByRole('option')).toHaveText(['DNS request rules', 'Routing rules']);
});

test('DNS and routing rules held together apply in one write, each listed with its own tab', async ({page}) => {
  const {api, requests} = await backend(page);
  const main = (await api.config()).sources.find(source => source.id === 'src-main')!;
  await holdRouting(page, '1');
  await holdRequest(page, /^reject/);
  await page
    .locator('.rp-toast.positive', {hasText: 'Rule held; not written yet'})
    .last()
    .getByRole('button', {name: 'Review held rules', exact: true})
    .click();
  await expect(page).toHaveURL(/#\/rules\?tab=dns&held=1$/);
  const held = page.getByRole('region', {name: 'Pending: 1'});
  await expect(held).toBeFocused();
  await expect(held).toContainText('qname(full: example.org) -> reject');
  await expect(held).toContainText('1 more held in another list; applying writes it too');
  await top(page).getByRole('button', {name: 'Apply (2)', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: '2 rules are in effect'})).toBeVisible();
  const writes = requests.filter(request => request.method() === 'PUT');
  expect(writes.map(request => new URL(request.url()).pathname)).toEqual(['/api/v1/config/sources/src-main']);
  const content: string = writes[0].postDataJSON().content;
  expect(content).toContain('      qname(full: example.org) -> reject\n      fallback: cloudflare\n');
  expect(content).toContain('domain(full: api.telegram.org) -> proxy\n');
  expect(content.split('\n')).toHaveLength(main.content!.split('\n').length + 2);
  await expect(held).toHaveCount(0);
});

test('a held DNS rule whose place changed stays held and is written nowhere', async ({page}) => {
  const {api, requests} = await backend(page);
  await holdRequest(page, /^asis/);
  const source = (await api.config()).sources.find(source => source.id === 'src-main')!;
  const content = source.content!.replace('      fallback: cloudflare', '      fallback: alidns');
  await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
  const before = requests.filter(request => request.method() === 'PUT').length;
  await top(page).getByRole('button', {name: 'Apply (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'The rule list and configuration are out of sync'})).toBeVisible();
  await expect(top(page).locator('.rp-held-count')).toHaveText('1');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(before);
});

test('rules held for an absent response list are written in one new block', async ({page}) => {
  const {api, requests} = await backend(page);
  const source = (await api.config()).sources.find(source => source.id === 'src-main')!;
  const content = source.content!.replace(/\n {4}response \{[^}]*\}/, '');
  await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
  for (const action of [/^accept/, /^reject/]) {
    const card = await query(page);
    await card.getByRole('button', {name: 'Add a rule for 192.0.2.14', exact: true}).click();
    await expect(dialogOf(page).getByRole('group', {name: 'Insert', exact: true})).toContainText('New response block, as its first rule');
    await pick(page, /Action$/, action);
    await dialogOf(page).getByRole('button', {name: 'Hold', exact: true}).click();
    await expect(dialogOf(page)).toHaveCount(0);
  }
  await page
    .locator('.rp-toast.positive', {hasText: 'Rule held; not written yet'})
    .last()
    .getByRole('button', {name: 'Review held rules', exact: true})
    .click();
  await expect(page.getByRole('region', {name: 'Pending: 2'})).toContainText('New response block, as its first rule');
  await top(page).getByRole('button', {name: 'Apply (2)', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: '2 rules are in effect'})).toBeVisible();
  const written: string = requests
    .filter(request => request.method() === 'PUT')
    .at(-1)!
    .postDataJSON().content;
  expect(written.match(/response \{/g)).toHaveLength(1);
  expect(written).toContain('    response {\n      ip(192.0.2.14/32) -> accept\n      ip(192.0.2.14/32) -> reject\n    }\n  }\n');
});

test('without a dns routing section the dialog opens the configuration beside it and keeps the rule', async ({page}) => {
  const {api} = await backend(page);
  const source = (await api.config()).sources.find(source => source.id === 'src-main')!;
  const content = source.content!.replace(/\n {2}routing \{[\s\S]*?\n {2}\}/, '');
  await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
  const card = await query(page);
  await card.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = dialogOf(page);
  await expect(dialog).toContainText('No writable dns routing section can hold this rule.');
  const open = dialog.getByRole('link', {name: 'Open DNS configuration', exact: true});
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('href', /#\/config\?tab=source&source=src-main/);
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeDisabled();
  await expect(dialog.getByRole('button', {name: 'Copy rule', exact: true})).toBeVisible();
  await expect(dialog.locator('.rp-code')).toHaveText('qname(full: example.org)');
});

test('a DNS rule written whose reload failed closes the dialog without offering to query again', async ({page}) => {
  const {api, handlers} = await backend(page);
  handlers['PUT config/sources/src-main'] = async request => ({
    ...(await api.replaceConfigSource('src-main', request.postDataJSON().content, request.headers()['if-match'])),
    operation_id: 'op-rejected',
    href: '/api/v1/operations/op-rejected'
  });
  handlers['GET operations/op-rejected'] = async () => rejectedReload();
  const card = await query(page);
  await card.getByRole('button', {name: 'Add rule', exact: true}).click();
  await pick(page, /Action$/, /^reject/);
  await dialogOf(page).getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'Written to the config file but not applied'})).toBeVisible();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Query again', exact: true})).toHaveCount(0);
  await expect(top(page).locator('.rp-held-count')).toHaveCount(0);
});

test('an apply that fails in a later file keeps the rule it could not write and says the DNS rule was written', async ({page}) => {
  const {api, handlers, requests} = await backend(page, true);
  setupIncludedRouting({api, handlers}, {refuseWrite: true});
  const connections = await createMockApi().connections();
  const inInclude = [...connections.tcp, ...connections.udp].find(row => row.rule_id === 'r7')!;
  await holdRequest(page, /^asis/);
  await holdRouting(page, inInclude.id);
  await top(page).getByRole('button', {name: 'Apply (2); writes 2 files', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: '1 rule written; 1 still held'})).toBeVisible();
  expect(requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname)).toEqual([
    '/api/v1/config/sources/src-main',
    '/api/v1/config/sources/src-rules'
  ]);
  await page.goto('/#/rules?tab=list&view=advanced');
  await expect(page.getByRole('region', {name: 'Pending: 1'})).toContainText('rules.dae line 7: Backend message: no group proxy');
  await page.goto('/#/rules?tab=dns');
  await expect(page.getByRole('region', {name: /^Pending/})).toHaveCount(0);
});

test('a held rule whose activation is unconfirmed and not written stays held', async ({page}) => {
  const {api, handlers} = await backend(page);
  const main = (await api.config()).sources.find(source => source.id === 'src-main')!;
  // The db store writes nothing before activation, so an engine that stops first leaves the file as it was.
  handlers['PUT config/sources/src-main'] = async request => ({
    ...(await api.replaceConfigSource('src-main', main.content!, request.headers()['if-match'])),
    operation_id: 'op-unconfirmed',
    href: '/api/v1/operations/op-unconfirmed'
  });
  handlers['GET operations/op-unconfirmed'] = async () => ({
    operation_id: 'op-unconfirmed',
    kind: 'reload',
    status: 'failed',
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    result: null,
    error: {code: 'activation_unconfirmed', message: 'Activation unconfirmed', details: {committed: null, written: false}}
  });
  await holdRequest(page, /^reject/);
  await top(page).getByRole('button', {name: 'Apply (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'Could not confirm whether the change took effect'})).toBeVisible();
  await expect(top(page).locator('.rp-held-count')).toHaveText('1');
});

import {detail, expect, mockBackend, test, moreAction} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});

test('a trace link fills in the form without running it', async ({page}) => {
  let traced = false;
  page.on('request', request => {
    if (request.url().includes('/routing/trace')) traced = true;
  });
  await page.goto('/#/rules?tab=trace&domain=example.com&dst_port=443&src_ip=10.0.0.2');
  await expect(page.getByLabel('Domain', {exact: true})).toHaveValue('example.com');
  await expect(page.getByLabel('Destination port', {exact: true})).toHaveValue('443');
  // The source sits under the advanced fields, which open to show it.
  await expect(page.getByLabel('Source IP', {exact: true})).toHaveValue('10.0.0.2');
  await expect(page.getByRole('button', {name: 'Run trace', exact: true})).toBeEnabled();
  expect(traced).toBe(false);
});

test('a connection opens the trace of its target and source', async ({page}) => {
  await page.goto('/#/connections?tab=list&id=1');
  await moreAction(detail(page), 'Trace this connection');
  await expect(page).toHaveURL(/#\/rules\?tab=trace&network=tcp&domain=api\.telegram\.org&dst_ip=149\.154\.167\.220&dst_port=443&src_ip=10\.0\.0\.12$/);
  await expect(page.getByLabel('Domain', {exact: true})).toHaveValue('api.telegram.org');
  await expect(page.getByLabel('Destination IP', {exact: true})).toHaveValue('149.154.167.220');
  await expect(page.getByLabel('Source IP', {exact: true})).toHaveValue('10.0.0.12');
  // The link pushed history: Back returns to the connection.
  await page.goBack();
  await expect(page).toHaveURL(/#\/connections\?tab=list&id=1$/);
});

test('a connection traces with its source port and process, so process rules are decided', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  handlers['GET connections'] = async () => {
    const list = await api.connections({detail: 'full', limit: 1000});
    return {...list, tcp: list.tcp.map(row => (row.id === '1' ? {...row, src: '10.0.0.12:51234', pname: 'Telegram'} : row))};
  };
  handlers['POST routing/trace'] = request => api.routingTrace(request.postDataJSON());
  await page.goto('/#/connections?tab=list&id=1');
  await moreAction(detail(page), 'Trace this connection');
  await expect(page).toHaveURL(/&src_ip=10\.0\.0\.12&src_port=51234&pname=Telegram$/);
  await expect(page.getByLabel('Source port', {exact: true})).toHaveValue('51234');
  await expect(page.getByLabel('Process name', {exact: true})).toHaveValue('Telegram');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  await expect.poll(() => requests.filter(request => request.method() === 'POST' && request.url().endsWith('/routing/trace')).length).toBe(1);
  const traced = requests.find(request => request.method() === 'POST' && request.url().endsWith('/routing/trace'))!;
  expect(traced.postDataJSON().input).toMatchObject({src_ip: '10.0.0.12', src_port: 51234, pname: 'Telegram'});
});

const runTrace = async (page: import('@playwright/test').Page, query: string) => {
  await page.goto('/#/rules?tab=trace&' + query);
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
};
const evaluation = (page: import('@playwright/test').Page) =>
  page.locator('.rp-card').filter({has: page.getByRole('heading', {name: '149.154.167.220', exact: true})});

test('a trace result opens its matched rule in the rule list', async ({page}) => {
  await runTrace(page, 'domain=api.telegram.org&dst_ip=149.154.167.220&dst_port=443');
  await evaluation(page).getByRole('link', {name: 'Open domain(geosite: telegram) -> proxy in the rule list', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=r5$/);
  await expect(page.locator('.rp-table [aria-selected="true"]')).toContainText('domain(geosite: telegram)');
  await page.goBack();
  await expect(page).toHaveURL(/#\/rules\?tab=trace&/);
});

// Rule ids are joined within one generation: a trace from another generation than the rule list links to no rule.
test('a trace result from another generation does not link its rules', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET rules'] = async () => ({...(await api.rules()), generation_id: 'next'});
  handlers['POST routing/trace'] = request => api.routingTrace(request.postDataJSON());
  await runTrace(page, 'domain=api.telegram.org&dst_ip=149.154.167.220&dst_port=443');
  await expect(evaluation(page).getByText('domain(geosite: telegram) -> proxy', {exact: true})).toBeVisible();
  await expect(evaluation(page).getByRole('link', {name: /in the rule list$/})).toHaveCount(0);
});

test('a trace result opens the group and the node it selects', async ({page}) => {
  await runTrace(page, 'domain=api.telegram.org&dst_ip=149.154.167.220&dst_port=443');
  await evaluation(page).getByRole('link', {name: 'View group proxy', exact: true}).click();
  await expect(page).toHaveURL(/#\/policies\?group=/);
  await expect(page.getByRole('region', {name: 'proxy'})).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/#\/rules\?tab=trace&/);
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  const node = evaluation(page).getByRole('link', {name: /^View node /});
  const name = (await node.textContent())!.replace(/^View node /, '');
  await node.click();
  await expect(page).toHaveURL(/#\/nodes\?provider=[^&]+&q=/);
  expect(new URL(page.url().replace('#/', '')).searchParams.get('q')).toBe(name);
  await expect(page.getByLabel('Search nodes')).toHaveValue(name);
});

test('a resolved name opens in DNS Query and the DNS cache', async ({page}) => {
  await runTrace(page, 'domain=api.telegram.org&dst_port=443');
  const dns = page
    .locator('.rp-card')
    .filter({has: page.getByRole('heading', {name: /api\.telegram\.org/})})
    .filter({hasText: 'Query DNS'})
    .first();
  await dns.getByRole('link', {name: 'Query DNS', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?tab=query&domain=api\.telegram\.org$/);
  await expect(page.getByLabel('Domain', {exact: true})).toHaveValue('api.telegram.org');
  await page.goBack();
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  await dns.getByRole('link', {name: 'View cache', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?tab=cache&domain=api\.telegram\.org$/);
});

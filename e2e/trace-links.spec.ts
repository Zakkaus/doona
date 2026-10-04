import {detail, expect, mockBackend, test, moreAction} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});

test('a trace link fills in the form without running it', async ({page}) => {
  let traced = false;
  page.on('request', request => {
    if (request.url().includes('/routing/trace')) traced = true;
  });
  await page.goto('/#/rules?tab=trace&domain=example.com&dst_port=443&src_ip=10.0.0.2');
  await expect(page.getByLabel('Domain', {exact: true})).toHaveValue('example.com');
  await expect(page.getByRole('textbox', {name: 'Destination port', exact: true})).toHaveValue('443');
  // The source sits under the advanced fields, which open to show it.
  await expect(page.getByLabel('Source IP', {exact: true})).toHaveValue('10.0.0.2');
  await expect(page.getByRole('button', {name: 'Run trace', exact: true})).toBeEnabled();
  expect(traced).toBe(false);
});

test('optional DSCP validates the contract bounds and reaches the trace evaluator', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = source.content!.replace(/^routing\s*\{/m, 'routing {\n  dscp(0,46,63) -> direct');
  await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
  // Read each reply from the handler: Chromium can drop a response body before the test reads it.
  const results: Array<Awaited<ReturnType<typeof api.routingTrace>>> = [];
  handlers['POST routing/trace'] = async request => {
    const result = await api.routingTrace(request.postDataJSON());
    results.push(result);
    return result;
  };
  await page.goto('/#/rules?tab=trace&domain=example.org&dst_ip=198.51.100.20&dst_port=443');
  await page.getByRole('button', {name: 'Advanced', exact: true}).click();
  await page.getByRole('textbox', {name: 'Process name', exact: true}).fill('curl');
  const dscp = page.getByRole('textbox', {name: 'DSCP', exact: true});
  const run = page.getByRole('button', {name: 'Run trace', exact: true});
  await dscp.fill('1.5');
  await expect(dscp).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('group', {name: 'Advanced', exact: true}).getByText('DSCP must be an integer from 0 to 63.', {exact: true})).toBeVisible();
  await expect(dscp).toHaveAccessibleDescription('DSCP must be an integer from 0 to 63.');
  await expect(run).toBeDisabled();
  // The number field takes no minus sign below its minimum and no letters, and snaps a value above its maximum into
  // range on leaving.
  for (const value of ['-1', 'invalid']) {
    await dscp.fill(value);
    await expect(dscp).not.toHaveValue(value);
  }
  await dscp.fill('64');
  await dscp.blur();
  await expect(dscp).toHaveValue('63');
  expect(requests.filter(request => request.url().endsWith('/routing/trace'))).toHaveLength(0);
  for (const value of ['0', '46', '63', '']) {
    await dscp.fill(value);
    await expect(dscp).not.toHaveAttribute('aria-invalid', 'true');
    await expect(run).toBeEnabled();
    const count = results.length;
    await run.click();
    await expect.poll(() => results.length).toBe(count + 1);
    expect(results.at(-1)!.evaluations[0]).toMatchObject(
      value === '' ? {decision: 'indeterminate', missing_inputs: ['dscp']} : {decision: 'determinate', outbound: 'direct'}
    );
    const input = requests
      .filter(request => request.url().endsWith('/routing/trace'))
      .at(-1)!
      .postDataJSON().input;
    if (value === '') expect(input).not.toHaveProperty('dscp');
    else expect(input.dscp).toBe(Number(value));
  }
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
  await expect(page.getByRole('textbox', {name: 'Source port', exact: true})).toHaveValue('51234');
  await expect(page.getByLabel('Process name', {exact: true})).toHaveValue('Telegram');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  await expect.poll(() => requests.filter(request => request.method() === 'POST' && request.url().endsWith('/routing/trace')).length).toBe(1);
  const traced = requests.find(request => request.method() === 'POST' && request.url().endsWith('/routing/trace'))!;
  expect(traced.postDataJSON().input).toMatchObject({src_ip: '10.0.0.12', src_port: 51234, pname: 'Telegram'});
});

const runTrace = async (page: import('@playwright/test').Page, query: string) => {
  await page.goto('/#/rules?tab=trace&' + query + '&pname=curl');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
};
const evaluation = (page: import('@playwright/test').Page) =>
  page.locator('.rp-card').filter({has: page.getByRole('heading', {name: '149.154.167.220', exact: true})});

test('a trace result opens its matched rule in the rule list', async ({page}) => {
  await runTrace(page, 'domain=api.telegram.org&dst_ip=149.154.167.220&dst_port=443');
  await evaluation(page).getByRole('link', {name: 'Open domain(geosite:telegram) -> telegram in the rule list', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=r5$/);
  await expect(page.locator('.rp-table [aria-selected="true"]')).toContainText('domain(geosite:telegram)');
  await page.goBack();
  await expect(page).toHaveURL(/#\/rules\?tab=trace&/);
});

// Rule ids are joined within one generation: a trace from another generation than the rule list links to no rule.
test('a trace result from another generation does not link its rules', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET rules'] = async () => ({...(await api.rules()), generation_id: 'next'});
  handlers['POST routing/trace'] = request => api.routingTrace(request.postDataJSON());
  await runTrace(page, 'domain=api.telegram.org&dst_ip=149.154.167.220&dst_port=443');
  await expect(evaluation(page).getByText('domain(geosite:telegram) -> telegram', {exact: true})).toBeVisible();
  await expect(evaluation(page).getByRole('link', {name: /in the rule list$/})).toHaveCount(0);
});

test('a trace result opens the group and the node it selects', async ({page}) => {
  await runTrace(page, 'domain=api.telegram.org&dst_ip=149.154.167.220&dst_port=443');
  await evaluation(page).getByRole('link', {name: 'View group telegram', exact: true}).click();
  await expect(page).toHaveURL(/#\/policies\?group=/);
  await expect(page.getByRole('region', {name: 'telegram', exact: true})).toBeInViewport();
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

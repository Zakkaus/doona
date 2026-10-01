import {detail, expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';

test.use({viewport: {width: 1440, height: 900}});
const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', {name: 'Add rule', exact: true});
const hold = async (page: import('@playwright/test').Page, query: string) => {
  await page.goto(`/#/rules?${query}`);
  await dialog(page).getByRole('button', {name: 'Hold', exact: true}).click();
  await expect(dialog(page)).toHaveCount(0);
};

for (const query of ['', '?view=simple', '?view=advanced'])
  test(`old rules entry ${query || 'default'} opens the workspace`, async ({page}) => {
    await page.goto(`/#/rules${query}`);
    await expect(page.getByRole('tabpanel', {name: 'Routing rules'}).getByRole('grid')).toBeVisible();
    await expect(page.getByRole('radiogroup', {name: 'Rules view'})).toHaveCount(0);
    await page.getByRole('button', {name: 'Apply template', exact: true}).click();
    await expect(page.getByRole('dialog', {name: 'Apply template'})).toBeVisible();
  });

for (const origin of ['connections', 'flows', 'trace', 'undecided trace'])
  test(`${origin} opens the shared editor with its available context`, async ({page}) => {
    if (origin === 'connections') {
      await page.goto('/#/connections?id=1');
      await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
    } else if (origin === 'flows') {
      await page.goto('/#/flows?tab=records&id=flow-1');
      await detail(page).getByRole('button', {name: 'Add a rule for this target', exact: true}).click();
    } else {
      await page.goto(`/#/rules?tab=trace&domain=api.telegram.org&dst_ip=149.154.167.220&dst_port=443${origin === 'trace' ? '&pname=NetworkManager' : ''}`);
      await page.getByRole('button', {name: 'Run trace', exact: true}).click();
      await page
        .locator('.rp-card')
        .filter({has: page.getByRole('heading', {name: '149.154.167.220', exact: true})})
        .getByRole('button', {name: 'Add rule', exact: true})
        .click();
    }
    await expect(page).toHaveURL(/#\/rules\?.*add=/);
    await expect(dialog(page).getByRole('textbox', {name: 'Values'})).toHaveValue('api.telegram.org');
    const query = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
    if (origin === 'undecided trace') {
      expect(query.get('target')).toBeNull();
      expect(query.get('before')).toBeNull();
    } else {
      expect(query.get('target')).toBeTruthy();
      expect(query.get('before')).toBeTruthy();
      await expect(dialog(page).getByRole('button', {name: /Outbound$/})).toContainText(query.get('target')!);
    }
  });

for (const origin of ['query', 'cache', 'log'])
  test(`DNS ${origin} opens the shared request editor and offers a response seed`, async ({page}) => {
    const backend = await mockBackend(page);
    backend.handlers['POST dns/query'] = request => backend.api.dnsQuery(request.postDataJSON().domain, request.postDataJSON().type);
    await page.goto(`/#/dns?tab=${origin}${origin === 'query' ? '&domain=example.org&type=A' : ''}`);
    if (origin === 'query') {
      await page.getByRole('button', {name: 'Query', exact: true}).click();
      await page
        .locator('.rp-card')
        .filter({has: page.getByRole('heading', {name: 'example.org. A', exact: true})})
        .getByRole('button', {name: 'Add rule', exact: true})
        .click();
    } else {
      const row = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]').first();
      await row.click();
      await page.locator('.rp-toolbar').getByRole('button', {name: 'Add rule', exact: true}).first().click();
    }
    await expect(page).toHaveURL(/#\/rules\?tab=dns&list=request&add=/);
    await expect(dialog(page).getByRole('textbox', {name: 'Values'})).not.toHaveValue('');
    if (origin === 'query') {
      await dialog(page).getByRole('button', {name: 'DNS response rules', exact: true}).click();
      await expect(page).toHaveURL(/list=response/);
      await expect(dialog(page).getByRole('textbox', {name: 'Values'})).toHaveValue('192.0.2.14/32');
      await expect(dialog(page).getByRole('button', {name: /Action$/})).toContainText('accept');
    }
  });

test('routing and DNS additions share one pending list and TopBar only navigates to it', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await hold(page, 'add=domain:example.org&target=direct&before=r5');
  await hold(page, 'tab=dns&list=response&add=answerIp:192.0.2.14/32&target=reject&before=end');
  await expect(page.getByRole('button', {name: 'Apply held rules'})).toHaveCount(1);
  await expect(page.getByRole('region', {name: 'Pending: 2'})).toBeVisible();
  await page.goto('/#/connections');
  await page.locator('.rp-top').getByRole('button', {name: 'Review held rules'}).click();
  await expect(page).toHaveURL(/#\/rules\?held=1$/);
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  await page.getByRole('button', {name: 'Apply held rules'}).click();
  await expect(page.getByRole('button', {name: 'Apply held rules'})).toHaveCount(0);
  const content = (await api.config()).sources.find(source => source.id === 'src-main')!.content!;
  expect(content).toContain('domain(full: example.org) -> direct');
  expect(content).toContain('ip(192.0.2.14/32) -> reject');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(1);
});

test('a refused apply keeps the combined pending list for retry', async ({page}) => {
  const {handlers, requests} = await mockBackend(page);
  handlers['PUT config/sources/src-main'] = async () => {
    throw new ApiError(412, 'precondition_failed', 'Changed');
  };
  await hold(page, 'add=domain:example.org&target=direct&before=r5');
  await page.getByRole('button', {name: 'Apply held rules'}).click();
  await expect(page.getByRole('region', {name: 'Pending: 1'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Apply held rules'})).toBeEnabled();
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(1);
});

test('a contextual seed waits for its outbound group before opening the editor', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let release!: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  handlers['GET groups'] = async () => {
    await ready;
    return api.groups();
  };
  const target = (await api.groups())[0].name;
  await page.goto(`/#/rules?add=domain:example.org&target=${encodeURIComponent(target)}&before=r5`);
  await expect(page.getByRole('tabpanel', {name: 'Routing rules'})).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  release();
  await expect(dialog(page).getByRole('button', {name: /Outbound$/})).toContainText(target);
});

test('a DNS seed without a writable rule position links to the upstream editor', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const dns = await api.dnsRules();
  handlers['GET dns/rules'] = async () => ({...dns, request: [], response: []});
  const config = await api.config();
  for (const source of config.sources) source.writable = false;
  handlers['GET config'] = async () => config;
  await page.goto('/#/rules?tab=dns&list=request&add=domain:example.org&before=end');
  const link = page.getByRole('link', {name: 'Open DNS configuration', exact: true});
  await expect(link).toHaveAttribute('href', '#/rules?tab=dns&section=upstreams');
  await link.click();
  await expect(page.getByRole('region', {name: 'DNS upstreams', exact: true})).toBeFocused();
  await expect(page.getByRole('region', {name: 'DNS upstreams', exact: true}).getByRole('button', {name: 'Edit', exact: true}).first()).toBeDisabled();
});

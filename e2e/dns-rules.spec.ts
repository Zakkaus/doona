import {expect, mockBackend, test} from './fixtures';

const section = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', {name, exact: true});
const rows = (page: import('@playwright/test').Page, name: string) => section(page, name).locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');

test('the rules page has no DNS rules tab when the backend does not list DNS rules', async ({page}) => {
  const {capabilities, requests} = await mockBackend(page);
  capabilities.resources.dns_rules.available = false;
  await page.goto('/#/rules?tab=dns');
  const tabs = page.getByRole('tablist', {name: 'Rules', exact: true}).getByRole('tab');
  await expect(tabs).toHaveText(['Routing rules', 'Trace simulation']);
  await expect(page.getByRole('tab', {name: 'Routing rules', exact: true})).toHaveAttribute('aria-selected', 'true');
  expect(requests.some(request => request.url().includes('/dns/rules'))).toBe(false);
});

test('the DNS rules tab lists request and response rules, each ending with its fallback', async ({page}) => {
  await page.goto('/#/rules');
  const tabs = page.getByRole('tablist', {name: 'Rules', exact: true}).getByRole('tab');
  await expect(tabs).toHaveText(['Routing rules', 'DNS rules', 'Trace simulation']);
  await expect(page.getByRole('tab', {name: 'Routing rules', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', {name: 'DNS rules', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=dns$/);
  const request = rows(page, 'Request rules');
  await expect(request).toHaveCount(5);
  await expect(request.first()).toContainText('qname(geosite: category-ads-all)');
  await expect(request.first()).toContainText('reject');
  await expect(request.first()).toContainText('config.dae:36');
  await expect(request.nth(3)).toContainText('alidns');
  await expect(request.last()).toContainText('fallback: cloudflare');
  const response = rows(page, 'Response rules');
  await expect(response).toHaveCount(3);
  await expect(response.first()).toContainText('upstream(cloudflare)');
  await expect(response.nth(1)).toContainText('!qname(geosite: cn)');
  await expect(response.last()).toContainText('fallback: accept');
  await expect(section(page, 'Response rules')).toContainText('3 rules, generation 40');
  await request.first().getByRole('button', {name: 'Open source', exact: true}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-main&line=36$/);
});

test('the DNS rules lead to the resolution log and to the dns section of the configuration', async ({page}) => {
  await page.goto('/#/rules?tab=dns');
  const request = section(page, 'Request rules');
  await request.getByRole('link', {name: 'Resolution log', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?tab=log$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/rules\?tab=dns$/);
  await section(page, 'Request rules').getByRole('link', {name: 'Open DNS configuration', exact: true}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-main&line=29$/);
});

test('a DNS request rule is added through the source splice and removed again', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.goto('/#/rules?tab=dns');
  const request = rows(page, 'Request rules');
  await expect(request).toHaveCount(5);
  await section(page, 'Request rules').getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog');
  // DNS rules have no must keyword, and a request rule cannot match the answer.
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await expect(page.getByRole('option', {name: 'Answer IP', exact: true})).toHaveCount(0);
  await page.getByRole('option', {name: 'Query type', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values'}).fill('AAAA');
  await expect(dialog).toContainText('qtype(AAAA)');
  await dialog.getByRole('button', {name: /Action$/}).click();
  await page.getByRole('option', {name: /^reject/}).click();
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'})).toBeVisible();
  await expect(request).toHaveCount(6);
  await expect(request.nth(4)).toContainText('qtype(AAAA)');
  await expect(request.nth(4)).toContainText('reject');
  // The whole main source was replaced with the new line spliced in before the fallback, at the list's indent.
  expect(requests.some(item => item.method() === 'PUT' && item.url().endsWith('/api/v1/config/sources/src-main'))).toBe(true);
  const main = (await api.config()).sources.find(source => source.id === 'src-main')!.content!;
  expect(main).toContain('      qname(geosite: cn) -> alidns\n      qtype(AAAA) -> reject\n      fallback: cloudflare\n');
  await request.nth(4).getByRole('button', {name: 'Remove rule', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule removed'})).toBeVisible();
  await expect(request).toHaveCount(5);
  expect((await api.config()).sources.find(source => source.id === 'src-main')!.content).not.toContain('qtype(AAAA)');
});
test('with no response block the one insert position reads as text with its help, not as a picker', async ({page}) => {
  const {api} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.id === 'src-main')!;
  const content = source.content!.replace(/\n {4}response \{[^}]*\}/, '');
  await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
  await page.goto('/#/rules?tab=dns');
  await section(page, 'Response rules').getByRole('button', {name: 'Add rule', exact: true}).click();
  const position = page.getByRole('dialog').getByRole('group', {name: 'Insert', exact: true});
  await expect(position).toContainText('New response block, as its first rule');
  await expect(position).toHaveAccessibleDescription('The dns section has no response block yet; saving this rule creates it.');
  await expect(position.getByRole('button')).toHaveCount(0);
});

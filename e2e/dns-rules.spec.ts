import {expect, mockBackend, test} from './fixtures';

const section = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', {name, exact: true});
const rows = (page: import('@playwright/test').Page, name: string) => section(page, name).locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');

test('the rules page has no DNS rules tab when the backend does not list DNS rules', async ({page}) => {
  const {capabilities, requests} = await mockBackend(page);
  capabilities.resources.dns_rules.available = false;
  await page.goto('/#/rules?tab=dns');
  const tabs = page.getByRole('tablist', {name: 'Rules', exact: true}).getByRole('tab');
  await expect(tabs).toHaveText(['Routing rules', 'Routing map', 'Flow records', 'Trace simulation']);
  await expect(page.getByRole('tab', {name: 'Routing rules', exact: true})).toHaveAttribute('aria-selected', 'true');
  expect(requests.some(request => request.url().includes('/dns/rules'))).toBe(false);
});

test('the DNS rules tab lists request and response rules, each ending with its fallback', async ({page}) => {
  await page.goto('/#/rules');
  const tabs = page.getByRole('tablist', {name: 'Rules', exact: true}).getByRole('tab');
  await expect(tabs).toHaveText(['Routing rules', 'DNS rules', 'Routing map', 'Flow records', 'Trace simulation']);
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
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule written'})).toBeVisible();
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
test('a resolution record opens the DNS request rule dialog with its domain prefilled', async ({page}) => {
  await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/dns?tab=log');
  const first = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]').first();
  const name = (await first.getByRole('rowheader').innerText()).trim().replace(/\.$/, '');
  await first.click();
  await page.locator('.rp-panel').getByRole('link', {name: 'Add a DNS rule for this domain', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?.*tab=dns/);
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await expect(dialog.getByRole('textbox', {name: 'Values'})).toHaveValue(name);
  await expect(dialog).toContainText(`qname(suffix: ${name})`);
  // Only the request list takes the seed.
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/add=/);
});

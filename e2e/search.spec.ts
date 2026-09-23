import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

const open = async (page: import('@playwright/test').Page, text: string) => {
  await page.keyboard.press('Control+K');
  const dialog = page.locator('.rp-dialog');
  await dialog.locator('input').fill(text);
  return dialog;
};

test('search reaches tabs and cards, not only pages', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  let dialog = await open(page, 'valid');
  await dialog.getByRole('option', {name: /Validation/}).click();
  await expect(page).toHaveURL(/#\/config\?tab=validate$/);
  dialog = await open(page, 'geodata');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await dialog.locator('input').fill('actions');
  await dialog.getByRole('option', {name: /Backend actions/}).click();
  await expect(page).toHaveURL(/#\/settings\?card=actions$/);
  await expect(page.getByRole('region', {name: 'Backend actions'})).toBeInViewport();
});

test('search opens a node in its source, a group on its card, a subscription and a config source', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  let dialog = await open(page, 'jp-01');
  await dialog.getByRole('option', {name: /^jp-01/}).click();
  await expect(page).toHaveURL(/#\/nodes\?provider=inline&q=jp-01$/);
  await expect(page.getByLabel('Search nodes')).toHaveValue('jp-01');
  await expect(page.locator('.rp-table').nth(1).locator('[role=row][data-key]')).toHaveCount(1);
  dialog = await open(page, 'gaming');
  await dialog.getByRole('option', {name: /^gaming/}).click();
  await expect(page).toHaveURL(/#\/policies\?group=gaming$/);
  await expect(page.getByRole('region', {name: 'gaming'})).toBeInViewport();
  dialog = await open(page, 'sub-c');
  await dialog.getByRole('option', {name: /^sub-c/}).click();
  await expect(page).toHaveURL(/#\/nodes\?provider=sub-c$/);
  dialog = await open(page, 'rules.dae');
  await dialog.getByRole('option', {name: /rules\.dae/}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-rules$/);
});

test('search finds a routing rule by its condition and lands on its row', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  const dialog = await open(page, 'doubleclick');
  // The connection to doubleclick.net is a hit too; the rule is the one that names its outbound.
  const hit = dialog.getByRole('option', {name: /domain\(suffix: doubleclick\.net\).*→ block/});
  await expect(hit).toHaveCount(1);
  await hit.click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=/);
  const row = page.locator('[role="row"][aria-selected="true"]');
  await expect(row).toContainText('doubleclick');
  await expect(row).toBeInViewport();
});

test('search respects destination capabilities, preserves loose-node ownership and qualifies partial results', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  capabilities.resources.dns_query.available = false;
  capabilities.resources.dns_log.available = false;
  capabilities.resources.routing_trace.available = false;
  const nodes = await api.nodes();
  nodes.nodes = [
    {...nodes.nodes[0], id: 'direct', name: 'direct', protocol: 'direct', provider_id: null},
    {...nodes.nodes[0], id: 'orphan-id', name: 'orphan', provider_id: null}
  ];
  const providers = await api.providers();
  providers.providers = [{...providers.providers[0], id: 'unattributed'}];
  const connections = await api.connections();
  connections.truncated = true;
  const responses: Record<string, unknown> = {
    '/capabilities': capabilities,
    '/version': await api.version(),
    '/nodes': nodes,
    '/providers': providers,
    '/groups': await api.groups(),
    '/config': await api.config(),
    '/rules': await api.rules(),
    '/connections': connections
  };
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/**', route => route.fulfill({json: responses[new URL(route.request().url()).pathname.replace('/api/v1', '')]}));
  await page.goto('/#/nodes?tab=list');
  await expect(page.getByLabel('Search nodes')).toBeVisible();
  let dialog = await open(page, 'query');
  await expect(dialog.getByRole('option', {name: /Query/})).toHaveCount(0);
  await dialog.locator('input').fill('cache');
  await expect(dialog.getByRole('option', {name: /Cache/})).toBeVisible();
  await dialog.locator('input').fill('trace');
  await expect(dialog.getByRole('option', {name: /Trace simulation/})).toHaveCount(0);
  await dialog.locator('input').fill('orphan');
  await dialog.getByRole('option', {name: /^orphan/}).click();
  await expect(page).toHaveURL(/provider=unattributed-&q=orphan$/);
  await expect(page.getByRole('rowheader', {name: 'orphan', exact: true})).toBeVisible();
  dialog = await open(page, 'nothing-matches-this');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('truncated');
  await dialog.getByRole('button', {name: 'Connections', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections$/);
  await expect(page.getByRole('tab', {name: 'Traffic', exact: true})).toHaveAttribute('aria-selected', 'true');
});

test('search results are reached with arrow keys while the field keeps focus', async ({page}) => {
  await page.goto('/#/activity');
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  const dialog = await open(page, 'valid');
  const field = dialog.locator('input');
  await expect(field).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(field).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/config\?tab=validate$/);
});

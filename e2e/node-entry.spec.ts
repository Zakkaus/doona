import {expect, mockBackend, moreAction, test} from './fixtures';
import {sha256} from '../src/api/hash';

const nodeRows = (page: import('@playwright/test').Page) => page.locator('.rp-table').nth(1).locator('[role=row][data-key]');

test('node editing writes in place and renames group references', async ({page}) => {
  const {api} = await mockBackend(page);
  let source = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(
    await api.replaceConfigSource(source.id, source.content.replace('filter: name(jp-01, hk-02)', 'filter: name(hk-01, hk-02)'), `"${source.content_sha256}"`)
  );
  source = (await api.config()).sources.find(source => source.kind === 'main')!;
  await page.goto('/#/nodes?provider=inline');
  const row = nodeRows(page).filter({hasText: 'hk-01'});
  await row.getByRole('button', {name: 'Node actions', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Edit hk-01', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit node hk-01'});
  await dialog.getByLabel('Name', {exact: true}).fill('hk-02');
  await expect(dialog.getByLabel('Name', {exact: true})).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('A node already uses this name.', {exact: true})).toHaveCount(1);
  await dialog.getByLabel('Name', {exact: true}).fill('edge one');
  await dialog.getByLabel('Node link', {exact: true}).fill('socks5://127.0.0.1:1080');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(nodeRows(page).filter({hasText: 'edge one'})).toBeVisible();
  const saved = (await api.config()).sources.find(item => item.id === source.id)!.content;
  expect(saved).toBe(
    source.content
      .replace("'hk-01': 'vless://demo@hk-01.example.net:443?security=tls#hk-01'", "'edge one': 'socks5://127.0.0.1:1080'")
      .replaceAll('name(hk-01', "name('edge one'")
      .replace('default: hk-01', "default: 'edge one'")
  );
});

test('Config opens the same node form and no longer edits the raw node section', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/config');
  const card = page.getByRole('region', {name: 'node', exact: true});
  await expect(card.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
  await card.getByRole('link', {name: 'Edit hk-01', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit node hk-01'});
  await expect(dialog.getByLabel('Name', {exact: true})).toHaveValue('hk-01');
  await expect(dialog.getByLabel('Node link', {exact: true})).toHaveValue(/vless:\/\//);
  await dialog.getByLabel('Name', {exact: true}).fill('edge-renamed');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page).toHaveURL(/q=edge-renamed/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(nodeRows(page)).toHaveCount(1);
  await expect(nodeRows(page)).toContainText('edge-renamed');
});

for (const reference of ['filter: name(hk-01)', 'default: hk-01', 'final: hk-01'])
  test(`cross-source ${reference} blocks only a rename`, async ({page}) => {
    const {api, handlers} = await mockBackend(page);
    handlers['GET config'] = async () => {
      const config = await api.config();
      const content = `group {\n other {\n ${reference}\n policy: random\n }\n}\n`;
      config.sources.push({...config.sources[0], id: 'other', kind: 'include', path: 'other.dae', content, content_sha256: await sha256(content)});
      return config;
    };
    await page.goto('/#/nodes?provider=inline');
    await nodeRows(page).filter({hasText: 'hk-01'}).getByRole('button', {name: 'Node actions', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Edit hk-01', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', {exact: true}).fill('changed');
    await expect(dialog).toContainText('Groups in another source refer to this node');
    await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
    await dialog.getByLabel('Name', {exact: true}).fill('hk-01');
    await dialog.getByLabel('Node link', {exact: true}).fill('socks5://127.0.0.1:1080');
    await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeEnabled();
  });

test('incomplete authored sources do not offer node editing', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    config.sources.find(source => source.kind === 'main')!.content += '# masked content\n';
    return config;
  };
  await page.goto('/#/nodes?provider=inline');
  await nodeRows(page).filter({hasText: 'hk-01'}).getByRole('button', {name: 'Node actions', exact: true}).click();
  await expect(page.getByRole('menuitem', {name: 'Edit hk-01', exact: true})).toHaveCount(0);
});

test('missing latency names and the remaining count open probeable node rows', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const listed = await api.nodes();
  const original = listed.nodes.find(node => node.name === 'hk-01')!;
  listed.nodes = Array.from({length: 9}, (_, index) => ({
    ...original,
    id: `missing-${index}`,
    name: `missing-${index}`,
    health: original.health.map(health => ({...health, state: index === 0 ? ('unavailable' as const) : ('unknown' as const), latency_ms: null}))
  }));
  handlers['GET nodes'] = async () => ({...listed, next_cursor: null});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/nodes?tab=latency');
  const more = page.getByRole('link', {name: '2 more', exact: true}).first();
  await expect(more).toHaveCSS('padding-left', '0px');
  await expect(more).toHaveCSS('min-height', '0px');
  await page.getByRole('link', {name: 'missing-0', exact: true}).first().click();
  await expect(page).toHaveURL(/provider=inline.*q=missing-0.*node=missing-0/);
  await expect(nodeRows(page)).toHaveCount(1);
  await expect(page.getByRole('button', {name: 'Test missing-0', exact: true})).toBeVisible();
  await page.goto('/#/nodes?tab=latency');
  await page.getByRole('link', {name: '2 more', exact: true}).first().click();
  await expect(nodeRows(page)).toHaveCount(8);
  await expect(page.getByRole('button', {name: 'Test missing-8', exact: true})).toBeVisible();
  await page.reload();
  await expect(nodeRows(page)).toHaveCount(8);
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page).not.toHaveURL(/nodes=/);
  await page.locator('.rp-table').first().locator('[role=row][data-key=inline]').click();
  await expect(nodeRows(page)).toHaveCount(9);
});

test('the interval jump edits the declaring include while the main file is read-only', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  let include = "subscription {\n  harbor: 'https://sub.example.net/api/v1/client/subscribe?token=demo' # keep\n}\n";
  handlers['GET config'] = async () => {
    const config = await api.config();
    const source = config.sources.find(source => source.kind === 'main')!;
    source.content = source.content.replace(/^\s*harbor:.*\n/m, '');
    source.content_sha256 = await sha256(source.content);
    source.writable = false;
    config.sources.push({...source, id: 'subs', path: 'subs.dae', kind: 'include', writable: true, content: include, content_sha256: await sha256(include)});
    return config;
  };
  handlers['PUT config/sources/subs'] = async request => {
    expect(request.headers()['if-match']).toBe(`"${await sha256(include)}"`);
    include = request.postDataJSON().content;
    return api.replaceConfigSource(main.id, main.content, `"${main.content_sha256}"`);
  };
  await page.goto('/#/nodes');
  const jump = page.getByRole('link', {name: 'Auto-refresh of harbor', exact: true});
  await expect(jump).toHaveText('Edit');
  await expect(jump).toHaveClass(/rp-btn/);
  expect((await jump.boundingBox())!.height).toBe((await page.getByRole('button', {name: 'Refresh harbor', exact: true}).boundingBox())!.height);
  await jump.click();
  const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor'});
  const interval = dialog.getByRole('button', {name: 'Auto-refresh'});
  await expect(interval).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('option', {name: 'Every 6 hours', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(include).toBe("subscription {\n  harbor: { # keep\n    url: 'https://sub.example.net/api/v1/client/subscribe?token=demo'\n    interval: 6h\n  }\n}\n");
  expect(requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname)).toEqual(['/api/v1/config/sources/subs']);
});

for (const writable of [false, true])
  test(`subscription links consume their action when writable=${writable}`, async ({page}) => {
    const {api, handlers} = await mockBackend(page);
    handlers['GET config'] = async () => {
      const config = await api.config();
      config.sources.find(source => source.kind === 'main')!.writable = writable;
      return config;
    };
    await page.goto('/#/nodes?editSubscription=harbor&focus=interval');
    if (writable) await expect(page.getByRole('dialog', {name: 'Edit subscription harbor'})).toBeVisible();
    else await expect(page).toHaveURL(/#\/config\?tab=source&source=[^&]+&line=\d+/);
    await expect(page).not.toHaveURL(/editSubscription|focus=/);
  });

test('referenced subscriptions cannot be removed', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/nodes');
  await moreAction(page.locator('body'), 'Remove harbor', 'More actions for harbor');
  const dialog = page.getByRole('alertdialog', {name: 'Remove node source harbor'});
  await expect(dialog).toContainText('Groups that filter on harbor: backup.');
  await expect(dialog.getByRole('button', {name: 'Remove', exact: true})).toHaveCount(0);
  await expect(dialog.getByRole('link', {name: 'Open Policies', exact: true})).toHaveAttribute('href', '#/policies');
  expect(requests.filter(request => request.method() === 'DELETE')).toHaveLength(0);
});

test('long node edit links keep card padding and expose the full name', async ({page}) => {
  const {api} = await mockBackend(page);
  const name = 'HongKongEnterpriseDedicatedPremiumBackupConnection01';
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(await api.replaceConfigSource(source.id, source.content.replaceAll('hk-01', name), `"${source.content_sha256}"`));
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/config');
  const card = page.getByRole('region', {name: 'node', exact: true});
  const link = card.getByRole('link', {name: `Edit ${name}`, exact: true});
  await expect(link).toBeVisible();
  const bounds = await link.evaluate(el => {
    const card = el.closest('.rp-card')!;
    return {right: el.getBoundingClientRect().right, edge: card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight)};
  });
  expect(bounds.right).toBeLessThanOrEqual(bounds.edge + 1);
  await link.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await expect(page.getByRole('tooltip')).toContainText(name);
});

test('a verified node tag preserves the interval for an opaque provider name', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = source.content.replace(/(harbor: '[^']+')/, '$1 {\n interval: 1h\n }');
  await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
  handlers['GET providers'] = async () => {
    const list = await api.providers();
    return {...list, providers: list.providers.map(item => (item.id === 'harbor' ? {...item, name: 'opaque-a'} : item))};
  };
  await page.goto('/#/nodes');
  const row = page.locator('.rp-table').first().locator('[role=row][data-key="harbor"]');
  await expect(row).toContainText('Every 1 hour');
});

import {expect, mockBackend, test} from './fixtures';
import {sha256} from '../src/api/hash';

const nodeRows = (page: import('@playwright/test').Page) => page.locator('.rp-table').nth(1).locator('[role=row][data-key]');

test('node editing writes in place and renames exact group filters', async ({page}) => {
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
});

test('cross-source node references block only a rename', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    const content = 'group {\n other {\n filter: name(hk-01)\n policy: random\n }\n}\n';
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
  await page.getByRole('link', {name: 'Auto-refresh of harbor', exact: true}).click();
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

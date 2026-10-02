import {scanConfig} from '../src/dae/text';
import {expect, mockBackend, test, moreAction, moreItem} from './fixtures';

test('close all closes what the backend owns and skips the rest', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast')).toContainText(/Closed \d+, skipped \d+/);
});

test('the backend actions card links to reload, DNS, subscriptions and connections', async ({page}) => {
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend actions'});
  // Geodata has its own card where the sources are configurable.
  await expect(card).not.toContainText('geosite');
  await card.getByRole('link', {name: 'Open subscriptions', exact: true}).click();
  await page.getByRole('button', {name: 'Update 1 subscription', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Subscriptions updated: 1 of 1'})).toBeVisible();
  await page.goto('/#/settings');
  await card.getByRole('link', {name: 'Open DNS cache', exact: true}).click();
  await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Cache cleared'})).toBeVisible();
  await page.goto('/#/settings');
  await card.getByRole('link', {name: 'Open connections', exact: true}).click();
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast', {hasText: /Closed \d+, skipped \d+/})).toBeVisible();
  await page.goto('/#/settings');
  await card.getByRole('link', {name: 'System status', exact: true}).click();
  await page.locator('#overview-status').getByRole('button', {name: 'Reload', exact: true}).click();
  await page.getByRole('dialog', {name: 'Reload honk?'}).getByRole('button', {name: 'Reload honk', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Reload: Completed'})).toBeVisible();
});

test.describe('with more connections than one bulk close admits', () => {
  // Any value turns on the large connection set, which outnumbers the mock's bulk limit of 200; the number itself
  // sizes only the node inventory, so it stays at the default.
  test.use({storage: {'doona-mock-big': '120'}});

  test('Settings links to closing all connections in batches and reporting the totals', async ({page}) => {
    await page.goto('/#/settings');
    const card = page.getByRole('region', {name: 'Backend actions'});
    await card.getByRole('link', {name: 'Open connections', exact: true}).click();
    await page.getByRole('button', {name: 'Close all', exact: true}).click();
    const dialog = page.locator('.rp-dialog[role="alertdialog"]');
    await expect(dialog).toContainText(/\(([\d,]+) right now\)/);
    const live = Number(/\(([\d,]+) right now\)/.exec((await dialog.textContent()) ?? '')![1].replace(/,/g, ''));
    expect(live).toBeGreaterThan(1000);
    await dialog.getByRole('button', {name: 'Close all', exact: true}).click();
    const toast = page.locator('.rp-toast', {hasText: /Closed \d+, skipped \d+/});
    await expect(toast).toBeVisible();
    const [, closed, skipped] = /Closed (\d+), skipped (\d+)/.exec((await toast.textContent()) ?? '')!.map(Number);
    expect(closed).toBeGreaterThan(0);
    expect(closed + skipped).toBe(live);
    // What is left is what the backend could not close.
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', {name: 'Close all', exact: true}).click();
    await expect(dialog).toContainText(`(${skipped.toLocaleString('en')} right now)`);
  });
});

test('a pairing link fills the backend form and leaves the address bar clean', async ({page}) => {
  await page.goto('/#/settings?api=http://127.0.0.1:9527&token=secret-token');
  await expect(page.getByLabel('Backend URL', {exact: true})).toHaveValue('http://127.0.0.1:9527');
  await expect(page.locator('.rp-content')).toContainText('filled in from the link');
  await expect(page).toHaveURL(/#\/settings$/);
});

test('a group declared in an include is edited there while the main source is read-only', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  // Move gaming from the main source's group section into the rules include.
  const before = await api.config();
  const main = before.sources.find(source => source.kind === 'main')!;
  const include = before.sources.find(source => source.id === 'src-rules')!;
  const block = scanConfig(main.content!)
    .blocks.find(block => block.name === 'group')!
    .children.find(block => block.name === 'gaming')!;
  const gaming = main.content!.slice(block.from, block.to);
  await api.pollOperation(await api.replaceConfigSource(include.id, include.content + `\ngroup {\n${gaming}\n}\n`, `"${include.content_sha256}"`));
  await api.pollOperation(await api.replaceConfigSource(main.id, main.content!.replace(gaming + '\n', ''), `"${main.content_sha256}"`));
  handlers['GET config'] = async () => {
    const config = await api.config();
    for (const source of config.sources) if (source.kind === 'main') source.writable = false;
    return config;
  };
  await page.goto('/#/policies');
  // A group the read-only main source declares says why it cannot be edited.
  const office = page.getByRole('region', {name: 'office', exact: true});
  await office.scrollIntoViewIfNeeded();
  const reason = 'This group is defined in /etc/honk/config.dae, which is read-only';
  await expect(office.getByRole('button', {name: 'Why office is locked'})).toBeVisible();
  // Its configuration still opens, read-only, with the reason it cannot be edited.
  await expect(await moreItem(office, 'Edit group')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await moreAction(office, 'View configuration');
  const view = page.getByRole('dialog', {name: 'office configuration'});
  await expect(view.getByText(reason, {exact: true})).toBeVisible();
  await expect(view.getByRole('textbox')).toHaveCount(0);
  await view.getByRole('button', {name: 'Close', exact: true}).click();
  const card = page.getByRole('region', {name: 'gaming', exact: true});
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await dialog.getByRole('button', {name: 'Remove jp-01', exact: true}).click();
  await dialog.getByRole('button', {name: 'Remove hk-02', exact: true}).click();
  await dialog.getByRole('button', {name: 'Nodes', exact: true}).click();
  await page.getByRole('option', {name: 'hk-01', exact: true}).click();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  const writes = requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname);
  expect(writes).toEqual(['/api/v1/config/sources/src-rules']);
  const after = await api.config();
  expect(after.sources.find(source => source.id === 'src-rules')!.content).toMatch(/gaming \{\s+filter: name\(hk-01\)/);
  expect(after.sources.find(source => source.kind === 'main')!.content).toBe(main.content!.replace(gaming + '\n', ''));
});

test('policy editing discards a cancelled draft and saves filters through the main source', async ({page}) => {
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'gaming', exact: true});
  const edit = async () => {
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  };
  await edit();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  const tags = dialog.getByRole('group', {name: 'Includes', exact: true});
  await expect(tags).toContainText('jp-01');
  await dialog.getByRole('button', {name: 'Remove jp-01', exact: true}).click();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await edit();
  await expect(tags).toContainText('jp-01');
  await dialog.getByRole('button', {name: 'Remove jp-01', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await edit();
  await expect(tags).not.toContainText('jp-01');
  await expect(tags).toContainText('hk-02');
});

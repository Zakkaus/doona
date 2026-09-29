import {expect, mockBackend, test, moreAction, moreItem} from './fixtures';

test('close all closes what the backend owns and skips the rest', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  await page.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast')).toContainText(/Closed \d+, skipped \d+/);
});

test('the backend actions card gathers reload, DNS, subscriptions and connections', async ({page}) => {
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend actions'});
  // Geodata has its own card where the sources are configurable.
  await expect(card).not.toContainText('geosite');
  await card.getByRole('button', {name: 'Refresh subscription (1)', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Subscriptions refreshed: 1 of 1'})).toBeVisible();
  await card.getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Clear all cache', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Cache cleared'})).toBeVisible();
  await card.getByRole('button', {name: 'Close all', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
  await expect(page.locator('.rp-toast', {hasText: /Closed \d+, skipped \d+/})).toBeVisible();
  await card.getByRole('button', {name: 'Reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Reload: Completed'})).toBeVisible();
});

test.describe('with more connections than one bulk close admits', () => {
  // Any value turns on the large connection set, which outnumbers the mock's bulk limit of 200; the number itself
  // sizes only the node inventory, so it stays at the default.
  test.use({storage: {'doona-mock-big': '120'}});

  test('Settings close all closes them in batches and reports the totals', async ({page}) => {
    await page.goto('/#/settings');
    const card = page.getByRole('region', {name: 'Backend actions'});
    await card.getByRole('button', {name: 'Close all', exact: true}).click();
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
    await card.getByRole('button', {name: 'Close all', exact: true}).click();
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
  const gaming = main.content!.split('\n').find(line => line.trim().startsWith('gaming {'))!;
  await api.pollOperation(await api.replaceConfigSource(include.id, include.content + `\ngroup {\n${gaming}\n}\n`, `"${include.content_sha256}"`));
  await api.pollOperation(await api.replaceConfigSource(main.id, main.content!.replace(gaming + '\n', ''), `"${main.content_sha256}"`));
  handlers['GET config'] = async () => {
    const config = await api.config();
    for (const source of config.sources) if (source.kind === 'main') source.writable = false;
    return config;
  };
  await page.goto('/#/policies');
  // A group the read-only main source declares says why it cannot be edited.
  const proxy = page.getByRole('region', {name: 'proxy', exact: true});
  const locked = await moreItem(proxy, 'Edit group');
  await expect(locked).toBeDisabled();
  await expect(locked).toHaveAccessibleDescription('This group is defined in /etc/honk/config.dae, which is read-only');
  await page.keyboard.press('Escape');
  await expect(proxy.getByText('This group is defined in /etc/honk/config.dae, which is read-only', {exact: true})).toBeVisible();
  const card = page.getByRole('region', {name: 'gaming', exact: true});
  await card.scrollIntoViewIfNeeded();
  await moreAction(card, 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await dialog.getByRole('textbox', {name: 'Filter 1', exact: true}).fill('name(hk-01)');
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
  const edit = () => moreAction(card, 'Edit group');
  await edit();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  const filter = dialog.getByRole('textbox', {name: 'Filter 1', exact: true});
  const original = await filter.inputValue();
  await filter.fill('name(hk-01)');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await edit();
  await expect(filter).toHaveValue(original);
  await filter.fill('name(hk-01)');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await edit();
  await expect(filter).toHaveValue('name(hk-01)');
});

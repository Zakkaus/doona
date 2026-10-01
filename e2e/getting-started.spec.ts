import type {Page} from '@playwright/test';
import {test, expect, box} from './fixtures';
import {freshBackend} from './getting-started';
import {writeTemplate} from '../src/dae/setup';
import {nodeFixtures} from '../src/api/mock/fixtures/inventory';
import {translate, type Translator} from '../src/i18n';
import {loadCatalogues} from './fixtures';
import {ApiError} from '../src/api/error';
import type {Provider} from '../src/api/model';

const card = (page: Page) => page.getByRole('region', {name: 'Getting started'});
const step = (page: Page, title: string) => card(page).getByRole('listitem').filter({hasText: title});
const t: Translator = (key, params) => translate('en', key, params);
test.beforeAll(loadCatalogues);

async function addNodes(page: Page) {
  await card(page).getByRole('link', {name: 'Add subscription', exact: true}).click();
  const subscription = page.getByRole('dialog', {name: 'Add subscription', exact: true});
  await expect(subscription).toBeVisible();
  await subscription.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('button', {name: 'Paste node link', exact: true}).click();
  const node = page.getByRole('dialog', {name: 'Paste node link', exact: true});
  await node.getByRole('textbox', {name: 'Name', exact: true}).fill('first-node');
  await node.getByRole('textbox', {name: 'Node link', exact: true}).fill('vless://demo@first.example.org:443?security=tls#first-node');
  await node.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(node).toHaveCount(0);
  await page.goto('/#/activity');
}

test('a fresh backend shows the three steps and adding a node completes the first', async ({page}) => {
  const backend = await freshBackend(page);
  await page.goto('/#/activity');
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('listitem')).toHaveCount(3);
  await expect(card(page).locator('[data-complete="false"]')).toHaveCount(3);
  await addNodes(page);
  const first = step(page, 'Add a subscription or nodes');
  await expect(first).toHaveAttribute('data-complete', 'true');
  await expect(first.getByRole('link')).toHaveCount(0);
  await expect(step(page, 'Choose routing rules')).toHaveAttribute('data-complete', 'false');
  await expect(step(page, 'Check the connection')).toHaveAttribute('data-complete', 'false');
  expect(backend.requests.some(request => new URL(request.url()).pathname.endsWith('/probes'))).toBe(false);
});

for (const failed of [false, true]) {
  test(`a subscription with zero nodes completes the first step (refresh fails: ${failed})`, async ({page}) => {
    const backend = await freshBackend(page);
    backend.capabilities.resources.providers.can_refresh = failed;
    backend.handlers['POST providers'] = async request => {
      const created = (await backend.api.createProvider(request.postDataJSON())) as Provider;
      backend.handlers[`POST providers/${created.id}/refresh`] = async () => {
        throw new ApiError(502, 'upstream_unavailable', 'Subscription server unreachable');
      };
      return created;
    };
    await page.goto('/#/activity');
    await card(page).getByRole('link', {name: 'Add subscription', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Add subscription', exact: true});
    await dialog.getByLabel('Name').fill('first-subscription');
    await dialog.getByLabel('Subscription URL').fill('https://example.org/sub');
    await dialog.getByRole('button', {name: 'Add', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    if (failed) await expect(page.locator('.rp-toast.negative')).toContainText('could not be refreshed');
    expect((await backend.api.nodes()).nodes).toHaveLength(0);
    await page.goto('/#/activity');
    await expect(step(page, 'Add a subscription or nodes')).toHaveAttribute('data-complete', 'true');
    await expect(step(page, 'Choose routing rules')).toHaveAttribute('data-complete', 'false');
  });
}

test('the routing action opens the template dialog and applying completes the second step', async ({page}) => {
  await freshBackend(page);
  await page.goto('/#/activity');
  await card(page).getByRole('link', {name: 'Choose rules', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?template=1$/);
  const modes = page.getByRole('radiogroup', {name: 'Routing mode'});
  await expect(modes).toBeVisible();
  await modes.getByText('Bypass mainland China', {exact: true}).click();
  await page.getByRole('dialog', {name: 'Apply template', exact: true}).getByRole('button', {name: 'Preview changes', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Bypass mainland China?'});
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/#/activity');
  await expect(step(page, 'Choose routing rules')).toHaveAttribute('data-complete', 'true');
  await expect(step(page, 'Choose routing rules').getByRole('link')).toHaveCount(0);
  await card(page).getByRole('link', {name: 'Check connection', exact: true}).click();
  await expect(page).toHaveURL(/#\/policies$/);
});

test('dismissing persists after reload', async ({page}) => {
  await freshBackend(page);
  await page.goto('/#/activity');
  await card(page).getByRole('button', {name: 'Dismiss', exact: true}).click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', {name: 'Traffic'})).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

for (const unavailable of [false, true]) {
  test(`Activity opens when setup configuration cannot be read (unavailable: ${unavailable})`, async ({page}) => {
    const backend = await freshBackend(page);
    backend.capabilities.resources.config.available = !unavailable;
    backend.handlers['GET config'] = async () => {
      throw new ApiError(502, 'upstream_unavailable', 'Configuration unavailable');
    };
    await page.goto('/#/activity');
    await expect(page.getByRole('region', {name: 'Traffic', exact: true})).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
}

test('an already stopped card does not rewrite its stored state', async ({page}) => {
  await freshBackend(page);
  await page.addInitScript(() => {
    localStorage.setItem('doona-getting-started', 'dismissed');
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'doona-getting-started') write.call(sessionStorage, 'setup-writes', String(Number(sessionStorage.getItem('setup-writes')) + 1));
      write.call(this, key, value);
    };
  });
  await page.goto('/#/activity');
  await expect(page.getByRole('region', {name: 'Traffic'})).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('setup-writes'))).toBeNull();
});

const setupReads = (backend: Awaited<ReturnType<typeof freshBackend>>) =>
  backend.requests.filter(request => /\/api\/v1\/(config|rules)$/.test(new URL(request.url()).pathname)).length;

for (const unavailable of [false, true]) {
  test(`completion releases setup reads and survives Activity visits (storage unavailable: ${unavailable})`, async ({page}) => {
    const backend = await freshBackend(page);
    await page.clock.install();
    if (unavailable)
      await page.addInitScript(() => {
        const read = Storage.prototype.getItem;
        const write = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) {
          if (key === 'doona-getting-started') throw new Error('Storage unavailable');
          return read.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (key === 'doona-getting-started') throw new Error('Storage unavailable');
          write.call(this, key, value);
        };
      });
    const main = (await backend.api.config()).sources.find(source => source.kind === 'main')!;
    const content = writeTemplate(
      main.content!.replace('node {\n}', "node {\nfirst: 'vless://demo@first.example.org:443?security=tls#first'\n}"),
      'bypass',
      [{name: 'proxy', written: 'proxy'}],
      {t, blockQuic: false, networkManagerDirect: false}
    );
    await backend.api.pollOperation(await backend.api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`));
    const health = nodeFixtures(0).nodes[0].health;
    backend.handlers['GET nodes'] = async () => {
      const inventory = await backend.api.nodes();
      return {...inventory, nodes: inventory.nodes.map(node => ({...node, health}))};
    };
    await page.goto('/#/activity');
    await expect(page.locator('.rp-latency .rp-tile-val')).toContainText('ms');
    await expect(card(page)).toHaveCount(0);
    if (!unavailable) await expect.poll(() => page.evaluate(() => localStorage.getItem('doona-getting-started'))).toBe('complete');
    const reads = setupReads(backend);
    expect(reads).toBe(1);
    await page.clock.fastForward(65000);
    expect(setupReads(backend)).toBe(reads);
    await page.getByRole('link', {name: 'Logs', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Logs', exact: true})).toBeVisible();
    await page.getByRole('link', {name: 'Activity', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Traffic'})).toBeVisible();
    await page.clock.fastForward(65000);
    await expect(card(page)).toHaveCount(0);
    expect(setupReads(backend)).toBe(reads + 1);
    if (!unavailable) {
      await page.reload();
      await expect(page.getByRole('region', {name: 'Traffic'})).toBeVisible();
      await page.clock.fastForward(65000);
      expect(setupReads(backend)).toBe(reads + 2);
    }
  });
}

test('dismiss releases setup reads for the session while storage refuses writes', async ({page}) => {
  const backend = await freshBackend(page);
  await page.clock.install();
  await page.goto('/#/activity');
  await expect(card(page)).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await card(page).getByRole('button', {name: 'Dismiss', exact: true}).click();
  await expect(card(page)).toHaveCount(0);
  const reads = setupReads(backend);
  await page.clock.fastForward(65000);
  await page.getByRole('link', {name: 'Logs', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Logs', exact: true})).toBeVisible();
  await page.getByRole('link', {name: 'Activity', exact: true}).click();
  await page.clock.fastForward(65000);
  await expect(card(page)).toHaveCount(0);
  expect(setupReads(backend)).toBe(reads + 1);
});

for (const variant of [
  {name: 'desktop en light', width: 1440, height: 1000, lang: 'en', scheme: 'light'},
  {name: 'desktop en dark', width: 1440, height: 1000, lang: 'en', scheme: 'dark'},
  {name: 'phone en light', width: 390, height: 844, lang: 'en', scheme: 'light'},
  {name: 'phone en dark', width: 390, height: 844, lang: 'en', scheme: 'dark'},
  {name: 'phone zh-CN light', width: 390, height: 844, lang: 'zh-CN', scheme: 'light'},
  {name: 'phone zh-CN dark', width: 390, height: 844, lang: 'zh-CN', scheme: 'dark'},
  {name: 'phone zh-TW light', width: 390, height: 844, lang: 'zh-TW', scheme: 'light'},
  {name: 'phone zh-TW dark', width: 390, height: 844, lang: 'zh-TW', scheme: 'dark'}
] as const) {
  test.describe(variant.name, () => {
    test.use({viewport: {width: variant.width, height: variant.height}, storage: {'doona-lang': variant.lang, 'doona-scheme': variant.scheme}});
    test('the three action buttons have equal width and height and the rows fit', async ({page}) => {
      await freshBackend(page);
      await page.goto('/#/activity');
      const setup = page.getByRole('region', {name: translate(variant.lang, 'act.setup.title')});
      await expect(setup).toBeVisible();
      const dismiss = setup.getByRole('button', {name: translate(variant.lang, 'act.setup.dismiss'), exact: true});
      await expect(dismiss.locator('svg')).toHaveCount(1);
      await expect(dismiss).toHaveText('');
      const dismissBox = await box(dismiss);
      expect(dismissBox.width).toBe(dismissBox.height);
      const actions = setup.getByRole('link');
      await expect(actions).toHaveCount(3);
      const boxes = await Promise.all((await actions.all()).map(box));
      for (const size of ['width', 'height'] as const)
        expect(Math.max(...boxes.map(item => item[size])) - Math.min(...boxes.map(item => item[size]))).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await actions.first().focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', {name: translate(variant.lang, 'nodes.addProvider'), exact: true})).toBeVisible();
    });
  });
}

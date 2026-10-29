import type {Locator, Page} from '@playwright/test';
import {translate, type Translator} from '../src/i18n';
import {scanConfig} from '../src/dae/text';
import {geodataPreset} from '../src/dae/geodata';
import {expect, loadCatalogues, mockBackend, test} from './fixtures';

const t: Translator = (key, params, pluralParam, precision) => translate('en', key, params, pluralParam, precision);
const services = ['Steam', 'Telegram', 'GitHub'];
const lines = ['domain(geosite:steam) -> proxy', 'domain(geosite:telegram) -> proxy', 'dip(geoip:telegram) -> proxy', 'domain(geosite:github) -> proxy'];
const dnsLine = 'qname(geosite: telegram) && qtype(https, svcb) -> reject';
const dialogOf = (page: Page) => page.getByRole('dialog', {name: t('rule.service.add'), exact: true});
const outboundOf = (dialog: Locator) => dialog.getByRole('button', {name: new RegExp(t('rule.service.outbound') + '$')});
test.beforeAll(loadCatalogues);
test.use({viewport: {width: 1280, height: 800}, storage: {'doona-lang': 'en'}});

async function setupRouting(page: Page) {
  const backend = await mockBackend(page);
  const source = (await backend.api.config()).sources.find(source => source.kind === 'main')!;
  const routing = scanConfig(source.content).blocks.find(block => block.name === 'routing')!;
  const before =
    source.content.slice(0, routing.from) +
    'routing {\n  # Keep existing rules first.\n  domain(suffix: example.org) -> direct\n  fallback: proxy\n}' +
    source.content.slice(routing.to);
  await backend.api.pollOperation(await backend.api.replaceConfigSource(source.id, before, `"${source.content_sha256}"`));
  return {...backend, source, before};
}

async function selectServices(page: Page, names = services) {
  await page.getByRole('button', {name: t('rule.service.add'), exact: true}).click();
  const dialog = dialogOf(page);
  for (const name of names) await dialog.getByText(name, {exact: true}).click();
  await outboundOf(dialog).click();
  await page.getByRole('option', {name: 'proxy', exact: true}).click();
  return dialog;
}

test('hold selected service rules, apply them from review, and show skipped services on reopening', async ({page}) => {
  const {api, requests, source, before} = await setupRouting(page);
  await page.goto('/#/rules?view=simple');
  const dialog = await selectServices(page);
  await expect(dialog.getByRole('checkbox', {name: t('rule.service.steamCn'), exact: true})).not.toBeChecked();
  await expect(dialog.getByRole('button', {name: t('rule.addApply'), exact: true})).toBeEnabled();
  await dialog.getByRole('button', {name: t('rule.hold'), exact: true}).click();
  await expect(dialog).toHaveCount(0);
  const apply = page.locator('.rp-top').getByRole('button', {name: t('rule.applyPending', {n: 5}), exact: true});
  await expect(apply.locator('.rp-held-count')).toHaveText('5');
  expect(requests.filter(request => request.method() !== 'GET')).toHaveLength(0);
  expect((await api.config()).sources.find(item => item.id === source.id)!.content).toBe(before);
  await page
    .locator('.rp-toast.positive', {hasText: t('rule.held')})
    .getByRole('button', {name: t('rule.reviewHeld'), exact: true})
    .click();
  await page
    .getByRole('radiogroup', {name: t('rule.viewMode')})
    .getByRole('radio', {name: t('rule.viewAdvanced'), exact: true})
    .click();
  const held = page.getByRole('region', {name: t('rule.pending', {n: 4}), exact: true});
  for (const line of lines) await expect(held).toContainText(line);
  await expect(held).toContainText(t('rule.pendingElsewhere', {n: 1}));
  await page.goto('/#/rules?tab=dns&held=1');
  const dnsHeld = page.getByRole('region', {name: t('rule.pending', {n: 1}), exact: true});
  await expect(dnsHeld).toContainText(dnsLine);
  await expect(dnsHeld).toContainText(t('rule.pendingElsewhere', {n: 4}));
  await expect(apply.locator('.rp-held-count')).toHaveText('5');
  await page.goto('/#/rules?tab=list&view=advanced&held=1');
  await held.getByRole('button', {name: t('rule.applyHeld'), exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: t('rule.applied', {n: 5})})).toBeVisible();
  await expect(held).toHaveCount(0);
  await expect(page.locator('.rp-top .rp-held-count')).toHaveCount(0);
  const after = (await api.config()).sources.find(item => item.id === source.id)!.content;
  expect(after).toContain('  domain(suffix: example.org) -> direct\n' + lines.map(line => `  ${line}\n`).join('') + '  fallback: proxy');
  expect(after).toContain(`${dnsLine}\n      fallback: cloudflare`);
  expect(requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname)).toEqual(['/api/v1/config/sources/src-main']);
  await page.getByRole('button', {name: t('rule.service.add'), exact: true}).click();
  for (const name of services) {
    const checkbox = dialog.getByRole('checkbox', {name, exact: true});
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
    await expect(checkbox).toHaveAccessibleDescription(t('rule.service.alreadyPresent'));
  }
  await expect(dialog.getByRole('checkbox', {name: t('rule.service.steamCn'), exact: true})).toHaveCount(0);
  await expect(dialog.getByText(t('rule.service.dnsNote'), {exact: true})).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: t('rule.hold'), exact: true})).toBeDisabled();
  await expect(dialog.getByRole('button', {name: t('rule.addApply'), exact: true})).toBeDisabled();
});

test('direct apply preserves held rules and orders Steam @cn first and all games last', async ({page}) => {
  const {api, requests, source} = await setupRouting(page);
  await page.goto('/#/rules?tab=list&view=advanced');
  const dialog = await selectServices(page, ['GitHub']);
  await dialog.getByRole('button', {name: t('rule.hold'), exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await selectServices(page, ['Steam', t('rule.service.allGames')]);
  await dialog.getByText(t('rule.service.steamCn'), {exact: true}).click();
  await dialog.getByRole('button', {name: t('rule.addApply'), exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive', {hasText: t('rule.applied', {n: 3})})).toBeVisible();
  await expect(page.locator('.rp-top .rp-held-count')).toHaveText('1');
  const held = page.getByRole('region', {name: t('rule.pending', {n: 1}), exact: true});
  await expect(held).toContainText(lines[3]);
  await expect(held.getByRole('button', {name: t('rule.discard'), exact: true})).toHaveCount(1);
  const after = (await api.config()).sources.find(item => item.id === source.id)!.content;
  const ordered = ['domain(geosite:steam@cn) -> direct', lines[0], 'domain(geosite:category-games) -> proxy'];
  expect(after).toContain('  domain(suffix: example.org) -> direct\n' + ordered.map(line => `  ${line}\n`).join('') + '  fallback: proxy');
  expect(after).not.toContain(lines[3]);
  expect(requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname)).toEqual(['/api/v1/config/sources/src-main']);
});

test('missing geodata services stay unchecked and cannot expose Steam options', async ({page}) => {
  const {api} = await setupRouting(page);
  const {urls} = geodataPreset('metacubex-lite');
  await api.patchRuntimeSettings({geodata: {geosite: {urls: urls.geosite}, geoip: {urls: urls.geoip}}});
  await page.goto('/#/rules?view=simple');
  const dialog = await selectServices(page, []);
  const steam = dialog.getByRole('checkbox', {name: 'Steam', exact: true});
  await expect(steam).toBeDisabled();
  await expect(steam).not.toBeChecked();
  await expect(steam).toHaveAccessibleDescription(t('rule.service.missing'));
  await expect(dialog.getByRole('checkbox', {name: t('rule.service.steamCn'), exact: true})).toHaveCount(0);
  await expect(dialog.getByText(t('rule.service.dnsNote'), {exact: true})).toHaveCount(0);
});

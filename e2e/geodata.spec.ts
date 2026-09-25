import {expect, mockBackend, test} from './fixtures';
import {geodataPreset} from '../src/dae/geodata';
import {LANGS, loadLanguage, translate} from '../src/i18n';
import type {RuntimeSettings} from '../src/api/model';

test.beforeAll(() => Promise.all(LANGS.map(([lang]) => loadLanguage(lang))));
const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
const full = geodataPreset('metacubex');
const lite = geodataPreset('metacubex-lite');
const loyal = geodataPreset('loyalsoldier');
const patches = (page: import('@playwright/test').Page) =>
  page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/runtime/settings'));

test('a preset is applied as both URL lists and names the current source', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: t('settings.geodata'), exact: true});
  await expect(card).toContainText(t('settings.geodataFromDefault'));
  await expect(card).toContainText(t('settings.geodataPreset.metacubex'));
  await card.getByRole('button', {name: t('settings.geodataSource')}).click();
  await page.getByRole('option', {name: t('settings.geodataPreset.loyalsoldier'), exact: true}).click();
  const saving = patches(page);
  await card.getByRole('button', {name: t('settings.apply'), exact: true}).click();
  expect((await saving).postDataJSON()).toEqual({geodata: {geosite: {urls: loyal.urls.geosite}, geoip: {urls: loyal.urls.geoip}}});
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataSaved')})).toBeVisible();
  await expect(card).toContainText(t('settings.geodataFromDb'));
  const settings = (await api.runtimeSettings()).geodata!;
  expect(settings.geosite.urls).toEqual(loyal.urls.geosite);
  // The plain table left the backend actions card, which no longer offers a second update button.
  await expect(page.getByRole('region', {name: t('settings.actions')})).not.toContainText('geosite');
});

test('the lite preset warns about the categories the rules use', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: t('settings.geodata'), exact: true});
  await card.getByRole('button', {name: t('settings.geodataSource')}).click();
  await page.getByRole('option', {name: t('settings.geodataPreset.metacubexLite'), exact: true}).click();
  const warning = card.getByRole('alert').filter({hasText: t('settings.geodataMissingTitle', {name: t('settings.geodataPreset.metacubexLite')})});
  // The demo rules use geosite:discord, which the lite file lacks.
  await expect(warning).toContainText('geosite: discord');
  await expect(card.getByText(/geosite about 176/)).toBeVisible();
  expect(lite.categories?.geosite).not.toContain('discord');
});

test('a custom URL list is saved in order and shown as custom with its host', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: t('settings.geodata'), exact: true});
  await card.getByRole('button', {name: t('settings.geodataSource')}).click();
  await page.getByRole('option', {name: t('settings.geodataCustom'), exact: true}).click();
  // Custom starts from the chosen preset's links, so a mirror goes in front of them.
  const first = card.getByLabel(t('settings.geodataUrlLabel', {kind: 'geosite', n: '1'}), {exact: true});
  await expect(first).toHaveValue(full.urls.geosite[0]);
  await first.fill('https://mirror.example.net/geosite.dat');
  await card.getByLabel(t('settings.geodataUrlLabel', {kind: 'geosite', n: '3'}), {exact: true}).fill('ftp://bad');
  await expect(card.getByText(t('settings.geodataUrlInvalid'))).toBeVisible();
  await expect(card.getByRole('button', {name: t('settings.apply'), exact: true})).toBeDisabled();
  await card.getByLabel(t('settings.geodataUrlLabel', {kind: 'geosite', n: '3'}), {exact: true}).fill('');
  const saving = patches(page);
  await card.getByRole('button', {name: t('settings.apply'), exact: true}).click();
  expect((await saving).postDataJSON()).toEqual({
    geodata: {geosite: {urls: ['https://mirror.example.net/geosite.dat', full.urls.geosite[1]]}, geoip: {urls: full.urls.geoip}}
  });
  await expect(card).toContainText(t('settings.geodataCustomHost', {host: 'mirror.example.net'}));
});

test('URLs written from the config file stay editable, and a patch stores them as saved', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  // honk wrote the config file's URLs into its stored settings at startup; the mock reports them until it stores a patch.
  let seeded = true;
  const configured = (settings: RuntimeSettings): RuntimeSettings => ({
    ...settings,
    geodata: {...settings.geodata!, source: 'config', geosite: {urls: ['https://files.example.org/geosite.dat']}, geoip: {urls: full.urls.geoip}}
  });
  handlers['GET runtime/settings'] = async () => (seeded ? configured(await api.runtimeSettings()) : api.runtimeSettings());
  handlers['PATCH runtime/settings'] = async request => {
    const result = await api.patchRuntimeSettings(request.postDataJSON());
    seeded &&= result.geodata!.source !== 'db';
    return seeded ? configured(result) : result;
  };
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: t('settings.geodata'), exact: true});
  await expect(card).toContainText(t('settings.geodataFromConfig'));
  const note = card.getByRole('status').filter({hasText: t('settings.geodataConfigSeeded')});
  await expect(note).toBeVisible();
  await expect(card).toContainText(t('settings.geodataCustomHost', {host: 'files.example.org'}));
  // Automatic updates are stored on their own and leave the URLs, and so the source, alone.
  await card.getByText(t('settings.geodataAutoUpdate'), {exact: true}).click();
  await card.getByLabel(t('settings.geodataInterval'), {exact: true}).fill('48');
  let saving = patches(page);
  await card.getByRole('button', {name: t('settings.apply'), exact: true}).click();
  expect((await saving).postDataJSON()).toEqual({geodata: {auto_update: {enabled: true, interval_hours: 48}}});
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataAutoSaved')})).toBeVisible();
  await expect(note).toBeVisible();
  const first = card.getByLabel(t('settings.geodataUrlLabel', {kind: 'geosite', n: '1'}), {exact: true});
  await expect(first).toHaveValue('https://files.example.org/geosite.dat');
  await first.fill('https://mirror.example.net/geosite.dat');
  saving = patches(page);
  await card.getByRole('button', {name: t('settings.apply'), exact: true}).click();
  expect((await saving).postDataJSON()).toEqual({geodata: {geosite: {urls: ['https://mirror.example.net/geosite.dat']}, geoip: {urls: full.urls.geoip}}});
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataSaved')})).toBeVisible();
  await expect(card).toContainText(t('settings.geodataFromDb'));
  await expect(note).toHaveCount(0);
  expect((await api.runtimeSettings()).geodata!.geosite.urls).toEqual(['https://mirror.example.net/geosite.dat']);
});

test('update now downloads from the stored sources and reports the status', async ({page}) => {
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: t('settings.geodata'), exact: true});
  await expect(card.getByRole('grid', {name: t('settings.geodata'), exact: true}).getByRole('row')).toHaveCount(3);
  await expect(card.getByText(t('settings.geodataVerifiedYes'))).toHaveCount(2);
  await card.getByRole('button', {name: t('settings.geodataUpdateNow'), exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataUpdated')})).toBeVisible();
  await expect(card.getByRole('grid').getByText(full.urls.geoip[0])).toBeVisible();
  // The lite preset lacks a category the demo rules use, so its update fails and the error is kept.
  await card.getByRole('button', {name: t('settings.geodataSource')}).click();
  await page.getByRole('option', {name: t('settings.geodataPreset.metacubexLite'), exact: true}).click();
  await card.getByRole('button', {name: t('settings.apply'), exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataSaved')})).toBeVisible();
  await card.getByRole('button', {name: t('settings.geodataUpdateNow'), exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'discord'})).toBeVisible();
  await expect(card).toContainText('lacks categories the configuration uses: discord');
});

test('without configurable sources the page keeps the plain geodata table in the actions card', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  delete capabilities.resources.geodata.configurable_sources;
  await page.goto('/#/settings');
  await expect(page.getByRole('region', {name: t('settings.runtime')})).toBeVisible();
  await expect(page.getByRole('region', {name: t('settings.geodata'), exact: true})).toHaveCount(0);
  const actions = page.getByRole('region', {name: t('settings.actions')});
  await expect(actions.getByRole('grid', {name: t('settings.geodata'), exact: true}).getByRole('row')).toHaveCount(3);
  await expect(actions.getByRole('button', {name: t('settings.geodataUpdate'), exact: true})).toBeVisible();
  await expect(actions).not.toContainText(t('settings.geodataVerified'));
});

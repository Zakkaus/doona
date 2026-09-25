import {expect, mockBackend, test} from './fixtures';
import type {Page} from '@playwright/test';
import {geodataPreset} from '../src/dae/geodata';
import {LANGS, loadLanguage, translate} from '../src/i18n';
import type {RuntimeSettings} from '../src/api/model';

test.beforeAll(() => Promise.all(LANGS.map(([lang]) => loadLanguage(lang))));
const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
const full = geodataPreset('metacubex');
const loyal = geodataPreset('loyalsoldier');
// Serves the mock over the network and records every settings PATCH and geodata update the page sends, in order.
async function traffic(page: Page) {
  const backend = await mockBackend(page);
  const sent: string[] = [];
  const bodies: unknown[] = [];
  page.on('request', request => {
    const url = request.url();
    if (request.method() === 'PATCH' && url.endsWith('/runtime/settings')) {
      sent.push('patch');
      bodies.push(request.postDataJSON());
    }
    if (request.method() === 'POST' && url.endsWith('/geodata/update')) sent.push('update');
  });
  return {...backend, sent, bodies};
}
const section = (page: Page) => page.getByRole('region', {name: t('settings.geodata'), exact: true});
const row = (page: Page, label: Parameters<typeof t>[0]) =>
  section(page)
    .locator('.rp-ops-group')
    .filter({has: page.getByText(t(label), {exact: true})});
async function pick(page: Page, label: Parameters<typeof t>[0], option: string, exact = true) {
  await section(page)
    .getByRole('button', {name: t(label)})
    .first()
    .click();
  await page.getByRole('option', {name: option, exact}).click();
}

test('choosing a preset saves it once and then updates once', async ({page}) => {
  const {sent, bodies} = await traffic(page);
  await page.goto('/#/settings');
  const status = row(page, 'settings.geodataStatus');
  await expect(status).toContainText(t('settings.geodataLastUpdated'));
  await expect(section(page)).not.toContainText(t('settings.geodataLastError'));
  await expect(row(page, 'settings.geodataSource')).toContainText(/geosite about/);
  await pick(page, 'settings.geodataSource', t('settings.geodataPreset.loyalsoldier'), false);
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataUpdated')})).toBeVisible();
  expect(sent).toEqual(['patch', 'update']);
  expect(bodies).toEqual([{geodata: {geosite: {urls: loyal.urls.geosite}, geoip: {urls: loyal.urls.geoip}}}]);
  await expect(section(page).getByRole('button', {name: t('settings.geodataSource')})).toContainText(t('settings.geodataPreset.loyalsoldier'));
  // Update now is idempotent: a double click sends one update.
  await section(page)
    .getByRole('button', {name: t('settings.geodataUpdateNow'), exact: true})
    .dblclick();
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataUpdated')})).toBeVisible();
  expect(sent).toEqual(['patch', 'update', 'update']);
});

test('a failed update keeps the old files and shows the reason in the status row', async ({page}) => {
  const {sent} = await traffic(page);
  await page.goto('/#/settings');
  await section(page)
    .getByRole('button', {name: t('settings.geodataSource')})
    .first()
    .click();
  // The demo rules use geosite:discord, which the lite file lacks; the option says so before it is chosen.
  const option = page.getByRole('option', {name: t('settings.geodataPreset.metacubexLite')});
  await expect(option).toContainText('geosite:discord');
  await option.click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'discord'})).toBeVisible();
  expect(sent).toEqual(['patch', 'update']);
  const status = row(page, 'settings.geodataStatus').getByRole('status');
  await expect(status).toContainText(t('settings.geodataLastError'));
  await expect(status).toContainText('lacks categories the configuration uses: discord');
  await expect(status).toHaveClass(/negative/);
  // The files are the ones loaded before.
  await section(page)
    .getByRole('button', {name: t('settings.geodataDetails')})
    .click();
  await expect(section(page).locator('.rp-kv')).toContainText('4.4 MB');
});

test('custom URLs are edited in a dialog, saved once and then updated', async ({page}) => {
  const {sent, bodies} = await traffic(page);
  await page.goto('/#/settings');
  await expect(row(page, 'settings.geodataCustomUrls')).toHaveCount(0);
  await pick(page, 'settings.geodataSource', t('settings.geodataCustom'));
  const dialog = page.getByRole('dialog', {name: t('settings.geodataCustomUrls')});
  // The dialog starts from the chosen preset's links, so a mirror goes in front of them.
  const first = dialog.getByLabel(t('settings.geodataUrlLabel', {kind: 'geosite', n: '1'}), {exact: true});
  await expect(first).toHaveValue(full.urls.geosite[0]);
  await first.fill('https://mirror.example.net/geosite.dat');
  const third = dialog.getByLabel(t('settings.geodataUrlLabel', {kind: 'geosite', n: '3'}), {exact: true});
  await third.fill('ftp://bad');
  await expect(dialog.getByText(t('settings.geodataUrlInvalid'))).toBeVisible();
  const save = dialog.getByRole('button', {name: t('settings.geodataSaveUpdate'), exact: true});
  await expect(save).toBeDisabled();
  await third.fill('');
  // The order is the fallback order: the mirror moves below the jsDelivr link, and the first URL cannot move up.
  const url = (n: string) => t('settings.geodataUrlLabel', {kind: 'geosite', n});
  await expect(dialog.getByRole('button', {name: t('settings.geodataMoveUp', {url: url('1')}), exact: true})).toBeDisabled();
  await dialog.getByRole('button', {name: t('settings.geodataMoveUp', {url: url('2')}), exact: true}).click();
  await expect(first).toHaveValue(full.urls.geosite[1]);
  await dialog.getByRole('button', {name: t('settings.geodataMoveDown', {url: url('1')}), exact: true}).click();
  await dialog.getByRole('button', {name: t('settings.geodataMoveUp', {url: url('2')}), exact: true}).click();
  await save.dblclick();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataUpdated')})).toBeVisible();
  expect(sent).toEqual(['patch', 'update']);
  expect(bodies).toEqual([{geodata: {geosite: {urls: [full.urls.geosite[1], 'https://mirror.example.net/geosite.dat']}, geoip: {urls: full.urls.geoip}}}]);
  const custom = row(page, 'settings.geodataCustomUrls');
  await expect(custom).toContainText('mirror.example.net');
  await custom.getByRole('button', {name: t('settings.geodataEdit'), exact: true}).click();
  await expect(dialog.getByLabel(url('2'), {exact: true})).toHaveValue('https://mirror.example.net/geosite.dat');
  await dialog.getByRole('button', {name: t('ui.cancel'), exact: true}).click();
  expect(sent).toEqual(['patch', 'update']);
});

test('the download route follows the routing rules by default, and a group route saves with its group', async ({page}) => {
  const {sent, bodies} = await traffic(page);
  await page.goto('/#/settings');
  const route = row(page, 'settings.geodataRoute');
  await expect(route.getByRole('button', {name: t('settings.geodataRoute')})).toContainText(t('settings.geodataRouteRouting'));
  await pick(page, 'settings.geodataRoute', t('settings.geodataRouteGroup'));
  // Choosing a group route only asks for the group.
  await expect(route.getByRole('button', {name: t('settings.geodataRouteGroup')}).last()).toBeVisible();
  expect(sent).toEqual([]);
  await route
    .getByRole('button', {name: t('settings.geodataRouteGroup')})
    .last()
    .click();
  await page.getByRole('option', {name: 'proxy', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataAutoSaved')})).toBeVisible();
  expect(bodies).toEqual([{geodata: {download: {route: 'group', group_id: 'proxy'}}}]);
  await pick(page, 'settings.geodataRoute', t('settings.geodataRouteDirect'));
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual({geodata: {download: {route: 'direct'}}});
  await expect(route.getByRole('button', {name: t('settings.geodataRouteGroup')})).toHaveCount(0);
  expect(sent).toEqual(['patch', 'patch']);
});

test('a backend that cannot update on request only stores the sources and says so', async ({page}) => {
  const {sent, capabilities} = await traffic(page);
  capabilities.resources.geodata.can_update = false;
  await page.goto('/#/settings');
  await expect(section(page).getByText(t('settings.geodataSourcesNoteStored'), {exact: true})).toBeVisible();
  await expect(section(page)).not.toContainText(t('settings.geodataSourcesNote'));
  await expect(section(page).getByRole('button', {name: t('settings.geodataUpdateNow'), exact: true})).toHaveCount(0);
  await pick(page, 'settings.geodataSource', t('settings.geodataPreset.loyalsoldier'), false);
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataSaved')})).toBeVisible();
  await expect(row(page, 'settings.geodataStatus')).not.toContainText(t('settings.geodataUpdating'));
  expect(sent).toEqual(['patch']);
  await pick(page, 'settings.geodataSource', t('settings.geodataCustom'));
  const dialog = page.getByRole('dialog', {name: t('settings.geodataCustomUrls')});
  await expect(dialog.getByRole('button', {name: t('settings.geodataSaveSources'), exact: true})).toBeVisible();
  await expect(dialog.getByRole('button', {name: t('settings.geodataSaveUpdate'), exact: true})).toHaveCount(0);
});

test('a backend without a download route shows no route control', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const older = (settings: RuntimeSettings): RuntimeSettings => {
    const {download, ...geodata} = settings.geodata!;
    return {...settings, geodata: geodata as RuntimeSettings['geodata']};
  };
  handlers['GET runtime/settings'] = async () => older(await api.runtimeSettings());
  await page.goto('/#/settings');
  await expect(row(page, 'settings.geodataAutoUpdate')).toBeVisible();
  await expect(row(page, 'settings.geodataRoute')).toHaveCount(0);
});

test('automatic updates save as they change, and the interval shows only while they are on', async ({page}) => {
  const {bodies} = await traffic(page);
  await page.goto('/#/settings');
  const auto = row(page, 'settings.geodataAutoUpdate');
  const interval = auto.getByRole('button', {name: t('settings.geodataInterval')});
  await expect(interval).toContainText('1 day');
  await pick(page, 'settings.geodataInterval', '3 days');
  await expect.poll(() => bodies).toEqual([{geodata: {auto_update: {interval_hours: 72}}}]);
  await expect(interval).toContainText('3 days');
  await auto.getByRole('switch', {name: t('settings.geodataAutoUpdate')}).click({force: true});
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual({geodata: {auto_update: {enabled: false}}});
  await expect(interval).toHaveCount(0);
});

test('the details list each asset by host, with the full URL behind it', async ({page}) => {
  await page.goto('/#/settings');
  const details = section(page).getByRole('button', {name: t('settings.geodataDetails')});
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await details.click();
  const geoip = section(page).locator('.rp-kv > div').filter({hasText: 'geoip'});
  const host = new URL(full.urls.geoip[1]).host;
  await expect(geoip).toContainText(host);
  await expect(geoip).toContainText(t('settings.geodataRouteRouting'));
  await expect(geoip).not.toContainText(full.urls.geoip[1]);
  await page.mouse.move(0, 0);
  await geoip.locator('.v').hover();
  await expect(page.getByRole('tooltip')).toHaveText(full.urls.geoip[1]);
});

test('URLs written from the config file carry a note until the page stores its own', async ({page}) => {
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
  const note = section(page).getByText(t('settings.geodataConfigSeeded'));
  await expect(note).toBeVisible();
  await expect(row(page, 'settings.geodataCustomUrls')).toContainText('files.example.org');
  await pick(page, 'settings.geodataSource', t('settings.geodataPreset.metacubex'), false);
  await expect(page.locator('.rp-toast.positive', {hasText: t('settings.geodataUpdated')})).toBeVisible();
  await expect(note).toHaveCount(0);
  expect((await api.runtimeSettings()).geodata!.geosite.urls).toEqual(full.urls.geosite);
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
  await expect(actions).not.toContainText(t('settings.geodataVerifiedYes'));
});

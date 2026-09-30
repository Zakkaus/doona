import {translate, type Translator} from '../src/i18n';
import {test, type Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import {allGroupNames} from '../src/dae/sources';
import {writeTemplate} from '../src/dae/setup';
import {scanConfig} from '../src/dae/text';
import legacy from '../src/dae/templates.legacy.json' with {type: 'json'};
import {box, expect, loadCatalogues} from './fixtures';

const templateShots = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_TEMPLATE_SHOTS;
const t: Translator = (key, params) => translate('en', key, params);
test.beforeAll(loadCatalogues);

test.use({viewport: {width: 1440, height: 1000}});

// The demo backend served over HTTP, so a spec can change its files as another client would.
async function backend(page: Page, lang = 'en') {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  await page.addInitScript(language => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', language);
  }, lang);
  const reads: Record<string, () => Promise<unknown>> = {
    capabilities: async () => capabilities,
    version: () => api.version(),
    config: () => api.config(),
    rules: () => api.rules(),
    'dns/rules': () => api.dnsRules(),
    groups: () => api.groups(),
    nodes: () => api.nodes({limit: 1000}),
    providers: () => api.providers({limit: 1000}),
    flows: () => api.flows({detail: 'full', limit: 1000}),
    connections: () => api.connections({detail: 'full', limit: 1000}),
    runtime: () => api.runtime(),
    geodata: () => api.geodata(),
    'runtime/settings': () => api.runtimeSettings(),
    'runtime/outbounds': () => api.runtimeOutbounds()
  };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    try {
      if (reads[path]) return await route.fulfill({json: await reads[path]()});
      if (path === 'config/validate') return await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
      if (path.startsWith('config/sources/'))
        return await route.fulfill({
          json: await api.replaceConfigSource(path.split('/').pop()!, route.request().postDataJSON().content, route.request().headers()['if-match'])
        });
      if (path.startsWith('operations/')) return await route.fulfill({json: await api.operation(path.split('/').pop()!)});
      throw new Error(`Unexpected request: ${route.request().method()} ${path}`);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      await route.fulfill({
        status: error.status,
        json: {request_id: 'templates-test', error: {code: error.code, message: error.message, details: error.details}}
      });
    }
  });
  const main = async () => (await api.config()).sources.find(source => source.kind === 'main')!;
  // Writes the main file as another client would and waits for the reload to take it in.
  const write = async (change: (text: string) => string) => {
    const source = await main();
    const next = change(source.content!);
    await api.replaceConfigSource(source.id, next, `"${source.content_sha256}"`);
    await expect.poll(async () => (await main()).content).toBe(next);
  };
  return {api, main, write};
}
const oneFile = (text: string) => text.replace('  include rules.dae\n', '');
const noDns = (text: string) => {
  const block = scanConfig(text).blocks.find(item => item.name === 'dns')!;
  return text.slice(0, block.from) + text.slice(block.to);
};
const modes = (page: Page) => page.getByRole('radiogroup', {name: 'Routing mode'});
// The input is visually hidden inside its label, as in S2, so a person presses the label.
const choose = async (page: Page, name: string) => {
  await modes(page).getByText(name, {exact: true}).click();
  await expect(modes(page).getByRole('radio', {name})).toBeChecked();
};
const applyButton = (page: Page) => page.getByRole('region', {name: 'Routing mode'}).getByRole('button', {name: 'Apply', exact: true});
const optionImpacts = (page: Page) =>
  page
    .getByRole('dialog')
    .locator('p')
    .filter({
      hasText: /^(?:Ad blocking is (?:on|off)\.|QUIC blocking is (?:on|off)\.|NetworkManager traffic (?:stays direct|follows the routing rules)\.)$/
    });

test('ads are off by default and switching them alone can be applied in both directions', async ({page}) => {
  const {main, write} = await backend(page);
  await write(oneFile);
  await page.goto('/#/rules?tab=list&view=simple');
  const ads = page.getByRole('switch', {name: 'Block ads', exact: true});
  await expect(ads).not.toBeChecked();
  await choose(page, 'Bypass mainland China');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog');
  await expect(optionImpacts(page)).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await main()).content).not.toContain('domain(geosite:category-ads-all) -> block');
  await expect(applyButton(page)).toBeDisabled();
  for (const enabled of [true, false]) {
    await ads.focus();
    await ads.press('Space');
    await expect(ads).toBeChecked({checked: enabled});
    await expect(applyButton(page)).toBeEnabled();
    await applyButton(page).click();
    await expect(dialog).toContainText(enabled ? 'Ad blocking is on.' : 'Ad blocking is off.');
    await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    expect((await main()).content!.includes('domain(geosite:category-ads-all) -> block')).toBe(enabled);
    await expect(applyButton(page)).toBeDisabled();
    await page.reload();
    await expect(ads).toBeChecked({checked: enabled});
    await expect(modes(page).getByRole('radio', {name: 'Bypass mainland China', exact: true})).toBeChecked();
  }
});

for (const option of [
  {name: 'Block ads', initial: false, line: 'domain(geosite:category-ads-all) -> block', on: 'Ad blocking is on.', off: 'Ad blocking is off.'},
  {name: 'Block QUIC', initial: true, line: 'l4proto(udp) && dport(443) -> block', on: 'QUIC blocking is on.', off: 'QUIC blocking is off.'},
  {
    name: 'Keep NetworkManager direct',
    initial: true,
    line: 'pname(NetworkManager) -> direct',
    on: 'NetworkManager traffic stays direct.',
    off: 'NetworkManager traffic follows the routing rules.'
  }
])
  test(`${option.name} alone changes Global proxy routing and is restored after applying`, async ({page}) => {
    const {main, write} = await backend(page);
    await write(text => writeTemplate(oneFile(text), 'global', [], {t}));
    await page.goto('/#/rules?tab=list&view=simple');
    const control = page.getByRole('switch', {name: option.name, exact: true});
    await expect(control).toBeChecked({checked: option.initial});
    await expect(applyButton(page)).toBeDisabled();
    for (const enabled of [!option.initial, option.initial]) {
      await control.focus();
      await control.press('Space');
      await expect(applyButton(page)).toBeEnabled();
      await applyButton(page).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(enabled ? option.on : option.off);
      await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
      await expect(dialog).toHaveCount(0);
      expect((await main()).content!.includes(option.line)).toBe(enabled);
      await expect(applyButton(page)).toBeDisabled();
      await page.reload();
      await expect(control).toBeChecked({checked: enabled});
      await expect(modes(page).getByRole('radio', {name: 'Global proxy', exact: true})).toBeChecked();
    }
  });

test('all changed options appear in the apply impact and restore together', async ({page}) => {
  const {write} = await backend(page);
  await write(text => writeTemplate(oneFile(text), 'bypass', [], {t}));
  await page.goto('/#/rules?tab=list&view=simple');
  for (const name of ['Block ads', 'Block QUIC', 'Keep NetworkManager direct']) {
    const control = page.getByRole('switch', {name, exact: true});
    await control.focus();
    await control.press('Space');
  }
  await choose(page, 'Global proxy');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog');
  for (const text of ['Ad blocking is on.', 'QUIC blocking is off.', 'NetworkManager traffic follows the routing rules.'])
    await expect(dialog).toContainText(text);
  await expect(optionImpacts(page)).toHaveCount(3);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('switch', {name: 'Block ads', exact: true})).toBeChecked();
  for (const name of ['Block QUIC', 'Keep NetworkManager direct']) await expect(page.getByRole('switch', {name, exact: true})).not.toBeChecked();
  await expect(applyButton(page)).toBeDisabled();
});

test('changing templates lists only options changed from the detected routing', async ({page}) => {
  const {write} = await backend(page);
  await write(() => 'group { proxy {} }\n' + legacy.global);
  await page.goto('/#/rules?tab=list&view=simple');
  await choose(page, 'Bypass mainland China');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog');
  await expect(optionImpacts(page)).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  const ads = page.getByRole('switch', {name: 'Block ads', exact: true});
  await ads.focus();
  await ads.press('Space');
  await applyButton(page).click();
  await expect(optionImpacts(page)).toHaveText(['Ad blocking is on.']);
});

for (const variant of [
  {lang: 'en', scheme: 'light', width: 1440, height: 1000, more: 'More templates'},
  {lang: 'zh-TW', scheme: 'dark', width: 1440, height: 1000, more: '更多範本'},
  {lang: 'zh-CN', scheme: 'light', width: 390, height: 844, more: '更多模板'}
] as const)
  test(`template switches share their size and left edge in ${variant.lang}`, async ({page}) => {
    await page.setViewportSize({width: variant.width, height: variant.height});
    await backend(page, variant.lang);
    await page.addInitScript(scheme => localStorage.setItem('doona-scheme', scheme), variant.scheme);
    await page.goto('/#/rules?tab=list&view=simple');
    await page.getByRole('button', {name: variant.more, exact: true}).click();
    const switches = page.locator('.rp-switch');
    await expect(switches).toHaveCount(3);
    const tracks = switches.locator('.track');
    const boxes = await Promise.all([0, 1, 2].map(index => box(tracks.nth(index))));
    for (const measured of boxes.slice(1)) {
      expect(measured.x).toBe(boxes[0].x);
      expect(measured.width).toBe(boxes[0].width);
      expect(measured.height).toBe(boxes[0].height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(variant.width);
    if (templateShots) {
      await page.setViewportSize({width: variant.width, height: variant.width === 390 ? 1800 : 1300});
      await page.screenshot({
        path: `${templateShots}/templates-after-${variant.width === 390 ? 'phone' : 'desktop'}-${variant.lang}-${variant.scheme}-list.png`,
        fullPage: true
      });
    }
  });

test('legacy routing selects its template with ad blocking on', async ({page}) => {
  const {write} = await backend(page);
  await write(() => 'group { proxy { filter: name(hk-01) policy: min_moving_avg } }\n' + legacy.bypass);
  await page.goto('/#/rules?tab=list&view=simple');
  await expect(modes(page).getByRole('radio', {name: 'Bypass mainland China', exact: true})).toBeChecked();
  await expect(page.getByRole('switch', {name: 'Block ads', exact: true})).toBeChecked();
  for (const name of ['Block QUIC', 'Keep NetworkManager direct']) await expect(page.getByRole('switch', {name, exact: true})).toBeChecked();
  await expect(applyButton(page)).toBeDisabled();
});

test('a template replaces the routing of the one file that holds it', async ({page}) => {
  const {main, write} = await backend(page);
  await write(oneFile);
  await page.goto('/#/rules?tab=list&view=simple');
  // Custom routing selects no mode, and says what applying one replaces.
  await expect(page.getByRole('status')).toContainText('The current rules match no mode. Applying a mode writes its top-level routing to config.dae.');
  await expect(modes(page).getByRole('radio', {checked: true})).toHaveCount(0);
  await expect(applyButton(page)).toBeDisabled();
  await choose(page, 'Bypass mainland China');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Bypass mainland China?'});
  await expect(dialog).toContainText(
    "Writes the mode's top-level routing to config.dae, replacing the existing top-level routing, and adds missing groups. Existing DNS routing and the other files stay as they are."
  );
  // The configuration has a dns block, so the DNS split is not offered.
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  // The impact: nothing new, the file's first group kept, and only the changed stretch of the file.
  await expect(dialog.getByRole('region', {name: 'Groups to create'})).toContainText('No new groups.');
  await expect(dialog.getByRole('region', {name: 'Existing groups used'})).toContainText('proxy');
  // The changes are folded away until asked for.
  const diff = dialog.getByRole('region', {name: 'Changes to config.dae'});
  await expect(diff).toBeHidden();
  // Content that fits needs no dividers.
  await expect(dialog.locator('.rp-dialog-body')).not.toHaveAttribute('data-overflow');
  await dialog.getByRole('button', {name: 'Changes to config.dae'}).click();
  await expect(diff.locator('[data-kind="add"]', {hasText: 'dip(geoip:cn) -> direct'})).toHaveCount(1);
  await expect(diff.locator('[data-kind="del"]', {hasText: 'domain(geosite: telegram) -> proxy'})).toHaveCount(1);
  await expect(diff).not.toContainText('tproxy_port');
  // At phone width a long line wraps inside the panel rather than scrolling it sideways.
  await page.setViewportSize({width: 320, height: 800});
  await expect.poll(() => diff.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  await page.setViewportSize({width: 1440, height: 1000});
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Applied Bypass mainland China to config.dae');
  await expect(dialog).toHaveCount(0);
  const saved = (await main()).content!;
  expect(saved).toContain('dip(geoip:cn) -> direct');
  expect(saved).toContain('fallback: proxy');
  // DNS routing is nested and stays.
  expect(saved).toContain('qname(geosite: cn) -> alidns');
  expect(saved).not.toContain('domain(geosite: telegram) -> proxy');
  // The applied mode is now the detected one: selected, with nothing left to apply.
  await expect(modes(page).getByRole('radio', {name: 'Bypass mainland China'})).toBeChecked();
  await expect(applyButton(page)).toBeDisabled();
  // The rules are read again with the file, so the table holds them at once though no event stream announces them.
  await page.getByRole('radiogroup', {name: 'Rules view'}).getByText('Advanced', {exact: true}).click();
  const table = page.getByRole('tabpanel', {name: 'Routing rules'}).locator('.rp-table');
  await expect(table).toContainText('dip(geoip:cn)');
  await expect(table).not.toContainText('geosite: telegram');
});

test('the routing list opens on the simple view for template and custom routing, and a link to a rule on the table', async ({page}) => {
  const {api, write} = await backend(page);
  const table = page.getByRole('tabpanel', {name: 'Routing rules'}).locator('.rp-table');
  await write(oneFile);
  await page.goto('/#/rules?tab=list');
  await expect(modes(page)).toBeVisible();
  await expect(modes(page).getByRole('radio', {checked: true})).toHaveCount(0);
  await expect(table).toHaveCount(0);
  const defined = allGroupNames((await api.config()).sources);
  await write(text => writeTemplate(text, 'bypass', defined, {t}));
  // Only the hash changes, so a reload reads the file written behind the page's back.
  await page.goto('/#/rules');
  await page.reload();
  await expect(modes(page).getByRole('radio', {name: 'Bypass mainland China'})).toBeChecked();
  // A link to one rule, as search and Connections make, lands on the table with the rule selected.
  const rule = (await api.rules()).rules[0].rule_id;
  await page.goto(`/#/rules?tab=list&rule=${rule}`);
  await expect(table).toBeVisible();
  await expect(modes(page)).toHaveCount(0);
  await page.goto('/#/rules?view=advanced');
  await expect(table).toBeVisible();
});

test('without a dns block the dialog offers the DNS split, checked, and writes it only while checked', async ({page}) => {
  const {main, write} = await backend(page);
  await write(text => noDns(oneFile(text)));
  await page.goto('/#/rules?tab=list&view=simple');
  await choose(page, 'Bypass mainland China');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Bypass mainland China?'});
  const split = dialog.getByRole('checkbox', {name: 'Also add DNS routing'});
  await expect(split).toBeChecked();
  await dialog.getByRole('button', {name: 'Changes to config.dae'}).click();
  const diff = dialog.getByRole('region', {name: 'Changes to config.dae'});
  await expect(diff.locator('[data-kind="add"]', {hasText: 'qname(geosite:cn) -> alidns'})).toHaveCount(1);
  await dialog.getByText('Also add DNS routing', {exact: true}).click();
  await expect(split).not.toBeChecked();
  await expect(diff.locator('[data-kind="add"]', {hasText: 'alidns'})).toHaveCount(0);
  await dialog.getByText('Also add DNS routing', {exact: true}).click();
  // Validation is held, so the checkbox can be tried while the write runs: it keeps the choice the write holds.
  let release = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route('**/api/v1/config/validate', async route => {
    await held;
    await route.fallback();
  });
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(split).toBeDisabled();
  await dialog.getByText('Also add DNS routing', {exact: true}).click({force: true});
  await expect(split).toBeChecked();
  await expect(diff.locator('[data-kind="add"]', {hasText: 'qname(geosite:cn) -> alidns'})).toHaveCount(1);
  release();
  await expect(dialog).toHaveCount(0);
  const saved = (await main()).content!;
  expect(saved).toContain("alidns: 'udp://223.5.5.5:53'");
  expect(saved).toContain('qname(geosite:cn) -> alidns');
});

test('the detected mode is selected, and the arrow keys move the selection through the visible modes', async ({page}) => {
  const {api, write} = await backend(page);
  const defined = allGroupNames((await api.config()).sources);
  await write(text => writeTemplate(oneFile(text), 'single', defined, {t}));
  await page.goto('/#/rules?tab=list&view=simple');
  // A detected preset under More templates opens it, so the selection is in view.
  const single = modes(page).getByRole('radio', {name: 'Single proxy group'});
  await expect(single).toBeChecked();
  await expect(single).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(applyButton(page)).toBeDisabled();
  await page.getByRole('button', {name: 'More templates'}).click();
  await expect(single).toBeHidden();
  // With More templates closed, the arrows cycle through the three plain modes only.
  const bypass = modes(page).getByRole('radio', {name: 'Bypass mainland China'});
  await bypass.focus();
  await page.keyboard.press('Space');
  await expect(bypass).toBeChecked();
  await expect(applyButton(page)).toBeEnabled();
  await page.keyboard.press('ArrowDown');
  await expect(modes(page).getByRole('radio', {name: 'GFW list only'})).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(modes(page).getByRole('radio', {name: 'Global proxy'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(bypass).toBeChecked();
  await page.keyboard.press('ArrowUp');
  await expect(modes(page).getByRole('radio', {name: 'Global proxy'})).toBeChecked();
  // Open, the presets under it join the same group.
  await page.getByRole('button', {name: 'More templates'}).click();
  await modes(page).getByRole('radio', {name: 'Global proxy'}).focus();
  await page.keyboard.press('ArrowDown');
  await expect(single).toBeChecked();
  await expect(applyButton(page)).toBeDisabled();
});

test('applying a template removes routing includes and keeps the included file', async ({page}) => {
  const {api, main} = await backend(page);
  const included = (await api.config()).sources.find(source => source.id === 'src-rules')!;
  await page.goto('/#/rules?tab=list&view=simple');
  await choose(page, 'Global proxy');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Global proxy?'});
  const removed = dialog.getByRole('region', {name: 'Rule files no longer included'});
  await expect(removed.locator('code')).toHaveText('rules.dae');
  await expect(removed).toContainText('The files are kept on disk, but their rules no longer apply.');
  await dialog.getByRole('button', {name: 'Changes to config.dae'}).click();
  await expect(dialog.locator('[data-kind="del"]', {hasText: 'include rules.dae'})).toHaveCount(1);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Applied Global proxy to config.dae');
  expect((await main()).content).not.toContain('include rules.dae');
  expect((await api.config()).sources.find(source => source.id === included.id)?.content).toBe(included.content);
});

test('routing spread over several files is refused and nothing is written', async ({page}) => {
  const {api} = await backend(page);
  let writes = 0;
  page.on('request', request => {
    if (request.method() !== 'GET') writes++;
  });
  const config = await api.config();
  for (const source of config.sources) {
    if (source.kind === 'main') source.content = oneFile(source.content!);
    if (source.id === 'src-rules') source.content = 'routing {\n  fallback: direct\n}\n';
  }
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/rules?tab=list&view=simple');
  await expect(applyButton(page)).toHaveAccessibleDescription(/^Routing rules are spread over several files\./);
  await choose(page, 'Global proxy');
  await expect(applyButton(page)).toBeDisabled();
  expect(writes).toBe(0);
});

test('a file changed on disk after the dialog opened is refused rather than overwritten', async ({page}) => {
  const {main, write} = await backend(page);
  await write(oneFile);
  await page.goto('/#/rules?tab=list&view=simple');
  await choose(page, 'GFW list only');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply GFW list only?'});
  await expect(dialog).toBeVisible();
  await write(text => '# concurrent edit\n' + text);
  const refused = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await refused;
  await expect(page.locator('.rp-toast.negative')).toBeVisible();
  const saved = (await main()).content!;
  expect(saved).toContain('# concurrent edit');
  expect(saved).not.toContain('domain(geosite:gfw)');
});

test('on a phone the dialog content scrolls between a title and a footer that stay put', async ({page}) => {
  const {write} = await backend(page);
  await write(oneFile);
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/rules?tab=list&view=simple');
  await page.getByRole('button', {name: 'More templates'}).click();
  await choose(page, 'Groups by service and region');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Groups by service and region?'});
  await dialog.getByRole('button', {name: 'Changes to config.dae'}).click();
  const body = dialog.locator('.rp-dialog-body');
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  const title = dialog.getByRole('heading', {name: 'Apply Groups by service and region?'});
  await expect.poll(() => body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(body).toHaveAttribute('data-overflow', 'true');
  // The body is the only vertical scroller: the diff grows with its lines.
  const diff = dialog.getByRole('region', {name: 'Changes to config.dae'});
  expect(await diff.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  const before = {apply: await box(apply), title: await box(title)};
  expect(before.apply.y + before.apply.height).toBeLessThanOrEqual(844);
  await body.evaluate(el => el.scrollTo(0, el.scrollHeight));
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await box(apply)).toEqual(before.apply);
  expect(await box(title)).toEqual(before.title);
  // Nothing in the dialog widens the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('the view switch ends the toolbar row beside the rule count, in the same place in both views', async ({page}) => {
  await backend(page);
  await page.goto('/#/rules?tab=list&view=simple');
  const views = page.getByRole('radiogroup', {name: 'Rules view'});
  const simple = await box(views);
  const caption = await box(page.locator('.rp-toolbar > .rp-label').first());
  expect(Math.abs(simple.y + simple.height / 2 - (caption.y + caption.height / 2))).toBeLessThan(4);
  await views.getByText('Advanced', {exact: true}).click();
  await expect(page.getByRole('button', {name: 'Add rule'})).toBeVisible();
  expect(await box(views)).toEqual(simple);
});

test('the template list uses doona names and homebound creates its mainland group', async ({page}) => {
  const {main, write} = await backend(page);
  await write(oneFile);
  await page.goto('/#/rules?tab=list&view=simple');
  await page.getByRole('button', {name: 'More templates'}).click();
  for (const name of ['Single proxy group', 'Groups by service', 'Groups by service and region', 'Back to mainland China'])
    await expect(modes(page).getByRole('radio', {name, exact: true})).toBeVisible();
  await choose(page, 'Back to mainland China');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Back to mainland China?'});
  await expect(dialog.getByRole('region', {name: 'Groups to create'})).toContainText('cn');
  await expect(dialog.getByRole('region', {name: 'Groups to create'})).toContainText('Mainland China');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  const saved = (await main()).content!;
  expect(saved).toContain('# 🇨🇳 Mainland China\n  cn {');
  expect(saved).toContain('domain(geosite:cn) -> cn');
  expect(saved).toContain('dip(geoip:cn) -> cn');
  expect(saved).toContain('fallback: direct');
  await expect(modes(page).getByRole('radio', {name: 'Back to mainland China'})).toBeChecked();
  await expect(applyButton(page)).toBeDisabled();
});

for (const variant of [
  {lang: 'zh-CN', more: '更多模板', names: ['单一代理组', '按服务分组', '按服务与地区分组', '回国'], apply: '应用', group: '回国节点'},
  {lang: 'zh-TW', more: '更多範本', names: ['單一代理群組', '按服務分組', '按服務與地區分組', '回國'], apply: '套用', group: '回國節點'}
])
  test(`template names and generated group labels follow ${variant.lang}`, async ({page}) => {
    const {main, write} = await backend(page, variant.lang);
    await write(oneFile);
    await page.goto('/#/rules?tab=list&view=simple');
    await expect(page.getByRole('switch', {name: variant.lang === 'zh-CN' ? '屏蔽广告' : '封鎖廣告', exact: true})).not.toBeChecked();
    await page.getByRole('button', {name: variant.more}).click();
    for (const name of variant.names) await expect(page.getByRole('radio', {name, exact: true})).toBeVisible();
    const radio = page.getByRole('radio', {name: variant.names[3], exact: true});
    await page.getByRole('radiogroup').filter({has: radio}).getByText(variant.names[3], {exact: true}).click();
    await expect(radio).toBeChecked();
    await page.getByRole('button', {name: variant.apply, exact: true}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(variant.group);
    await dialog.getByRole('button', {name: variant.apply, exact: true}).click();
    await expect(dialog).toHaveCount(0);
    expect((await main()).content).toContain(`# 🇨🇳 ${variant.group}\n  cn {`);
  });

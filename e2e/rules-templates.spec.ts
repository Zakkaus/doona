import {test, type Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {ApiError} from '../src/api/error';
import {allGroupNames} from '../src/dae/sources';
import {writeTemplate} from '../src/dae/setup';
import {scanConfig} from '../src/dae/text';
import {box, expect} from './fixtures';

test.use({viewport: {width: 1440, height: 1000}});

// The demo backend served over HTTP, so a spec can change its files as another client would.
async function backend(page: Page) {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
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

test('a template replaces the routing of the one file that holds it', async ({page}) => {
  const {main, write} = await backend(page);
  await write(oneFile);
  await page.goto('/#/rules?tab=list&view=simple');
  // Custom routing selects no mode, and says what applying one replaces.
  await expect(page.getByRole('status')).toContainText('The current rules are custom; applying a mode replaces the top-level routing in config.dae.');
  await expect(modes(page).getByRole('radio', {checked: true})).toHaveCount(0);
  await expect(applyButton(page)).toBeDisabled();
  await choose(page, 'Bypass mainland China');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply Bypass mainland China?'});
  await expect(dialog).toContainText('Replaces the top-level routing in config.dae; DNS routing and the other files stay as they are.');
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
  await write(text => writeTemplate(text, 'bypass', defined));
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
  const split = dialog.getByRole('checkbox', {name: 'Also add DNS split'});
  await expect(split).toBeChecked();
  await dialog.getByRole('button', {name: 'Changes to config.dae'}).click();
  const diff = dialog.getByRole('region', {name: 'Changes to config.dae'});
  await expect(diff.locator('[data-kind="add"]', {hasText: 'qname(geosite:cn) -> alidns'})).toHaveCount(1);
  await dialog.getByText('Also add DNS split', {exact: true}).click();
  await expect(split).not.toBeChecked();
  await expect(diff.locator('[data-kind="add"]', {hasText: 'alidns'})).toHaveCount(0);
  await dialog.getByText('Also add DNS split', {exact: true}).click();
  // Validation is held, so the checkbox can be tried while the write runs: it keeps the choice the write holds.
  let release = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route('**/api/v1/config/validate', async route => {
    await held;
    await route.fallback();
  });
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(split).toBeDisabled();
  await dialog.getByText('Also add DNS split', {exact: true}).click({force: true});
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
  await write(text => writeTemplate(oneFile(text), 'mini', defined));
  await page.goto('/#/rules?tab=list&view=simple');
  // A detected preset under More templates opens it, so the selection is in view.
  const mini = modes(page).getByRole('radio', {name: 'ACL4SSR Mini'});
  await expect(mini).toBeChecked();
  await expect(mini).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(applyButton(page)).toBeDisabled();
  await page.getByRole('button', {name: 'More templates'}).click();
  await expect(mini).toBeHidden();
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
  await expect(mini).toBeChecked();
  await expect(applyButton(page)).toBeDisabled();
});

test('routing that pulls in or spreads over other files is refused and nothing is written', async ({page}) => {
  const {api} = await backend(page);
  let writes = 0;
  page.on('request', request => {
    if (request.method() !== 'GET') writes++;
  });
  await page.goto('/#/rules?tab=list&view=simple');
  // The reason is help text under Apply, which stays disabled whatever is chosen.
  await expect(applyButton(page)).toHaveAccessibleDescription('The routing in config.dae includes another file. Remove the include to apply a template.');
  await choose(page, 'Global proxy');
  await expect(applyButton(page)).toBeDisabled();
  const config = await api.config();
  for (const source of config.sources) {
    if (source.kind === 'main') source.content = oneFile(source.content!);
    if (source.id === 'src-rules') source.content = 'routing {\n  fallback: direct\n}\n';
  }
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.reload();
  await expect(applyButton(page)).toHaveAccessibleDescription(/^Routing rules are spread over several files\./);
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
  await choose(page, 'ACL4SSR Full');
  await applyButton(page).click();
  const dialog = page.getByRole('dialog', {name: 'Apply ACL4SSR Full?'});
  await dialog.getByRole('button', {name: 'Changes to config.dae'}).click();
  const body = dialog.locator('.rp-dialog-body');
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  const title = dialog.getByRole('heading', {name: 'Apply ACL4SSR Full?'});
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

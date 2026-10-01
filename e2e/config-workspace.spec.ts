import {expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';
import {sha256} from '../src/api/hash';
import {readSubscriptionEntries} from '../src/dae/subscriptions';
import {readGroupEntries} from '../src/dae/groups';

test.use({viewport: {width: 1440, height: 1000}});
test('modules are summaries with one link to each editor', async ({page}) => {
  await page.goto('/#/config');
  const modules = page.getByRole('tabpanel', {name: 'Modules'});
  await expect(modules.locator('.cm-content')).toHaveCount(0);
  for (const [section, path] of [
    ['global', 'settings'],
    ['node', 'nodes'],
    ['subscription', 'nodes'],
    ['group', 'policies'],
    ['dns', 'rules'],
    ['routing', 'rules']
  ]) {
    const card = modules.getByRole('region', {name: section, exact: true});
    await expect(card.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
    await expect(card.locator('.rp-light.info')).toHaveCount(0);
    await card.getByRole('link', {name: 'Open page'}).click();
    await expect(page).toHaveURL(new RegExp('#/' + path));
    if (section === 'global') await expect(page.getByRole('region', {name: 'Persistent global settings'})).toBeInViewport();
    await page.goBack();
  }
});
test('a located global jumps to its field, writes only the value, and survives navigation', async ({page}) => {
  const {api} = await mockBackend(page);
  const original = (await api.config()).sources[0];
  const line = original.content.slice(0, original.content.indexOf('tproxy_port:')).split('\n').length;
  await page.goto(`/#/config?tab=source&source=${original.id}&line=${line}`);
  await page.getByRole('link', {name: 'tproxy_port', exact: true}).click();
  const field = page.getByRole('textbox', {name: 'tproxy_port', exact: true});
  await expect(field).toBeFocused();
  await field.fill('65536');
  const card = page.getByRole('region', {name: 'Persistent global settings'});
  await expect(card.getByRole('button', {name: 'Write and reload'})).toBeDisabled();
  await field.fill('23456');
  await card.getByRole('button', {name: 'Write and reload'}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Global settings written');
  expect((await api.config()).sources[0].content).toBe(original.content.replace('tproxy_port: 12345', 'tproxy_port: 23456'));
  await page.reload();
  await expect(field).toHaveValue('23456');
  await expect(page.getByRole('region', {name: 'Temporary runtime overrides'})).toBeVisible();
});
test('source editing protects form values while allowing unsupported fields and comments', async ({page}) => {
  const {api} = await mockBackend(page);
  const original = (await api.config()).sources[0].content;
  await page.goto('/#/config?tab=source');
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.fill(original.replace('tproxy_port: 12345', 'tproxy_port: 23456'));
  await editor.press('ControlOrMeta+Home');
  await expect(editor).toContainText('tproxy_port: 12345');
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toHaveCount(0);
  await expect(page.locator('.rp-toast.info')).toContainText('Settings with a form');
  await editor.fill(original + '\n# retained raw text');
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toContainText('Current draft');
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toContainText('accepted configuration');
});
test('legacy validation links focus diagnostics beside the source at its line', async ({page}) => {
  const {api} = await mockBackend(page);
  const file = (await api.config()).sources.find(source => source.kind === 'main')!;
  const line = file.content.slice(0, file.content.indexOf('tproxy_port:')).split('\n').length;
  await page.goto(`/#/config?tab=validate&source=${file.id}&line=${line}`);
  await expect(page.getByRole('tab', {name: 'Config files', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', {name: 'Validation', exact: true})).toHaveCount(0);
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toBeFocused();
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toBeInViewport();
  await expect(page.locator('.cm-activeLine')).toContainText('tproxy_port:');
  await expect(page.getByRole('list', {name: 'Diagnostics'})).toHaveCount(1);
});
test('the merged workspace can validate a complete read-only configuration', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const config = await api.config();
  config.sources[0].writable = false;
  handlers['GET config'] = async () => config;
  await page.goto('/#/config?tab=validate');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Validation passed');
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toContainText('Current config file diagnostics');
});
test('global form edits includes without changing other text', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const config = await api.config();
  const file = config.sources[1];
  file.content = '# include\nglobal {\n  log_level: info # keep\n}\n';
  file.content_sha256 = await sha256(file.content);
  file.bytes = new TextEncoder().encode(file.content).length;
  handlers['GET config'] = async () => config;
  let written = '';
  handlers['PUT config/sources/' + file.id] = async route => {
    written = route.postDataJSON().content;
    return api.replaceConfigSource(config.sources[0].id, config.sources[0].content, `"${config.sources[0].content_sha256}"`);
  };
  await page.goto(`/#/settings?card=global&source=${file.id}&field=log_level`);
  const card = page.getByRole('region', {name: 'Persistent global settings'});
  await card.getByRole('button', {name: 'log_level'}).click();
  await page.getByRole('option', {name: 'debug', exact: true}).click();
  await card.getByRole('button', {name: 'Write and reload'}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Global settings written');
  expect(written).toBe(file.content.replace('info', 'debug'));
});
test('global drafts guard navigation and read-only sources disable the form', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const config = await api.config();
  handlers['GET config'] = async () => config;
  await page.goto('/#/settings?card=global');
  const field = page.getByRole('textbox', {name: 'tproxy_port', exact: true});
  await field.fill('23456');
  await page.getByRole('link', {name: 'Configuration', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  config.sources[0].writable = false;
  await page.goto('/#/settings?card=global');
  await expect(field).toBeDisabled();
});

test('located routing and DNS rules open their exact edit dialogs', async ({page}) => {
  const {api} = await mockBackend(page);
  const routing = (await api.rules()).rules.find(rule => rule.kind === 'rule' && rule.source)!;
  const dns = (await api.dnsRules()).request.find(rule => rule.kind === 'rule' && rule.source)!;
  for (const rule of [routing, dns]) {
    await page.goto(`/#/config?tab=source&source=${rule.source!.source_id}&line=${rule.source!.line}`);
    await page.getByRole('link', {name: rule.expression, exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`edit=${encodeURIComponent(rule.rule_id)}`));
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', {name: 'Cancel', exact: true}).click();
  }
});

test('located subscriptions open the existing editor and groups focus their card', async ({page}) => {
  const {api} = await mockBackend(page);
  const file = (await api.config()).sources[0];
  const subscription = readSubscriptionEntries(file.content)[0];
  await page.goto(`/#/config?tab=source&source=${file.id}&line=${subscription.line}`);
  await page.getByRole('link', {name: subscription.tag, exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Edit subscription ' + subscription.tag, exact: true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {name: 'Cancel', exact: true}).click();
  const group = readGroupEntries(file.content)[0];
  await page.goto(`/#/config?tab=source&source=${file.id}&line=${group.from + 1}`);
  await page.getByRole('link', {name: group.name, exact: true}).click();
  await expect(page).toHaveURL(/#\/policies\?group=/);
  await expect(page.getByRole('region', {name: group.name, exact: true})).toBeInViewport();
});

test('global form creates an absent section and keeps the existing file intact', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const config = await api.config();
  const file = config.sources[0];
  config.sources = [file];
  file.content = '# unchanged\nrouting { fallback: direct }\n';
  file.content_sha256 = await sha256(file.content);
  file.bytes = new TextEncoder().encode(file.content).length;
  handlers['GET config'] = async () => config;
  let written = '';
  handlers['PUT config/sources/' + file.id] = async route => {
    written = route.postDataJSON().content;
    const original = (await api.config()).sources[0];
    return api.replaceConfigSource(original.id, original.content, `"${original.content_sha256}"`);
  };
  await page.goto('/#/settings?card=global');
  await page.getByRole('textbox', {name: 'tproxy_port', exact: true}).fill('23456');
  await page.getByRole('button', {name: 'Write and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Global settings written');
  expect(written).toBe(file.content + 'global {\n  tproxy_port: 23456\n}\n');
});

test('global controls share widths and align beneath wrapped labels', async ({page}) => {
  await page.goto('/#/settings?card=global');
  await expect(page.getByRole('textbox', {name: 'tproxy_port', exact: true})).toBeEnabled();
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height: 900});
    await page.evaluate(() => document.fonts.ready);
    const fields = await page.locator('[data-setting]').evaluateAll(elements =>
      elements.map(element => {
        const outer = element.getBoundingClientRect();
        const control = element.querySelector('.rp-input, .rp-selectbtn')!.getBoundingClientRect();
        const label = element.querySelector('label')!;
        const range = document.createRange();
        range.selectNodeContents(label);
        return {row: outer.top, top: control.top, width: control.width, height: control.height, labelLines: range.getClientRects().length};
      })
    );
    if (width === 390) expect.soft(fields.every(field => field.labelLines === 1)).toBe(true);
    await expect.soft(page.locator('[data-setting] > .rp-field[style*="width"]')).toHaveCount(0);
    const notes = page.getByRole('region', {name: 'Temporary runtime overrides'}).locator('.rp-fieldgrid > .rp-label');
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all())
      expect
        .soft(await note.evaluate(element => element.getBoundingClientRect().width / element.parentElement!.getBoundingClientRect().width))
        .toBeGreaterThan(0.99);
    expect(Math.max(...fields.map(field => field.width)) - Math.min(...fields.map(field => field.width))).toBeLessThanOrEqual(1);
    for (const row of new Set(fields.map(field => field.row))) {
      const controls = fields.filter(field => field.row === row);
      expect(Math.max(...controls.map(field => field.top)) - Math.min(...controls.map(field => field.top))).toBeLessThanOrEqual(1);
      expect(new Set(controls.map(field => field.height)).size).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('bare routing includes protect targets while their conditions remain editable', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const config = await api.config();
  const file = config.sources.find(source => source.id === 'src-rules')!;
  const original = file.content + 'domain(example.org) -> direct\n';
  file.content = original;
  file.content_sha256 = await sha256(original);
  file.bytes = new TextEncoder().encode(original).length;
  file.line_count = original.trimEnd().split('\n').length;
  handlers['GET config'] = async () => config;
  await page.goto('/#/config?tab=source&source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill(original.replace('-> direct', '-> block'));
  await expect(page.locator('.rp-toast.info')).toContainText('Settings with a form');
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toHaveCount(0);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n# retained include comment');
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toBeEnabled();
});

for (const state of ['unavailable', 'loading', 'error'] as const) {
  test(`global settings block editing in the ${state} state`, async ({page}) => {
    const {capabilities, handlers} = await mockBackend(page);
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    if (state === 'unavailable') capabilities.resources.config.available = false;
    else
      handlers['GET config'] = async () => {
        if (state === 'loading') await pending;
        throw new ApiError(503, 'temporarily_unavailable', 'Config unavailable');
      };
    await page.goto('/#/settings?card=global');
    const card = page.getByRole('region', {name: 'Persistent global settings'});
    try {
      if (state === 'unavailable') {
        await expect(page.getByRole('region', {name: 'Temporary runtime overrides'})).toBeVisible();
        await expect(card).toHaveCount(0);
      } else {
        await expect(card.getByRole('button', {name: 'Config file', exact: true})).toBeDisabled();
        await expect(card.getByRole('textbox', {name: 'tproxy_port', exact: true})).toBeDisabled();
        if (state === 'error') await expect(card).toContainText('Backend temporarily unavailable');
      }
    } finally {
      release();
    }
  });
}
for (const mode of ['validation', 'restart'] as const) {
  test(`global saves explain ${mode} failures and count only errors`, async ({page}) => {
    const {api, handlers} = await mockBackend(page);
    const diagnostic = {
      level: 'error',
      source_id: 'src-main',
      line: null,
      column: null,
      span: null,
      code: mode === 'restart' ? 'restart-required' : 'invalid',
      message: 'Change refused'
    };
    const diagnostics = [diagnostic, {...diagnostic, level: 'warning'}, {...diagnostic, level: 'info'}];
    let validations = 0;
    handlers['POST config/validate'] = async request => {
      const result = await api.validateConfig(request.postDataJSON());
      return mode === 'validation' && ++validations > 1 ? {...result, valid: false, diagnostics} : result;
    };
    handlers['PUT config/sources/src-main'] = async () => {
      throw new ApiError(422, 'unsupported_value', 'Configuration validation failed', null, {diagnostics});
    };
    await page.goto('/#/settings?card=global');
    const card = page.getByRole('region', {name: 'Persistent global settings'});
    await card.getByRole('textbox', {name: 'tproxy_port', exact: true}).fill('23456');
    await card.getByRole('button', {name: 'Write and reload'}).click();
    await expect(card).toContainText(mode === 'restart' ? '1 setting takes effect only after a restart; nothing written' : 'Validation found 1 error');
  });
}
test('diagnostic source actions show a button and open the named file', async ({page}) => {
  await mockBackend(page, {faults: true});
  await page.goto('/#/config?tab=validate');
  const action = page
    .getByRole('region', {name: 'Diagnostics', exact: true})
    .getByRole('button', {name: /Open.*rules.dae/})
    .first();
  await expect(action).toBeVisible();
  await expect(action).not.toHaveClass(/quiet/);
  await expect(action).toContainText('Open');
  await action.click();
  await expect(page).toHaveURL(/source=src-rules/);
});

for (const width of [390, 1440]) {
  test(`accepted diagnostics retain focus and provenance with redacted sources at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    const {api, handlers} = await mockBackend(page, {faults: true});
    const config = await api.config();
    config.sources[0].content = '<redacted>';
    handlers['GET config'] = async () => config;
    await page.goto('/#/config?tab=validate');
    const panel = page.getByRole('region', {name: 'Diagnostics', exact: true});
    await expect(panel).toBeFocused();
    await expect(panel).toBeInViewport();
    await expect(panel).toContainText('accepted configuration');
    await expect(panel.getByRole('listitem').first()).toBeVisible();
    await expect(panel).not.toContainText('Current config file diagnostics');
  });
}

test('invalid stored hex ports remain visible and can be corrected', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const config = await api.config();
  const file = config.sources[0];
  file.content = file.content.replace('tproxy_port: 12345', 'tproxy_port: 0x10');
  file.content_sha256 = await sha256(file.content);
  file.bytes = new TextEncoder().encode(file.content).length;
  handlers['GET config'] = async () => config;
  await page.goto('/#/settings?card=global');
  const field = page.getByRole('textbox', {name: 'tproxy_port', exact: true});
  await expect(field).toHaveValue('0x10');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('16');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', {name: 'Write and reload'})).toBeEnabled();
});

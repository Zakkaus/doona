import type {Page, Route} from '@playwright/test';
import {ApiError} from '../src/api/error';
import type {createMockApi} from '../mock';
import {downloadText, expect, expectLoadFailures, faults, test, fulfillAccepted, mockBackend, box} from './fixtures';
import {sha256} from '../src/api/hash';
import {readSubscriptionEntries} from '../src/dae/subscriptions';
import {readGroupEntries} from '../src/dae/groups';

test.use({viewport: {width: 1440, height: 1000}});

for (const scenario of ['unique', 'duplicate', 'node-tag'] as const)
  test(`located subscription links resolve opaque provider IDs only for a unique tag (${scenario})`, async ({page}) => {
    const {api, handlers} = await mockBackend(page);
    const ambiguous = scenario === 'duplicate';
    handlers['GET providers'] = async () => {
      const list = await api.providers();
      const providers = list.providers.map(provider =>
        provider.name === 'harbor' ? {...provider, id: 'provider-a', name: scenario === 'node-tag' ? 'opaque-name' : provider.name} : provider
      );
      if (ambiguous) providers.push({...providers.find(provider => provider.name === 'harbor')!, id: 'provider-b'});
      return {...list, providers};
    };
    if (scenario === 'node-tag')
      handlers['GET nodes'] = async () => {
        const list = await api.nodes({limit: 1000});
        return {...list, nodes: list.nodes.map(node => (node.subscription_tag === 'harbor' ? {...node, provider_id: 'provider-a'} : node))};
      };
    const file = (await api.config()).sources.find(source => source.kind === 'main')!;
    const entry = readSubscriptionEntries(file.content).find(entry => entry.tag === 'harbor')!;
    await page.goto(`/#/config?tab=source&source=${file.id}&line=${entry.line}`);
    await page.getByRole('link', {name: entry.tag, exact: true}).click();
    if (ambiguous) {
      await expect(page.getByRole('button', {name: 'Add subscription', exact: true})).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/editSubscriptionTag=harbor/);
    } else {
      const dialog = page.getByRole('dialog', {name: 'Edit subscription harbor', exact: true});
      await expect(dialog.getByRole('textbox', {name: 'Subscription URL', exact: true})).toHaveValue(entry.url);
      await expect(page).not.toHaveURL(/editSubscription/);
    }
  });

test('the removed quick setup address opens the default tab', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const tabs = page.getByRole('tablist', {name: 'Configuration'});
  await expect(tabs.getByRole('tab')).toHaveText(['Modules', 'Global settings', 'Config files', 'Backups and revisions']);
  await expect(tabs.getByRole('tab', {name: 'Modules'})).toHaveAttribute('aria-selected', 'true');
});

test('configuration sources list with the main source open, read-only ones cannot be edited', async ({page}) => {
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content[aria-label="/etc/honk/config.dae"]')).toContainText('tproxy_port: 12345');
  await expect(page.locator('.cm-content[aria-label="/etc/honk/config.dae"]')).toHaveAttribute('contenteditable', 'true');
  const picker = page.getByRole('button', {name: /Config file/});
  await expect(picker).toContainText('/etc/honk/config.dae');
  await picker.click();
  await expect(page.getByRole('option')).toHaveCount(5);
  await page.getByRole('option', {name: /harbor\.dae/}).click();
  await expect(page).toHaveURL(/source=src-harbor$/);
  await expect(page.locator('.cm-content[aria-label="/var/lib/honk/subscriptions/harbor.dae"]')).toContainText('redacted');
  await expect(page.locator('.cm-content[aria-label="/var/lib/honk/subscriptions/harbor.dae"]')).toHaveAttribute('contenteditable', 'false');
});

test('a generated source names why it is read-only and offers no validation', async ({page}) => {
  await page.goto('/#/config?tab=source&source=src-generated');
  await expect(page.locator('.cm-content[aria-label="/var/lib/honk/generated/backup.dae"]')).toContainText('backup');
  const toolbar = page.locator('.rp-toolbar').nth(1);
  await expect(toolbar.locator('.rp-badge')).toHaveText(['Generated']);
  // The line under the text says why, so the badge carries no help that would repeat it.
  await expect(toolbar.getByRole('button', {name: 'About Generated', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Validate', exact: true})).toHaveCount(0);
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  // What the file is and what can be done with it is said under the text.
  await expect(page.locator('.rp-card').first()).toContainText('The engine generates this file and overwrites it when it regenerates');
  await expect(page.getByRole('region', {name: '/var/lib/honk/generated/backup.dae'}).getByRole('heading')).toHaveText('Editor');
  await page.goto('/#/config?tab=source&source=src-main');
  await expect(page.getByRole('button', {name: 'Validate', exact: true})).toBeVisible();
  await expect(page.locator('.rp-toolbar').nth(1).locator('.rp-badge')).toHaveCount(0);
  await expect(page.locator('.rp-card').first()).toContainText('Click the text to edit; validate before applying.');
});

test('switching sources discards the draft after confirmation', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toBeVisible();
  const original = await editor.innerText();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('# unsaved source note');
  await expect(editor).toContainText('# unsaved source note');
  const picker = page.getByRole('button', {name: /Config file/});
  await picker.click();
  await page.getByRole('option', {name: /\/etc\/honk\/config\.dae/}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('.cm-content[aria-label="/etc/honk/config.dae"]')).toBeVisible();
  await picker.click();
  await page.getByRole('option', {name: /\/etc\/honk\/rules\.dae/}).click();
  await expect(editor).toHaveText(original, {useInnerText: true});
  await expect(page.locator('.rp-badge', {hasText: 'Not applied'})).toHaveCount(0);
});

test('editing validates, shows diagnostics on errors, and saves through a reload', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('unknown_section {}');
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  const diagnostics = page.getByRole('list', {name: 'Diagnostics'});
  await expect(diagnostics.getByRole('listitem')).toHaveCount(1);
  await expect(diagnostics).toContainText('Unknown section "unknown_section"');
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  // The bar is as wide as the editor and the list opens inside it; the action keeps clear of the list's edge and
  // scrollbar, centred on its row.
  const geometry = await diagnostics.evaluate(list => {
    const bar = list.closest('[role=region]')!.getBoundingClientRect();
    const editor = document.querySelector('.rp-source-card .cm-editor')!.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    const row = list.querySelector('[role=listitem]')!.getBoundingClientRect();
    const action = list.querySelector('[role=listitem] button[aria-label^="Go to line"]')!.getBoundingClientRect();
    const edge = box.left + list.clientLeft + list.clientWidth;
    return {
      widths: [bar.left - editor.left, bar.right - editor.right].map(Math.abs),
      gap: bar.bottom - box.bottom,
      room: edge - action.right,
      offset: Math.abs(action.top + action.bottom - row.top - row.bottom) / 2
    };
  });
  for (const width of geometry.widths) expect(width).toBeLessThanOrEqual(0.5);
  expect(geometry.gap).toBeGreaterThanOrEqual(0);
  expect(geometry.gap).toBeLessThanOrEqual(1);
  expect(geometry.room).toBeGreaterThanOrEqual(8);
  expect(geometry.offset).toBeLessThanOrEqual(1);
  await page.keyboard.press('ControlOrMeta+Home');
  await diagnostics.getByRole('button', {name: /^Go to line/}).click();
  await expect(page.locator('.cm-activeLine')).toContainText('unknown_section');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  await page.keyboard.type('# ');
  await expect(page.locator('.rp-badge', {hasText: 'Not applied'})).toBeVisible();
  await expect(page.locator('.rp-card').first()).toContainText('Reloading or closing the page loses the changes');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
  await expect(page.locator('.rp-badge', {hasText: 'Not applied'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Apply', exact: true})).toHaveCount(0);
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toContainText('# unknown_section {}');
  await expect(page.locator('.rp-toolbar').first()).toContainText('41');
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('3 lines,');
});

test('a writable source edits in place, and Cancel restores the loaded text with nothing left to undo', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  const original = await editor.innerText();
  const unsaved = page.locator('.rp-badge', {hasText: 'Not applied'});
  const save = page.getByRole('button', {name: 'Apply', exact: true});
  const cancel = page.getByRole('button', {name: 'Cancel', exact: true});
  await expect(save).toHaveCount(0);
  await expect(cancel).toHaveCount(0);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('# typed');
  await expect(unsaved).toBeVisible();
  await expect(save).toBeEnabled();
  // Typing back to the loaded text leaves nothing to save.
  for (let i = 0; i < '# typed'.length; i++) await page.keyboard.press('Backspace');
  await expect(unsaved).toHaveCount(0);
  await expect(save).toHaveCount(0);
  await page.keyboard.type('# dropped');
  await cancel.click();
  await expect(editor).toHaveText(original, {useInnerText: true});
  await expect(unsaved).toHaveCount(0);
  // The cancelled edits are gone from the undo history too.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(editor).toHaveText(original, {useInnerText: true});
  await expect(unsaved).toHaveCount(0);
});

const readOnlyNotice = (page: Page) => page.locator('.rp-toast.info', {hasText: 'This file is read-only'});
const nextFrame = (page: Page) => page.evaluate(() => new Promise(requestAnimationFrame));

test('a read-only source explains itself once per visit when typed into, and keeps its text', async ({page}) => {
  await page.goto('/#/config?tab=source&source=src-generated');
  const editor = page.locator('.cm-content[aria-label="/var/lib/honk/generated/backup.dae"]');
  await expect(editor).toContainText('backup');
  const original = await editor.innerText();
  await editor.click();
  // No caret or active line, so it does not look editable; a mouse click alone is not an attempt.
  await expect(page.locator('.cm-cursorLayer')).toHaveCount(0);
  await expect(page.locator('.cm-activeLine')).toHaveCount(0);
  await nextFrame(page);
  await expect(page.locator('.rp-toast')).toHaveCount(0);
  await page.keyboard.type('abc');
  const notice = readOnlyNotice(page);
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('The engine generates this file');
  await expect(editor).toHaveText(original, {useInnerText: true});
  await notice.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(page.locator('.rp-toast')).toHaveCount(0);
  await editor.click();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await nextFrame(page);
  await expect(page.locator('.rp-toast')).toHaveCount(0);
  await expect(editor).toHaveText(original, {useInnerText: true});
  // Another source and back is a new visit, so the first attempt explains again.
  const picker = page.getByRole('button', {name: /Config file/});
  await picker.click();
  await page.getByRole('option', {name: /\/etc\/honk\/config\.dae/}).click();
  await picker.click();
  await page.getByRole('option', {name: /backup\.dae/}).click();
  await editor.click();
  await page.keyboard.type('x');
  await expect(readOnlyNotice(page)).toHaveCount(1);
});

test('paste into a read-only source is refused with the read-only notice', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/config?tab=source&source=src-generated');
  const editor = page.locator('.cm-content[aria-label="/var/lib/honk/generated/backup.dae"]');
  await expect(editor).toContainText('backup');
  const original = await editor.innerText();
  await editor.click();
  await page.evaluate(() => navigator.clipboard.writeText('pasted text'));
  await page.keyboard.press('ControlOrMeta+V');
  await expect(readOnlyNotice(page)).toContainText('The engine generates this file');
  await expect(editor).toHaveText(original, {useInnerText: true});
});

test.describe(() => {
  test.use({storage: faults});
  test('the diagnostics summary lists accepted diagnostics and opens the source at the line', async ({page}) => {
    await page.goto('/#/config?tab=validate');
    const panel = page.getByRole('region', {name: 'Diagnostics', exact: true});
    await expect(panel).toBeFocused();
    await expect(panel).toContainText('Diagnostics kept for the accepted configuration');
    const rows = page.getByRole('list', {name: 'Diagnostics'}).getByRole('listitem');
    // Without errors the summary stays shut until opened.
    await expect(rows).toHaveCount(0);
    await panel.getByRole('button', {name: /Errors 0/}).click();
    await expect(rows).toHaveCount(3);
    await page.getByRole('button', {name: 'Validate', exact: true}).click();
    await expect(panel).toContainText('No diagnostics');
    await expect(rows).toHaveCount(0);
    await page.reload();
    await panel.getByRole('button', {name: /Errors 0/}).click();

    await page.getByRole('button', {name: 'Open config file: rules.dae:3', exact: true}).click();
    await expect(page).toHaveURL(/tab=source&source=src-rules&line=3$/);
    await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toBeVisible();
    // An editable source marks the line with its caret; a read-only one with the focus line.
    await expect(page.locator('.cm-activeLine')).toContainText('mac(aa:bb:cc:dd:ee:ff)');
  });
});

test('identical diagnostics share one row with their count, and a known code keeps the backend words as detail', async ({page}) => {
  const {api} = await mockBackend(page);
  const config = await api.config();
  const duplicate = {
    level: 'warning',
    source_id: 'src-main',
    line: null,
    column: null,
    span: null,
    code: 'duplicate-subscription-entry',
    message: 'duplicate endpoint identity; retaining the first usable entry'
  } as const;
  config.diagnostics = [duplicate, duplicate, duplicate];
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=validate');

  await page
    .getByRole('region', {name: 'Diagnostics', exact: true})
    .getByRole('button', {name: /Warnings 3/})
    .click();
  const rows = page.getByRole('list', {name: 'Diagnostics'}).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Duplicate node in the subscription; the first usable entry is kept (3 times)');
  const backend = rows.getByText('duplicate endpoint identity; retaining the first usable entry', {exact: true});
  await expect(backend).toBeHidden();
  await rows.getByRole('button', {name: 'Details', exact: true}).click();
  await expect(backend).toBeVisible();
  await page.goto('/#/config?tab=source&source=src-main');
  await expect(page.getByRole('list', {name: 'Diagnostics'}).getByRole('listitem')).toHaveCount(1);
});

test('the level filter narrows the diagnostics list, each level counted', async ({page}) => {
  const {api} = await mockBackend(page);
  const config = await api.config();
  const note = (level: 'error' | 'warning' | 'info', line: number, message: string) =>
    ({level, source_id: 'src-main', line, column: 1, span: null, code: 'other', message}) as const;
  const repeated = note('error', 2, 'Repeated error');
  config.diagnostics = [repeated, repeated, note('error', 3, 'Single error'), note('warning', 4, 'A warning'), note('info', 5, 'A note')];
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=source&source=src-main');
  const panel = page.getByRole('region', {name: 'Diagnostics', exact: true});
  const rows = page.getByRole('list', {name: 'Diagnostics'}).getByRole('listitem');
  // Errors open the list, under the filter at All.
  await expect(rows).toHaveCount(4);
  const filter = panel.getByRole('radiogroup', {name: 'Level'});
  const level = (name: string) => filter.getByRole('radio', {name, exact: true});
  await expect(level('All 5')).toHaveAttribute('aria-checked', 'true');
  await expect(level('Errors 3')).toBeVisible();
  await expect(level('Warnings 1')).toBeVisible();
  await expect(level('Info 1')).toBeVisible();
  expect(await filter.evaluate(element => element.getBoundingClientRect().height)).toBe(40);
  await level('Errors 3').click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Repeated error');
  await expect(rows.last()).toContainText('Single error');
  await level('Warnings 1').click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('A warning');
  await level('Info 1').click();
  await expect(rows).toHaveText([/A note/]);
  await level('All 5').click();
  await expect(rows).toHaveCount(4);
});

test.describe('without configuration readback', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('the page is hidden from navigation and says so when opened', async ({page}) => {
    await page.goto('/#/config');
    await expect(page.locator('.rp-nav[href="#/config"]')).toHaveAttribute('data-unavailable', '');
    await expect(page.locator('.rp-content')).toContainText('This backend does not provide this page');
  });
});

// An include is validated by the replacement itself, in its full source set; a refusal writes nothing.
test('validation refusal keeps the draft and never replaces the source', async ({page}) => {
  const {api} = await mockBackend(page);
  const original = (await api.config()).sources.find(source => source.id === 'src-rules')!.content;
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill(original + '\nunknown_section {}\n');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toContainText('unknown_section {}');
  expect((await api.config()).sources.find(source => source.id === 'src-rules')!.content).toBe(original);
});

test('a source over the advertised body limit is refused before anything is sent, naming the limit', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.limits.max_json_body_bytes = 200;
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# ' + 'grown past the limit '.repeat(20) + '\n');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('larger than the backend accepts. Limit: 200 bytes');
  expect(writes).toEqual([]);
});

test('a 413 on a config write names the tighter advertised limit', async ({page}) => {
  await mockBackend(page);
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({
      status: 413,
      json: {request_id: 'config-test', error: {code: 'request_too_large', message: 'Request body exceeds its limit', details: null}}
    })
  );
  expectLoadFailures(page, /\/config\/sources\//);
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# refused by the backend\n');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Limit: 65,536 bytes');
});

test('source application works without the optional full validation endpoint', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.resources.config_validate.available = false;
  let validations = 0;
  page.on('request', request => {
    if (request.url().endsWith('/config/validate')) validations++;
  });
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# without dry run\n');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  await expect(editor).toContainText('# without dry run');
  expect(validations).toBe(0);
});

test('incomplete sources cannot be transformed by rule edits', async ({page}) => {
  const {api} = await mockBackend(page);
  const config = await api.config();
  for (const source of config.sources) source.content = source.content.replace('direct', 'redacted');
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  let mutations = 0;
  page.on('request', request => {
    if (request.method() !== 'GET') mutations++;
  });
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.rp-toolbar').nth(1).locator('.rp-badge')).toHaveText(['Redacted']);
  await expect(page.locator('.rp-card').first()).toContainText('This file contains redacted listener secrets and cannot be edited here. Edit it on the host.');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', {name: 'Validate', exact: true})).toBeDisabled();
  await page.goto('/#/rules?tab=list&view=advanced');
  await page.getByRole('button', {name: 'Remove rule', exact: true, disabled: false}).first().click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('incomplete');
  expect(mutations).toBe(0);
});

// The main source is checked before replacement; a discarded draft must not turn into a write afterwards.
test('leaving the editor aborts validation before any replacement', async ({page}) => {
  const {api} = await mockBackend(page);
  let release!: () => void;
  const hold = new Promise<void>(resolve => {
    release = resolve;
  });
  let settled!: () => void;
  const handled = new Promise<void>(resolve => {
    settled = resolve;
  });
  await page.route('**/api/v1/config/validate', async route => {
    await hold;
    await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
    settled();
  });
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'PUT') writes++;
  });
  await page.goto('/#/config?source=src-main');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n# cancelled draft\n');
  const validating = page.waitForRequest('**/config/validate');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await validating;
  await page.locator('.rp-nav[href="#/settings"]').click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page.locator('.rp-nav[href="#/settings"]')).toHaveAttribute('aria-current', 'page');
  release();
  await handled;
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  expect(writes).toBe(0);
});

test('a file changed on disk under a draft blocks saving until the draft is kept over it', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# local draft\n');
  const source = (await api.config()).sources.find(source => source.id === 'src-rules')!;
  await api.replaceConfigSource(source.id, source.content + '\n# concurrent edit\n', `\"${source.content_sha256}\"`);
  // The concurrent edit becomes the accepted text once its reload completes.
  await expect.poll(async () => (await api.config()).sources.find(item => item.id === source.id)!.content).toContain('# concurrent edit');
  // The save carries the digest the draft began from and is refused; the refetch shows the change, and the draft
  // stays with saving held for the person.
  const apply = page.getByRole('button', {name: 'Apply', exact: true});
  const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await apply.click();
  await rejected;
  const conflict = page.getByRole('alert').filter({hasText: 'changed on disk while you were editing'});
  await expect(conflict).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect(editor).toContainText('# local draft');
  await expect(editor).not.toContainText('# concurrent edit');
  await conflict.getByRole('button', {name: 'Keep changes', exact: true}).click();
  await expect(conflict).toHaveCount(0);
  await apply.click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  const saved = (await api.config()).sources.find(item => item.id === source.id)!.content!;
  expect(saved).toContain('# local draft');
  expect(saved).not.toContain('# concurrent edit');
});

test('rule writes require a stable source ID even when the display path matches', async ({page}) => {
  const {api} = await mockBackend(page);
  const rules = await api.rules();
  for (const rule of rules.rules) if (rule.source) rule.source.source_id = 'unknown-source';
  await page.route('**/api/v1/rules', route => route.fulfill({json: rules}));
  await page.goto('/#/rules?tab=list&view=advanced');
  const add = page.getByRole('button', {name: 'Add rule', exact: true});
  await expect(add).toBeDisabled();
  const reason = 'No rule is in a file doona can write, so there is no place to insert.';
  await expect(add).toHaveAccessibleDescription(reason);
  await page.mouse.move(0, 0);
  await add.locator('..').hover();
  await expect(page.getByRole('tooltip')).toHaveText(reason);
  // Remove stays in each row, disabled with the reason, rather than disappearing.
  const remove = page.getByRole('button', {name: 'Remove rule', exact: true});
  await expect(remove.first()).toHaveAccessibleDescription("Cannot locate this rule's line in its config file; it cannot be edited here");
  await expect(page.getByRole('button', {name: 'Remove rule', exact: true, disabled: false})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Open config file', exact: true})).toHaveCount(0);
});

test('the dns and routing module cards open their rule lists', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/config');
  const modules = page.getByRole('tabpanel', {name: 'Modules'});
  await modules.getByRole('region', {name: 'dns', exact: true}).getByRole('link', {name: 'Open page', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=dns$/);
  await expect(page.getByRole('tab', {name: 'DNS rules', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await modules.getByRole('region', {name: 'routing', exact: true}).first().getByRole('link', {name: 'Open page', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list$/);
  await expect(page.getByRole('tab', {name: 'Routing rules', exact: true})).toHaveAttribute('aria-selected', 'true');
});

test('code scrolled sideways passes under the line numbers', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/config?tab=source&source=src-rules');
  const routing = page.getByRole('region', {name: '/etc/honk/rules.dae', exact: true});
  await routing.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(`\n# ${'long.'.repeat(40)}example.org`);
  const gutter = routing.locator('.cm-gutters');
  // Clear of the phone's bottom bar, whose translucent surface shows the scrolled code behind it. The comparison leaves
  // out the editor's rounded border, whose anti-aliasing can differ by a shade between two captures.
  await gutter.evaluate(element => element.scrollIntoView({block: 'center'}));
  const rect = await box(gutter);
  const clip = {x: rect.x + 3, y: rect.y + 3, width: rect.width - 6, height: rect.height - 6};
  const before = await page.screenshot({clip});
  await routing.locator('.cm-scroller').evaluate(scroller => (scroller.scrollLeft = 120));
  expect(await page.screenshot({clip})).toEqual(before);
});

test('explicit include validation sends the main-first set with source paths', async ({page}) => {
  const {api} = await mockBackend(page);
  const config = await api.config();
  config.sources.reverse();
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# candidate include\n');
  const request = page.waitForRequest('**/config/validate');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  const submitted = (await request).postDataJSON();
  expect(submitted.sources[0]).toMatchObject({id: 'src-main', path: '/etc/honk/config.dae'});
  expect(submitted.sources.find((source: {id: string}) => source.id === 'src-rules')).toMatchObject({
    path: '/etc/honk/rules.dae',
    content: expect.stringContaining('# candidate include')
  });
});

test('rejected saves show cross-source diagnostics without marking the edited file', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  expectLoadFailures(page, /\/config\/sources\//);
  capabilities.resources.config_validate.available = false;
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({
      status: 422,
      json: {
        request_id: 'cross-source',
        error: {
          code: 'validation_failed',
          message: 'Invalid configuration',
          details: {
            diagnostics: [{level: 'error', source_id: 'src-main', line: 2, column: 1, span: null, code: 'invalid', message: 'Error in main source'}]
          }
        }
      }
    })
  );
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# rejected\n');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  const diagnostics = page.getByRole('list', {name: 'Diagnostics'});
  await expect(diagnostics).toContainText('config.dae');
  await expect(diagnostics).toContainText('Error in main source');
  await expect(editor.locator('.cm-diag-line-error')).toHaveCount(0);
  await diagnostics.getByRole('button', {name: /^Open config file: config\.dae/}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/source=src-main.*line=2/);
});

test('redacted includes do not disable main validation or background diagnostics', async ({page}) => {
  const {api} = await mockBackend(page);
  const config = await api.config();
  const include = config.sources.find(source => source.kind === 'include')!;
  include.content = include.content.replace('direct', 'redacted');
  include.path = '<redacted>';
  include.writable = false;
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=source');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Validation passed');
  const editor = page.locator('.cm-content');
  await editor.fill(config.sources.find(source => source.kind === 'main')!.content + '\nunknown_section {}\n');
  await expect(page.getByRole('list', {name: 'Diagnostics'})).toContainText('Unknown section "unknown_section"');
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
});

test('source redaction does not certify exports or diagnose the redacted include', async ({page}) => {
  const {api} = await mockBackend(page);
  const config = await api.config();
  config.secrets_redacted = true;
  const main = config.sources.find(source => source.kind === 'main')!;
  main.path = '<redacted>';
  const include = config.sources.find(source => source.kind === 'include')!;
  include.path = '<redacted>';
  include.content = include.content.replace('direct', 'redacted');
  include.writable = false;
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.rp-content')).toContainText('Listener secret values are redacted');
  await expect(page.locator('.rp-content')).toContainText('Exports preserve the displayed file bytes and may contain credentials');
  await expect(page.getByRole('button', {name: 'About Export', exact: true})).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download source file', exact: true}).click();
  expect(await downloadText(await downloading)).toBe(main.content);
  await page.getByRole('button', {name: /Config file/}).click();
  await page.getByRole('option', {name: /Include src-rule/}).click();
  await expect(page.locator('.rp-content')).toContainText('The backend does not accept writes to this file, so it can only be viewed.');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', {name: 'Validate', exact: true})).toBeDisabled();
});

test('configuration diagnostics wrap on phones', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.setViewportSize({width: 390, height: 844});
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  const message = 'duplicate endpoint identity; retaining the first usable entry ' + 'identifier'.repeat(20);
  config.diagnostics = [{level: 'warning', source_id: main.id, line: null, column: null, span: null, code: 'duplicate', message}];
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/config?tab=source');
  await page
    .getByRole('region', {name: 'Diagnostics', exact: true})
    .getByRole('button', {name: /Warnings 1/})
    .click();
  const diagnostic = page.getByRole('list', {name: 'Diagnostics'}).getByText(`Backend message: ${message}`);
  await expect(diagnostic).toBeVisible();
  expect(await diagnostic.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('a validation run gives way to the accepted diagnostics after a reload', async ({page}) => {
  const {api, capabilities} = await mockBackend(page);
  capabilities.resources.events.available = true;
  let changed!: () => void;
  const generation = new Promise<void>(resolve => {
    changed = resolve;
  });
  await page.route('**/api/v1/events**', async route => {
    await generation;
    await route.fulfill({contentType: 'text/event-stream', body: 'event: generation.changed\ndata: {}\n\n'});
  });
  // The accepted configuration and a validation each have a diagnostic, so the summary names which one it shows.
  await page.route('**/api/v1/config', async route => {
    const accepted = await api.config();
    accepted.diagnostics = [{level: 'warning', source_id: 'src-main', line: null, column: null, span: null, code: 'duplicate', message: 'Accepted'}];
    await route.fulfill({json: accepted});
  });
  await page.route('**/api/v1/config/validate', async route => {
    const result = await api.validateConfig(route.request().postDataJSON());
    const warning = {level: 'warning', source_id: 'src-main', line: null, column: null, span: null, code: 'duplicate', message: 'Checked'} as const;
    await route.fulfill({json: {...result, diagnostics: [warning]}});
  });
  await page.goto('/#/config?tab=validate');
  const panel = page.getByRole('region', {name: 'Diagnostics', exact: true});
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  await expect(panel).toContainText('Current config file diagnostics');
  // Another client writes the file; the reload arrives while this tab is open.
  const before = await api.config();
  const source = before.sources.find(item => item.id === 'src-rules')!;
  await api.replaceConfigSource(source.id, source.content + '\n# elsewhere\n', `"${source.content_sha256}"`);
  await expect.poll(async () => (await api.config()).generation_id).not.toBe(before.generation_id);
  changed();
  await expect(panel).toContainText('Diagnostics kept for the accepted configuration');
  await expect(panel).not.toContainText('Current config file diagnostics');
});

const restartRefusal = {
  request_id: 'restart',
  error: {
    code: 'unsupported_value',
    message: 'Configuration validation failed',
    details: {
      diagnostics: [
        {
          level: 'error',
          source_id: 'src-rules',
          line: null,
          column: null,
          span: null,
          code: 'restart-required',
          message: 'Changing global.log_level requires restarting honk'
        }
      ]
    }
  }
};

test('a restart-only change is refused with the setting named, and the next write goes through', async ({page}) => {
  await mockBackend(page);
  expectLoadFailures(page, /\/config\/sources\//);
  let refused = false;
  await page.route('**/api/v1/config/sources/*', route => {
    if (refused) return route.fallback();
    refused = true;
    return route.fulfill({status: 422, json: restartRefusal});
  });
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# restart draft\n');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('1 setting takes effect only after a restart; nothing written');
  await expect(page.getByRole('list', {name: 'Diagnostics'})).toContainText('global.log_level');
  const notice = page.getByRole('alert').filter({hasText: '1 setting needs a restart'});
  await expect(notice).toContainText('global.log_level');
  await expect(notice).toContainText('Nothing was written');
  await expect(notice).toBeFocused();
  await expect(notice).toContainText('other init systems');
  await expect(notice).toContainText('systemctl restart honk-core');
  await expect(notice.getByRole('link', {name: /Reload and restart/})).toHaveAttribute('href', /install\.html#reload-and-restart$/);
  await expect(editor).toContainText('# restart draft');
  await editor.fill((await editor.innerText()) + '\n# revised draft\n');
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('list', {name: 'Diagnostics'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
});

test('a file ahead of the running configuration is explained when the refusal repeats', async ({page}) => {
  await mockBackend(page);
  expectLoadFailures(page, /\/config\/sources\//);
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({status: 412, json: {request_id: 'ahead', error: {code: 'stale_revision', message: 'Source changed on disk', details: null}}})
  );
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# ahead draft\n');
  const apply = page.getByRole('button', {name: 'Apply', exact: true});
  await apply.click();
  await expect(page.locator('.rp-toast.negative')).toContainText('changed');
  await apply.click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'not the running configuration'})).toContainText('Reload honk to apply the file');
  await expect(editor).toContainText('# ahead draft');
});

test('a reload refused after the write says the file was written but not applied', async ({page}) => {
  await mockBackend(page);
  const href = '/api/v1/operations/op-rejected';
  await page.route('**/api/v1/config/sources/*', route =>
    route.fulfill({
      status: 202,
      headers: {'Retry-After': '1', Location: href},
      json: {operation_id: 'op-rejected', kind: 'reload', status: 'queued', href}
    })
  );
  await page.route('**' + href, route =>
    route.fulfill({
      json: {
        operation_id: 'op-rejected',
        kind: 'reload',
        status: 'failed',
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        result: null,
        error: {code: 'reload_rejected', message: 'Reload rejected', details: {written: true, committed: false}}
      }
    })
  );
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await editor.fill((await editor.innerText()) + '\n# rejected reload\n');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Written to the config file but not applied');
});

test('a new file in the include directory is created empty and opens in the source editor', async ({page}) => {
  await page.goto('/#/config?tab=source');
  await page.getByRole('button', {name: 'New file', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New config file'});
  const name = dialog.getByLabel('Name', {exact: true});
  const create = dialog.getByRole('button', {name: 'Create', exact: true});
  // The one include pattern fixes the directory and the extension; only the name its `*` stands for is typed.
  await expect(dialog.locator('.rp-input .affix')).toHaveText(['config.d/', '.dae']);
  await expect(dialog.getByRole('button', {name: 'Include pattern'})).toHaveCount(0);
  await expect(dialog.getByLabel('Path', {exact: true})).toHaveCount(0);
  await expect(name).toHaveValue('');
  await expect(create).toBeDisabled();
  await name.fill('work');
  await expect(create).toBeEnabled();
  await create.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('config.d/work.dae created, configuration reloaded');
  await expect(page).toHaveURL(/tab=source&source=src-new-1$/);
  const editor = page.locator('.cm-content[aria-label="/etc/honk/config.d/work.dae"]');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.type('# include file notes');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
  await expect(editor).toContainText('# include file notes');
  // The backend's refusal of an existing name stays in the dialog.
  await page.getByRole('button', {name: 'New file', exact: true}).click();
  await name.fill('work');
  await create.click();
  await expect(dialog.getByRole('alert')).toContainText('Operation conflicts with the current state');
});

// Holds every create request until `release` runs, then answers it with `answer`.
async function heldCreate(page: Page, answer: (route: Route, body: {path: string; content: string}, api: ReturnType<typeof createMockApi>) => Promise<void>) {
  const {api} = await mockBackend(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route('**/api/v1/config/sources', async route => {
    await held;
    await answer(route, route.request().postDataJSON(), api);
  });
  await page.goto('/#/config?tab=source');
  const dialog = page.getByRole('dialog', {name: 'New config file'});
  await page.getByRole('button', {name: 'New file', exact: true}).click();
  await dialog.getByLabel('Name', {exact: true}).fill('work');
  const sent = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/config/sources'));
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await sent;
  // Closed while the create is pending, then opened again; its field waits until that create settles.
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', {name: 'New file', exact: true}).click();
  await expect(dialog.getByLabel('Name', {exact: true})).toBeDisabled();
  release();
  return dialog;
}

test('a create refused after its dialog closed reports in a toast, not in the dialog opened since', async ({page}) => {
  expectLoadFailures(page, /\/config\/sources$/);
  const dialog = await heldCreate(page, route =>
    route.fulfill({status: 409, json: {request_id: 'config-test', error: {code: 'state_conflict', message: 'Refused for the test'}}})
  );
  await expect(page.locator('.rp-toast.negative')).toContainText('Could not create config.d/work.dae');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByLabel('Name', {exact: true}).fill('other');
});

test('a create that succeeds after its dialog closed leaves the dialog opened since', async ({page}) => {
  const dialog = await heldCreate(page, async (route, body, api) => fulfillAccepted(route, await api.createConfigSource(body.path, body.content)));
  await expect(page.locator('.rp-toast.positive')).toContainText('config.d/work.dae created, configuration reloaded');
  await dialog.getByLabel('Name', {exact: true}).fill('other');
  await expect(dialog).toBeVisible();
  await expect(page).not.toHaveURL(/source=/);
});

test('a new file name is checked for what the path rules refuse', async ({page}) => {
  await page.goto('/#/config?tab=source');
  await page.getByRole('button', {name: 'New file', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New config file'});
  const name = dialog.getByLabel('Name', {exact: true});
  const create = dialog.getByRole('button', {name: 'Create', exact: true});
  await name.fill('sub/work');
  await expect(dialog).toContainText('The name cannot contain /');
  await expect(create).toBeDisabled();
  await name.fill('bad\u0007name');
  await expect(dialog).toContainText('The name cannot contain control characters');
  await expect(create).toBeDisabled();
  await name.fill('work');
  await expect(dialog.locator('.rp-field-error')).toHaveCount(0);
  await expect(create).toBeEnabled();
});

// The main source's include section as given, with every create request answered by a refusal and kept for checking.
async function newSourceBackend(page: Page, include: string) {
  const {api} = await mockBackend(page);
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  main.content = main.content!.replace(/include \{[^}]*\}/, include);
  main.content_sha256 = await sha256(main.content);
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  const created: {path: string; content: string}[] = [];
  expectLoadFailures(page, /\/config\/sources$/);
  await page.route('**/api/v1/config/sources', async route => {
    created.push(route.request().postDataJSON());
    await route.fulfill({status: 409, json: {request_id: 'config-test', error: {code: 'state_conflict', message: 'Refused for the test'}}});
  });
  await page.goto('/#/config?tab=source');
  await page.getByRole('button', {name: 'New file', exact: true}).click();
  return {dialog: page.getByRole('dialog', {name: 'New config file'}), created};
}

test('several include patterns are picked from before the name is typed', async ({page}) => {
  const {dialog, created} = await newSourceBackend(page, 'include {\n  config.d/*.dae\n  ./rules/r-*.rule.dae\n  extra.dae\n}');
  await expect(dialog.locator('.rp-input .affix')).toHaveText(['config.d/', '.dae']);
  await dialog.getByRole('button', {name: 'Include pattern'}).click();
  await expect(page.getByRole('option')).toHaveText(['config.d/*.dae', 'rules/r-*.rule.dae']);
  await page.getByRole('option', {name: 'rules/r-*.rule.dae', exact: true}).click();
  await expect(dialog.locator('.rp-input .affix')).toHaveText(['rules/r-', '.rule.dae']);
  await dialog.getByLabel('Name', {exact: true}).fill('home');
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Operation conflicts with the current state');
  expect(created).toEqual([{path: 'rules/r-home.rule.dae', content: ''}]);
});

test('without a pattern to fill, the whole relative path is typed', async ({page}) => {
  const {dialog, created} = await newSourceBackend(page, 'include {\n  config.d/**.dae\n}');
  const path = dialog.getByLabel('Path', {exact: true});
  const create = dialog.getByRole('button', {name: 'Create', exact: true});
  await expect(dialog.locator('.rp-input .affix')).toHaveCount(0);
  await expect(dialog.getByLabel('Name', {exact: true})).toHaveCount(0);
  await expect(path).toHaveValue('config.d/');
  await expect(create).toBeDisabled();
  await path.fill('config.d/../work.dae');
  await expect(dialog).toContainText('Path segments cannot be empty, . or ..');
  await expect(create).toBeDisabled();
  await path.fill('config.d/work');
  await expect(dialog).toContainText('The file name must end in .dae');
  // A path no include pattern matches is warned about, and the backend's refusal stays in the dialog.
  await path.fill('work.dae');
  await expect(dialog.getByRole('status')).toContainText('No include pattern of the loaded files matches this path');
  await path.fill('config.d/work.dae');
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await create.click();
  await expect(dialog.getByRole('alert')).toContainText('Operation conflicts with the current state');
  expect(created).toEqual([{path: 'config.d/work.dae', content: ''}]);
});

test('kit pickers keep symmetric insets', async ({page}) => {
  await page.goto('/#/config?tab=source');

  const pickers = page.locator('.rp-selectbtn');
  await expect(pickers.first()).toBeVisible();
  expect(
    await pickers.evaluateAll(elements =>
      elements.every(el => {
        const style = getComputedStyle(el);
        return style.paddingInlineStart === style.paddingInlineEnd;
      })
    )
  ).toBe(true);
});

test('modules are summaries with one link to each editor', async ({page}) => {
  await page.goto('/#/config');
  const modules = page.getByRole('tabpanel', {name: 'Modules'});
  for (const [section, path] of [
    ['global', 'config\\?tab=global'],
    ['node', 'nodes'],
    ['subscription', 'nodes'],
    ['group', 'policies'],
    ['dns', 'rules'],
    ['routing', 'rules']
  ]) {
    const card = modules.getByRole('region', {name: section, exact: true});
    await card.getByRole('link', {name: 'Open page'}).click();
    await expect(page).toHaveURL(new RegExp('#/' + path));
    if (section === 'global') await expect(page.getByRole('tabpanel', {name: 'Global settings'})).toBeVisible();
    await page.goBack();
  }
});

test('a located global jumps to its field, writes only the value, and survives navigation', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources[0];
  // tproxy_port and its neighbours are restart-only in honk, so the demo refuses to write them; sniffing_timeout reloads.
  const seeded = main.content.replace('tproxy_port: 12345', 'tproxy_port: 12345\n  sniffing_timeout: 100ms');
  await api.pollOperation(await api.replaceConfigSource(main.id, seeded, `"${main.content_sha256}"`));
  const original = (await api.config()).sources[0];
  const line = original.content.slice(0, original.content.indexOf('sniffing_timeout:')).split('\n').length;
  await page.goto(`/#/config?tab=source&source=${original.id}&line=${line}`);
  await page.getByRole('link', {name: 'sniffing_timeout', exact: true}).click();
  const field = page.getByRole('textbox', {name: 'Sniffing timeout', exact: true});
  await expect(field).toBeFocused();
  await field.fill('200ms');
  await page.getByRole('tabpanel', {name: 'Global settings'}).getByRole('button', {name: 'Write and reload'}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Global settings written');
  expect((await api.config()).sources[0].content).toBe(original.content.replace('sniffing_timeout: 100ms', 'sniffing_timeout: 200ms'));
  await page.reload();
  await expect(field).toHaveValue('200ms');
  await field.fill('300ms');
  await page.getByRole('link', {name: 'Configuration', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/config/);
});

test('a global write that cannot be read back keeps the draft and offers Retry', async ({page}) => {
  const backend = await mockBackend(page);
  const {api} = backend;
  const main = (await api.config()).sources[0];
  const seeded = main.content.replace('tproxy_port: 12345', 'tproxy_port: 12345\n  sniffing_timeout: 100ms');
  await api.pollOperation(await api.replaceConfigSource(main.id, seeded, `"${main.content_sha256}"`));
  await page.goto('/#/config?tab=global');
  const panel = page.getByRole('tabpanel', {name: 'Global settings'});
  const field = panel.getByRole('textbox', {name: 'Sniffing timeout', exact: true});
  await field.fill('200ms');
  let offline = false;
  backend.handlers['GET config'] = async () => {
    if (offline) throw new ApiError(503, 'temporarily_unavailable', 'Backend unavailable');
    return api.config();
  };
  offline = true;
  await panel.getByRole('button', {name: 'Write and reload'}).click();
  await expect(panel.getByRole('status')).toContainText('The change was saved, but the configuration could not be read back');
  await expect(panel.getByRole('button', {name: 'Retry'})).toBeVisible();
  await expect(field).toHaveValue('200ms');
  expect((await api.config()).sources[0].content).toContain('sniffing_timeout: 200ms');
  offline = false;
  await panel.getByRole('button', {name: 'Retry'}).click();
  await expect(panel.getByRole('button', {name: 'Retry'})).toBeHidden();
});

test('global setting fields keep one width across groups', async ({page}) => {
  await page.goto('/#/config?tab=global');
  const grids = page.getByRole('tabpanel', {name: 'Global settings'}).locator('.rp-fieldgrid');
  await expect(grids.first()).toBeVisible();
  const widths = await grids.evaluateAll(els => els.map(grid => [...grid.children].map(child => child.getBoundingClientRect().width)));
  const counts = new Set(widths.map(group => group.length));
  expect(counts.size).toBeGreaterThan(1);
  const all = widths.flat();
  expect(Math.max(...all) - Math.min(...all)).toBeLessThanOrEqual(1);
});

test('source editing writes form-owned values in full', async ({page}) => {
  const {api} = await mockBackend(page);
  const original = (await api.config()).sources[0].content;
  await page.goto('/#/config?tab=source');
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.fill(original.replace('allow_insecure: false', 'allow_insecure: true'));
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toContainText('Current draft');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
  expect((await api.config()).sources[0].content).toContain('allow_insecure: true');
});

test('legacy validation links focus diagnostics above the source at its line', async ({page}) => {
  const {api} = await mockBackend(page);
  const file = (await api.config()).sources.find(source => source.kind === 'main')!;
  const line = file.content.slice(0, file.content.indexOf('tproxy_port:')).split('\n').length;
  await page.goto(`/#/config?tab=validate&source=${file.id}&line=${line}`);
  await expect(page.getByRole('tab', {name: 'Config files', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', {name: 'Validation', exact: true})).toHaveCount(0);
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toBeFocused();
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toBeInViewport();
  await expect(page.locator('.cm-activeLine')).toContainText('tproxy_port:');
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toHaveCount(1);
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

async function revisionBackend(page: Page) {
  const backend = await mockBackend(page);
  const {api, handlers} = backend;
  handlers['GET x-honk/config/revisions'] = () => api.configRevisions();
  handlers['POST x-honk/config/import'] = request => api.importConfig(request.postDataJSON().replace);
  handlers['POST x-honk/config/revisions/1/activate'] = () => api.activateConfigRevision(1);
  return backend;
}

test('history is hidden without its extension and export-only downloads the response filename and bytes', async ({page}) => {
  const {api, capabilities} = await revisionBackend(page);
  capabilities.extensions = {};
  delete (capabilities.resources as Record<string, unknown>)['x-honk'];
  await page.goto('/#/config?tab=history');
  await expect(page.getByRole('tab', {name: 'Config files', exact: true})).toBeVisible();
  await expect(page.getByRole('tab', {name: 'Backups and revisions'})).toHaveCount(0);
  const extensions = {'x-honk': {config_export: {available: true}}};
  capabilities.extensions = extensions;
  Object.assign(capabilities.resources, extensions, {config: {available: false, create: false}});
  const exported = await api.exportConfig();
  await page.route('**/api/v1/x-honk/config/export', route =>
    route.fulfill({body: exported.content, contentType: exported.contentType, headers: {'Content-Disposition': `attachment; filename="${exported.filename}"`}})
  );
  await page.reload();
  await page.getByRole('tab', {name: 'Backups and revisions'}).click();
  await expect(page.getByRole('button', {name: 'Import server files', exact: true})).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export configuration', exact: true}).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(exported.filename);
  expect(await downloadText(file)).toBe(exported.content);
});

test('server import cancels without a write, then succeeds and lists a revision with details', async ({page}) => {
  const {api, requests} = await revisionBackend(page);
  await page.goto('/#/config?tab=history');
  await page.getByRole('button', {name: 'Import server files', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Replace configuration from server files?'});
  await expect(dialog).toContainText('-c');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(0);
  expect((await api.configRevisions()).revisions).toHaveLength(1);
  await page.getByRole('button', {name: 'Import server files', exact: true}).click();
  await dialog.getByRole('button', {name: 'Import server files', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Server configuration imported');
  const row = page.getByRole('row').filter({hasText: 'Database head'});
  await expect(row).toContainText('2');
  await row.click();
  const details = page.getByRole('dialog', {name: 'Revision details'});
  const revision = (await api.configRevisions()).revisions[0];
  await expect(details).toContainText(revision.content_sha256);
  await expect(details).toContainText(revision.sources[0].path);
  await expect(details).toContainText('demo');
  await expect(details.getByRole('button', {name: 'Restore revision', exact: true})).toBeDisabled();
});

test('server import stays available when the revisions list fails', async ({page}) => {
  const {handlers, requests} = await revisionBackend(page);
  handlers['GET x-honk/config/revisions'] = () => {
    throw new ApiError(503, 'service_unavailable', 'Revisions unavailable');
  };
  await page.goto('/#/config?tab=history');
  await expect(page.getByRole('button', {name: 'Retry', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Import server files', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Replace configuration from server files?'});
  await expect(dialog).not.toContainText('Database head');
  await dialog.getByRole('button', {name: 'Import server files', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(1);
});

test('an unknown import survives closing and navigation, and refresh reads the accepted operation', async ({page}) => {
  const {api, handlers, requests} = await revisionBackend(page);
  let operationId = '';
  handlers['POST x-honk/config/import'] = async request => {
    const accepted = await api.importConfig(request.postDataJSON().replace);
    operationId = accepted.operation_id;
    handlers[`GET operations/${operationId}`] = () => {
      throw new ApiError(503, 'service_unavailable', 'Operation unavailable');
    };
    return accepted;
  };
  await page.goto('/#/config?tab=history');
  await page.getByRole('button', {name: 'Import server files', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Replace configuration from server files?'});
  const confirm = dialog.getByRole('button', {name: 'Import server files', exact: true});
  await confirm.click();
  await expect(dialog).toContainText('Could not confirm the result of the operation');
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', {name: 'Import server files', exact: true}).click();
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole('button', {name: 'Refresh', exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('link', {name: 'Settings', exact: true}).click();
  await page.getByRole('link', {name: 'Configuration', exact: true}).click();
  await page.getByRole('tab', {name: 'Backups and revisions', exact: true}).click();
  await page.getByRole('button', {name: 'Import server files', exact: true}).click();
  await expect(confirm).toBeDisabled();
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(1);
  handlers[`GET operations/${operationId}`] = () => api.operation(operationId);
  await dialog.getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(1);
  expect(requests.filter(request => new URL(request.url()).pathname.endsWith(`/operations/${operationId}`))).toHaveLength(2);
});

test('restore confirms, shows 422 diagnostics, then creates a new revision', async ({page}) => {
  const {api, handlers, requests} = await revisionBackend(page);
  await api.pollOperation(await api.importConfig(true));
  handlers['POST x-honk/config/revisions/1/activate'] = () => {
    throw new ApiError(422, 'unsupported_value', 'Revision validation failed', 'restore-request', {
      diagnostics: [
        {level: 'error', source_id: 'former-source', line: 4, column: 1, code: 'invalid_config', message: 'Historical source cannot be activated', span: null}
      ]
    });
  };
  await page.goto('/#/config?tab=history');
  await page.getByRole('rowheader', {name: '1', exact: true}).click();
  await page.getByRole('button', {name: 'Restore revision', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Restore revision 1?'});
  expect(requests.filter(request => request.method() === 'POST')).toHaveLength(0);
  await dialog.getByRole('button', {name: 'Restore revision', exact: true}).click();
  await expect(dialog).toContainText('Historical source cannot be activated');
  await expect(dialog.getByRole('button', {name: /Open config file|Go to line/})).toHaveCount(0);
  handlers['POST x-honk/config/revisions/1/activate'] = () => api.activateConfigRevision(1);
  await dialog.getByRole('button', {name: 'Restore revision', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Revision restored');
  await expect(page.getByRole('row').filter({hasText: 'Database head'})).toContainText('3');
  const list = await api.configRevisions();
  expect(list.revisions[0]).toMatchObject({revision: 3, parent: 2, origin: 'activate'});
});

test('a committed restore failure retains inline diagnostics and copies its original error from both surfaces', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const {api, handlers} = await revisionBackend(page);
  await api.pollOperation(await api.importConfig(true));
  let operationId = '';
  handlers['POST x-honk/config/revisions/1/activate'] = async () => {
    const accepted = await api.activateConfigRevision(1);
    operationId = accepted.operation_id;
    handlers[`GET operations/${operationId}`] = async () => ({
      ...(await api.pollOperation(accepted)),
      status: 'failed',
      result: null,
      error: {
        code: 'store_unavailable',
        message: 'Revision store fsync failed on the backend volume',
        details: {
          committed: true,
          diagnostics: [{level: 'error', source_id: null, line: null, column: null, code: 'invalid_config', message: 'Backend volume is read-only', span: null}]
        }
      }
    });
    return accepted;
  };
  await page.goto('/#/config?tab=history');
  await page.getByRole('rowheader', {name: '1', exact: true}).click();
  await page.getByRole('button', {name: 'Restore revision', exact: true}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Restore revision 1?'});
  await dialog.getByRole('button', {name: 'Restore revision', exact: true}).click();
  await expect(dialog).toContainText('Backend volume is read-only');
  await expect(dialog).toContainText('The change is active but was not saved');
  await expect(dialog.getByRole('button', {name: 'Restore revision', exact: true})).toBeEnabled();
  await page.locator('.rp-toast.negative').getByRole('button', {name: 'Copy error', exact: true}).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('code: store_unavailable');
  expect(copied).toContain('message: Revision store fsync failed on the backend volume');
  expect(copied).toContain(`operation: ${operationId} reload failed`);
  expect(copied).toContain('"committed":true');
  await page.locator('.rp-toast.positive', {hasText: 'Error details copied'}).getByRole('button', {name: 'Close', exact: true}).click();
  await page.locator('.rp-toast.negative').getByRole('button', {name: 'Close', exact: true}).click();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('link', {name: 'Settings', exact: true}).click();
  await page.getByRole('button', {name: 'Copy recent errors', exact: true}).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(copied.split('\n\n')[1]);
});

for (const tab of ['source', 'global'])
  test(`entering history guards a ${tab} draft before requesting revisions`, async ({page}) => {
    const {requests} = await revisionBackend(page);
    await page.goto(`/#/config?tab=${tab}&source=src-main`);
    const editor = tab === 'source' ? page.locator('.cm-content') : page.getByRole('textbox', {name: 'Sniffing timeout', exact: true});
    await expect(editor).toBeEditable();
    await editor.fill(tab === 'source' ? (await editor.innerText()) + '\n# unsaved history draft' : '100ms');
    await page.getByRole('tab', {name: 'Backups and revisions'}).click();
    const dialog = page.getByRole('alertdialog', {name: 'Discard changes not applied?'});
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    if (tab === 'source') await expect(editor).toContainText('unsaved history draft');
    else await expect(editor).toHaveValue('100ms');
    expect(requests.some(request => request.url().includes('/x-honk/'))).toBe(false);
    await page.getByRole('tab', {name: 'Backups and revisions'}).click();
    await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
    await expect(page.getByRole('grid', {name: 'Backups and revisions'})).toBeVisible();
  });

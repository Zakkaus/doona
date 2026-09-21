import {test as httpTest, type Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
import {sha256} from '../src/api/hash';
import {ApiError} from '../src/api/error';
import {expect, test} from './fixtures';

async function backend(page: Page) {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  const reads: Record<string, () => Promise<unknown>> = {
    capabilities: async () => capabilities,
    version: () => api.version(),
    config: () => api.config(),
    rules: () => api.rules(),
    groups: () => api.groups(),
    nodes: () => api.nodes(),
    providers: () => api.providers(),
    flows: () => api.flows(),
    connections: () => api.connections(),
    runtime: () => api.runtime(),
    geodata: () => api.geodata(),
    'runtime/settings': () => api.runtimeSettings(),
    'runtime/memory': () => api.runtimeMemory(),
    'runtime/memory/history': () => api.memoryHistory(),
    'runtime/traffic/history': () => api.trafficHistory(),
    'runtime/outbounds': () => api.runtimeOutbounds()
  };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    if (reads[path]) return route.fulfill({json: await reads[path]()});
    throw new Error(`Unexpected request: ${route.request().method()} ${path}`);
  });
  return api;
}

test.use({viewport: {width: 1440, height: 1000}});

for (const tab of ['source', 'setup']) {
  test(`${tab} drafts survive cancelled sidebar and hash navigation`, async ({page}) => {
    await page.goto(`/#/config?tab=${tab}`);
    if (tab === 'source') {
      await page.getByRole('button', {name: 'Edit', exact: true}).click();
      await page.locator('.cm-content').fill('draft that must survive');
    } else await page.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/unsaved');
    await page.locator('.rp-nav[href="#/connections"]').click();
    const dialog = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`config\\?tab=${tab}$`));
    if (tab === 'source') await expect(page.locator('.cm-content')).toContainText('draft that must survive');
    else await expect(page.getByLabel('Subscription URL', {exact: true})).toHaveValue('https://example.org/unsaved');
    await page.evaluate(() => {
      location.hash = '#/settings';
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
    await expect(page.locator('.rp-nav[href="#/settings"]')).toHaveAttribute('aria-current', 'page');
  });

  test(`${tab} editing stays frozen through validation and save`, async ({page}) => {
    const api = await backend(page);
    let releaseValidation!: () => void;
    const validation = new Promise<void>(resolve => {
      releaseValidation = resolve;
    });
    let releaseSave!: () => void;
    const save = new Promise<void>(resolve => {
      releaseSave = resolve;
    });
    await page.route('**/api/v1/config/validate', async route => {
      await validation;
      await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
    });
    await page.route('**/api/v1/config/sources/*', async route => {
      await save;
      const id = new URL(route.request().url()).pathname.split('/').pop()!;
      const result = await api.replaceConfigSource(id, route.request().postDataJSON().content, route.request().headers()['if-match']);
      await route.fulfill({json: result});
    });
    await page.route('**/api/v1/operations/*', async route => {
      await route.fulfill({json: await api.operation(new URL(route.request().url()).pathname.split('/').pop()!)});
    });
    await page.goto(`/#/config?tab=${tab}`);
    if (tab === 'source') {
      await page.getByRole('button', {name: 'Edit', exact: true}).click();
      const editor = page.locator('.cm-content');
      await editor.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type('\n# retained edit\n');
    } else await page.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/saved');
    await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
    try {
      if (tab === 'source') await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
      else {
        await expect(page.getByLabel('Subscription URL', {exact: true})).toBeDisabled();
        await expect(page.getByRole('button', {name: /Rules$/})).toBeDisabled();
        await expect(page.getByRole('button', {name: 'Add a subscription', exact: true})).toBeDisabled();
      }
      const writing = page.waitForRequest(request => request.method() === 'PUT');
      releaseValidation();
      await writing;
      if (tab === 'source') await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
      else await expect(page.getByLabel('Subscription URL', {exact: true})).toBeDisabled();
    } finally {
      releaseValidation();
      releaseSave();
    }
    await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText(tab === 'source' ? '# retained edit' : 'https://example.org/saved');
  });
}

for (const all of [false, true]) {
  test(`navigation cancels ${all ? 'bulk' : 'single'} close without announcing success`, async ({page}) => {
    await backend(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route('**/api/v1/connections**', async route => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      await gate;
      await route.fulfill(all ? {json: {closed: 1, skipped: 0}} : {status: 204});
    });
    await page.goto('/#/connections?id=1');
    const request = page.waitForRequest(request => request.method() === 'DELETE');
    if (all) {
      await page.getByRole('button', {name: 'Close all', exact: true}).click();
      await page.getByRole('alertdialog').getByRole('button', {name: 'Close all', exact: true}).click();
    } else await page.getByRole('button', {name: 'Close connection', exact: true}).click();
    await request;
    await expect(page).toHaveURL(/connections\?id=1$/);
    await page.locator('.rp-nav[href="#/settings"]').click();
    await expect(page.locator('[name=api]')).toBeVisible();
    release();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.locator('.rp-toast')).toHaveCount(0);
  });
}

test('Add refuses changed rule generations while its dialog is open', async ({page}) => {
  const api = await backend(page);
  const rules = await api.rules();
  const config = await api.config();
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  const capabilities = await api.capabilities();
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  let changed!: () => void;
  const generation = new Promise<void>(resolve => {
    changed = resolve;
  });
  await page.route('**/api/v1/events**', async route => {
    await generation;
    await route.fulfill({contentType: 'text/event-stream', body: 'event: generation.changed\ndata: {}\n\n'});
  });
  let reads = 0;
  let writes = 0;
  await page.route('**/api/v1/rules', route => {
    reads++;
    return route.fulfill({json: rules});
  });
  await page.route('**/api/v1/config/validate', async route => {
    writes++;
    await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
  });
  await page.goto('/#/rules?tab=list');
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', {name: 'Expression', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Condition'}).fill('domain(example.org)');
  rules.generation_id = 'changed-generation';
  config.generation_id = rules.generation_id;
  changed();
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('changed-generation');
  const before = reads;
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('out of sync');
  await expect.poll(() => reads).toBeGreaterThan(before);
  expect(writes).toBe(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', {name: 'Condition'})).toHaveValue('domain(example.org)');
});

for (const action of ['add', 'remove'] as const) {
  test(`${action} refuses a shifted source even when its generation and digest are current`, async ({page}) => {
    const api = await backend(page);
    const config = await api.config();
    const main = config.sources.find(source => source.kind === 'main')!;
    main.content = main.content!.replace('routing {', 'routing {\n  dport(65535) -> direct');
    main.content_sha256 = await sha256(main.content);
    await page.route('**/api/v1/config', route => route.fulfill({json: config}));
    let validations = 0;
    await page.route('**/api/v1/config/validate', async route => {
      validations++;
      await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
    });
    await page.goto('/#/rules?tab=list');
    if (action === 'add') {
      await page.getByRole('button', {name: 'Add rule', exact: true}).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', {name: 'Values', exact: true}).fill('example.org');
      await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
    } else {
      await page.getByRole('button', {name: 'Remove rule', exact: true}).first().click();
      await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
    }
    await expect(page.locator('.rp-toast.negative')).toContainText('out of sync');
    expect(validations).toBe(0);
    await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  });
}

test('routing map shows a failed rules request and retries it', async ({page}) => {
  await backend(page);
  await page.route('**/api/v1/rules', route => route.fulfill({contentType: 'application/json', body: 'invalid JSON'}), {times: 1});
  await page.goto('/#/rules?tab=map');
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('alert')).toBeVisible();
  await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('node probe announcements retain sub-ten-millisecond precision', async ({page}) => {
  const api = await backend(page);
  await page.route('**/api/v1/probes', async route => {
    await route.fulfill({json: await api.startProbe(route.request().postDataJSON())});
  });
  await page.route('**/api/v1/operations/*', async route => {
    const operation = await api.operation(new URL(route.request().url()).pathname.split('/').pop()!);
    if (operation.status === 'succeeded' && operation.kind === 'probe') {
      for (const result of operation.result.results) {
        result.state = 'healthy';
        result.latency_ms = 5.4;
      }
    }
    await route.fulfill({json: operation});
  });
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Test hk-01', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('hk-01: 5.4 ms');
});

for (const tab of ['source', 'setup']) {
  test(`discarding ${tab} inside Config cancels its transaction and releases the next editor`, async ({page}) => {
    const api = await backend(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let settled!: () => void;
    const handled = new Promise<void>(resolve => {
      settled = resolve;
    });
    await page.route('**/api/v1/config/validate', async route => {
      await gate;
      await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
      settled();
    });
    let writes = 0;
    await page.route('**/api/v1/config/sources/*', async route => {
      writes++;
      await route.fulfill({status: 500, json: {code: 'unexpected_write', message: 'Discarded draft was written'}});
    });
    await page.goto(`/#/config?tab=${tab}`);
    if (tab === 'source') {
      await page.getByRole('button', {name: 'Edit', exact: true}).click();
      await page.locator('.cm-content').fill('routing {\n  fallback: direct\n}\n');
    } else await page.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/discarded');
    const validating = page.waitForRequest('**/config/validate');
    await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
    await validating;
    if (tab === 'source') {
      await page.getByRole('button', {name: / Source$/}).click();
      await page.getByRole('option', {name: /rules\.dae/}).click();
    } else await page.getByRole('tab', {name: 'Sources', exact: true}).click();
    await page.getByRole('alertdialog').getByRole('button', {name: 'Discard changes', exact: true}).click();
    try {
      await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeEnabled();
    } finally {
      release();
    }
    await handled;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(writes).toBe(0);
    await expect(page.locator('.rp-toast')).toHaveCount(0);
    await expect(page).toHaveURL(tab === 'source' ? /source=src-rules/ : /tab=source/);
  });
}

test('global target cannot change during a pending mode apply', async ({page}) => {
  const api = await backend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v1/config/validate', async route => {
    await gate;
    await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
  });
  await page.route('**/api/v1/config/sources/*', async route => {
    await route.fulfill({json: await api.replaceConfigSource('src-main', route.request().postDataJSON().content, route.request().headers()['if-match'])});
  });
  await page.route('**/api/v1/operations/*', async route => {
    await route.fulfill({json: await api.operation(new URL(route.request().url()).pathname.split('/').pop()!)});
  });
  await page.goto('/#/activity');
  await page.getByRole('radio', {name: 'Global', exact: true}).click();
  const validating = page.waitForRequest('**/config/validate');
  await page.getByRole('button', {name: 'Apply', exact: true}).click();
  await validating;
  try {
    await expect(page.getByRole('button', {name: 'Global target', exact: true})).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator('.rp-toast.positive')).toContainText('reloaded: Global');
  await expect(page.getByRole('button', {name: 'Global target', exact: true})).toBeEnabled();
});

test('trace headings and selected leaves retain the submitted domain and network', async ({page}) => {
  const api = await backend(page);
  await api.selectGroup('proxy', {member_id: 'hk-01', network: 'tcp'});
  await api.selectGroup('proxy', {member_id: 'sg-01', network: 'udp'});
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v1/routing/trace', async route => {
    const response = await api.routingTrace(route.request().postDataJSON());
    response.evaluations = [{...response.evaluations[0], dst_ip: null, outbound: 'proxy'}];
    await gate;
    await route.fulfill({json: response});
  });
  await page.goto('/#/rules?tab=trace');
  await page.getByRole('button', {name: / Resolution mode$/}).click();
  await page.getByRole('option', {name: /No resolution/}).click();
  await page.getByLabel('Domain', {exact: true}).fill('submitted.example');
  const tracing = page.waitForRequest('**/routing/trace');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  await tracing;
  await page.getByLabel('Domain', {exact: true}).fill('edited.example');
  await page.getByRole('button', {name: / Network protocol$/}).click();
  await page.getByRole('option', {name: 'UDP', exact: true}).click();
  release();
  const result = page.getByRole('region', {name: 'Simulation result', exact: true});
  await expect(result.getByRole('heading', {name: 'submitted.example', exact: true})).toBeVisible();
  await expect(result).toContainText('hk-01');
  await expect(result).not.toContainText('sg-01');
  await page.getByLabel('Domain', {exact: true}).fill('edited-again.example');
  await expect(result.getByRole('heading', {name: 'submitted.example', exact: true})).toBeVisible();
});

test('search keeps the keyboard target when an earlier connection disappears', async ({page}) => {
  const api = await backend(page);
  const snapshot = await api.connections();
  snapshot.tcp = snapshot.tcp.slice(0, 3).map((connection, index) => ({...connection, domain: `stable-${index}.example`}));
  snapshot.udp = [];
  await page.route('**/api/v1/connections**', route => route.fulfill({json: snapshot}));
  await page.clock.install();
  await page.goto('/#/config');
  await expect(page.getByRole('heading', {name: 'Configuration', exact: true})).toBeVisible();
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox').fill('stable-');
  const target = snapshot.tcp[1];
  await dialog.getByRole('option', {name: new RegExp(target.domain!)}).focus();
  snapshot.tcp.shift();
  await page.clock.fastForward(6000);
  await expect(dialog.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`connections\\?id=${target.id}$`));
});

httpTest('policy drafts survive a completeness recheck and reject a changed original digest', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-lang', 'en'));
  const api = await backend(page);
  const capabilities = await api.capabilities();
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/groups/*', async route => {
    await route.fulfill({json: await api.group(new URL(route.request().url()).pathname.split('/').pop()!)});
  });
  let changed!: () => void;
  const generation = new Promise<void>(resolve => {
    changed = resolve;
  });
  await page.route('**/api/v1/events**', async route => {
    await generation;
    await route.fulfill({contentType: 'text/event-stream', body: 'event: generation.changed\ndata: {}\n\n'});
  });
  await page.route('**/api/v1/config/validate', async route => {
    await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
  });
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await page.route('**/api/v1/config/sources/*', async route => {
    expect(route.request().headers()['if-match']).toBe(`"${main.content_sha256}"`);
    try {
      await route.fulfill({json: await api.replaceConfigSource(main.id, route.request().postDataJSON().content, route.request().headers()['if-match'])});
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      await route.fulfill({status: error.status, json: {error: {code: error.code, message: error.message}}});
    }
  });
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'gaming', exact: true}).getByRole('button', {name: 'Edit', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  const filter = dialog.getByRole('textbox', {name: 'Filter 1', exact: true});
  await filter.fill('name(hk-01)');
  await api.replaceConfigSource(main.id, main.content + '\n# concurrent edit\n', `"${main.content_sha256}"`);
  const refreshed = page.waitForResponse('**/api/v1/config');
  changed();
  await refreshed;
  await expect(filter).toHaveValue('name(hk-01)');
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('changed');
  await expect(filter).toHaveValue('name(hk-01)');
});

test('policy details load near the viewport and a deep link explicitly mounts a distant group', async ({page}) => {
  const api = await backend(page);
  const base = await api.group('proxy');
  const snapshot = await api.groups();
  const summary = snapshot[0];
  const groups = Array.from({length: 60}, (_, i) => ({...summary, id: `group-${i}`, name: `Group ${i}`}));
  const loaded = new Set<string>();
  await page.route('**/api/v1/groups', route => route.fulfill({json: groups}));
  await page.route('**/api/v1/groups/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!;
    loaded.add(id);
    return route.fulfill({json: {...base, id, name: groups.find(group => group.id === id)!.name}});
  });
  await page.goto('/#/policies');
  await expect(page.getByRole('region', {name: 'Group 0', exact: true}).getByRole('heading', {name: 'Group 0', exact: true})).toBeVisible();
  expect(loaded.has('group-59')).toBe(false);
  expect(loaded.size).toBeLessThan(60);
  await page.goto('/#/policies?group=group-59');
  await expect(page.getByRole('region', {name: 'Group 59', exact: true}).getByRole('heading', {name: 'Group 59', exact: true})).toBeVisible();
  expect(loaded.has('group-59')).toBe(true);
});

test('cancelled runtime saves do not announce success and keep editing frozen until navigation', async ({page}) => {
  const api = await backend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v1/runtime/settings', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await gate;
    await route.fulfill({json: await api.patchRuntimeSettings(route.request().postDataJSON())});
  });
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend options'});
  const records = card.getByRole('textbox', {name: 'Log records kept', exact: true});
  await records.fill('512');
  const saving = page.waitForRequest(request => request.method() === 'PATCH');
  await card.getByRole('button', {name: 'Apply', exact: true}).click();
  await saving;
  await expect(records).toBeDisabled();
  await page.locator('.rp-nav[href="#/connections"]').click();
  const discard = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  await discard.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(records).toHaveValue('512');
  await page.locator('.rp-nav[href="#/connections"]').click();
  await discard.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections$/);
  release();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('.rp-toast.positive', {hasText: 'Backend options applied'})).toHaveCount(0);
});

test('runtime drafts survive a changed poll and explicit discard loads the current values', async ({page}) => {
  const api = await backend(page);
  const settings = await api.runtimeSettings();
  await page.route('**/api/v1/runtime/settings', route => route.fulfill({json: settings}));
  await page.clock.install();
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend options'});
  const records = card.getByRole('textbox', {name: 'Log records kept', exact: true});
  await records.fill('512');
  settings.log.buffered_records = 2048;
  const refresh = page.waitForResponse('**/api/v1/runtime/settings');
  await page.clock.runFor(16000);
  await refresh;
  await expect(records).toHaveValue('512');
  await expect(card.getByRole('alert')).toContainText('your draft was kept');
  await card.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(records).toHaveValue('2048');
  await page.locator('.rp-nav[href="#/connections"]').click();
  await expect(page).toHaveURL(/#\/connections$/);
});

test('new group validation refusal retains the dialog and its name without a success toast', async ({page}) => {
  const api = await backend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v1/config/validate', async route => {
    await gate;
    const result = await api.validateConfig(route.request().postDataJSON());
    await route.fulfill({json: {...result, valid: false}});
  });
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Add hk-01 to a group', exact: true}).click();
  await page.getByRole('menuitemradio', {name: 'New group…', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New group…', exact: true});
  await dialog.getByLabel('Name', {exact: true}).fill('retained-group');
  const validating = page.waitForRequest('**/api/v1/config/validate');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await validating;
  await expect(dialog).toBeVisible();
  release();
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation');
  await expect(dialog.getByLabel('Name', {exact: true})).toHaveValue('retained-group');
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
});

test('main-source actions remain disabled when advertised content fails completeness verification', async ({page}) => {
  const api = await backend(page);
  const config = await api.config();
  config.sources.find(source => source.kind === 'main')!.content = 'redacted';
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/nodes?provider=inline');
  await expect(page.getByRole('button', {name: 'Add hk-01 to a group', exact: true})).toBeDisabled();
});

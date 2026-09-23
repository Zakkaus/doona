import {test as httpTest, type Locator, type Page} from '@playwright/test';
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
        await expect(page.getByRole('button', {name: 'Add subscription', exact: true})).toBeDisabled();
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
  test(`${all ? 'Cancel abandons bulk' : 'navigation cancels single'} close without announcing success`, async ({page}) => {
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
    // A pending confirmation covers the page; its Cancel abandons the bulk close.
    if (all) await page.getByRole('alertdialog').getByRole('button', {name: 'Cancel', exact: true}).click();
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
  // The catch-all only goes after a prefix of must rules; the demo source is reordered to allow it.
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  const ordinary = '  domain(suffix: doubleclick.net) -> block\n';
  await api.pollOperation(
    await api.replaceConfigSource(
      source.id,
      source.content!.replace(ordinary, '').replace('  domain(geosite: cn)', ordinary + '  domain(geosite: cn)'),
      `"${source.content_sha256}"`
    )
  );
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
  await page.getByLabel('Domain', {exact: true}).fill('submitted.example');
  await page.getByLabel('Destination port', {exact: true}).fill('443');
  await page.getByRole('button', {name: / Resolution mode$/}).click();
  await page.getByRole('option', {name: /No resolution/}).click();
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
  await expect(dialog.getByRole('alert')).toContainText('changed');
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
  await expect(dialog.getByRole('alert')).toContainText('Validation');
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

test('a completed provider creation cannot close a newer node draft or clear its guard', async ({page}) => {
  const api = await backend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v1/providers', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const created = await api.createProvider(route.request().postDataJSON());
    await gate;
    await route.fulfill({json: created});
  });
  // The page refreshes a new provider straight away; the mock's accepted operation completes on its own.
  await page.route('**/api/v1/providers/*/refresh', async route =>
    route.fulfill({status: 202, json: await api.refreshProvider(new URL(route.request().url()).pathname.split('/').at(-2)!)})
  );
  await page.route('**/api/v1/operations/*', async route =>
    route.fulfill({json: await api.operation(new URL(route.request().url()).pathname.split('/').at(-1)!)})
  );
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const provider = page.getByRole('dialog');
  await provider.getByLabel('Name', {exact: true}).fill('slow-provider');
  await provider.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/sub');
  const submitted = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/providers'));
  await provider.getByRole('button', {name: 'Add', exact: true}).click();
  await submitted;
  await provider.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('button', {name: 'Paste node link', exact: true}).click();
  const node = page.getByRole('dialog');
  await node.getByLabel('Name', {exact: true}).fill('new-draft');
  await node.getByLabel('Node link', {exact: true}).fill('vless://uuid@example.org:443');
  release();
  await expect(page.locator('.rp-toast.positive')).toContainText('slow-provider added and refreshed');
  await expect(node.getByLabel('Name', {exact: true})).toHaveValue('new-draft');
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await expect(page.getByRole('alertdialog', {name: 'Discard unsaved changes?'})).toBeVisible();
});

test('provider host labels cannot enable interval writes without node tag metadata', async ({page}) => {
  const api = await backend(page);
  const config = await api.config();
  const main = config.sources.find(source => source.kind === 'main')!;
  main.content = "subscription {\n  main: {\n    url: 'https://shared.example/sub'\n    interval: '2h'\n  }\n}\n";
  main.content_sha256 = await sha256(main.content);
  const providers = await api.providers();
  const subscription = providers.providers.find(provider => provider.kind === 'subscription')!;
  providers.providers = [
    {...subscription, id: 'main-provider', name: 'opaque-main', url_redacted: 'https://shared.example/redacted'},
    {...subscription, id: 'include-provider', name: 'opaque-include', url_redacted: 'https://shared.example/redacted'}
  ];
  const nodes = await api.nodes();
  nodes.nodes = [];
  nodes.next_cursor = null;
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.route('**/api/v1/providers?*', route => route.fulfill({json: providers}));
  await page.route('**/api/v1/nodes?*', route => route.fulfill({json: nodes}));
  await page.goto('/#/nodes?tab=list');
  await expect(page.locator('.rp-table').first().locator('[role=row][data-key]')).toHaveCount(2);
  await expect(page.getByRole('button', {name: /^Auto-refresh of/})).toHaveCount(0);
});

httpTest('backend inventory failures expose independent retries without claiming zero counts', async ({page}) => {
  const api = await backend(page);
  await page.addInitScript(() => localStorage.setItem('doona-lang', 'en'));
  let failProviders = true;
  let failConnections = true;
  const failure = (message: string) => ({status: 503, json: {request_id: 'inventory', error: {code: 'service_unavailable', message, details: null}}});
  await page.route('**/api/v1/providers?*', async route =>
    route.fulfill(failProviders ? failure('Provider inventory unavailable') : {json: await api.providers()})
  );
  await page.route('**/api/v1/connections?*', async route =>
    route.fulfill(failConnections ? failure('Connection inventory unavailable') : {json: await api.connections()})
  );
  await page.goto('/#/settings');
  const card = page.getByRole('region', {name: 'Backend actions'});
  const providers = card.locator('.rp-ops-group').filter({hasText: 'Provider inventory unavailable'});
  const connections = card.locator('.rp-ops-group').filter({hasText: 'Connection inventory unavailable'});
  await expect(providers).toBeVisible();
  await expect(connections).toBeVisible();
  await expect(card.getByRole('button', {name: /^Refresh .*subscription/})).toBeDisabled();
  await expect(card.getByRole('button', {name: /^Refresh .*subscription/})).not.toContainText('(0)');
  await expect(card.getByRole('button', {name: 'Close all', exact: true})).toBeDisabled();
  failProviders = false;
  await providers.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(card.getByRole('button', {name: 'Refresh subscription (1)', exact: true})).toBeEnabled();
  await expect(connections).toBeVisible();
  failConnections = false;
  await connections.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(card.getByRole('button', {name: 'Close all', exact: true})).toBeEnabled();
});

httpTest('failed reads on activity, DNS and settings each offer a retry', async ({page}) => {
  const api = await backend(page);
  await page.addInitScript(() => localStorage.setItem('doona-lang', 'en'));
  let fail = true;
  const failure = (message: string) => ({status: 503, json: {request_id: 'retry', error: {code: 'service_unavailable', message, details: null}}});
  await page.route('**/api/v1/runtime/outbounds', async route => route.fulfill(fail ? failure('Outbounds unavailable') : {json: await api.runtimeOutbounds()}));
  await page.route('**/api/v1/dns/cache{,?*}', async route => route.fulfill(fail ? failure('Cache unavailable') : {json: await api.dnsCache()}));
  await page.route('**/api/v1/geodata', async route => route.fulfill(fail ? failure('Geodata unavailable') : {json: await api.geodata()}));
  const retried = async (alert: Locator) => {
    await expect(alert).toBeVisible();
    fail = false;
    await alert.getByRole('button', {name: 'Retry', exact: true}).click();
    await expect(alert).toHaveCount(0);
    fail = true;
  };
  await page.goto('/#/activity');
  await retried(page.getByRole('alert').filter({hasText: 'Outbounds unavailable'}));
  await page.goto('/#/dns?tab=cache');
  await retried(page.getByRole('alert').filter({hasText: 'Cache unavailable'}));
  await expect(page.getByRole('grid', {name: 'Cache', exact: true}).getByRole('rowheader').first()).toBeVisible();
  await page.goto('/#/settings');
  await retried(page.getByRole('alert').filter({hasText: 'Geodata unavailable'}));
});

test('routing map selections separate missing outbounds from a backend name of unknown', async ({page}) => {
  const api = await backend(page);
  const snapshot = await api.flows();
  const base = snapshot.flows[0];
  snapshot.flows = [
    {...base, id: 'missing', outbound: null, chain: [], rule_id: null, rule_expression: null},
    {...base, id: 'known', outbound: 'unknown', chain: ['unknown'], rule_id: null, rule_expression: 'unknown'}
  ];
  snapshot.next_cursor = null;
  await page.route('**/api/v1/flows?*', route => route.fulfill({json: snapshot}));
  await page.goto('/#/rules?tab=map');
  const missing = page.locator('.rp-tree-tile[data-id="outbound:"]');
  const known = page.locator('.rp-tree-tile[data-id="outbound:unknown"]');
  await expect(missing).toBeVisible();
  await expect(known).toBeVisible();
  await expect(missing.locator('.c')).toHaveText('1');
  await expect(known.locator('.c')).toHaveText('1');
  await known.click();
  await expect(known).toHaveAttribute('aria-pressed', 'true');
  await expect(missing).toHaveAttribute('aria-pressed', 'false');
});

test('node creation freezes its submitted draft until the response arrives', async ({page}) => {
  const api = await backend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v1/nodes', async route => {
    await gate;
    await route.fulfill({json: await api.createNode(route.request().postDataJSON())});
  });
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Paste node link', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('submitted-node');
  await dialog.getByLabel('Node link').fill('vless://uuid@example.com:443?security=tls#submitted-node');
  const request = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/nodes'));
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await request;
  try {
    await expect(dialog.getByLabel('Name')).toBeDisabled();
    await expect(dialog.getByLabel('Node link')).toBeDisabled();
  } finally {
    release();
  }
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .locator('.rp-table')
      .nth(1)
      .getByRole('row', {name: /submitted-node/})
  ).toBeVisible();
});

test('redacted rule labels edit accepted source and freeze the draft through validation', async ({page}) => {
  const api = await backend(page);
  await page.route('**/api/v1/rules', async route => {
    const rules = await api.rules();
    rules.rules = rules.rules.map(rule => ({...rule, expression: rule.kind === 'fallback' ? 'fallback' : 'domain(<redacted>)'}));
    await route.fulfill({json: rules});
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v1/config/validate', async route => {
    await gate;
    await route.fulfill({json: await api.validateConfig(route.request().postDataJSON())});
  });
  await page.route('**/api/v1/config/sources/*', async route => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!;
    await route.fulfill({json: await api.replaceConfigSource(id, route.request().postDataJSON().content, route.request().headers()['if-match'])});
  });
  await page.route('**/api/v1/operations/*', async route => {
    await route.fulfill({json: await api.operation(new URL(route.request().url()).pathname.split('/').pop()!)});
  });
  const original = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await page.goto('/#/rules?tab=list');
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add rule', exact: true});
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).fill('accepted.example');
  const validating = page.waitForRequest('**/config/validate');
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await validating;
  try {
    await expect(dialog.getByRole('textbox', {name: 'Values', exact: true})).toBeDisabled();
    await expect(dialog.getByRole('radio', {name: 'Expression', exact: true})).toBeDisabled();
    await expect(dialog.getByRole('button', {name: /Match by$/})).toBeDisabled();
    await expect(dialog.getByRole('button', {name: /Outbound$/})).toBeDisabled();
    await expect(dialog.getByRole('button', {name: /Insert$/})).toBeDisabled();
    await expect(dialog.getByRole('switch', {name: 'must', exact: true})).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule written'})).toBeVisible();
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toContain('domain(suffix: accepted.example)');
  const rows = page.getByRole('tabpanel', {name: 'Rule list'}).locator('[role=row][data-key]');
  await expect(rows).toHaveCount(10);
  await rows.nth(8).getByRole('button', {name: 'Remove rule', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule removed'})).toBeVisible();
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(original);
});

test('withheld rule source disables editing and explains the restriction', async ({page}) => {
  const api = await backend(page);
  const config = await api.config();
  config.sources = config.sources.map(source => ({...source, content: undefined}));
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/rules?tab=list');
  await expect(page.getByRole('button', {name: 'Add rule', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Remove rule', exact: true})).toHaveCount(0);
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('The text is incomplete or redacted; it cannot be edited here');
});

test('a large routing dictionary reveals bounded batches without changing tile geometry', async ({page}) => {
  const api = await backend(page);
  const dictionary = await api.rules();
  dictionary.rules = Array.from({length: 4096}, (_, i) => ({...dictionary.rules[0], rule_id: String(i), expression: `rule-${i}`, outbound: 'direct'}));
  const groups = await api.groups();
  groups[0].policy = {...groups[0].policy, kind: 'urltest', native: 'min_avg10'};
  const flows = {...(await api.flows()), flows: []};
  await page.route('**/api/v1/rules', route => route.fulfill({json: dictionary}));
  await page.route('**/api/v1/groups', route => route.fulfill({json: groups}));
  await page.route('**/api/v1/flows?*', route => route.fulfill({json: flows}));
  await page.goto('/#/rules?tab=map');
  const leaves = page.locator('.rp-tree-tile[data-stage="rule"]');
  await expect(leaves).toHaveCount(30);
  await expect(page.locator('.rp-tree-tile[data-stage="outbound"]').filter({hasText: groups[0].name})).toContainText('min_avg10');
  const first = await leaves.first().boundingBox();
  await page.getByRole('button', {name: 'Show 30 more items', exact: true}).click();
  await expect(leaves).toHaveCount(60);
  const after = await leaves.first().boundingBox();
  expect(after!.width).toBe(first!.width);
  expect(after!.height).toBe(first!.height);
  await leaves.nth(59).click();
  await expect(leaves.nth(59)).toHaveAttribute('aria-pressed', 'true');
  await leaves.nth(59).press('Escape');
  await expect(page).not.toHaveURL(/path=/);
  await page.getByRole('button', {name: 'Show only the first 30 items', exact: true}).click();
  await expect(leaves).toHaveCount(30);
});

test('flow input identifiers stay literal beside localized enums and incomplete coverage', async ({page}) => {
  const api = await backend(page);
  const detail = await api.flow('flow-1');
  const input = detail.trace.steps.find(step => step.stage === 'input')!;
  input.data.values = {...input.data.values, domain: 'cache', pname: 'drop'};
  await page.route('**/api/v1/flows/flow-1', route => route.fulfill({json: detail}));
  await page.goto('/#/rules?tab=flows&id=flow-1');
  const step = page.locator('.rp-step').filter({hasText: 'Input'});
  await expect(step.getByText('cache', {exact: true})).toBeVisible();
  await expect(step.getByText('drop', {exact: true})).toBeVisible();
  await expect(page.getByRole('group', {name: 'Observation coverage'})).toContainText('not fully observed');
});

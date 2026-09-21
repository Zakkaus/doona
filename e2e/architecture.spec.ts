import type {Page} from '@playwright/test';
import {createMockApi} from '../src/api/mock';
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
  changed();
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('changed-generation');
  const before = reads;
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('out of step');
  await expect.poll(() => reads).toBeGreaterThan(before);
  expect(writes).toBe(0);
  await expect(dialog).toBeVisible();
});

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

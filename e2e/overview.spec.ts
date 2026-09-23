import {downloadText, expect, mockBackend, test} from './fixtures';

test('overview exports runtime and reports a failed accepted reload without success', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const runtime = await api.runtime();
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  handlers['POST operations/reload'] = async () => ({
    operation_id: 'reload-failed',
    kind: 'reload',
    status: 'queued',
    href: '/api/v1/operations/reload-failed',
    retryAfter: 2
  });
  handlers['GET operations/reload-failed'] = async () => {
    await pending;
    return {
      operation_id: 'reload-failed',
      kind: 'reload',
      status: 'failed',
      created_at: runtime.observed_at,
      started_at: runtime.observed_at,
      finished_at: runtime.observed_at,
      result: null,
      error: {code: 'operation_failed', message: 'Reload rejected by engine'}
    };
  };
  await page.goto('/#/overview');
  const reload = page.getByRole('button', {name: 'Reload', exact: true});
  await expect(reload).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export state JSON', exact: true}).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^doona-state-.*\.json$/);
  expect(JSON.parse(await downloadText(download)).runtime).toMatchObject({instance_id: runtime.instance_id, lifecycle: {state: 'running'}});
  const polling = page.waitForRequest('**/api/v1/operations/reload-failed');
  const accepted = page.waitForResponse(response => response.url().endsWith('/operations/reload') && response.request().method() === 'POST');
  await reload.click();
  const response = await accepted;
  expect(response.status()).toBe(202);
  expect(response.headers()['retry-after']).toBe('2');
  expect(response.headers().location).toBe('/api/v1/operations/reload-failed');
  try {
    await expect(reload).toBeDisabled();
    await expect(page.getByRole('button', {name: 'Suspend', exact: true})).toBeDisabled();
    await polling;
    await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('.rp-toast.negative')).toContainText('Reload rejected by engine');
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  await expect(reload).toBeEnabled();
  expect(requests.filter(request => request.method() === 'POST').map(request => new URL(request.url()).pathname)).toEqual(['/api/v1/operations/reload']);
});

test('overview suspend and resume follow the completed lifecycle', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.goto('/#/overview');
  await page.getByRole('button', {name: 'Suspend', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Resume', exact: true})).toBeEnabled();
  await expect(page.locator('.rp-toast.positive')).toContainText('Suspend: Completed');
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Suspend', exact: true})).toBeEnabled();
  await expect(page.locator('.rp-toast.positive').last()).toContainText('Resume: Completed');
  expect(requests.filter(request => request.method() === 'POST').map(request => new URL(request.url()).pathname)).toEqual([
    '/api/v1/operations/suspend',
    '/api/v1/operations/resume'
  ]);
});

test('an accepted source reload respects Retry-After and retains the draft on terminal failure', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  let acceptedAt = 0;
  let polledAt = 0;
  handlers[`PUT config/sources/${source.id}`] = async () => {
    acceptedAt = Date.now();
    return {operation_id: 'source-failed', kind: 'reload', status: 'queued', href: '/api/v1/operations/source-failed', retryAfter: 2};
  };
  handlers['GET operations/source-failed'] = async () => {
    polledAt = Date.now();
    const timestamp = new Date().toISOString();
    return {
      operation_id: 'source-failed',
      kind: 'reload',
      status: 'failed',
      created_at: timestamp,
      started_at: timestamp,
      finished_at: timestamp,
      result: null,
      error: {code: 'operation_failed', message: 'Source reload failed'}
    };
  };
  await page.goto('/#/config?tab=source');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const draft = source.content + '\n# keep this draft\n';
  await page.locator('.cm-content').fill(draft);
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Source reload failed');
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('# keep this draft');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
  expect(polledAt - acceptedAt).toBeGreaterThanOrEqual(1900);
  const write = requests.find(request => request.method() === 'PUT')!;
  expect(write.postDataJSON()).toEqual({content: draft});
  expect(write.headers()['if-match']).toBe(`"${source.content_sha256}"`);
});

test('backend feature labels and statuses use one stacked layout', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/overview');
  const card = page.getByRole('region', {name: 'Backend features', exact: true});
  await expect(card.getByText('Connections', {exact: true})).toBeVisible();
  const rows = await card.locator('.rp-list-columns > div').evaluateAll(elements =>
    elements.map(element => {
      const [label, status] = [...element.children].map(child => child.getBoundingClientRect());
      return {label: {left: label.left, bottom: label.bottom}, status: {left: status.left, top: status.top}};
    })
  );
  for (const row of rows) {
    expect(row.status.top).toBeGreaterThanOrEqual(row.label.bottom);
    expect(row.status.left).toBeCloseTo(row.label.left, 0);
  }
});

import {ApiError} from '../src/api/error';
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

test('a reload the backend forgot while polling reports an unknown result and re-reads the page', async ({page}) => {
  const {handlers, requests} = await mockBackend(page);
  handlers['POST operations/reload'] = async () => ({
    operation_id: 'reload-lost',
    kind: 'reload',
    status: 'queued',
    href: '/api/v1/operations/reload-lost',
    retryAfter: 1
  });
  handlers['GET operations/reload-lost'] = async () => {
    throw new ApiError(404, 'resource_not_found', 'Operation not found');
  };
  await page.goto('/#/overview');
  const reload = page.getByRole('button', {name: 'Reload', exact: true});
  await expect(reload).toBeEnabled();
  // The version is read once and only again on a full re-read.
  const versionReads = () => requests.filter(request => new URL(request.url()).pathname === '/api/v1/version').length;
  await expect.poll(versionReads).toBe(1);
  await reload.click();
  await expect(page.locator('.rp-toast.neutral')).toHaveText(/^Could not confirm the result of the operation; the data was reloaded/);
  await expect(page.locator('.rp-toast.negative')).toHaveCount(0);
  await expect.poll(versionReads).toBe(2);
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

test('backend features share columns with inline statuses', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/overview');
  const card = page.getByRole('region', {name: 'Backend features', exact: true});
  await expect(card.getByText('Connections', {exact: true})).toBeVisible();
  const rows = await card.locator('.rp-capabilities > div').evaluateAll(elements =>
    elements.map(element => {
      const [label, status] = [...element.children].map(child => child.getBoundingClientRect());
      return {label: {left: label.left, top: label.top}, status: {left: status.left, top: status.top}};
    })
  );
  expect(rows.length).toBeGreaterThan(10);
  expect(new Set(rows.map(row => Math.round(row.label.left))).size).toBeGreaterThanOrEqual(2);
  for (const row of rows) {
    expect(Math.abs(row.status.top - row.label.top)).toBeLessThan(8);
    expect(row.status.left).toBeGreaterThan(row.label.left);
  }
});

test('overview cards keep readable summaries and fill their rows at 1024 px', async ({page}) => {
  await page.goto('/#/overview');
  for (const lang of ['zh-TW', 'en']) {
    for (const scheme of ['light', 'dark']) {
      await page.evaluate(
        ({lang, scheme}) => {
          localStorage.setItem('doona-lang', lang);
          localStorage.setItem('doona-scheme', scheme);
        },
        {lang, scheme}
      );
      for (const width of [1024, 1280, 1440]) {
        await page.setViewportSize({width, height: 900});
        await page.reload();
        await expect(page.locator('.rp-capability').first()).toBeVisible();
        const columns = await page.locator('.rp-capability').evaluateAll(rows => new Set(rows.map(row => Math.round(row.getBoundingClientRect().left))).size);
        expect(columns, `${lang} ${scheme} ${width}px capability columns`).toBeGreaterThanOrEqual(2);
        if (width !== 1024) continue;
        const memory = page.locator('.rp-g3 > .rp-card:nth-child(3)');
        const memoryBar = memory.locator('.rp-bar .top .l');
        expect(await memoryBar.evaluate(label => label.scrollWidth <= label.clientWidth), 'memory label is not clipped').toBe(true);
        const memoryWidth = await memory.evaluate(card => card.getBoundingClientRect().width);
        const gridWidth = await page.locator('.rp-g3').evaluate(grid => grid.getBoundingClientRect().width);
        expect(Math.abs(memoryWidth - gridWidth)).toBeLessThan(2);
        const bottomGap = await page.locator('.rp-overview-lower > .rp-card:first-child').evaluate(card => {
          const content = [...card.children].at(-1)!;
          return card.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom;
        });
        expect(bottomGap).toBeLessThan(40);
      }
    }
  }
});

test('Activity and Overview keep cards in each grid row equal height', async ({page}) => {
  for (const scheme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('doona-scheme', value), scheme);
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({width, height: 900});
      for (const route of ['activity', 'overview']) {
        await page.goto('/#/' + route);
        await expect(page.locator('.rp-card').first()).toBeVisible();
        if (route === 'overview') await expect(page.locator('.rp-capability').first()).toBeVisible();
        const rows = await page.locator('.rp-quick, .rp-strip, .rp-g21, .rp-g3').evaluateAll(grids =>
          grids.flatMap(grid => {
            const cards = [...grid.children].filter(child => child.classList.contains('rp-card'));
            const byTop = new Map<number, number[]>();
            for (const card of cards) {
              const rect = card.getBoundingClientRect();
              const top = Math.round(rect.top);
              byTop.set(top, [...(byTop.get(top) ?? []), rect.height]);
            }
            return [...byTop.values()].filter(heights => heights.length > 1);
          })
        );
        if (route === 'activity' || width >= 1024) expect(rows.length, `${route} ${scheme} ${width}px`).toBeGreaterThan(0);
        for (const heights of rows) expect(Math.max(...heights) - Math.min(...heights), `${route} ${scheme} ${width}px`).toBeLessThanOrEqual(2);
      }
    }
  }
});

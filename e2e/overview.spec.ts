import {ApiError} from '../src/api/error';
import {downloadText, expect, expectLoadFailures, faults, mockBackend, setAppearance, settle, test} from './fixtures';

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
  // Reload asks first, as the top bar's does, and sends nothing until it is confirmed.
  const dialog = page.getByRole('dialog', {name: 'Reload honk?'});
  await expect(dialog).toContainText('Held rules are not written');
  expect(requests.filter(request => request.method() === 'POST')).toEqual([]);
  await dialog.getByRole('button', {name: 'Reload honk', exact: true}).click();
  await expect(dialog).toHaveCount(0);
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
  await page.getByRole('dialog', {name: 'Reload honk?'}).getByRole('button', {name: 'Reload honk', exact: true}).click();
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
  const draft = source.content + '\n# keep this draft\n';
  await page.locator('.cm-content').fill(draft);
  await page.locator('.rp-editor-toolbar').getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Source reload failed');
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('# keep this draft');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
  expect(polledAt - acceptedAt).toBeGreaterThanOrEqual(1900);
  const write = requests.find(request => request.method() === 'PUT')!;
  expect(write.postDataJSON()).toEqual({content: draft});
  expect(write.headers()['if-match']).toBe(`"${source.content_sha256}"`);
});

test('backend features lead with a dot, keep whole labels and share columns', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/overview');
  const card = page.getByRole('region', {name: 'Backend features', exact: true});
  await expect(card.getByText('Connections', {exact: true})).toBeVisible();
  const rows = await card.locator('.rp-capability').evaluateAll(elements =>
    elements.map(element => {
      const label = element.querySelector('.rp-light .rp-link')!;
      return {left: Math.round(element.getBoundingClientRect().left), cut: label.scrollWidth > label.clientWidth, text: element.textContent};
    })
  );
  expect(rows.length).toBeGreaterThan(10);
  expect(new Set(rows.map(row => row.left)).size).toBeGreaterThanOrEqual(2);
  for (const row of rows) {
    expect(row.cut).toBe(false);
    // The status stays in the text even where only the dot shows it.
    expect(row.text).toMatch(/available/i);
  }
});

test('overview cards keep readable summaries and fill their rows at 1024 px', async ({page}) => {
  await page.goto('/#/overview');
  for (const lang of ['zh-TW', 'en']) {
    for (const scheme of ['light', 'dark']) {
      await setAppearance(page, lang, scheme);
      for (const width of [1024, 1280, 1440]) {
        await page.setViewportSize({width, height: 900});
        await settle(page);
        await page.reload();
        await expect(page.locator('.rp-capability').first()).toBeVisible();
        const columns = await page.locator('.rp-capability').evaluateAll(rows => new Set(rows.map(row => Math.round(row.getBoundingClientRect().left))).size);
        expect(columns, `${lang} ${scheme} ${width}px capability columns`).toBeGreaterThanOrEqual(2);
        if (width !== 1024) continue;
        const memory = page.locator('.rp-g3 > .rp-card:nth-child(3)');
        const memoryLabel = memory.locator('.rp-kv-meter .k');
        expect(await memoryLabel.evaluate(label => label.scrollWidth <= label.clientWidth), 'memory label is not clipped').toBe(true);
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

// Activity's dashboard sections pack like masonry, so there the rule is that the cards starting a row together end
// level, except one with a card under it in its columns.
test('Activity and Overview keep cards in each grid row equal height', async ({page}) => {
  for (const scheme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('doona-scheme', value), scheme);
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({width, height: 900});
      for (const route of ['activity', 'overview']) {
        await page.goto('/#/' + route);
        await expect(page.locator('.rp-card').first()).toBeVisible();
        if (route === 'overview') await expect(page.locator('.rp-capability').first()).toBeVisible();
        const rows = await page.locator('.rp-strip, .rp-g21, .rp-g3, .rp-dash-section').evaluateAll(grids =>
          grids.flatMap(grid => {
            const cards = [...grid.children].filter(child => child.classList.contains('rp-card') || child.classList.contains('rp-dashboard-cell'));
            if (grid.classList.contains('rp-dash-section')) {
              const boxes = cards.map(card => card.getBoundingClientRect());
              const open = boxes.filter(box => !boxes.some(other => other.top >= box.bottom && other.left < box.right - 1 && other.right > box.left + 1));
              const rows = new Map<number, number[]>();
              for (const box of open) rows.set(Math.round(box.top), [...(rows.get(Math.round(box.top)) ?? []), box.bottom]);
              return [...rows.values()];
            }
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

test('a runtime degradation shows as one warning line in the Datapath card', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/overview');
  const card = page.getByRole('region', {name: 'Datapath', exact: true});
  const line = card.locator('.rp-cluster .rp-light.warn', {hasText: 'QUIC probes are off, so node scores use other probes only'});
  await expect(line).toHaveCount(1);
});
test('the cgroup scope explains itself in a help popover', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/overview');
  await page.getByRole('button', {name: 'About cgroup scope', exact: true}).click();
  const help = page.getByRole('dialog', {name: 'cgroup scope'});
  await expect(help).toContainText(
    'This service: This cgroup holds only this service. Its used memory counts toward this service, and usage is the used memory against the limit.'
  );
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
});

test('a read the backend never answers fails at the deadline and recovers on retry', async ({page}) => {
  const backend = await mockBackend(page);
  expectLoadFailures(page, /\/api\/v1\/datapath/);
  let hold = true;
  backend.handlers['GET datapath'] = async () => (hold ? new Promise(() => {}) : backend.api.datapath('full'));
  await page.clock.install();
  await page.goto('/#/overview');
  await expect.poll(() => backend.requests.some(request => new URL(request.url()).pathname === '/api/v1/datapath')).toBe(true);
  await page.clock.fastForward(15000);
  const alert = page.getByRole('alert').filter({hasText: 'The backend did not answer within 15 seconds.'});
  await expect(alert).toBeVisible();
  hold = false;
  await alert.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(alert).toHaveCount(0);
});

test.describe('with the base profile', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('the features that are off are grouped by cause below the other cards, and Activity links to System status', async ({page}) => {
    await page.goto('/#/overview');
    const card = page.locator('section').filter({has: page.getByRole('heading', {name: 'Features that are off', exact: true})});
    const rows = card.locator('.rp-limit');
    // Each cause is one row: the result, then the features it covers unless the result already names them.
    await expect(rows.locator('.rp-limit-text > span:first-child')).toHaveText([
      'The configuration cannot be read',
      'The configuration turns off 4 recorders',
      'Geodata is unavailable',
      'Subscriptions cannot be updated for now',
      'This honk build lacks 6 features'
    ]);
    await expect(rows.nth(0).locator('.rp-note')).toHaveText('Configuration, Validation, Nodes and node sources');
    await expect(rows.nth(1).locator('.rp-note')).toHaveText('DNS log, Traffic history, Memory history, Logs');
    await expect(rows.nth(2).locator('.rp-note')).toHaveCount(0);
    await expect(card.locator('pre')).toHaveCount(0);
    // The recorders' help holds the settings that turn them on.
    await rows.nth(1).getByRole('button', {name: 'How to turn on'}).click();
    const help = page.getByRole('dialog', {name: 'How to turn on'});
    await expect(help).toContainText('Add the settings below to the configuration, then restart honk.');
    await expect(help.locator('pre')).toHaveText(
      'experimental {\n  native_api {\n    record_dns_log: true\n    record_traffic: true\n    record_memory: true\n    record_logs: true\n  }\n}'
    );
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await expect(rows.nth(4).getByRole('link', {name: 'Version requirements'})).toHaveAttribute('href', /\/en\/requirements\.html#honk-version$/);
    // The card sits below the Datapath and Backend features row, across the page.
    const lower = await page.locator('.rp-overview-lower').boundingBox();
    const box = await card.boundingBox();
    expect(box!.y).toBeGreaterThan(lower!.y + lower!.height);
    // Backend features lists only what is on, as dots.
    const features = page.locator('section').filter({has: page.getByRole('heading', {name: 'Backend features', exact: true})});
    await expect(features.locator('.rp-capability').filter({hasText: 'Logs'})).toHaveCount(0);
    await expect(features.locator('.rp-capability').filter({hasText: 'Connections'})).toHaveCount(1);
    await page.goto('/#/activity');
    const details = page.locator('[data-instance="status"]').getByRole('link');
    await expect(details).toHaveCount(1);
    await details.click();
    await expect(page).toHaveURL(/#\/overview$/);
    await expect(page.getByRole('heading', {name: 'System status', exact: true})).toBeVisible();
  });
});

test.describe(() => {
  test.use({storage: faults});
  test('the header shows a degraded datapath beside the lifecycle and links to the Datapath card', async ({page}) => {
    await page.goto('/#/overview');
    const status = page.locator('.rp-page > .rp-between').getByRole('link', {name: 'Running, datapath degraded', exact: true});
    await expect(status).toHaveAttribute('href', '#/overview?card=datapath');
    await expect(status.locator('.rp-light')).toHaveClass(/\bwarn\b/);
  });
});

test('a backend feature that is on opens where it is used', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/overview');
  const card = page.getByRole('region', {name: 'Backend features', exact: true});
  await card.getByRole('link', {name: 'DNS cache', exact: true}).click();
  await expect(page).toHaveURL(/#\/dns\?tab=cache$/);
  await expect(page.getByRole('tab', {name: 'Cache', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await card.getByRole('link', {name: 'Connections', exact: true}).click();
  await expect(page).toHaveURL(/#\/connections\?tab=list$/);
});

test('QUIC degradation wraps within the phone content column', async ({page}) => {
  await page.setViewportSize({width: 390, height: 1000});
  await page.goto('/#/overview');
  const warning = page.locator('.rp-light').filter({hasText: /QUIC/}).last();
  await expect(warning).toBeVisible();
  const bounds = await warning.evaluate(el => {
    const r = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    return {
      scroll: el.scrollWidth,
      client: el.clientWidth,
      text: range.getBoundingClientRect().right,
      edge: r.right,
      whiteSpace: getComputedStyle(el).whiteSpace
    };
  });
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
  expect(bounds.text).toBeLessThanOrEqual(bounds.edge + 1);
  expect(bounds.whiteSpace).not.toBe('nowrap');
});

test('the memory card meters cgroup usage by its name and value text', async ({page}) => {
  await page.goto('/#/overview');
  const meter = page.getByRole('region', {name: 'Memory', exact: true}).getByRole('meter', {name: 'cgroup usage', exact: true});
  await expect(meter).toBeVisible();
  await expect(meter).toHaveAttribute('aria-valuetext', /^\S+(?: \S+)? \/ \S+ \S+$/);
  await expect(meter.locator('.v')).toHaveText((await meter.getAttribute('aria-valuetext'))!);
  expect(Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
});

// The skeleton draws the loaded body's grid and caption line, so the card is as tall before its values as after.
test('a loading card holds its loaded height with a skeleton', async ({page}) => {
  const {handlers, api} = await mockBackend(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => (release = resolve));
  handlers['GET runtime'] = async () => {
    await held;
    return api.runtime();
  };
  await page.setViewportSize({width: 390, height: 1000});
  await page.goto('/#/overview');
  const card = page.getByRole('region', {name: 'Traffic counters', exact: true});
  await expect(card.locator('.rp-skeleton')).toBeVisible();
  await expect(card.locator('.rp-skeleton [role=status]')).toHaveText('Loading…');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const waiting = await card.evaluate(element => element.getBoundingClientRect().height);
  release();
  await expect(card.locator('.rp-skeleton')).toHaveCount(0);
  await expect(card.locator('.rp-kv')).toBeVisible();
  const loaded = await card.evaluate(element => element.getBoundingClientRect().height);
  expect(Math.abs(loaded - waiting)).toBeLessThan(1);
});

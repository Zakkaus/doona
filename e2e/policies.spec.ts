import {expect, expectLoadFailures, mockBackend, test} from './fixtures';

test('policies select a member, pin one network, release and test the group', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const selector = page.getByRole('region', {name: 'proxy', exact: true});
  const selected = selector.getByRole('button', {name: /^sg-01\b/});
  await selected.click();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rp-toast.positive')).toContainText('proxy selected sg-01');
  const automatic = page.getByRole('region', {name: 'resilient', exact: true});
  await automatic.getByRole('radio', {name: 'TCP', exact: true}).click();
  const pinned = automatic.getByRole('button', {name: /^us-01\b/});
  await pinned.click();
  await expect(pinned).toHaveAttribute('aria-pressed', 'true');
  await expect(automatic.getByText('Pinned', {exact: true})).toBeVisible();
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'resilient pinned us-01'})).toBeVisible();
  await automatic.getByRole('button', {name: 'Back to automatic', exact: true}).click();
  await expect(automatic.getByText('Automatic', {exact: true})).toBeVisible();
  await expect(automatic.getByRole('button', {name: 'Back to automatic', exact: true})).toHaveCount(0);
  await expect(automatic.getByRole('button', {name: /^sg-01\b/})).toHaveAttribute('aria-pressed', 'true');
  await automatic.getByRole('button', {name: 'Test all', exact: true}).click();
  await expect(page.locator('.rp-toast.positive').filter({hasText: /resilient.*Available.*selection: (changed|unchanged)/})).toBeVisible();
  await expect(automatic.getByRole('button', {name: 'Test all', exact: true})).toBeEnabled();
  const controls = requests.filter(request => request.method() !== 'GET');
  expect(controls.map(request => [request.method(), new URL(request.url()).pathname + new URL(request.url()).search])).toEqual([
    ['PUT', '/api/v1/groups/proxy/selection'],
    ['PUT', '/api/v1/groups/resilient/selection'],
    ['DELETE', '/api/v1/groups/resilient/selection?network=tcp'],
    ['POST', '/api/v1/probes']
  ]);
  expect(controls[0].postDataJSON()).toEqual({member_id: 'sg-01', network: 'both'});
  expect(controls[1].postDataJSON()).toEqual({member_id: 'us-01', network: 'tcp'});
  expect(controls[3].postDataJSON()).toMatchObject({target: {type: 'group', group_id: 'resilient'}, transport: ['tcp']});
});

test('a group card mounted on screen shows its members in the first frame', async ({page}) => {
  // Checked in the frame callback, which sees what is about to be painted.
  await page.addInitScript(() => {
    const check = () => {
      for (const wait of document.querySelectorAll('.rp-content section.rp-card .rp-wait-line'))
        if (wait.closest('section')!.getBoundingClientRect().top < innerHeight) document.documentElement.dataset.waited = '';
    };
    new MutationObserver(() => requestAnimationFrame(check)).observe(document, {childList: true, subtree: true});
  });
  await page.goto('/#/policies');
  await expect(page.locator('.rp-content .rp-node').first()).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-waited');
});

test('a group whose networks use different members marks each with its network', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/policies');
  const proxy = page.getByRole('region', {name: 'proxy', exact: true});
  const tcp = proxy.getByRole('button', {name: /^hk-01\b/});
  const udp = proxy.getByRole('button', {name: /^hk-02\b/});
  await expect(tcp).toHaveClass(/\bcur\b/);
  await expect(udp).toHaveClass(/\bcur\b/);
  await expect(tcp.locator('.cur')).toHaveText('TCP');
  await expect(udp.locator('.cur')).toHaveText('UDP');
  await expect(proxy.getByRole('button', {name: /^sg-01\b/})).not.toHaveClass(/\bcur\b/);
});

test('the page note does not promise pinning, which honk groups refuse', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/policies');
  await expect(page.locator('.rp-note').first()).toHaveText('Manual groups switch members directly, and TCP and UDP can be selected separately.');
});

// Where a palette sets tone text to body text, the dot still carries the latency tone.
for (const palette of ['rose-pine/dawn', 'rose-pine/moon'])
  test(`member latencies carry a tone dot in ${palette}`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem('doona-palette', value), palette);
    await page.goto('/#/policies');
    const tones = await page
      .locator('.rp-node .ms')
      .first()
      .waitFor()
      .then(() =>
        page.$$eval('.rp-node .ms', spans => {
          const resolve = (name: string) => {
            const probe = document.createElement('span');
            probe.style.color = `var(${name})`;
            document.body.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          };
          const expected = {ok: resolve('--rp-positive'), warn: resolve('--rp-notice'), err: resolve('--rp-negative')};
          return spans
            .map(span => {
              const tone = (['ok', 'warn', 'err'] as const).find(name => span.classList.contains(name));
              const dot = getComputedStyle(span, '::before');
              return tone
                ? {tone, dot: dot.backgroundColor, want: expected[tone], size: [dot.display, parseFloat(dot.width), parseFloat(dot.height)] as const}
                : null;
            })
            .filter(item => item !== null);
        })
      );
    expect(tones.length).toBeGreaterThan(0);
    for (const {tone, dot, want, size} of tones) {
      expect(dot, tone).toBe(want);
      // A dot that is not drawn would carry the colour all the same.
      expect(size[0], tone).not.toBe('none');
      expect(Math.min(size[1], size[2]), tone).toBeGreaterThan(0);
    }
  });

test('a group check URL is edited in its dialog, refused inline when unsafe', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'resilient', exact: true});
  await expect(page.getByRole('region', {name: 'proxy', exact: true}).getByRole('button', {name: 'Check settings', exact: true})).toHaveCount(0);
  await card.getByRole('button', {name: 'Check settings', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Check settings for resilient'});
  const url = dialog.getByRole('textbox', {name: 'Check URL'});
  await url.fill('http://user@cp.cloudflare.com/');
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Enter an http or https URL with a host')).toBeVisible();
  const url204 = 'https://cp.cloudflare.com/generate_204';
  await url.fill(url204);
  await expect(dialog.getByText('Enter an http or https URL with a host')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'Configuration for resilient written and reloaded'})).toBeVisible();
  await card.getByRole('button', {name: 'Configuration', exact: true}).click();
  await expect(card.getByText(url204, {exact: true})).toBeVisible();
  const patches = requests.filter(request => request.method() === 'PATCH');
  expect(patches.map(request => [new URL(request.url()).pathname, request.postDataJSON()])).toEqual([
    [
      '/api/v1/groups/resilient',
      [
        {op: 'test', path: '/config/check_url', value: null},
        {op: 'replace', path: '/config/check_url', value: url204}
      ]
    ]
  ]);
  expect(patches[0].headers()['if-match']).toBe('"40"');
});

test('a check URL another client changed while the dialog was open is not overwritten', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'resilient', exact: true});
  await card.getByRole('button', {name: 'Check settings', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Check settings for resilient'});
  const remote = 'http://remote.example/';
  const accepted = await api.patchGroup('resilient', [{op: 'replace', path: '/config/check_url', value: remote}], '"40"');
  await expect.poll(async () => 'operation_id' in accepted && (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  await dialog.getByRole('textbox', {name: 'Check URL'}).fill('https://cp.cloudflare.com/generate_204');
  const save = dialog.getByRole('button', {name: 'Save', exact: true});
  // The first save carries the revision the page loaded and is refused as stale, which fetches the group again.
  await save.click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Revision changed');
  await expect.poll(() => requests.filter(request => request.method() === 'GET' && request.url().endsWith('/groups/resilient')).length).toBeGreaterThan(1);
  // The retry carries the current revision, but the URL it opened with no longer holds, so the backend refuses it.
  await save.click();
  await expect(page.locator('.rp-toast.negative').filter({hasText: 'Patch test failed'})).toBeVisible();
  await expect(dialog).toBeVisible();
  // The dialog now shows the URL the group holds, so a further save tests against it.
  await expect(dialog.getByRole('textbox', {name: 'Check URL'})).toHaveValue(remote);
  expect((await api.group('resilient')).config.check_url).toBe(remote);
});

test('a check save refused with 409 reads the group again and shows what it holds now', async ({page}) => {
  const {api} = await mockBackend(page);
  expectLoadFailures(page, /\/groups\/resilient$/);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'resilient', exact: true});
  await card.getByRole('button', {name: 'Check settings', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Check settings for resilient'});
  const url = dialog.getByRole('textbox', {name: 'Check URL'});
  await expect(url).toHaveValue('');
  const remote = 'http://remote.example/';
  const accepted = await api.patchGroup('resilient', [{op: 'replace', path: '/config/check_url', value: remote}], '"40"');
  await expect.poll(async () => 'operation_id' in accepted && (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  // The page still holds the revision it loaded; the backend refuses the save once, as it would a failed test op.
  let refused = false;
  await page.route('**/api/v1/groups/resilient', route => {
    if (route.request().method() !== 'PATCH' || refused) return route.fallback();
    refused = true;
    return route.fulfill({status: 409, json: {request_id: 'policies-test', error: {code: 'state_conflict', message: 'Patch test failed'}}});
  });
  await url.fill('https://cp.cloudflare.com/generate_204');
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(page.locator('.rp-toast.negative').filter({hasText: 'Patch test failed'})).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(url).toHaveValue(remote);
});

test('a disabled Test all does not blame TCP support when the probe limits rule it out', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  // The group takes TCP probes; the backend's job limit is what rules Test all out.
  capabilities.resources.probes.limits!.max_members_per_job = 0;
  await page.goto('/#/policies');
  const probe = page.getByRole('region', {name: 'resilient', exact: true}).getByRole('button', {name: 'Test all', exact: true});
  await expect(probe).toBeDisabled();
  // The reason is a line under the card's header, in view on every width, and the button's description.
  const reason = 'Test all is not available for this group';
  await expect(page.getByRole('region', {name: 'resilient', exact: true}).getByText(reason, {exact: true})).toBeVisible();
  await expect(probe).toHaveAccessibleDescription(reason);
});

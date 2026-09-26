import {expect, mockBackend, test} from './fixtures';

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
    ['/api/v1/groups/resilient', [{op: 'replace', path: '/config/check_url', value: url204}]]
  ]);
  expect(patches[0].headers()['if-match']).toBe('"40"');
});

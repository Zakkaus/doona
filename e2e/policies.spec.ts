import {expect, expectLoadFailures, mockBackend, test, moreAction, moreItem, scrollIntoList} from './fixtures';

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
  await moreAction(automatic, 'Back to automatic');
  await expect(automatic.getByText('Automatic', {exact: true})).toBeVisible();
  await expect(await moreItem(automatic, 'Back to automatic')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(automatic.getByRole('button', {name: /^sg-01\b/})).toHaveAttribute('aria-pressed', 'true');
  await moreAction(automatic, 'Test all');
  await expect(page.locator('.rp-toast.positive').filter({hasText: /resilient.*Available.*selection: (changed|unchanged)/})).toBeVisible();
  await expect(await moreItem(automatic, 'Test all')).toBeEnabled();
  await page.keyboard.press('Escape');
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
  await moreAction(card, 'Check settings');
  const dialog = page.getByRole('dialog', {name: 'Check settings for resilient'});
  const url = dialog.getByRole('textbox', {name: 'Check URL'});
  await url.fill('http://user@cp.cloudflare.com/');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Enter an http or https URL with a host')).toBeVisible();
  const url204 = 'https://cp.cloudflare.com/generate_204';
  await url.fill(url204);
  await expect(dialog.getByText('Enter an http or https URL with a host')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'Configuration for resilient written and reloaded'})).toBeVisible();
  await card.getByRole('button', {name: 'Configuration', exact: true}).click();
  await expect(card.getByText(url204, {exact: true})).toBeVisible();
  const patches = requests.filter(request => request.method() === 'PATCH');
  expect(patches.map(request => [new URL(request.url()).pathname, request.postDataJSON()])).toEqual([
    [
      '/api/v1/groups/resilient/config',
      [
        {op: 'test', path: '/config/check_url', value: null},
        {op: 'replace', path: '/config/check_url', value: url204}
      ]
    ]
  ]);
  expect(patches[0].headers()['if-match']).toBe('"40"');
});

test('a check URL another client changed while the dialog was open is shown before it is replaced', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'resilient', exact: true});
  await moreAction(card, 'Check settings');
  const dialog = page.getByRole('dialog', {name: 'Check settings for resilient'});
  const remote = 'http://remote.example/';
  const accepted = await api.patchGroup('resilient', [{op: 'replace', path: '/config/check_url', value: remote}], '"40"');
  await expect.poll(async () => 'operation_id' in accepted && (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  const mine = 'https://cp.cloudflare.com/generate_204';
  const url = dialog.getByRole('textbox', {name: 'Check URL'});
  await url.fill(mine);
  const save = dialog.getByRole('button', {name: 'Apply', exact: true});
  // The save carries the revision the page loaded and is refused as stale, which fetches the group again.
  await save.click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Content changed since it was loaded');
  await expect.poll(() => requests.filter(request => request.method() === 'GET' && request.url().endsWith('/groups/resilient')).length).toBeGreaterThan(1);
  // The dialog keeps the edit and already shows the URL the group holds; nothing was overwritten.
  await expect(dialog).toBeVisible();
  await expect(url).toHaveValue(mine);
  await expect(url).toHaveAccessibleDescription(`Changed to ${remote} on the backend after this opened. Applying again replaces it with the value here.`);
  expect((await api.group('resilient')).config.check_url).toBe(remote);
  // Applying again tests against the URL shown, at the current revision, so it goes through.
  await save.click();
  await expect(dialog).toHaveCount(0);
  const patches = requests.filter(request => request.method() === 'PATCH');
  expect(patches.at(-1)?.postDataJSON()).toEqual([
    {op: 'test', path: '/config/check_url', value: remote},
    {op: 'replace', path: '/config/check_url', value: mine}
  ]);
  await expect.poll(async () => (await api.group('resilient')).config.check_url).toBe(mine);
});

test('a check save refused with 409 keeps the edit and shows what the group holds now', async ({page}) => {
  const {api} = await mockBackend(page);
  expectLoadFailures(page, /\/groups\/resilient\/config$/);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'resilient', exact: true});
  await moreAction(card, 'Check settings');
  const dialog = page.getByRole('dialog', {name: 'Check settings for resilient'});
  const url = dialog.getByRole('textbox', {name: 'Check URL'});
  await expect(url).toHaveValue('');
  const remote = 'http://remote.example/';
  const accepted = await api.patchGroup('resilient', [{op: 'replace', path: '/config/check_url', value: remote}], '"40"');
  await expect.poll(async () => 'operation_id' in accepted && (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  // The page still holds the revision it loaded; the backend refuses the save once, as it would a failed test op.
  let refused = false;
  await page.route('**/api/v1/groups/resilient/config', route => {
    if (route.request().method() !== 'PATCH' || refused) return route.fallback();
    refused = true;
    return route.fulfill({status: 409, json: {request_id: 'policies-test', error: {code: 'state_conflict', message: 'Patch test failed'}}});
  });
  const mine = 'https://cp.cloudflare.com/generate_204';
  await url.fill(mine);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.negative').filter({hasText: 'Patch test failed'})).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(url).toHaveValue(mine);
  await expect(url).toHaveAccessibleDescription(`Changed to ${remote} on the backend after this opened. Applying again replaces it with the value here.`);
});

test('a disabled Test all does not blame TCP support when the probe limits rule it out', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  // The group takes TCP probes; the backend's job limit is what rules Test all out.
  capabilities.resources.probes.limits!.max_members_per_job = 0;
  await page.goto('/#/policies');
  const probe = await moreItem(page.getByRole('region', {name: 'resilient', exact: true}), 'Test all');
  await expect(probe).toBeDisabled();
  // The reason is a line under the card's header, in view on every width, and the menu item's description.
  const reason = 'Test all is not available for this group';
  await expect(page.getByRole('region', {name: 'resilient', exact: true}).getByText(reason, {exact: true})).toBeVisible();
  await expect(probe).toHaveAccessibleDescription(reason);
});

test('a group is switched to the score policy in its edit dialog', async ({page}) => {
  await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'gaming', exact: true}), 'Edit group');
  let dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await dialog.getByRole('button', {name: /Selection policy/}).click();
  await expect(page.getByRole('option', {name: /^Score/})).toContainText('Picks a node by its observed reliability and recent connection quality');
  await page.getByRole('option', {name: /^Score/}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for gaming written and reloaded');
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content')).toContainText('gaming {\n    filter: name(jp-01, hk-02)\n    policy: score\n  }');
  // Reopened, the group shows the policy as chosen rather than as a raw name.
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'gaming', exact: true}), 'Edit group');
  dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await expect(dialog.getByRole('button', {name: /Selection policy/})).toContainText('Score');
});

test('the Configuration list opens the edit dialog, where a node becomes the final outbound and None clears it', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'proxy', exact: true});
  await card.getByRole('button', {name: 'Configuration', exact: true}).click();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group proxy'});
  const member = dialog.getByRole('button', {name: /Default member$/});
  const final = dialog.getByRole('button', {name: /Final outbound$/});
  // Opened from the list, the dialog starts on the first of the fields it shows.
  await expect(member).toBeFocused();
  // The demo's proxy group names hk-01 as its default, as the Configuration list shows.
  await expect(member).toContainText('hk-01');
  await expect(final).toContainText('None');
  await expect(final).toHaveAccessibleDescription('Used when the group has no eligible member. None sets no fallback.');
  await final.click();
  const list = page.getByRole('listbox');
  // The group itself is not offered; the built-ins and the other groups come before the nodes.
  await expect(list.getByRole('group', {name: 'Built-in'}).getByRole('option')).toHaveText(['direct', 'block']);
  await expect(list.getByRole('group', {name: 'Groups'}).getByRole('option')).toHaveText(['resilient', 'gaming', 'skylink']);
  // A node's latency takes the node menus' tone: under 100 ms ok, under 300 ms warn.
  for (const [name, tone] of [
    ['sg-01', 'ok'],
    ['us-01', 'warn']
  ]) {
    const option = list.getByRole('option', {name: new RegExp(`^${name}`)});
    await scrollIntoList(option);
    await expect(option.locator('.desc')).toHaveClass(`desc ${tone}`);
  }
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('SG-0');
  await expect(list.getByRole('option')).toHaveText([/^sg-01/]);
  const node = list.getByRole('option', {name: /^sg-01/});
  await scrollIntoList(node);
  await node.click();
  await expect(final).toContainText('sg-01');
  await member.click();
  const hk = page.getByRole('listbox').getByRole('option', {name: /^hk-02/});
  await scrollIntoList(hk);
  await hk.click();
  await expect(member).toContainText('hk-02');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for proxy written and reloaded');
  await expect.poll(async () => (await api.group('proxy')).config).toMatchObject({default_member_id: 'hk-02', final_outbound: 'sg-01'});
  await expect(card.getByText('sg-01', {exact: true})).toBeVisible();
  // None removes the line again.
  await moreAction(card, 'Edit group');
  await expect(final).toContainText('sg-01');
  await final.click();
  await page.getByRole('option', {name: 'None', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await api.group('proxy')).config.final_outbound).toBeNull();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  expect(main.content).toMatch(/proxy \{[^}]*default: hk-02[^}]*\}/);
  expect(main.content).not.toMatch(/proxy \{[^}]*final:/);
});

test('a final outbound does not offer the group or a group that nests it', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  // gaming nests resilient, so a final of resilient that named gaming would lead back to resilient.
  const accepted = await api.replaceConfigSource(
    main.id,
    main.content!.replace('gaming { filter:', 'gaming { filter: group(resilient) filter:'),
    `"${main.content_sha256}"`
  );
  await expect.poll(async () => (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'resilient', exact: true}), 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group resilient'});
  await dialog.getByRole('button', {name: /Final outbound$/}).click();
  await expect(page.getByRole('listbox').getByRole('group', {name: 'Groups'}).getByRole('option')).toHaveText(['proxy', 'skylink']);
});

test('the default member is offered only while the dialog selects manual selection, and a hidden one stays in the file', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'resilient', exact: true});
  await card.getByRole('button', {name: 'Configuration', exact: true}).click();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  let dialog = page.getByRole('dialog', {name: 'Edit group resilient'});
  const member = dialog.getByRole('button', {name: /Default member$/});
  const policy = dialog.getByRole('button', {name: /Selection policy/});
  // honk reads a default member only under manual selection, so a group that picks the fastest starts on the final outbound.
  await expect(dialog.getByRole('button', {name: /Final outbound$/})).toBeFocused();
  await expect(member).toHaveCount(0);
  await policy.click();
  await page.getByRole('option', {name: /^Manual/}).click();
  await expect(member).toBeVisible();
  // Appearing later, the picker leaves focus where it was.
  await expect(policy).toBeFocused();
  await policy.click();
  await page.getByRole('option', {name: /^First available/}).click();
  await expect(member).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  // Switching a manual group away writes the new policy and keeps its default line as written.
  await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'Edit group');
  dialog = page.getByRole('dialog', {name: 'Edit group proxy'});
  await expect(dialog.getByRole('button', {name: /Default member$/})).toContainText('hk-01');
  await dialog.getByRole('button', {name: /Selection policy/}).click();
  await page.getByRole('option', {name: /^Fastest on average/}).click();
  await expect(dialog.getByRole('button', {name: /Default member$/})).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for proxy written and reloaded');
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  expect(main.content).toMatch(/proxy \{[^}]*policy: min_moving_avg[^}]*default: hk-01[^}]*\}/);
});

test('a group edit refused over a file changed on disk saves on retry', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'resilient', exact: true}), 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group resilient'});
  await dialog.getByRole('textbox', {name: 'Filter 1'}).fill('name(hk-01, sg-01)');
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.replaceConfigSource(main.id, '# concurrent edit\n' + main.content, `"${main.content_sha256}"`);
  await expect.poll(async () => (await api.config()).sources.find(source => source.kind === 'main')!.content).toContain('# concurrent edit');
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await apply.click();
  await rejected;
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for resilient written and reloaded');
  const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(saved).toContain('# concurrent edit');
  expect(saved).toContain('filter: name(hk-01, sg-01)');
});

test('a group edit retried after a refusal writes against the declaration read again, not the one it opened on', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies');
  await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'Edit group');
  const dialog = page.getByRole('dialog', {name: 'Edit group proxy'});
  await expect(dialog.getByRole('button', {name: /Default member$/})).toContainText('hk-01');
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Filter 1'}).fill('name(hk-01)');
  // The concurrent edit quotes the default member: the same member, written differently.
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.replaceConfigSource(main.id, main.content!.replace('default: hk-01', "default: 'hk-01'"), `"${main.content_sha256}"`);
  await expect.poll(async () => (await api.config()).sources.find(source => source.kind === 'main')!.content).toContain("default: 'hk-01'");
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await apply.click();
  await rejected;
  await expect(dialog.getByRole('alert')).toBeVisible();
  await apply.click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for proxy written and reloaded');
  // The unchanged member keeps the spelling on disk, so the retry took its baseline from the fresh read.
  const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(saved).toMatch(/proxy \{[^}]*filter: name\(hk-01\)[^}]*default: 'hk-01'[^}]*\}/);
});

test('a long group name truncates with a tooltip and keeps the More menu on its title row', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const long = 'G'.repeat(150);
  const id = (await api.groups()).find(group => group.name === 'skylink')!.id;
  handlers[`GET groups/${id}`] = async () => ({...(await api.group(id)), name: long});
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/policies');
  const title = page.getByRole('heading', {name: long, exact: true});
  const card = page.getByRole('region').filter({has: title});
  await expect(title).toBeVisible();
  const cut = title.locator('.rp-truncate');
  expect(await cut.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const more = card.getByRole('button', {name: 'More actions', exact: true});
  const [titleBox, moreBox] = [await title.boundingBox(), await more.boundingBox()];
  expect(moreBox!.y).toBeLessThan(titleBox!.y + titleBox!.height);
  await cut.focus();
  await expect(page.getByRole('tooltip')).toHaveText(long);
});

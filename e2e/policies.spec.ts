import type {Locator, Page} from '@playwright/test';
import {expect, expectVirtualOptions, expectLoadFailures, mockBackend, test, moreAction, moreItem, scrollIntoList, editorText} from './fixtures';
import {readGroupEntries, writeGroupEntry, type GroupEntryUpdate} from '../src/dae/groups';

test('policies select a member, pin one network, release and test the group', async ({page}) => {
  const {requests} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const selector = page.getByRole('region', {name: 'proxy', exact: true});
  await selector.getByRole('searchbox', {name: 'Filter nodes'}).fill('-0');
  const selected = selector.getByRole('row', {name: 'sg-01', exact: true});
  await selected.click();
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.rp-toast.positive')).toContainText('proxy selected sg-01');
  const automatic = page.getByRole('region', {name: 'gaming', exact: true});
  // An automatic group folds its members under the summary until opened.
  await automatic.scrollIntoViewIfNeeded();
  const summary = automatic.getByRole('button', {name: /^Current/});
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(automatic.getByRole('radio', {name: 'TCP', exact: true})).toHaveCount(0);
  await summary.click();
  await automatic.getByRole('radio', {name: 'TCP', exact: true}).click();
  const pinned = automatic.getByRole('button', {name: /^jp-01\b/});
  await pinned.click();
  await expect(pinned).toHaveAttribute('aria-pressed', 'true');
  await expect(automatic.getByText('Pinned', {exact: true})).toBeVisible();
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'gaming pinned jp-01'})).toBeVisible();
  // The pinned light stays beside the summary while the members are folded.
  await summary.click();
  await expect(automatic.getByText('Pinned', {exact: true})).toBeVisible();
  await summary.click();
  await moreAction(automatic, 'Back to automatic');
  await expect(automatic.getByText('Pinned', {exact: true})).toHaveCount(0);
  await expect(await moreItem(automatic, 'Back to automatic')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(automatic.getByRole('button', {name: /^hk-02\b/})).toHaveAttribute('aria-pressed', 'true');
  await moreAction(automatic, 'Test all');
  await expect(page.locator('.rp-toast.positive').filter({hasText: /gaming.*Available.*selection: (changed|unchanged)/})).toBeVisible();
  await expect(await moreItem(automatic, 'Test all')).toBeEnabled();
  await page.keyboard.press('Escape');
  const controls = requests.filter(request => request.method() !== 'GET');
  expect(controls.map(request => [request.method(), new URL(request.url()).pathname + new URL(request.url()).search])).toEqual([
    ['PUT', '/api/v1/groups/proxy/selection'],
    ['PUT', '/api/v1/groups/gaming/selection'],
    ['DELETE', '/api/v1/groups/gaming/selection?network=tcp'],
    ['POST', '/api/v1/probes']
  ]);
  expect(controls[0].postDataJSON()).toEqual({member_id: 'sg-01', network: 'both'});
  expect(controls[1].postDataJSON()).toEqual({member_id: 'jp-01', network: 'tcp'});
  expect(controls[3].postDataJSON()).toMatchObject({target: {type: 'group', group_id: 'gaming'}, transport: ['tcp']});
});

test('rapid node switches paint only the current selection with ordinary motion', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.pollOperation(
    await api.replaceConfigSource(
      main.id,
      writeGroupEntry(main.content, 'gaming', {filters: ['name(jp-01, hk-02, sg-01, us-01)'], policy: 'min_moving_avg'}),
      `"${main.content_sha256}"`
    )
  );
  for (const id of ['gaming', 'proxy']) await api.selectGroup(id, {member_id: 'hk-02', network: 'both'});
  await page.goto('/#/policies?group=gaming');
  for (const id of ['gaming', 'proxy']) {
    const card = page.getByRole('region', {name: id, exact: true});
    await card.scrollIntoViewIfNeeded();
    if (id === 'proxy') await card.getByRole('searchbox', {name: 'Filter nodes'}).fill('-0');
    await expect(card.locator('.rp-node[data-selected]')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await card.evaluate(async el => {
      await Promise.allSettled([...el.querySelectorAll('.rp-node')].flatMap(n => n.getAnimations().map(a => a.finished)));
    });
    await card.evaluate(el => {
      const tiles = () => [...el.querySelectorAll('.rp-node')];
      const accent = getComputedStyle(tiles().find(n => n.hasAttribute('data-selected'))!).borderTopColor;
      const neutral = getComputedStyle(tiles().find(n => !n.hasAttribute('data-selected'))!).borderTopColor;
      const paint = {frames: 0, stop: false, failures: [] as string[]};
      Object.assign(window, {selectionPaint: paint});
      const sample = () => {
        if (paint.stop) return;
        paint.frames++;
        const nodes = tiles();
        if (nodes.filter(n => n.hasAttribute('data-selected')).length !== 1) paint.failures.push('selected DOM count');
        for (const node of nodes) {
          const selected = node.hasAttribute('data-selected') || node.classList.contains('cur');
          const border = getComputedStyle(node).borderTopColor;
          if (border !== (selected ? accent : neutral)) paint.failures.push(`${node.textContent}: ${border}`);
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    for (const name of ['jp-01', 'sg-01', 'us-01']) {
      const tile = id === 'gaming' ? card.getByRole('button', {name: new RegExp(`^${name}\\b`)}) : card.getByRole('row', {name, exact: true});
      await tile.click({force: true});
      await expect(tile).toHaveAttribute(id === 'gaming' ? 'aria-pressed' : 'aria-selected', 'true');
    }
    const paint = await card.evaluate(async el => {
      await Promise.allSettled([...el.querySelectorAll('.rp-node')].flatMap(n => n.getAnimations().map(a => a.finished)));
      const paint = (window as typeof window & {selectionPaint: {frames: number; stop: boolean; failures: string[]}}).selectionPaint;
      paint.stop = true;
      return paint;
    });
    expect(paint.frames).toBeGreaterThan(0);
    expect.soft(paint.failures, `${id} selection paint`).toEqual([]);
    const selection = (await api.group(id)).runtime.selection;
    expect([selection.tcp?.member_id, selection.udp?.member_id]).toEqual(['us-01', 'us-01']);
  }
});

test('manual node outlines follow keyboard focus despite stale focus-visible attributes', async ({page}) => {
  const {api} = await mockBackend(page);
  await api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'});
  await page.goto('/#/policies');
  for (const palette of ['rose-pine/moon', 'glass/glass']) {
    await page.evaluate(value => localStorage.setItem('doona-palette', value), palette);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-family', palette.split('/')[0]);
    const card = page.getByRole('region', {name: 'proxy', exact: true});
    const filter = card.getByRole('searchbox', {name: 'Filter nodes'});
    await filter.fill('-0');
    const rows = card.getByRole('row');
    await expect(rows).toHaveCount(5);
    const first = card.getByRole('row', {name: 'sg-01', exact: true});
    const second = card.getByRole('row', {name: 'hk-01', exact: true});
    const selected = first;
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    const selectedBorder = await selected.evaluate(el => getComputedStyle(el).borderTopColor);
    await first.focus();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('data-focused', 'true');
    await expect(first).toHaveCSS('outline-style', 'solid');
    await expect(first).toHaveCSS('outline-width', '2px');
    await page.keyboard.press('ArrowDown');
    await expect(second).toBeFocused();
    await expect(second).toHaveCSS('outline-style', 'solid');
    await expect(first).toHaveCSS('outline-style', 'none');

    // Defensive CSS regression: retain the independently observed stale attribute on unfocused rows.
    await rows.evaluateAll(nodes => {
      for (const node of nodes.filter(n => !n.hasAttribute('data-focused') && !n.hasAttribute('data-selected')).slice(0, 2))
        node.setAttribute('data-focus-visible', 'true');
    });
    const stale = rows.and(page.locator('[data-focus-visible]:not([data-focused])'));
    await expect(stale).toHaveCount(2);
    for (const row of await stale.all()) await expect(row).toHaveCSS('outline-style', 'none');
    await expect(second).toHaveCSS('outline-style', 'solid');
    await filter.click();
    await expect(second).not.toHaveAttribute('data-focused', 'true');
    for (const row of await rows.all()) await expect(row).toHaveCSS('outline-style', 'none');
    await expect(selected).toHaveAttribute('data-selected', 'true');
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected).toHaveCSS('border-top-color', selectedBorder);
  }
});

test('a group card mounted on screen shows its members in the first frame', async ({page}) => {
  // Checked in the frame callback, which sees what is about to be painted.
  await page.addInitScript(() => {
    const check = () => {
      for (const wait of document.querySelectorAll('.rp-content section.rp-card .rp-skeleton-bar'))
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
  await proxy.getByRole('searchbox', {name: 'Filter nodes'}).fill('-0');
  const tcp = proxy.getByRole('row', {name: 'hk-01', exact: true});
  const udp = proxy.getByRole('row', {name: 'hk-02', exact: true});
  await expect(tcp).toHaveClass(/\bcur\b/);
  await expect(udp).toHaveClass(/\bcur\b/);
  await expect(tcp.locator('.cur')).toHaveText('TCP');
  await expect(udp.locator('.cur')).toHaveText('UDP');
  await expect(proxy.getByRole('row', {name: 'sg-01', exact: true})).not.toHaveClass(/\bcur\b/);
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
  const card = page.getByRole('region', {name: 'auto', exact: true});
  await moreAction(card, 'Check settings');
  const dialog = page.getByRole('dialog', {name: 'Check settings for auto'});
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
  await expect(page.locator('.rp-toast.positive').filter({hasText: 'Configuration for auto written and reloaded'})).toBeVisible();
  // The edit dialog lists the group's running configuration under the declaration.
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const edit = page.getByRole('dialog', {name: 'Edit group auto'});
  await expect(edit.getByRole('heading', {name: 'Running configuration'})).toBeVisible();
  await expect(edit.getByText(url204, {exact: true})).toBeVisible();
  await edit.getByRole('button', {name: 'Cancel', exact: true}).click();
  const patches = requests.filter(request => request.method() === 'PATCH');
  expect(patches.map(request => [new URL(request.url()).pathname, request.postDataJSON()])).toEqual([
    [
      '/api/v1/groups/auto/config',
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
  const card = page.getByRole('region', {name: 'auto', exact: true});
  await moreAction(card, 'Check settings');
  const dialog = page.getByRole('dialog', {name: 'Check settings for auto'});
  const remote = 'http://remote.example/';
  const accepted = await api.patchGroup('auto', [{op: 'replace', path: '/config/check_url', value: remote}], '"40"');
  await expect.poll(async () => 'operation_id' in accepted && (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  const mine = 'https://cp.cloudflare.com/generate_204';
  const url = dialog.getByRole('textbox', {name: 'Check URL'});
  await url.fill(mine);
  const save = dialog.getByRole('button', {name: 'Apply', exact: true});
  // The save carries the revision the page loaded and is refused as stale, which fetches the group again.
  await save.click();
  await expect(page.locator('.rp-toast.negative')).toContainText('Content changed since it was loaded');
  await expect.poll(() => requests.filter(request => request.method() === 'GET' && request.url().endsWith('/groups/auto')).length).toBeGreaterThan(1);
  // The dialog keeps the edit and already shows the URL the group holds; nothing was overwritten.
  await expect(dialog).toBeVisible();
  await expect(url).toHaveValue(mine);
  await expect(url).toHaveAccessibleDescription(`Changed to ${remote} on the backend after this opened. Applying again replaces it with the value here.`);
  expect((await api.group('auto')).config.check_url).toBe(remote);
  // Applying again tests against the URL shown, at the current revision, so it goes through.
  await save.click();
  await expect(dialog).toHaveCount(0);
  const patches = requests.filter(request => request.method() === 'PATCH');
  expect(patches.at(-1)?.postDataJSON()).toEqual([
    {op: 'test', path: '/config/check_url', value: remote},
    {op: 'replace', path: '/config/check_url', value: mine}
  ]);
  await expect.poll(async () => (await api.group('auto')).config.check_url).toBe(mine);
});

test('a check save refused with 409 keeps the edit and shows what the group holds now', async ({page}) => {
  const {api} = await mockBackend(page);
  expectLoadFailures(page, /\/groups\/auto\/config$/);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'auto', exact: true});
  await moreAction(card, 'Check settings');
  const dialog = page.getByRole('dialog', {name: 'Check settings for auto'});
  const url = dialog.getByRole('textbox', {name: 'Check URL'});
  await expect(url).toHaveValue('');
  const remote = 'http://remote.example/';
  const accepted = await api.patchGroup('auto', [{op: 'replace', path: '/config/check_url', value: remote}], '"40"');
  await expect.poll(async () => 'operation_id' in accepted && (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  // The page still holds the revision it loaded; the backend refuses the save once, as it would a failed test op.
  let refused = false;
  await page.route('**/api/v1/groups/auto/config', route => {
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
  const probe = await moreItem(page.getByRole('region', {name: 'auto', exact: true}), 'Test all');
  await expect(probe).toBeDisabled();
  await expect(page.getByRole('menuitem', {name: 'Probe with options…', exact: true})).toBeDisabled();
  // The lock opens the same reason as the menu item's description.
  const reason = 'Test all is not available for this group';
  await expect(probe).toHaveAccessibleDescription(reason);
  await page.keyboard.press('Escape');
  const lock = page.getByRole('region', {name: 'auto', exact: true}).getByRole('button', {name: 'Why auto is locked'});
  await expect(lock).toBeVisible();
  await lock.click();
  await expect(page.getByRole('dialog', {name: 'Why auto is locked'})).toContainText(reason);
});

test('a group is switched to the score policy in its edit dialog', async ({page}) => {
  await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'gaming', exact: true}).scrollIntoViewIfNeeded();
  await page.getByRole('region', {name: 'gaming', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  let dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await dialog.getByRole('button', {name: /Selection policy/}).click();
  await expect(page.getByRole('option', {name: /^Score/})).toContainText('Picks a node by its observed reliability and recent connection quality');
  await page.getByRole('option', {name: /^Score/}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for gaming written and reloaded');
  await page.goto('/#/config?tab=source');
  expect(await editorText(page)).toContain('gaming {\n    filter: name(jp-01, hk-02)\n    policy: score\n  }');
  // Reopened, the group shows the policy as chosen rather than as a raw name.
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'gaming', exact: true}).scrollIntoViewIfNeeded();
  await page.getByRole('region', {name: 'gaming', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await expect(dialog.getByRole('button', {name: /Selection policy/})).toContainText('Score');
});

test('the edit dialog makes a node the final outbound and None clears it', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'office', exact: true});
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group office'});
  const member = dialog.getByRole('button', {name: /Default member$/});
  const final = dialog.getByRole('button', {name: /Final outbound$/});
  // The demo's office group names hk-01 as its default, as its running configuration shows.
  await expect(member).toContainText('hk-01');
  await expect(final).toContainText('None');
  await expect(final).toHaveAccessibleDescription('Fallback when no member is available. None leaves it unset.');
  await final.click();
  const list = page.getByRole('listbox');
  // The group itself is not offered; the built-ins and the other groups come before the nodes.
  await expect(list.getByRole('group', {name: 'Built-in'}).getByRole('option')).toHaveText(['direct', 'block']);
  for (const name of ['proxy', 'auto', 'hk', 'jp', 'us', 'tw', 'sg', 'kr', 'telegram', 'ai', 'youtube', 'netflix', 'bahamut', 'media', 'gaming', 'backup']) {
    await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill(name);
    await expect(list.getByRole('group', {name: 'Groups'}).getByRole('option', {name, exact: true})).toBeVisible();
  }
  // A node's latency takes the node menus' tone: under 100 ms ok, under 300 ms warn.
  for (const [name, tone] of [
    ['sg-01', 'ok'],
    ['us-01', 'warn']
  ]) {
    await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill(name);
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
  await page.getByRole('searchbox', {name: 'Filter members'}).fill('hk-02');
  const hk = page.getByRole('listbox').getByRole('option', {name: /^hk-02/});
  await scrollIntoList(hk);
  await hk.click();
  await expect(member).toContainText('hk-02');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for office written and reloaded');
  await expect.poll(async () => (await api.group('office')).config).toMatchObject({default_member_id: 'hk-02', final_outbound: 'sg-01'});
  // None removes the line again.
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await expect(dialog.locator('.rp-kv').getByText('sg-01', {exact: true})).toBeVisible();
  await expect(final).toContainText('sg-01');
  await final.click();
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('None');
  await page.getByRole('option', {name: 'None', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await api.group('office')).config.final_outbound).toBeNull();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  expect(main.content).toMatch(/office \{[^}]*default: hk-02[^}]*\}/);
  expect(main.content).not.toMatch(/office \{[^}]*final:/);
});

test('a final outbound does not offer the group or a group that nests it', async ({page}) => {
  const {api} = await mockBackend(page);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  // gaming nests auto, so a final of auto that named gaming would lead back to auto.
  const accepted = await api.replaceConfigSource(
    main.id,
    main.content!.replace('gaming {\n    filter:', 'gaming {\n    filter: group(auto)\n    filter:'),
    `"${main.content_sha256}"`
  );
  await expect.poll(async () => (await api.operation(accepted.operation_id)).status).toBe('succeeded');
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'auto', exact: true}).scrollIntoViewIfNeeded();
  await page.getByRole('region', {name: 'auto', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group auto'});
  await dialog.getByRole('button', {name: /Final outbound$/}).click();
  const list = page.getByRole('listbox');
  await expectVirtualOptions(list, list.getByRole('group', {name: 'Groups'}).getByRole('option'), ['hk', 'jp', 'us', 'tw', 'sg', 'kr', 'office', 'backup']);
});

test('the default member is offered only while the dialog selects manual selection, and a hidden one stays in the file', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'auto', exact: true});
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  let dialog = page.getByRole('dialog', {name: 'Edit group auto'});
  const member = dialog.getByRole('button', {name: /Default member$/});
  const policy = dialog.getByRole('button', {name: /Selection policy/});
  // honk reads a default member only under manual selection, so a group that picks the fastest offers the final outbound alone.
  await expect(dialog.getByRole('button', {name: /Final outbound$/})).toBeVisible();
  await expect(member).toHaveCount(0);
  await policy.focus();
  await expect(policy).toBeFocused();
  // Keyboard only, so focus stays where the person put it: open, type to Manual, Enter. Focusing the option from the
  // test (as locator.press does) moved focus behind React Aria's back, and its restore after the list closed then
  // missed on CI.
  await page.keyboard.press('ArrowDown');
  const listbox = page.getByRole('listbox');
  await page.keyboard.type('m');
  await expect(listbox.getByRole('option', {name: /^Manual/})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(listbox).toHaveCount(0);
  await expect(policy).toBeFocused();
  await expect(policy).toContainText('Manual');
  // The draft now selects manually, so the default member is offered; appearing later, it leaves focus where it was.
  await expect(member).toBeVisible();
  await expect(policy).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(policy).not.toBeFocused();
  await policy.click();
  await page.getByRole('option', {name: /^First available/}).click();
  await expect(member).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  // Switching a manual group away writes the new policy and keeps its default line as written.
  await page.getByRole('region', {name: 'office', exact: true}).scrollIntoViewIfNeeded();
  await page.getByRole('region', {name: 'office', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  dialog = page.getByRole('dialog', {name: 'Edit group office'});
  await expect(dialog.getByRole('button', {name: /Default member$/})).toContainText('hk-01');
  await dialog.getByRole('button', {name: /Selection policy/}).click();
  await page.getByRole('option', {name: /^Fastest on average/}).click();
  await expect(dialog.getByRole('button', {name: /Default member$/})).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for office written and reloaded');
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  expect(main.content).toMatch(/office \{[^}]*policy: min_moving_avg[^}]*default: hk-01[^}]*\}/);
});

test('a group edit refused over a file changed on disk saves on retry', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'auto', exact: true}).scrollIntoViewIfNeeded();
  await page.getByRole('region', {name: 'auto', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group auto'});
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await page.getByRole('option', {name: 'Exact names', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).fill('hk-01, sg-01');
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
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for auto written and reloaded');
  const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(saved).toContain('# concurrent edit');
  expect(saved).toContain("filter: name('hk-01', 'sg-01')");
});

test('a group edit retried after a refusal writes against the declaration read again, not the one it opened on', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'office', exact: true}).scrollIntoViewIfNeeded();
  await page.getByRole('region', {name: 'office', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group office'});
  await expect(dialog.getByRole('button', {name: /Default member$/})).toContainText('hk-01');
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await page.getByRole('option', {name: 'Exact names', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).fill('hk-01');
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
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for office written and reloaded');
  // The unchanged member keeps the spelling on disk, so the retry took its baseline from the fresh read.
  const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(saved).toMatch(/office \{[^}]*filter: name\('hk-01'\)[^}]*default: 'hk-01'[^}]*\}/);
});

// Opens office written as `opened`, makes the given edit, and lets the concurrent edit land on disk before Apply.
async function refusedEdit(
  page: Page,
  concurrent: (text: string) => string,
  edit: (dialog: Locator) => Promise<void> = toScore,
  opened: GroupEntryUpdate = {filters: ['name(hk-01)'], policy: 'select'}
) {
  const {api, handlers, requests} = await mockBackend(page);
  const main = async () => (await api.config()).sources.find(source => source.kind === 'main')!;
  const initial = await main();
  await api.pollOperation(await api.replaceConfigSource(initial.id, writeGroupEntry(initial.content!, 'office', opened), `"${initial.content_sha256}"`));
  await page.goto('/#/policies?group=office');
  await page.getByRole('region', {name: 'office', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group office'});
  await edit(dialog);
  const origin = await main();
  const changed = concurrent(origin.content!);
  // A poll of the runtime groups drops a card, and the dialog open in it, once its group is gone. Serving the list as it stood keeps
  // the card until the retry, so a slow run cannot close the dialog first.
  const listed = await api.groups();
  handlers['GET groups'] = async () => listed;
  await api.pollOperation(await api.replaceConfigSource(origin.id, changed, `"${origin.content_sha256}"`));
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  const rejected = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 412);
  await apply.click();
  await rejected;
  await expect(dialog.getByRole('alert')).toBeVisible();
  return {dialog, apply, main, changed, puts: () => requests.filter(request => request.method() === 'PUT').length};
}
async function toScore(dialog: Locator) {
  await dialog.getByRole('button', {name: /Selection policy/}).click();
  await dialog
    .page()
    .getByRole('option', {name: /^Score/})
    .click();
}
const reopen = 'The group changed in the configuration in a way that conflicts with this edit';

test('a group edit retried after a refusal writes only the changed fields and keeps the filter changed on disk', async ({page}) => {
  const {dialog, apply, main} = await refusedEdit(page, text => writeGroupEntry(text, 'office', {filters: ['name(hk-02)'], policy: 'select'}));
  await apply.click();
  await expect(dialog).toHaveCount(0);
  expect(readGroupEntries((await main()).content).find(entry => entry.name === 'office')).toMatchObject({filters: ['name(hk-02)'], policy: 'score'});
});

test('a group edit retried after a refusal writes nothing when the same field changed on disk to another value', async ({page}) => {
  const {dialog, apply, main, changed, puts} = await refusedEdit(page, text =>
    writeGroupEntry(text, 'office', {filters: ['name(hk-01)'], policy: 'min_moving_avg'})
  );
  await apply.click();
  await expect(dialog.getByRole('alert')).toContainText(reopen);
  expect(puts()).toBe(1);
  expect((await main()).content).toBe(changed);
});

test('a group edit retried after a refusal writes nothing when the group was renamed on disk', async ({page}) => {
  const {dialog, apply, main, changed, puts} = await refusedEdit(page, text => text.replace(/^(\s*)office \{/m, '$1office2 {'));
  expect(changed).not.toMatch(/^\s*office \{/m);
  await apply.click();
  await expect(dialog.getByRole('alert')).toContainText(reopen);
  expect(puts()).toBe(1);
  expect((await main()).content).toBe(changed);
});

test('a group removed on disk while its editor is open keeps the editor and its edits, and writes nothing', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const main = async () => (await api.config()).sources.find(source => source.kind === 'main')!;
  await page.goto('/#/policies?group=office');
  await page.getByRole('region', {name: 'office', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group office'});
  await toScore(dialog);
  const origin = await main();
  const removed = origin.content!.replace(/^ *office \{[^}]*\}\n/m, '');
  expect(readGroupEntries(removed).some(entry => entry.name === 'office')).toBe(false);
  await api.pollOperation(await api.replaceConfigSource(origin.id, removed, `"${origin.content_sha256}"`));
  // The next poll of the groups list drops the group; the editor stays open and says so.
  await expect(dialog.getByRole('status').filter({hasText: 'This group was removed. The changes were not saved.'})).toBeVisible({timeout: 15_000});
  await expect(dialog.getByRole('button', {name: /Selection policy/})).toContainText('Score');
  const apply = dialog.getByRole('button', {name: 'Apply', exact: true});
  await expect(apply).toBeDisabled();
  await expect(apply).toHaveAccessibleDescription('This group was removed. The changes were not saved.');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  // The card stayed only for its editor.
  await expect(page.getByRole('region', {name: 'office', exact: true})).toHaveCount(0);
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  expect((await main()).content).toBe(removed);
});

test('a group edit retried after a refusal agrees with interruption written on disk in another spelling', async ({page}) => {
  const {dialog, apply, main} = await refusedEdit(
    page,
    text => writeGroupEntry(text, 'office', {filters: ['name(hk-01)'], policy: 'select', interrupt: "'true'"}),
    async dialog => {
      await dialog.getByText('Interrupt existing connections on switch', {exact: true}).click();
      await expect(dialog.getByRole('switch', {name: 'Interrupt existing connections on switch', exact: true})).toBeChecked();
    },
    {filters: ['name(hk-01)'], policy: 'select', interrupt: 'false'}
  );
  await apply.click();
  await expect(dialog).toHaveCount(0);
  expect(readGroupEntries((await main()).content).find(entry => entry.name === 'office')).toMatchObject({interrupt: "'true'"});
});

test('a long group name truncates with a tooltip and keeps the More menu on its title row', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const long = 'G'.repeat(150);
  const id = (await api.groups()).find(group => group.name === 'backup')!.id;
  handlers[`GET groups/${id}`] = async () => ({...(await api.group(id)), name: long});
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'backup', exact: true}).scrollIntoViewIfNeeded();
  const title = page.getByRole('heading', {name: long, exact: true});
  const card = page.getByRole('region').filter({has: title});
  await expect(title).toBeVisible();
  const cut = title.locator('.rp-truncate');
  await expect.poll(() => cut.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const more = card.getByRole('button', {name: 'More actions', exact: true});
  const [titleBox, moreBox] = [await title.boundingBox(), await more.boundingBox()];
  expect(moreBox!.y).toBeLessThan(titleBox!.y + titleBox!.height);
  await expect(cut).toHaveAttribute('tabindex', '0');
  await cut.scrollIntoViewIfNeeded();
  await cut.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(cut).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText(long);
});

test('automatic node grid keeps its inset and filter type roles', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'backup', exact: true});
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const expand = card.getByRole('button', {name: /^Current/});
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  const grid = card.locator('.rp-nodegrid');
  await expect(grid).toBeVisible();
  const geometry = await grid.evaluate(el => {
    const r = el.getBoundingClientRect(),
      card = el.closest('.rp-card')!,
      c = card.getBoundingClientRect(),
      s = getComputedStyle(card);
    return {left: r.left - c.left, right: c.right - r.right, padding: parseFloat(s.paddingLeft), margin: getComputedStyle(el).marginInlineEnd};
  });
  expect(Math.abs(geometry.left - geometry.right)).toBeLessThanOrEqual(1);
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.padding);
  expect(geometry.margin).toBe('0px');
  const tileInsets = await grid.evaluate(el => {
    const grid = el.getBoundingClientRect();
    const tiles = Array.from(el.querySelectorAll('.rp-node')).map(tile => tile.getBoundingClientRect());
    return {left: Math.min(...tiles.map(tile => tile.left)) - grid.left, right: grid.right - Math.max(...tiles.map(tile => tile.right))};
  });
  expect(Math.abs(tileInsets.left - tileInsets.right)).toBeLessThanOrEqual(1);
  await expect(card.getByRole('button', {name: /Sort/})).toHaveCSS('font-size', '14px');
  await expect(card.locator('.rp-switch')).toHaveCSS('font-size', '14px');
});

test('a group remeasures across 12 and 13 members and viewport resizes', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const group = await api.group('proxy');
  const members = Array.from({length: 13}, (_, index) => ({...group.members[0], id: `member-${index}`, name: `member-${index}`}));
  let count = 12;
  handlers['GET groups/proxy'] = async () => ({...group, members: members.slice(0, count)});
  await page.clock.install();
  await page.setViewportSize({width: 1000, height: 1000});
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'proxy', exact: true});
  await expect(card.locator('.rp-nodes .rp-node')).toHaveCount(12);
  for (const next of [13, 12, 13]) {
    count = next;
    await page.clock.fastForward(31000);
    if (next === 12) {
      await expect(card.locator('.rp-nodes .rp-node')).toHaveCount(12);
      continue;
    }
    const grid = card.locator('.rp-nodegrid');
    await expect(grid).toBeVisible();
    for (const width of [1000, 390, 1000]) {
      await page.setViewportSize({width, height: 1000});
      await expect
        .poll(() =>
          grid.evaluate(el => {
            const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rp-space-2'));
            const columns = Math.max(1, Math.floor((el.clientWidth - gap) / (228 + gap)));
            const tiles = [...el.querySelectorAll('.rp-node')].map(tile => tile.getBoundingClientRect());
            const first = tiles[0];
            return (
              !!first &&
              tiles.filter(tile => Math.abs(tile.top - first.top) < 1).length === columns &&
              Math.abs(first.width - (el.clientWidth - gap * (columns + 1)) / columns) < 1
            );
          })
        )
        .toBe(true);
    }
  }
});

test('member tiles share one column track across groups and a group member shows its selection latency', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  const [two, three] = await Promise.all([api.group('telegram'), api.group('ai')]);
  const member = (id: string, kind: 'node' | 'group' = 'node') => ({id, name: id, kind});
  // telegram selects the proxy group, whose own TCP selection is hk-01: that node's latency is the member's.
  handlers['GET groups/telegram'] = async () => ({...two, members: [member('proxy', 'group'), member('hk-01')]});
  handlers['GET groups/ai'] = async () => ({...three, members: [member('hk-01'), member('hk-02'), member('sg-01')]});
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto('/#/policies');
  const cards = ['telegram', 'ai'].map(name => page.getByRole('region', {name, exact: true}));
  const [short, full] = cards.map(card => card.locator('.rp-nodes .rp-node'));
  // A card reads its group once it scrolls on screen.
  for (const [index, count] of [2, 3].entries()) {
    await cards[index].scrollIntoViewIfNeeded();
    await expect(cards[index].locator('.rp-nodes .rp-node')).toHaveCount(count);
  }
  const group = short.filter({hasText: 'proxy'});
  await expect(group.locator('.rp-badge')).toHaveText('Group');
  await expect(group.locator('.ms')).toHaveText('84 ms');
  await expect(group.locator('.ms')).toHaveClass(/\bok\b/);
  const boxes = (tiles: Locator) => tiles.evaluateAll(els => els.map(el => el.getBoundingClientRect()).map(({left, width}) => ({left, width})));
  for (const width of [1280, 1024, 390]) {
    await page.setViewportSize({width, height: 1000});
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([boxes(short), boxes(full)]);
        return a.every((box, i) => Math.abs(box.left - b[i].left) <= 1 && Math.abs(box.width - b[i].width) <= 1);
      })
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Names wrap inside their tile rather than cutting off.
    expect(await short.locator('.n > *').evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
  }
});

test('policy probe entries share the busy state', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  handlers['POST probes'] = async request => {
    await pending;
    return api.startProbe(request.postDataJSON());
  };
  await page.goto('/#/policies');
  const group = page.getByRole('region', {name: 'gaming', exact: true});
  await moreAction(group, 'Test all');
  try {
    await expect(await moreItem(group, 'Testing…')).toBeDisabled();
    await expect(page.getByRole('menuitem', {name: 'Probe with options…', exact: true})).toBeDisabled();
  } finally {
    release();
  }
});

for (const available of [false, true]) {
  test(`policy options follow advertised choices with DNS-only probes (${available})`, async ({page}) => {
    const {capabilities} = await mockBackend(page);
    capabilities.resources.probes.available = available;
    capabilities.resources.probes.kinds = ['dns'];
    await page.goto('/#/policies');
    const group = page.getByRole('region', {name: 'gaming', exact: true});
    const probe = await moreItem(group, 'Test all');
    if (available) await expect(probe).toBeEnabled();
    else await expect(probe).toBeDisabled();
    const options = page.getByRole('menuitem', {name: 'Probe with options…', exact: true});
    if (available) await expect(options).toBeEnabled();
    else await expect(options).toHaveCount(0);
  });
}

test('an empty group still shows offered probe options in the disabled state', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET groups/gaming'] = async () => ({...(await api.group('gaming')), members: []});
  await page.goto('/#/policies');
  const group = page.getByRole('region', {name: 'gaming', exact: true});
  await expect(await moreItem(group, 'Test all')).toBeDisabled();
  await expect(page.getByRole('menuitem', {name: 'Probe with options…', exact: true})).toBeDisabled();
});

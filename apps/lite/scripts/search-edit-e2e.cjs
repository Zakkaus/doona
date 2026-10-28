const {chromium, expect} = require('@playwright/test');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
async function go(p, route) {
  await expect(p.getByRole('link', {name: route === 'dns' ? 'DNS' : route[0].toUpperCase() + route.slice(1), exact: true, includeHidden: true})).toBeEnabled({
    timeout: 20000
  });
  await p.evaluate(r => (location.hash = r), route);
  await p.locator('[data-page-body]:visible').waitFor();
  await expect(p.locator('h1:visible')).toHaveText(route === 'dns' ? 'DNS' : route[0].toUpperCase() + route.slice(1));
}
async function search(p, query) {
  await p.keyboard.press('Control+k');
  const input = p.getByRole('combobox', {name: 'Search', exact: true});
  await input.fill(query);
  await expect(p.getByRole('option').first()).toContainText(query);
  return input;
}
async function tableTextFits(p) {
  const clipped = await p.locator('tbody td:visible, [data-member-row]:visible, [data-subscription-nodes] > li:visible').evaluateAll(cells =>
    cells.flatMap(cell => {
      const bounds = cell.getBoundingClientRect();
      const texts = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const failures = [];
      while (texts.nextNode()) {
        if (!texts.currentNode.textContent.trim()) continue;
        let parent = texts.currentNode.parentElement;
        let visuallyHidden = false;
        while (parent && parent !== cell) {
          if (getComputedStyle(parent).clip === 'rect(0px, 0px, 0px, 0px)') visuallyHidden = true;
          parent = parent.parentElement;
        }
        if (visuallyHidden) continue;
        const range = document.createRange();
        range.selectNodeContents(texts.currentNode);
        if ([...range.getClientRects()].some(r => r.left < bounds.left - 0.5 || r.right > bounds.right + 0.5)) failures.push(texts.currentNode.textContent);
      }
      return failures;
    })
  );
  expect(clipped).toEqual([]);
}
(async () => {
  const browser = await chromium.launch();
  for (const width of [1440, 390]) {
    const p = await browser.newPage({viewport: {width, height: 1000}, reducedMotion: 'reduce', locale: 'en-US'});
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', message => {
      // The static preview answers the same-origin honk probe with 404.
      if (message.type() === 'error' && !new URL(message.location().url).pathname.endsWith('/api')) errors.push(message.text());
    });
    await p.goto(base + '/?slow=200');
    await waitForDemo(p);
    await go(p, 'nodes');
    await expect(p.getByRole('button', {name: 'Add node', exact: true})).toBeEnabled();
    const actions = await p.locator('tbody:visible tr:has([data-node-id])').evaluateAll(rows =>
      rows.map(row => {
        const cell = row.lastElementChild;
        const control = cell.querySelector('button, .astryx-text');
        const r = control.getBoundingClientRect();
        return {centre: r.left + r.width / 2, width: cell.getBoundingClientRect().width};
      })
    );
    for (const key of ['centre', 'width'])
      expect(Math.max(...actions.map(row => row[key])) - Math.min(...actions.map(row => row[key]))).toBeLessThanOrEqual(0.5);
    if (width < 768) {
      await expect(p.locator('thead th')).toHaveCount(3);
      await expect(p.locator('tbody:visible tr:has([data-node-id])').nth(2)).toContainText('trojan / Manual');
      await tableTextFits(p);
      await search(p, 'sg-01');
      await p.keyboard.press('Escape');
      for (const action of ['Add node']) {
        await p.getByRole('button', {name: action, exact: true}).click();
        await expect(p.locator('dialog[open]')).toBeVisible();
        await p.keyboard.press('Escape');
        await expect(p.locator('dialog[open], .astryx-mobile-nav:visible')).toHaveCount(0);
      }
      await go(p, 'subscriptions');
      await expect(p.locator('.astryx-mobile-nav:visible')).toHaveCount(0);
      await p.getByRole('button', {name: 'Add subscription', exact: true}).click();
      await p.keyboard.press('Escape');
      await go(p, 'nodes');
      console.log('PASS mobile search/add/import/Escape/route sequence leaves the drawer closed');
    }
    await (await search(p, 'hk-01')).press('Enter');
    await expect(p.getByRole('dialog', {name: 'Edit node', exact: true})).toBeVisible();
    await expect(p.getByRole('textbox', {name: 'Name', exact: true})).toHaveValue('hk-01');
    await p.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(p.locator('[data-node-id="hk-01"]')).toBeFocused();
    await (await search(p, 'alidns')).press('Enter');
    await expect(p.getByRole('dialog', {name: 'Edit DNS server', exact: true})).toBeVisible();
    await p.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(p.locator('[data-upstream="alidns"]')).toBeFocused();
    await (await search(p, 'NetworkManager')).press('Enter');
    await expect(p.getByRole('dialog', {name: 'Edit rule', exact: true})).toBeVisible();
    await p.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(p.locator('[data-rule-list="routing"] [data-rule-index]').first()).toBeFocused();
    const dnsQuery = await search(p, 'alidns');
    await dnsQuery.press('ArrowDown');
    await dnsQuery.press('ArrowDown');
    await dnsQuery.press('Enter');
    await expect(p.getByRole('dialog', {name: 'Edit rule', exact: true})).toBeVisible();
    await p.getByRole('button', {name: 'Cancel', exact: true}).click();
    await (await search(p, 'harbor')).press('Enter');
    const searchedSubscription = p.locator('[data-provider-id="harbor"] .astryx-collapsible-trigger');
    await expect(searchedSubscription).toHaveAttribute('aria-expanded', 'true');
    await expect(searchedSubscription).toBeFocused();
    await searchedSubscription.click();
    console.log(`PASS ${width}: exact-name priority, node/rule/upstream/subscription jumps, arrow choice and focus return`);
    await search(p, 'auto');
    await p.getByRole('option').filter({hasText: /^auto/}).getByRole('button', {name: 'Switch node', exact: true}).click();
    const auto = p.locator('[data-group-inspector="auto"]:visible');
    await auto.getByRole('textbox', {name: 'Search members: auto', exact: true}).fill('hk-02');
    const tile = auto.locator('[data-member-row]').filter({has: p.getByRole('radio', {name: 'Switch node: hk-02', exact: true})});
    await tile.click();
    await expect(auto).toHaveAttribute('aria-busy', 'true');
    await expect(tile).toHaveAttribute('aria-current', 'true', {timeout: 20000});
    await expect(auto).toHaveAttribute('aria-busy', 'false');
    const toast = p.locator('.astryx-toast').last();
    await expect(toast).toBeVisible();
    expect(await toast.evaluate(e => e.getBoundingClientRect().top > innerHeight / 2)).toBe(true);
    await auto.getByRole('button', {name: 'Restore automatic', exact: true}).click();
    await expect(auto.getByRole('button', {name: 'Restore automatic', exact: true})).toHaveCount(0, {timeout: 20000});
    if (width < 768) await p.keyboard.press('Escape');
    await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('proxy');
    await p.locator('[data-group-row="proxy"] button').click();
    const manual = p.locator('[data-group-inspector="proxy"]:visible');
    await manual.getByRole('textbox', {name: 'Search members: proxy', exact: true}).fill('hk-02');
    await manual
      .locator('[data-member-row]')
      .filter({has: p.getByRole('radio', {name: 'Switch node: hk-02', exact: true})})
      .click();
    await expect(manual).toContainText('Current: hk-02', {timeout: 20000});
    await expect(manual).toHaveAttribute('aria-busy', 'false');
    if (width < 768) await p.keyboard.press('Escape');
    console.log(`PASS ${width}: resource search Enter, inspector switch, manual select, automatic pin/restore`);
    await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('');
    await p.getByRole('button', {name: 'Create group', exact: true}).click();
    await p.getByRole('textbox', {name: 'Name', exact: true}).fill('orchestrated');
    await p.getByRole('button', {name: 'Create', exact: true}).click();
    const editor = p.locator('[data-group-editor="orchestrated"]:visible');
    await expect(editor).toContainText('No selected members.');
    await expect(editor).not.toContainText("name(regex: '^$')");
    const allNodes = editor.getByRole('switch', {name: 'Include all nodes', exact: true});
    await allNodes.check();
    await editor.getByRole('combobox', {name: 'Policy', exact: true}).click();
    await p.getByRole('option', {name: 'Take turns', exact: true}).click();
    await expect(allNodes).toBeChecked();
    await expect(editor.locator('[data-transfer="members"]')).toContainText('Includes all nodes');
    await allNodes.uncheck();
    await editor.locator('[data-transfer="available"]').getByRole('textbox', {name: 'Search members', exact: true}).fill('jp-01');
    await editor.getByRole('button', {name: 'Add: jp-01', exact: true}).click();
    await expect(editor.locator('[data-transfer="members"]')).toContainText('jp-01');
    await editor.getByRole('combobox', {name: 'Policy', exact: true}).click();
    await p.getByRole('option', {name: 'Auto-pick fastest', exact: true}).click();
    await expect(allNodes).not.toBeChecked();
    await expect(editor.locator('[data-transfer="members"] [data-member-filter]')).toHaveCount(1);
    await expect(editor.locator('[data-transfer="members"]')).toContainText('jp-01');
    console.log(`PASS ${width}: policy changes preserve all-node and explicit member filters`);
    if (width < 768) await p.keyboard.press('Escape');
    await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('no-such-group');
    await expect(p.getByText('No matching results', {exact: true}).filter({visible: true})).toBeVisible();
    await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('');
    await p.getByRole('button', {name: 'Review and apply', exact: true}).click();
    await expect(p.getByRole('dialog')).toContainText('jp-01');
    await p.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(p.locator('dialog[open]')).toHaveCount(0, {timeout: 20000});
    await expect(p.getByRole('button', {name: 'Review and apply', exact: true})).toHaveCount(0);
    await go(p, 'subscriptions');
    await expect(p.getByRole('textbox', {name: 'Search subscriptions', exact: true})).toHaveValue('harbor');
    await p.getByRole('textbox', {name: 'Search subscriptions', exact: true}).fill('');
    await expect(p.locator('[data-provider-id]')).toHaveCount(3);
    const sub = p.locator('[data-provider-id="harbor"]');
    const trigger = sub.locator('.astryx-collapsible-trigger');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    // A visible row may still be a loading skeleton. Snapshot loaded nodes on both viewports.
    await expect(sub.locator('[data-subscription-nodes] > li').first()).toContainText('香港 01 IPLC');
    await expect(sub.locator('[data-subscription-nodes] > li').first()).toContainText('hysteria2');
    if (width < 768) {
      await expect(sub.locator('[data-subscription-nodes]')).toHaveCount(1);
      await expect(sub.locator('table')).toHaveCount(0);
      await tableTextFits(p);
    }
    const before = await sub.locator('[data-subscription-nodes] > li').first().textContent();
    await sub.getByRole('button', {name: 'Update: harbor', exact: true}).click();
    await expect(sub.locator('[data-subscription-nodes] > li').first()).toHaveText(before);
    await expect(sub.getByRole('button', {name: 'Update: harbor', exact: true})).toBeEnabled({timeout: 20000});
    await trigger.click();
    await expect(sub.locator('[data-subscription-nodes]')).toHaveCount(0);
    await trigger.click();
    await sub.locator('[data-subscription-nodes]').waitFor();
    await go(p, 'nodes');
    await p.getByRole('button', {name: 'Add node', exact: true}).click();
    await p
      .getByRole('textbox', {name: 'Share links', exact: true})
      .fill('anytls://demo@one.example.net:443#Bulk-one\nanytls://demo@two.example.net:443#Bulk-two');
    await p.getByRole('button', {name: 'Add 2 nodes', exact: true}).click();
    await expect(p.locator('dialog[open]')).toHaveCount(0, {timeout: 20000});
    await p.getByRole('textbox', {name: 'Search nodes', exact: true}).fill('Bulk-');
    await expect(p.locator('tbody:visible tr:has([data-node-id])')).toHaveCount(2);
    await p.locator('thead input[type="checkbox"]').check();
    await p.getByRole('button', {name: 'Delete selected', exact: true}).click();
    await p.getByRole('dialog').getByRole('button', {name: 'Delete', exact: true}).click();
    await expect(p.locator('dialog[open]')).toHaveCount(0, {timeout: 20000});
    await expect(p.locator('tbody:visible tr:has([data-node-id])')).toHaveCount(0);
    console.log(`PASS ${width}: filtered manual-node bulk deletion through validated write`);
    await go(p, 'subscriptions');
    await expect(p.locator('[data-provider-id="harbor"] .astryx-collapsible-trigger')).toHaveAttribute('aria-expanded', 'true');
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(errors).toEqual([]);
    console.log(
      `PASS ${width}: orchestration ${width >= 1024 ? 'drag' : 'Add button'}, reviewed diff, subscription disclosure persistence, refresh keeps nodes, no overflow`
    );
    await p.close();
  }
  for (const width of [1440, 390]) {
    const p = await browser.newPage({locale: 'en-US', viewport: {width, height: 1000}, reducedMotion: 'reduce'});
    const closeSheet = async () => {
      if (width < 768) await p.keyboard.press('Escape');
    };
    await p.goto(base);
    await waitForDemo(p);
    await p.getByRole('radio', {name: 'Edit group', exact: true}).click();
    await p.locator('[data-group-row="hk"] button').click();
    await p.getByRole('button', {name: 'Actions: hk', exact: true}).click();
    await p.getByRole('menuitem', {name: 'Duplicate', exact: true}).click();
    const duplicate = p.getByRole('dialog', {name: /^Duplicate/});
    await duplicate.getByRole('textbox', {name: 'Name', exact: true}).fill('draft-group');
    await duplicate.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(duplicate).toHaveCount(0);
    await closeSheet();
    await p.locator('[data-group-row="draft-group"] button').click();
    await p.getByRole('button', {name: 'Actions: draft-group', exact: true}).click();
    await p.getByRole('menuitem', {name: 'Edit as text', exact: true}).click();
    const text = p.getByRole('dialog', {name: /^Edit as text/});
    await text.getByRole('textbox', {name: 'Group', exact: true}).fill('\n    filter: name(hk-01)\n    policy: select\n  ');
    await text.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(text).toHaveCount(0);
    const editor = p.locator('[data-group-editor="draft-group"]:visible');
    await expect(editor.locator('[data-transfer="members"]')).toContainText('Nodes: hk-01');
    const name = editor.getByRole('textbox', {name: 'Name', exact: true});
    await name.fill('draft-renamed');
    await name.press('Enter');
    await expect(p.locator('[data-group-editor="draft-renamed"]:visible')).toBeVisible();
    await closeSheet();
    await p.getByRole('button', {name: 'Review and apply', exact: true}).click();
    await expect(p.getByRole('dialog')).toContainText('draft-renamed');
    await p.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(p.locator('dialog[open]')).toHaveCount(0, {timeout: 20000});
    await p.locator('[data-group-row="draft-renamed"] button').click();
    await p.getByRole('button', {name: 'Actions: draft-renamed', exact: true}).click();
    await p.getByRole('menuitem', {name: 'Delete', exact: true}).click();
    await p.getByRole('dialog', {name: 'Delete group?', exact: true}).getByRole('button', {name: 'Delete', exact: true}).click();
    await expect(p.locator('[data-group-row="draft-renamed"]')).toHaveCount(0);
    await closeSheet();
    await p.getByRole('button', {name: 'Discard', exact: true}).click();
    await expect(p.locator('[data-group-row="draft-renamed"]')).toHaveCount(1);
    console.log('PASS group duplicate, text edit, inline rename, review/apply, delete/discard', width);
    await p.close();
  }
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});

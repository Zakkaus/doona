// Exercises the retained configuration workflow and quick member switching on the local mock.
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const {chromium, expect} = require('@playwright/test');
async function settle(p) {
  await p.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))
    );
  });
}
async function apply(p, label = 'Apply') {
  await p.getByRole('button', {name: 'Review and apply', exact: true}).click();
  await p.getByRole('button', {name: label, exact: true}).click();
  await expect(p.getByRole('dialog')).not.toBeVisible({timeout: 20000});
}
async function quickSwitch(b, width) {
  const p = await b.newPage({locale: 'en-US', viewport: {width, height: 1000}});
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/?slow=600');
  await waitForDemo(p, {keepBadge: true});
  await expect(p.getByRole('link', {name: 'Lite', exact: true})).toHaveAttribute('aria-current', 'page');
  await p.getByRole('button', {name: 'Hide demo badge', exact: true}).click();
  await expect(p.locator('[data-group-row="auto"]')).toBeVisible();
  await p.locator('[data-group-row="auto"] button').click();
  const inspector = p.locator('[data-group-inspector="auto"]:visible');
  const search = inspector.getByRole('textbox', {name: 'Search members: auto', exact: true});
  await search.fill('hk-02');
  const option = inspector.locator('[data-member-row]').filter({has: p.getByRole('radio', {name: 'Switch node: hk-02', exact: true})});
  await expect(option).toContainText('vless');
  await option.focus();
  await p.keyboard.press('Enter');
  await expect(inspector).toHaveAttribute('aria-busy', 'true');
  await expect(inspector).toHaveAttribute('aria-busy', 'false', {timeout: 20000});
  await expect(option).toBeFocused();
  await expect(option).toHaveAttribute('aria-current', 'true');
  await expect(inspector).toContainText('Pinned');
  await expect(p.getByRole('status').filter({hasText: 'pinned'}).first()).toBeVisible();
  await inspector.getByRole('button', {name: 'Restore automatic', exact: true}).click();
  await expect(inspector).toHaveAttribute('aria-busy', 'true');
  await expect(inspector).toHaveAttribute('aria-busy', 'false', {timeout: 20000});
  await expect(inspector.getByRole('button', {name: 'Restore automatic', exact: true})).toHaveCount(0);
  await search.fill('');
  const rows = inspector.locator('[data-member-row]');
  // The inspector appends rows after paint; End must not race a changing last row.
  const totalMembers = Number((await inspector.getByText(/^\d+ of \d+$/).innerText()).split(' of ')[1]);
  await expect(rows).toHaveCount(totalMembers);
  await rows.first().focus();
  await p.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await p.keyboard.press('ArrowUp');
  await expect(rows.first()).toBeFocused();
  await p.keyboard.press('End');
  await expect(rows.last()).toBeFocused();
  await p.keyboard.press('Home');
  await expect(rows.first()).toBeFocused();
  if (width >= 768) {
    const buttons = p.locator('[data-group-row] button');
    await buttons.first().focus();
    await p.keyboard.press('ArrowDown');
    await expect(buttons.nth(1)).toBeFocused();
    await p.keyboard.press('Enter');
    const second = await p.locator('[data-group-row]').nth(1).getAttribute('data-group-row');
    await expect(p.locator(`[data-group-inspector="${second}"]`)).toBeVisible();
  } else {
    await p.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
  }
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
  console.log(`PASS ${width}: member search, source, row arrows/Enter, pending, pin, toast, restore, list arrows, sheet Escape, no overflow`);
  await p.close();
}

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({locale: 'en-US', viewport: {width: 1280, height: 900}});
  p.setDefaultTimeout(12000);
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base);
  await waitForDemo(p, {keepBadge: true});
  await expect(p.getByRole('link', {name: 'Lite', exact: true})).toHaveAttribute('aria-current', 'page');
  await p.getByRole('button', {name: 'Hide demo badge', exact: true}).click();
  await p.evaluate(() => (location.hash = 'nodes'));
  await p.getByRole('heading', {name: 'Nodes', exact: true}).waitFor();
  await expect(p.locator('[data-group-inspector]:visible')).toHaveCount(0);
  await p.locator('table:visible').waitFor();
  await p.getByRole('button', {name: 'Add node', exact: true}).click();
  await p
    .getByRole('textbox', {name: 'Share links', exact: true})
    .fill('anytls://demo@edge.example.net:443#Test-one\nanytls://demo@edge2.example.net:443#Test-two');
  await expect(p.getByRole('dialog').getByText(/^Recognized:/)).toHaveCount(2);
  await expect(p.getByRole('button', {name: 'Add 2 nodes', exact: true})).toBeEnabled();
  await p.getByRole('button', {name: 'Add 2 nodes', exact: true}).click();
  await expect(p.getByRole('dialog')).not.toBeVisible({timeout: 20000});
  await p.getByRole('textbox', {name: 'Search nodes', exact: true}).fill('Test-');
  await expect(p.locator('tbody:visible tr:has([data-node-id])')).toHaveCount(2);
  await expect(p.locator('tbody:visible')).toContainText('Manually added (2)');
  await expect(p.locator('tbody:visible')).toContainText('Test-one');
  await expect(p.locator('tbody:visible')).toContainText('Test-two');
  console.log('PASS paste two links, recognize both, add both to the manual section');
  await p.getByRole('link', {name: 'Subscriptions', exact: true}).click();
  await p.getByRole('button', {name: 'Add subscription', exact: true}).click();
  await p.getByRole('textbox', {name: 'Name (optional)', exact: true}).fill('test-sub');
  await p.getByRole('textbox', {name: 'Subscription link', exact: true}).fill('https://example.net/sub');
  await p.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(p.getByRole('dialog')).not.toBeVisible({timeout: 20000});
  await expect(p.locator('[data-provider-id="draft:test-sub"]')).toContainText('test-sub');
  await apply(p);
  await expect(p.locator('[data-provider-id="test-sub"]')).toContainText('test-sub');
  console.log('PASS subscription');
  await p.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const addSubscription = p.getByRole('dialog');
  const saveSubscription = addSubscription.getByRole('button', {name: 'Save', exact: true});
  await expect(saveSubscription).toBeDisabled();
  await expect(addSubscription.getByText('Enter a subscription link', {exact: true}).and(addSubscription.locator('.astryx-text'))).toBeVisible();
  await expect(addSubscription.getByRole('textbox').first()).toHaveAccessibleName('Subscription link');
  await addSubscription.getByRole('textbox', {name: 'Subscription link', exact: true}).fill('not a link');
  await expect(saveSubscription).toBeDisabled();
  await expect(addSubscription.getByText('Enter a valid link', {exact: true}).and(addSubscription.locator('.astryx-text'))).toBeVisible();
  await addSubscription.getByRole('textbox', {name: 'Subscription link', exact: true}).fill('https://sub.example.org/feed');
  const optionalName = addSubscription.getByRole('textbox', {name: 'Name (optional)', exact: true});
  await expect(optionalName).toHaveValue('');
  await expect(optionalName).toHaveAttribute('placeholder', 'sub.example.org');
  await optionalName.fill('test-sub');
  await expect(saveSubscription).toBeDisabled();
  await expect(addSubscription.getByText('This name is already in use', {exact: true}).and(addSubscription.locator('.astryx-text'))).toBeVisible();
  await optionalName.fill('');
  await expect(saveSubscription).toBeEnabled();
  await saveSubscription.click();
  const draftSubscription = p.locator('[data-provider-id="draft:sub.example.org"]');
  await draftSubscription.waitFor();
  await p.waitForFunction(() =>
    document
      .querySelector('[data-provider-id="draft:sub.example.org"]')
      ?.getAnimations()
      .some(animation => animation.id === 'row-highlight')
  );
  await expect(draftSubscription).toBeInViewport();
  await apply(p);
  const hostSubscription = p.locator('[data-provider-id="sub.example.org"]');
  await expect(hostSubscription).toContainText('sub.example.org');
  await expect(p.getByRole('status').filter({hasText: 'Configuration saved and applied.'}).first()).toBeVisible();
  await expect(hostSubscription).toContainText('No nodes');
  await hostSubscription.locator('.astryx-collapsible-trigger').click();
  await expect(hostSubscription.getByText('This subscription returned no nodes', {exact: true})).toBeVisible();
  await hostSubscription.getByRole('button', {name: 'Edit link', exact: true}).click();
  await expect(p.getByRole('textbox', {name: 'Name', exact: true})).toBeDisabled();
  await expect(p.getByRole('dialog')).toContainText('The name cannot be changed after creation because groups may refer to it.');
  await p.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(p.getByRole('dialog')).not.toBeVisible();
  console.log('PASS link-only subscription: validation, host placeholder/name, highlight, viewport, review, automatic update, empty state and edit hint');
  await p.getByRole('link', {name: 'Groups', exact: true}).click();
  await p.getByRole('button', {name: 'Create group', exact: true}).click();
  await p.getByRole('textbox', {name: 'Name', exact: true}).fill('test-group');
  await p.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(p.getByRole('dialog')).not.toBeVisible();
  const editor = p.locator('[data-group-editor="test-group"]');
  const available = editor.locator('[data-transfer="available"]');
  const chosen = editor.locator('[data-transfer="members"]');
  await available.getByRole('textbox', {name: 'Search members', exact: true}).fill('Test-');
  await available.getByRole('button', {name: 'Add: Test-one', exact: true}).click();
  await expect(chosen).toContainText('Test-one');
  await available.getByRole('button', {name: 'Add: Test-two', exact: true}).click();
  await available.getByRole('textbox', {name: 'Search members', exact: true}).fill('test-sub');
  await available.getByRole('button', {name: 'Add: test-sub', exact: true}).click();
  await p.locator('[data-bind-popover="test-sub"]').getByRole('button', {name: 'Add', exact: true}).click();
  await expect(chosen).toContainText('test-sub');
  await expect(p.locator('[data-bind-popover="test-sub"]')).not.toBeVisible();
  await settle(p);
  await chosen.getByRole('button', {name: 'Drag Test-one', exact: true}).focus();
  await expect(chosen.getByRole('button', {name: 'Drag Test-one', exact: true})).toBeFocused();
  await p.keyboard.press('ArrowDown');
  await expect(chosen.locator('li').nth(1)).toContainText('Test-one');
  await expect(chosen.getByRole('button', {name: 'Drag Test-one', exact: true})).toBeFocused();
  await apply(p);
  await p.getByRole('radio', {name: 'Select nodes', exact: true}).click();
  await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('test-group');
  await expect(p.locator('[data-group-row]')).toHaveCount(1);
  await p.locator('[data-group-row="test-group"] button').click();
  const inspector = p.locator('[data-group-inspector="test-group"]');
  await inspector
    .locator('[data-member-row]')
    .filter({has: p.getByRole('radio', {name: 'Switch node: Test-two', exact: true})})
    .click();
  await expect(inspector).toHaveAttribute('aria-busy', 'false', {timeout: 20000});
  await expect(inspector.locator('[data-member-row]').filter({has: p.getByRole('radio', {name: 'Switch node: Test-two', exact: true})})).toHaveAttribute(
    'aria-current',
    'true'
  );
  console.log('PASS group create, transfer add, keyboard reorder, apply, select');
  await p.getByRole('link', {name: 'Routing', exact: true}).click();
  await p.getByRole('button', {name: 'Add rule', exact: true}).click();
  await p.getByRole('combobox', {name: 'Values 1', exact: true}).fill('test.example.net');
  await p.getByRole('combobox', {name: 'Values 1', exact: true}).press('Enter');
  await p.getByRole('button', {name: 'Add condition', exact: true}).click();
  await p.getByRole('combobox', {name: 'Condition type 2', exact: true}).click();
  await p.getByRole('option', {name: 'Destination port', exact: true}).click();
  await p.getByRole('combobox', {name: 'Values 2', exact: true}).fill('443');
  await p.getByRole('combobox', {name: 'Values 2', exact: true}).press('Enter');
  await p.getByRole('button', {name: 'Goes to', exact: true}).click();
  await p.getByRole('option', {name: 'Direct', exact: true}).click();
  await expect(p.getByRole('dialog')).toContainText('Domain and subdomains: test.example.net and Destination port: 443 → Direct');
  await p.getByRole('button', {name: 'Add', exact: true}).click();
  const list = p.locator('[data-rule-list="routing"]');
  const first = await list.locator('[data-rule-index]').first().textContent();
  await list.locator('[data-drag-handle="0"]').dragTo(list.locator('[data-drop-target="1"]'));
  await expect(list.locator('[data-rule-index]').nth(1)).toHaveText(first);
  await expect(list.locator('[data-rule-index="1"]')).toBeFocused();
  await list
    .locator('[data-rule-index="1"]')
    .getByRole('button', {name: /^Actions: /})
    .click();
  await p.getByRole('menuitem', {name: 'Move up', exact: true}).click();
  await expect(list.locator('[data-rule-index]').first()).toHaveText(first);
  await expect(list.locator('[data-rule-index="0"]')).toBeFocused();
  await p.getByRole('link', {name: 'DNS', exact: true}).click();
  await expect(p.getByRole('dialog', {name: 'Discard unsaved changes?', exact: true})).toBeVisible();
  await p.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(p.getByRole('heading', {name: 'Routing', exact: true})).toBeVisible();
  await apply(p, 'Apply');
  console.log('PASS rule builder, drag, keyboard move, navigation guard, apply');
  await p.getByRole('link', {name: 'DNS', exact: true}).click();
  await p.getByRole('button', {name: 'Add DNS server', exact: true}).click();
  await p.getByRole('textbox', {name: 'Name', exact: true}).fill('test-dns');
  await p.getByRole('textbox', {name: 'Server address', exact: true}).fill('https://dns.example.net/dns-query');
  await p.getByRole('button', {name: 'Add', exact: true}).click();
  const request = p.locator('[data-rule-list="request"]');
  await request.getByRole('button', {name: 'Add rule', exact: true}).click();
  await p.getByRole('combobox', {name: 'Values 1', exact: true}).fill('example.net');
  await p.getByRole('combobox', {name: 'Values 1', exact: true}).press('Enter');
  await p.getByRole('button', {name: 'DNS server', exact: true}).click();
  await p.getByRole('option', {name: 'test-dns', exact: true}).click();
  await p.getByRole('button', {name: 'Add', exact: true}).click();
  await apply(p);
  await expect(p.locator('[data-rule-list="request"]')).toContainText('test-dns');
  console.log('PASS DNS upstream and request rule');
  await p.getByRole('button', {name: 'Settings', exact: true}).click();
  await p.getByRole('button', {name: 'Health check', exact: true}).click();
  await p.getByRole('spinbutton', {name: 'Switch tolerance', exact: true}).fill('120');
  await p.getByRole('dialog').getByRole('button', {name: 'Review and apply', exact: true}).click();
  await p.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(p.getByRole('spinbutton', {name: 'Switch tolerance', exact: true})).toHaveValue('120');
  await p.keyboard.press('Escape');
  console.log('PASS settings');
  expect(errors).toEqual([]);
  for (const width of [1280, 390]) await quickSwitch(browser, width);
  await browser.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});

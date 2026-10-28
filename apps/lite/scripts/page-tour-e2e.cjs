const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
// Screenshots are written only when LITE_SHOTS names a directory.
const shots = process.env.LITE_SHOTS;
if (shots) fs.mkdirSync(shots, {recursive: true});
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
async function highlighted(p) {
  await expect(p.locator('.cm-line span[class]').first()).toBeVisible();
  const style = await p.locator('.cm-editor').evaluate(editor => ({
    colors: new Set([...editor.querySelectorAll('.cm-line span[class]')].map(span => getComputedStyle(span).color)).size,
    font: getComputedStyle(editor.querySelector('.cm-scroller')).fontFamily,
    themeFont: getComputedStyle(editor)
      .getPropertyValue('--font-family-code')
      .split(',')[0]
      .trim()
      .replace(/^["']|["']$/g, '')
  }));
  expect(style.colors).toBeGreaterThan(1);
  expect(style.themeFont).not.toBe('');
  expect(style.font).toContain(style.themeFont);
}
async function choose(p, label, value) {
  await p.getByRole('combobox', {name: label, exact: true}).click();
  await p.getByRole('option', {name: value, exact: true}).click();
}
async function closed(p) {
  await expect(p.locator('dialog[open]')).toHaveCount(0, {timeout: 20000});
}
async function apply(p, label = 'Apply') {
  await p.getByRole('button', {name: 'Review and apply', exact: true}).click();
  await p.getByRole('button', {name: label, exact: true}).click();
  await closed(p);
  await settle(p);
}
async function go(p, route) {
  await expect(p.getByRole('link', {name: route === 'dns' ? 'DNS' : route[0].toUpperCase() + route.slice(1), exact: true, includeHidden: true})).toBeEnabled();
  await p.evaluate(route => (location.hash = route), route);
  await expect(p.getByRole('heading', {name: route === 'dns' ? 'DNS' : route[0].toUpperCase() + route.slice(1), exact: true})).toBeVisible();
}
(async () => {
  const b = await chromium.launch();
  for (const [width, theme] of [
    [1280, 'light'],
    [390, 'light'],
    [1280, 'dark']
  ]) {
    const c = await b.newContext({viewport: {width, height: 1000}, colorScheme: theme, locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write']});
    const p = await c.newPage();
    const errors = [];
    const requests = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', message => {
      // The static preview answers the same-origin honk probe with 404.
      if (message.type() === 'error' && !new URL(message.location().url).pathname.endsWith('/api')) errors.push(message.text());
    });
    p.on('request', r => requests.push(r.url()));
    const shot = async name => {
      console.log('SCREEN', name, width, theme);
      await settle(p);
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (shots) await p.screenshot({path: path.join(shots, `${name}-${width}-${theme}.png`), fullPage: true});
    };
    await p.goto(base);
    await waitForDemo(p);
    await go(p, 'nodes');
    await expect(p.locator('[data-group-inspector]:visible')).toHaveCount(0);
    await p.locator('table:visible').waitFor();
    await p.getByRole('button', {name: 'Add node', exact: true}).click();
    await p.getByRole('tab', {name: 'Enter manually', exact: true}).click();
    await p.getByRole('textbox', {name: 'Name', exact: true}).fill('Reality-form');
    await p.getByRole('textbox', {name: 'Server address', exact: true}).fill('edge.example.net');
    await p.getByRole('textbox', {name: 'UUID', exact: true}).fill('b831381d-6324-4d53-ad4f-8cda48b30811');
    await choose(p, 'Security', 'reality');
    await p.getByRole('textbox', {name: 'SNI', exact: true}).fill('www.example.net');
    await p.getByRole('textbox', {name: 'Reality public key', exact: true}).fill('jNXwRz8LPiKoTs4R7c2XsJf0Vkd7pA-Gpq3qbxnPfmY');
    await p.getByRole('textbox', {name: 'Short ID', exact: true}).fill('0123456789abcdef');
    await shot('protocol-vless');
    await p.getByRole('checkbox', {name: 'Advanced options', exact: true}).check();
    await choose(p, 'mux', 'xray');
    await p.getByRole('spinbutton', {name: 'concurrency', exact: true}).fill('-1');
    await p.getByRole('textbox', {name: 'SNI', exact: true}).click();
    await p.getByRole('button', {name: 'Add', exact: true}).click();
    await closed(p);
    await p.getByRole('textbox', {name: 'Search nodes', exact: true}).fill('Reality-form');
    await expect(p.locator('tbody')).toContainText('Reality-form');
    await p.getByRole('button', {name: 'Actions: Reality-form', exact: true}).click();
    await p.getByRole('menuitem', {name: 'Share', exact: true}).click();
    await expect(
      p
        .getByRole('dialog')
        .locator('svg')
        .filter({has: p.locator('title')})
    ).toBeVisible();
    await expect(p.getByRole('textbox', {name: 'Share link', exact: true})).toHaveValue(/concurrency=-1/);
    await shot('share');
    const shareLink = await p.getByRole('textbox', {name: 'Share link', exact: true}).inputValue();
    const clipboard = await p.evaluateHandle(() => navigator.clipboard);
    const writeClipboard = await p.evaluateHandle(() => navigator.clipboard.writeText.bind(navigator.clipboard));
    await p.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error('denied');
      };
    });
    await p.getByRole('button', {name: 'Copy link', exact: true}).click();
    await expect(p.getByRole('button', {name: 'Copied', exact: true})).toBeVisible();
    await expect.poll(() => clipboard.evaluate(value => value.readText())).toBe(shareLink);
    await writeClipboard.evaluate(write => write(''));
    await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true}));
    await p.getByRole('button', {name: 'Copied', exact: true}).click();
    await expect(p.getByRole('button', {name: 'Copied', exact: true})).toBeVisible();
    await expect.poll(() => clipboard.evaluate(value => value.readText())).toBe(shareLink);
    await p.evaluate(() => {
      document.execCommand = () => false;
    });
    await p.getByRole('button', {name: 'Copied', exact: true}).click();
    await expect(p.getByRole('dialog').getByRole('status').filter({hasText: 'Could not copy. Select and copy the link above.'})).toBeVisible();
    await expect(p.getByRole('button', {name: 'Copy link', exact: true})).toBeEnabled();
    await p.evaluate(() => {
      delete document.execCommand;
      delete navigator.clipboard;
    });
    await clipboard.evaluate(value => delete value.writeText);
    await writeClipboard.dispose();
    await clipboard.dispose();
    await p.getByRole('group', {name: 'Dialog actions'}).getByRole('button', {name: 'Close', exact: true}).click();
    await closed(p);
    await go(p, 'subscriptions');
    await p.getByRole('button', {name: 'Add subscription', exact: true}).click();
    await p.getByRole('textbox', {name: 'Name (optional)', exact: true}).fill('form-sub');
    await p.getByRole('textbox', {name: 'Subscription link', exact: true}).fill('https://example.net/form-sub');
    await p.getByRole('button', {name: 'Save', exact: true}).click();
    await closed(p);
    await apply(p);
    await p.locator('[data-provider-id="form-sub"] .astryx-collapsible-trigger').click();
    // The demo fetches nothing for a new link, so the expanded row shows its empty state.
    const expanded = p.locator('[data-provider-id="form-sub"]');
    await expect(expanded.getByText('This subscription returned no nodes', {exact: true})).toBeVisible();
    const expandedList = await expanded.boundingBox();
    expect(expandedList.x + expandedList.width).toBeLessThanOrEqual(width);
    await shot('subscription-expanded');
    await go(p, 'groups');
    await p.getByRole('button', {name: 'Create group', exact: true}).click();
    await p.getByRole('textbox', {name: 'Name', exact: true}).fill('form-group');
    await p.getByRole('button', {name: 'Create', exact: true}).click();
    // On phones the new group's editor opens in the inspector sheet.
    await expect(p.getByRole('dialog', {name: 'Create group', exact: true})).toHaveCount(0);
    const groupEditor = p.locator('[data-group-editor="form-group"]:visible');
    const available = groupEditor.locator('[data-transfer="available"]');
    const chosen = groupEditor.locator('[data-transfer="members"]');
    const bind = async (name, words) => {
      await available.getByRole('button', {name: `Add: ${name}`, exact: true}).click();
      const popover = p.locator(`[data-bind-popover="${name}"]`);
      await popover.getByRole('textbox', {name: 'Name contains (e.g. IPLC, Residential)', exact: true}).fill(words);
      await expect(popover).toContainText(`nodes in ${name} match`);
      return popover;
    };
    await available.getByRole('textbox', {name: 'Search members', exact: true}).fill('form-sub');
    await (await bind('form-sub', 'HK, Hong')).getByRole('button', {name: 'Add', exact: true}).click();
    await expect(chosen).toContainText('“HK” or “Hong”');
    await available.getByRole('textbox', {name: 'Search members', exact: true}).fill('harbor');
    const harbor = await bind('harbor', 'IPLC');
    const region = harbor.getByRole('button', {name: 'Hong Kong', exact: true});
    const keywords = harbor.getByRole('textbox', {name: 'Name contains (e.g. IPLC, Residential)', exact: true});
    await region.click();
    await expect(region).toHaveAttribute('aria-pressed', 'true');
    await expect(keywords).toHaveValue('IPLC');
    await region.click();
    await expect(region).toHaveAttribute('aria-pressed', 'false');
    await expect(keywords).toHaveValue('IPLC');
    await keywords.fill('');
    await expect(harbor.getByRole('button', {name: 'Add', exact: true})).toBeDisabled();
    await region.click();
    await expect(keywords).toHaveValue('');
    await expect(harbor.getByRole('button', {name: 'Add', exact: true})).toBeEnabled();
    await shot('region-binding');
    await harbor.getByRole('button', {name: 'Add', exact: true}).click();
    await expect(chosen).toContainText('Nodes from harbor in Hong Kong');
    await chosen.getByRole('button', {name: 'Edit harbor', exact: true}).click();
    await expect(region).toHaveAttribute('aria-pressed', 'true');
    await expect(keywords).toHaveValue('');
    await keywords.fill('IPLC');
    await harbor.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(chosen).toContainText('Nodes from harbor in Hong Kong or whose names contain “IPLC”');
    await available.getByRole('textbox', {name: 'Search members', exact: true}).fill('Reality-form');
    await available.getByRole('button', {name: 'Add: Reality-form', exact: true}).click();
    if (width < 768) await p.keyboard.press('Escape');
    await apply(p);
    await p.getByRole('radio', {name: 'Select nodes', exact: true}).click();
    await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('form-group');
    await p.locator('[data-group-row="form-group"] button').click();
    const inspector = p.locator('[data-group-inspector="form-group"]:visible');
    await inspector.getByRole('textbox', {name: 'Search members: form-group', exact: true}).fill('Reality-form');
    await inspector
      .locator('[data-member-row]')
      .filter({has: p.getByRole('radio', {name: 'Switch node: Reality-form', exact: true})})
      .click();
    await expect(inspector).toHaveAttribute('aria-busy', 'false', {timeout: 20000});
    if (width < 768) await p.keyboard.press('Escape');
    await go(p, 'routing');
    await p.getByRole('button', {name: 'Rebuild rules from a template', exact: true}).click();
    await choose(p, 'Rebuild rules from a template', /^GFW list/);
    await shot('template-diff');
    await p.getByRole('button', {name: 'Replace rules', exact: true}).click();
    await closed(p);
    await apply(p, 'Apply');
    await go(p, 'dns');
    await p.getByRole('button', {name: 'Add DNS server', exact: true}).click();
    await p.getByRole('textbox', {name: 'Name', exact: true}).fill('form-dns');
    await p.getByRole('textbox', {name: 'Server address', exact: true}).fill('https://dns.example.net/dns-query');
    await p.getByRole('button', {name: 'Add', exact: true}).click();
    await closed(p);
    await apply(p);
    // The shell drawer owns the footer on phones.
    if (width < 768)
      await p
        .getByRole('button', {name: /navigation|menu/i})
        .first()
        .click();
    await p.getByRole('button', {name: 'Proxy service actions', exact: true}).click();
    await shot('backend-menu');
    await p.getByRole('menuitem', {name: 'Pause proxy', exact: true}).click();
    await p.getByRole('dialog', {name: 'Pause proxy', exact: true}).getByRole('button', {name: 'Pause proxy', exact: true}).click();
    await expect(p.locator('dialog[open]').filter({has: p.getByRole('heading', {name: 'Pause proxy', exact: true})})).toHaveCount(0, {timeout: 20000});
    await p.getByRole('button', {name: 'Proxy service actions', exact: true}).click();
    await p.getByRole('menuitem', {name: 'Resume proxy', exact: true}).click();
    await expect(p.getByRole('button', {name: 'Proxy service actions', exact: true})).toBeEnabled({timeout: 20000});
    if (width < 768) await p.keyboard.press('Escape');
    await go(p, 'routing');
    // The editor loads on intent: pointing at the Text option starts the request before the click.
    await p.getByRole('radio', {name: 'Text', exact: true}).hover();
    await expect.poll(() => requests.some(url => url.includes('LiteCodeEditor-'))).toBeTruthy();
    await p.getByRole('radio', {name: 'Text', exact: true}).click();
    const editor = p.locator('.cm-content');
    await expect(editor).toBeVisible();
    await highlighted(p);
    expect(requests.some(url => url.includes('LiteCodeEditor-'))).toBeTruthy();
    await editor.click();
    await p.keyboard.press('Control+Home');
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Home');
    await p.keyboard.type('dom');
    await p.keyboard.press('Control+Space');
    await expect(p.locator('.cm-tooltip-autocomplete')).toBeVisible();
    await shot('code-completion');
    await p.keyboard.press('Enter');
    await p.keyboard.type('suffix: editor.example) -> direct\n');
    await p.keyboard.press('Escape');
    await expect(editor).toContainText('domain(suffix: editor.example) -> direct');
    await apply(p, 'Apply');
    await p.getByRole('radio', {name: 'Visual', exact: true}).click();
    await expect(p.locator('[data-rule-list="routing"]')).toContainText('editor.example');
    await go(p, 'dns');
    await p.getByRole('radio', {name: 'Text', exact: true}).click();
    await highlighted(p);
    await p.getByRole('radio', {name: 'Visual', exact: true}).click();
    await go(p, 'routing');
    await p.getByRole('heading', {name: 'Routing', exact: true}).focus();
    await p.keyboard.press('Control+k');
    await expect(p.getByRole('dialog', {name: 'Search', exact: true})).toBeVisible();
    await shot('command-palette');
    await p.getByRole('dialog').getByRole('combobox').fill('Nodes');
    await expect(p.getByRole('option', {name: 'Nodes', exact: true})).toBeVisible();
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Enter');
    await expect(p.getByRole('heading', {name: 'Nodes', exact: true})).toBeVisible();
    if (width === 1280 && theme === 'light') {
      await p.getByRole('textbox', {name: 'Search nodes', exact: true}).fill('Reality-form');
      await p.getByRole('button', {name: 'Actions: Reality-form', exact: true}).click();
      await p.getByRole('menuitem', {name: 'Edit', exact: true}).click();
      await expect(p.getByRole('textbox', {name: 'Reality public key', exact: true})).toHaveValue('jNXwRz8LPiKoTs4R7c2XsJf0Vkd7pA-Gpq3qbxnPfmY');
      await p.getByRole('textbox', {name: 'Server address', exact: true}).fill('changed.example.net');
      await p.getByRole('button', {name: 'Undo changes', exact: true}).click();
      await expect(p.getByRole('textbox', {name: 'Server address', exact: true})).toHaveValue('edge.example.net');
      await p.getByRole('button', {name: 'Cancel', exact: true}).click();
      await closed(p);
      await p.getByRole('textbox', {name: 'Search nodes', exact: true}).fill('nsg');
      await expect(p.getByRole('heading', {name: 'Nodes', exact: true})).toBeVisible();
      await p.getByRole('heading', {name: 'Nodes', exact: true}).focus();
      await p.keyboard.press('Control+k');
      await p.getByRole('dialog').getByRole('combobox').fill('Create group');
      await expect(p.getByRole('option', {name: 'Create group', exact: true})).toBeVisible();
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Enter');
      await expect(p.getByRole('dialog', {name: 'Create group', exact: true})).toBeVisible();
      await p.getByRole('textbox', {name: 'Name', exact: true}).fill('palette-group');
      await p.getByRole('button', {name: 'Create', exact: true}).click();
      await closed(p);
      const paletteEditor = p.locator('[data-group-editor="palette-group"]');
      await paletteEditor.locator('[data-transfer="available"]').getByRole('textbox', {name: 'Search members', exact: true}).fill('hk-');
      await paletteEditor.getByRole('button', {name: 'Add all', exact: true}).click();
      const removes = paletteEditor.locator('[data-transfer="members"]').getByRole('button', {name: /^Remove: /});
      expect(await removes.count()).toBeGreaterThan(1);
      while (await removes.count()) await removes.first().click();
      await expect(paletteEditor.locator('[data-transfer="members"]')).toContainText('No selected members.');
      await p.getByRole('button', {name: 'Discard', exact: true}).click();
      await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('form-group');
      await p.locator('[data-group-row="form-group"] button').click();
      await p.getByRole('button', {name: 'Actions: form-group', exact: true}).click();
      await p.getByRole('menuitem', {name: 'Copy members to…', exact: true}).click();
      await choose(p, 'Target group', 'backup');
      await expect(p.getByRole('dialog')).toContainText('backup: add');
      await p.getByRole('button', {name: 'Save', exact: true}).click();
      await closed(p);
      await apply(p);
      await p.getByRole('textbox', {name: 'Search groups', exact: true}).fill('backup');
      await p.locator('[data-group-row="backup"] button').click();
      await expect(p.locator('[data-group-editor="backup"] [data-transfer="members"]')).toContainText(
        'Nodes from harbor in Hong Kong or whose names contain “IPLC”'
      );
      await p.getByRole('heading', {name: 'Groups', exact: true}).focus();
      await p.keyboard.press('?');
      await expect(p.getByRole('dialog', {name: 'Keyboard shortcuts', exact: true})).toBeVisible();
      await p.getByRole('group', {name: 'Dialog actions', exact: true}).getByRole('button', {name: 'Close', exact: true}).click();
      await closed(p);
      console.log('PASS form reset, typing guard, palette creation, multi-add/remove, copy filters and shortcut help');
    }
    expect(errors).toEqual([]);
    console.log(`PASS round 7 workflow ${width} ${theme}; lazy editor, form, regex, template, pause/resume, palette; no overflow`);
    await c.close();
  }
  await b.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});

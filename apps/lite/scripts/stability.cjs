const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const titles = {nodes: 'Nodes', subscriptions: 'Subscriptions', groups: 'Groups', routing: 'Routing', dns: 'DNS'};
const first = {nodes: 'tbody tr', subscriptions: '[data-provider-id]', groups: '[data-group-row]', routing: '[data-rule-index]', dns: '[data-upstream]'};
const records = [];
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
async function box(locator) {
  return locator.evaluate(e => {
    const r = e.getBoundingClientRect();
    return {x: r.x, y: r.y, width: e.offsetWidth, height: e.offsetHeight};
  });
}
function same(a, b, keys = ['x', 'y', 'width', 'height']) {
  for (const key of keys) expect(Math.abs(a[key] - b[key]), key).toBeLessThanOrEqual(0.5);
}
async function focusRefresh(p) {
  // Advance only the focus-refresh cooldown; timers and animation clocks stay real.
  await p.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 16000;
    window.dispatchEvent(new Event('focus'));
  });
}
async function go(p, route) {
  await p.evaluate(route => (location.hash = route), route);
  await expect(p.locator('h1:visible')).toHaveText(titles[route]);
}
async function dialogStable(p, label, title) {
  const dialog = title ? p.getByRole('dialog', {name: title, exact: true}) : p.locator('dialog[open]').last();
  await dialog.waitFor();
  await p.waitForTimeout(50);
  const a = await box(dialog);
  await p.waitForTimeout(550);
  const b = await box(dialog);
  same(a, b, ['height', 'width']);
  expect(await dialog.evaluate(e => e.getAnimations({subtree: true}).filter(a => a.id === 'row-enter').length)).toBe(0);
  records.push({label, at50: a, at600: b});
}
(async () => {
  const browser = await chromium.launch({args: ['--disable-features=OverlayScrollbar']});
  const p = await browser.newPage({locale: 'en-US', viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  p.setDefaultTimeout(10000);
  // Preserve the initial Groups skeleton now that navigation starts the demo.
  await p.goto(base + '/?slow=1200', {waitUntil: 'domcontentloaded'});
  await p.locator('h1:visible').filter({hasText: 'Groups'}).waitFor();
  for (const route of ['groups', 'nodes', 'subscriptions', 'routing', 'dns']) {
    await go(p, route);
    const skeleton = p.locator(`[data-loading-shape="${route}"]:visible`).first();
    await skeleton.waitFor();
    const initial = await box(p.locator('h1:visible'));
    await expect(p.locator(`[data-loading-shape="${route}"]`)).toHaveCount(0, {timeout: 20000});
    if (route === 'groups') await waitForDemo(p);
    else await p.locator(`${first[route]}:visible`).first().waitFor();
    await settle(p);
    same(initial, await box(p.locator('h1:visible')));
    const row = p.locator(`${first[route]}:visible`).first();
    const before = await box(row);
    await focusRefresh(p);
    await expect(p.getByRole('progressbar').first()).toBeVisible();
    await expect(row).toBeVisible();
    same(before, await box(row));
    await expect(p.getByRole('progressbar')).toHaveCount(0, {timeout: 20000});
    same(before, await box(row));
    await p.evaluate(() => {
      window.originalAbortCheck = AbortSignal.prototype.throwIfAborted;
      AbortSignal.prototype.throwIfAborted = function () {
        throw new Error('Injected read failure');
      };
    });
    await focusRefresh(p);
    await expect(p.locator('.astryx-banner').first()).toBeVisible();
    await expect(row).toBeVisible();
    await p.evaluate(() => (AbortSignal.prototype.throwIfAborted = window.originalAbortCheck));
    await p.getByRole('button', {name: 'Reload', exact: true}).first().click();
    await expect(p.locator('.astryx-banner')).toHaveCount(0, {timeout: 20000});
    records.push({route, initial, refreshed: await box(row)});
    console.log('PASS loading header, refresh geometry, read failure and retry', route);
    if (route === 'subscriptions') {
      const start = await box(row);
      const update = p.getByRole('button', {name: 'Update all', exact: true});
      await update.click();
      await expect(update).toBeDisabled();
      same(start, await box(row), ['x', 'width']);
      await expect(update).toBeEnabled({timeout: 20000});
      same(start, await box(row), ['x', 'width']);
    }
  }
  await p.close();
  for (const width of [390, 1280, 1440]) {
    const p = await browser.newPage({locale: 'en-US', viewport: {width, height: 1000}});
    p.setDefaultTimeout(10000);
    await p.goto(base);
    await waitForDemo(p);
    for (const route of Object.keys(titles)) {
      await go(p, route);
      await p.locator(`${first[route]}:visible`).first().waitFor();
      await settle(p);
      expect(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      if (route === 'routing' || route === 'dns') {
        const geometry = await p.locator('[data-rule-index]:visible').evaluateAll(rows =>
          rows.map(row => {
            const handle = row.querySelector('[data-drag-handle]').getBoundingClientRect();
            const chips = [...row.querySelector('[data-rule-conditions]').children].map(e => e.getBoundingClientRect());
            return {handle: handle.top - row.getBoundingClientRect().top, chips: chips.every(r => r.right <= row.getBoundingClientRect().right)};
          })
        );
        expect(Math.max(...geometry.map(row => row.handle)) - Math.min(...geometry.map(row => row.handle))).toBeLessThanOrEqual(0.5);
        expect(geometry.every(row => row.chips)).toBeTruthy();
      }
    }
    await go(p, 'routing');
    for (const mode of ['All direct', 'Global proxy', 'Rule-based']) {
      await p.getByRole('radio', {name: mode, exact: true}).scrollIntoViewIfNeeded();
      const before = await box(p.locator('h1:visible'));
      const cards = await p.locator('[data-mode]').evaluateAll(items => items.map(e => ({x: e.getBoundingClientRect().x, width: e.offsetWidth})));
      await p.getByRole('radio', {name: mode, exact: true}).click();
      await settle(p);
      same(before, await box(p.locator('h1:visible')), ['x', 'width']);
      const after = await p.locator('[data-mode]').evaluateAll(items => items.map(e => ({x: e.getBoundingClientRect().x, width: e.offsetWidth})));
      cards.forEach((card, i) => same(card, after[i], ['x', 'width']));
    }
    for (const [route, label] of [
      ['nodes', 'Add node'],
      ['routing', 'Add rule'],
      ['dns', 'Add DNS server'],
      ['groups', 'Create group']
    ]) {
      await go(p, route);
      await p.getByRole('button', {name: label, exact: true}).click();
      await dialogStable(p, `${width}: ${label}`);
      await p.getByRole('button', {name: 'Cancel', exact: true}).click();
    }
    await p.keyboard.press('Control+k');
    await dialogStable(p, `${width}: Search`);
    await p.keyboard.press('Escape');
    await go(p, 'groups');
    await p.getByRole('radio', {name: 'Edit group', exact: true}).click();
    await p.locator('[data-group-row="proxy"] button').click();
    for (const label of ['Copy members to…', 'Edit as text', 'Duplicate', 'Delete']) {
      await p.getByRole('button', {name: 'Actions: proxy', exact: true}).click();
      await p.getByRole('menuitem', {name: label, exact: true}).click();
      await dialogStable(
        p,
        `${width}: ${label}`,
        {'Copy members to…': 'Copy members', 'Edit as text': 'Edit as text: proxy', Duplicate: 'Duplicate: proxy', Delete: 'Delete group?'}[label]
      );
      await p.keyboard.press('Escape');
    }
    if (width < 768) await p.keyboard.press('Escape');
    if (width < 768)
      await p
        .getByRole('button', {name: /navigation|menu/i})
        .first()
        .click();
    await p.getByRole('button', {name: 'Settings', exact: true}).click();
    await dialogStable(p, `${width}: Settings`);
    await p.keyboard.press('Escape');
    console.log('PASS tables, overflow, mode width and overlay stability', width);
    await p.close();
  }
  for (const colorScheme of ['light', 'dark']) {
    const p = await browser.newPage({locale: 'en-US', viewport: {width: 1440, height: 1000}, colorScheme});
    await p.goto(base);
    await waitForDemo(p);
    await p.getByRole('button', {name: 'Collapse sidebar', exact: true}).click();
    await settle(p);
    const centres = await p
      .locator('nav')
      .first()
      .locator('a,button')
      .evaluateAll(items => items.filter(e => e.checkVisibility()).map(e => e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2));
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(0.5);
    await p.getByRole('button', {name: 'Proxy service actions', exact: true}).click();
    await expect(p.getByRole('menu')).toContainText('Demo');
    console.log('PASS collapsed rail axis and service menu', colorScheme);
    await p.close();
  }
  await browser.close();
  if (process.env.LITE_TEST_OUTPUT) fs.writeFileSync(process.env.LITE_TEST_OUTPUT, JSON.stringify(records, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});

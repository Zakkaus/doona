const {chromium, expect} = require('@playwright/test');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const routes = ['groups', 'subscriptions', 'nodes', 'routing', 'dns'];
(async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({locale: 'en-US', viewport: {width: 1440, height: 900}});
    await p.addInitScript(() => {
      window.readChecks = 0;
      const check = AbortSignal.prototype.throwIfAborted;
      AbortSignal.prototype.throwIfAborted = function () {
        window.readChecks++;
        return check.call(this);
      };
      window.entrances = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (['page-enter', 'row-enter', 'collection-ready'].includes(options?.id)) window.entrances.push(options.id);
        return animate.call(this, frames, options);
      };
      window.pageNodes = {};
    });
    await p.goto(base);
    await waitForDemo(p);
    await p.locator('[data-group-inspector]').waitFor();
    for (const route of routes) {
      await p.evaluate(route => {
        location.hash = route;
      }, route);
      await expect(p.locator('h1:visible')).toHaveText(route === 'dns' ? 'DNS' : route[0].toUpperCase() + route.slice(1));
      // The page itself, not the frame shown while its chunk loads.
      await p.locator('[data-collection]:visible').first().waitFor();
      await expect(p.locator('[data-collection][aria-busy="true"]:visible')).toHaveCount(0);
      await p.waitForTimeout(250);
      await p.evaluate(route => {
        pageNodes[route] = [...document.querySelectorAll('[data-page-frame]')].find(e => e.checkVisibility());
      }, route);
    }
    const reads = await p.evaluate(() => {
      entrances = [];
      return readChecks;
    });
    for (const route of routes) {
      await p.evaluate(route => {
        location.hash = route;
      }, route);
      await expect(p.locator('h1:visible')).toHaveText(route === 'dns' ? 'DNS' : route[0].toUpperCase() + route.slice(1));
      expect(await p.evaluate(route => pageNodes[route] === [...document.querySelectorAll('[data-page-frame]')].find(e => e.checkVisibility()), route)).toBe(
        true
      );
      await expect(p.locator('dialog')).toHaveCount(0);
    }
    await p.waitForTimeout(250);
    expect(await p.evaluate(() => readChecks)).toBe(reads);
    expect(await p.evaluate(() => entrances)).toEqual([]);
    console.log('PASS five retained page DOMs, no revisit reads or entrance replay, no closed dialogs');
    await p.evaluate(() => {
      location.hash = 'nodes';
    });
    await expect(p.locator('h1:visible')).toHaveText('Nodes');
    await expect(p.locator('h1:visible')).toBeFocused();
    const actions = p.getByRole('button', {name: /^Actions:/}).first();
    await actions.focus();
    await p.keyboard.press('ArrowDown');
    const items = p.locator('[role="menu"]:visible [role^="menuitem"]:not([aria-disabled="true"])');
    await expect(items.first()).toBeFocused();
    await p.keyboard.press('Escape');
    await expect(actions).toBeFocused();
    await p.keyboard.press('ArrowUp');
    await expect(items.last()).toBeFocused();
    await p.keyboard.press('Escape');
    await actions.click();
    await expect(p.getByRole('menu')).toBeFocused();
    await p.keyboard.press('Escape');
    await expect(p.getByRole('menu')).toHaveCount(0);
    console.log('PASS lazy row menu preserves pointer, ArrowDown, ArrowUp and Escape focus');
    await p.close();
    const phone = await browser.newPage({locale: 'en-US', viewport: {width: 390, height: 900}});
    await phone.goto(base);
    await waitForDemo(phone);
    await phone.locator('[data-group-row] button').first().click();
    await phone.locator('dialog[open]').waitFor();
    await phone.keyboard.press('Escape');
    await phone.evaluate(() => {
      location.hash = 'routing';
    });
    await phone.getByRole('button', {name: 'Rebuild rules from a template', exact: true}).click();
    await expect(phone.getByRole('dialog', {name: 'Rebuild rules from a template', exact: true})).toBeVisible();
    console.log('PASS navigation during sheet exit releases the native modal');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

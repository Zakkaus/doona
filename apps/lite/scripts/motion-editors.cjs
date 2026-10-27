const base = require('./preview.cjs');
const {chromium, expect} = require('@playwright/test');
const {waitForDemo} = require('./demo.cjs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({locale: 'en-US', viewport: {width: 1280, height: 1000}});
  await p.addInitScript(() => {
    window.draftOffsets = [];
    window.draftStyleReads = 0;
    let announcing = false;
    const dispatch = window.dispatchEvent;
    window.dispatchEvent = function (event) {
      const previous = announcing;
      announcing = event.type === 'lite-draft-offset';
      try {
        return dispatch.call(this, event);
      } finally {
        announcing = previous;
      }
    };
    const computed = window.getComputedStyle;
    window.getComputedStyle = function (...args) {
      if (announcing) window.draftStyleReads++;
      return computed.apply(this, args);
    };
    window.addEventListener('lite-draft-offset', event => window.draftOffsets.push(event.detail));
  });
  await p.goto(base);
  await waitForDemo(p);
  for (const [route, rows] of [
    ['routing', '[data-rule-index]'],
    ['nodes', 'tbody tr'],
    ['groups', '[data-group-row]'],
    ['routing', '[data-rule-index]']
  ]) {
    await p.locator(`a.astryx-side-nav-item[href="#${route}"]`).click();
    await p.locator(`${rows}:visible`).first().waitFor();
  }
  expect(await p.evaluate(() => window.draftOffsets)).toEqual([]);
  const list = p.locator('[data-rule-list="routing"]');
  await list.locator('[data-rule-index]').first().waitFor();
  await p.evaluate(async () => {
    await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})));
    window.motionCalls = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      motionCalls.push({id: options?.id, draft: this.hasAttribute('data-draft-bar'), frames, duration: options?.duration});
      return animate.call(this, frames, options);
    };
  });
  await list.locator('[data-drag-handle="0"]').dragTo(list.locator('[data-drop-target="1"]'));
  await expect(p.locator('[data-draft-bar]')).toBeVisible();
  const offset = await p.evaluate(() => {
    const height = document.querySelector('[data-draft-bar]').offsetHeight;
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spacing-4')) || 0;
    return {
      height,
      announced: window.draftOffsets.at(-1),
      toastAboveDraft: [...document.querySelectorAll('[popover="manual"]')].some(el => parseFloat(el.style.bottom) === height + gap)
    };
  });
  expect(offset.announced).toBe(offset.height);
  expect(offset.toastAboveDraft).toBe(true);
  await list
    .locator('[data-rule-index="1"]')
    .getByRole('button', {name: /^Actions: /})
    .click();
  await p.getByRole('menuitem', {name: 'Move up', exact: true}).click();
  await expect(p.locator('[data-draft-bar]')).not.toBeVisible();
  expect(await p.evaluate(() => window.draftOffsets)).toEqual([offset.height, 0]);
  expect(await p.evaluate(() => window.draftStyleReads)).toBe(0);
  const calls = await p.evaluate(() => motionCalls);
  expect(calls.filter(a => a.id === 'item-move')).toHaveLength(2);
  const drafts = calls.filter(a => a.draft);
  expect(drafts).toHaveLength(2);
  expect(drafts[0].frames.map(f => f.opacity)).toEqual([0, 1]);
  expect(drafts[1].frames.map(f => f.opacity)).toEqual([1, 0]);
  expect(drafts.every(a => a.duration === 240)).toBeTruthy();
  console.log('PASS shared drag/keyboard animation and draft enter/exit', JSON.stringify({moves: 2, draft: 2}));
  await p.emulateMedia({reducedMotion: 'reduce'});
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.evaluate(() => (motionCalls = []));
  await list.locator('[data-drag-handle="0"]').dragTo(list.locator('[data-drop-target="1"]'));
  await expect(p.locator('[data-draft-bar]')).toBeVisible();
  await p.getByRole('button', {name: 'Discard', exact: true}).click();
  await expect(p.locator('[data-draft-bar]')).not.toBeVisible();
  expect(await p.evaluate(() => motionCalls.filter(a => a.draft || a.id === 'item-move'))).toEqual([]);
  console.log('PASS static draft and movement with reduced motion');
  await require('./motion-groups.cjs')(b);
  await b.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});

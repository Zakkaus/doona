const {chromium, expect} = require('@playwright/test');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');

async function finishAnimations(page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect.getTiming().iterations !== Infinity) animation.finish();
    }
  });
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({locale: 'en-US', viewport: {width: 1280, height: 800}, reducedMotion});
      // The mock's ?slow delay is a release latch, not a real-time assertion.
      // Pause new animations at their first frame so even a busy runner sees a reset.
      await page.addInitScript(() => {
        const timeout = window.setTimeout;
        window.pendingReads = [];
        window.holdReads = false;
        window.setTimeout = (callback, delay, ...args) => {
          if (delay !== 12345) return timeout(callback, delay, ...args);
          if (!window.holdReads) return timeout(callback, 0, ...args);
          window.pendingReads.push(() => callback(...args));
          return 0;
        };
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames, options) {
          const animation = animate.call(this, frames, options);
          if (animation.effect.getTiming().iterations !== Infinity) {
            animation.pause();
            animation.currentTime = 0;
          }
          return animation;
        };
      });
      let releaseChunk;
      const chunk = new Promise(resolve => (releaseChunk = resolve));
      await page.route(/\/assets\/Nodes-[^/]*\.js$/, async route => {
        await chunk;
        await route.continue();
      });
      await page.goto(`${base}?slow=12345`);
      await waitForDemo(page);
      await finishAnimations(page);
      await page.evaluate(() => (window.holdReads = true));
      await page.getByRole('link', {name: 'Nodes', exact: true}).click();
      await expect(page.locator('h1:visible')).toHaveText('Nodes');
      await finishAnimations(page);
      const description = page.getByText('Manage manual nodes and nodes supplied by subscriptions.', {exact: true});
      const before = await description.boundingBox();
      releaseChunk();
      const toolbar = page.locator('[data-collection-toolbar]:visible');
      await toolbar.waitFor();
      await page.waitForFunction(() => window.pendingReads.length > 0);
      await finishAnimations(page);
      const loadedFrame = await description.boundingBox();
      const toolbarBefore = await toolbar.boundingBox();
      await expect(toolbar).toHaveCSS('opacity', '1');
      await page.evaluate(() => {
        window.holdReads = false;
        for (const release of window.pendingReads.splice(0)) release();
      });
      await page.locator('[data-page-body]:visible').waitFor();
      await expect(page.locator('[data-node-id]').filter({hasText: /^hk-01$/})).toBeVisible();
      // Data becoming ready must not hide or move a toolbar that was already shown.
      await expect(toolbar).toHaveCSS('opacity', '1');
      expect((await toolbar.boundingBox()).y).toBe(toolbarBefore.y);
      await finishAnimations(page);
      expect(loadedFrame.y, 'lazy header and loaded header keep the description in place').toBe(before.y);
      expect((await description.boundingBox()).y).toBe(before.y);
      await expect(page.locator('h1:visible')).toBeFocused();
      console.log(`PASS page load keeps the description and visible toolbar stable (${reducedMotion})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

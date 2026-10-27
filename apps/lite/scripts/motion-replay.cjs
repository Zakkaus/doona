const base = require('./preview.cjs');
const {chromium, expect} = require('@playwright/test');
const {waitForDemo} = require('./demo.cjs');
async function settle(p) {
  await p.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))
    );
  });
}
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({locale: 'en-US', viewport: {width: 1280, height: 1000}});
  const p = await c.newPage();
  await p.goto(base + '/?slow=600');
  await waitForDemo(p);
  for (const route of ['nodes', 'subscriptions', 'groups', 'routing', 'dns']) {
    await p.evaluate(route => (location.hash = route), route);
    await p.waitForFunction(
      route =>
        Array.from(document.querySelectorAll('h1'))
          .find(e => e.checkVisibility())
          ?.textContent?.toLowerCase() === route && Array.from(document.querySelectorAll('[data-page-body]')).some(e => e.checkVisibility()),
      route
    );
    await settle(p);
    await p.evaluate(() => {
      window.replayed = [];
      window.watching = true;
      const sample = () => {
        if (!watching) return;
        replayed.push(
          ...document
            .getAnimations()
            .filter(a => ['page-enter', 'row-enter'].includes(a.id))
            .map(a => a.id)
        );
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await p.evaluate(() => {
      const now = Date.now;
      Date.now = () => now() + 16000;
      window.dispatchEvent(new Event('focus'));
    });
    await expect(p.getByRole('progressbar', {name: /refresh|update/i})).toBeVisible();
    await expect(p.getByRole('progressbar', {name: /refresh|update/i})).toHaveCount(0, {timeout: 20000});
    const other = await c.newPage();
    await other.bringToFront();
    await p.bringToFront();
    await other.close();
    expect(
      await p.evaluate(() => {
        watching = false;
        return replayed;
      })
    ).toEqual([]);
    console.log('PASS no reload/focus replay', route);
  }
  await p.evaluate(() => (location.hash = 'groups'));
  await p.locator('[data-group-row="auto"] button').click();
  await p.locator('[data-group-inspector="auto"] [data-member-row]').first().waitFor();
  const rows = await p.evaluate(() => document.getAnimations().filter(a => a.id === 'row-enter').length);
  expect(rows).toBeGreaterThanOrEqual(3);
  await p.emulateMedia({reducedMotion: 'reduce'});
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await p.evaluate(() => document.getAnimations().length)).toBe(0);
  console.log('PASS inspector rows', rows, 'and live reduced-motion cancellation');
  await p.emulateMedia({reducedMotion: 'no-preference'});
  const inspector = p.locator('[data-group-inspector="auto"]:visible');
  const search = inspector.getByRole('textbox', {name: 'Search members: auto', exact: true});
  await search.fill('__no_member_matches__');
  await expect(inspector.locator('[data-member-row]')).toHaveCount(0);
  await search.clear();
  await inspector.locator('[data-member-row]').first().waitFor();
  expect(await p.evaluate(() => document.getAnimations().filter(a => ['page-enter', 'row-enter'].includes(a.id)).length)).toBe(0);
  console.log('PASS no row entrance replay after empty member search');
  await b.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});

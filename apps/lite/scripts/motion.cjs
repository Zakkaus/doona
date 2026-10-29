// The demo supplies three subscriptions; keep 600 ms latency confined to this test URL.
const base = require('./preview.cjs');
const {chromium, expect} = require('@playwright/test');
const {waitForDemo} = require('./demo.cjs');
(async () => {
  const browser = await chromium.launch();
  const counts = [];
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const c = await browser.newContext({locale: 'en-US', viewport: {width: 1280, height: 1000}, reducedMotion});
    const p = await c.newPage();
    await p.addInitScript(() => {
      window.collectionFades = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (options?.id === 'collection-ready') collectionFades.push({frames, duration: options.duration, easing: options.easing});
        return animate.call(this, frames, options);
      };
    });
    await p.goto(base + '/?slow=600');
    await waitForDemo(p);
    // Groups opens first and is retained, so it is measured on that first open.
    for (const route of ['groups', 'nodes', 'subscriptions', 'routing', 'dns']) {
      await p.evaluate(route => (location.hash = route), route);
      await p.waitForFunction(route => {
        const heading = Array.from(document.querySelectorAll('h1')).find(e => e.checkVisibility());
        return (
          heading?.textContent?.toLowerCase() === route &&
          Array.from(document.querySelectorAll('[data-page-body]')).some(e => e.checkVisibility()) &&
          (route === 'routing'
            ? !!document.querySelector('[data-rule-list="routing"] [data-rule-index]')
            : route === 'dns'
              ? !!document.querySelector('[data-rule-list="request"] [data-rule-index]')
              : route === 'groups'
                ? !!document.querySelector('[data-group-row]')
                : route === 'subscriptions'
                  ? !!document.querySelector('[data-provider-id]')
                  : !!document.querySelector('tbody tr'))
        );
      }, route);
      await p.evaluate(() => new Promise(r => requestAnimationFrame(r)));
      const record = await p.evaluate(() => {
        const animations = document.getAnimations();
        return {
          body: animations.filter(a => a.id === 'page-enter' && a.effect.target.closest('[data-page-body]')).length,
          rows: animations.filter(a => a.id === 'row-enter').length,
          total: animations.length
        };
      });
      counts.push({route, reducedMotion, ...record});
      console.log(JSON.stringify(counts.at(-1)));
      if (reducedMotion === 'reduce') expect(record.total).toBe(0);
      else {
        expect(record.rows).toBeGreaterThanOrEqual(3);
      }
    }
    const fades = await p.evaluate(() => collectionFades);
    if (reducedMotion === 'reduce') expect(fades).toEqual([]);
    else {
      expect(fades.length).toBeGreaterThan(0);
      for (const fade of fades) {
        expect(fade.duration).toBe(240);
        expect(fade.easing).toBe('cubic-bezier(0.24, 1, 0.4, 1)');
        expect(fade.frames).toEqual([{opacity: 0}, {opacity: 1}]);
      }
    }
    await c.close();
  }
  await browser.close();
  if (process.env.LITE_TEST_OUTPUT) require('fs').writeFileSync(process.env.LITE_TEST_OUTPUT, JSON.stringify(counts, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});

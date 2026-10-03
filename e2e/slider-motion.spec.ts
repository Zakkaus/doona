import type {Locator, Page} from '@playwright/test';
import {expect, test} from './fixtures';

// A selection marker slides to the item a pointer picks. The press sinks the item by a transform that eases back after
// release; the marker is placed from layout, so the easing neither moves its target nor cancels the slide.
const cases: Array<{name: string; route: string; marker: string; pick: (page: Page) => Locator; axis: 'x' | 'y'}> = [
  {
    name: 'segmented control',
    route: 'activity',
    marker: '[data-instance="mode"] .rp-seg > .rp-slider',
    pick: page => page.getByRole('radiogroup', {name: 'Outbound mode'}).getByRole('radio', {name: 'Global', exact: true}),
    axis: 'x'
  },
  {
    name: 'tab bar',
    route: 'connections',
    marker: '.rp-content .rp-tabbar > .rp-slider',
    pick: page => page.getByRole('tab', {name: 'Connections', exact: true}),
    axis: 'x'
  },
  {
    name: 'side navigation',
    route: 'activity',
    marker: '.rp-side-links > .rp-nav-slider',
    pick: page => page.locator('.rp-nav[href="#/connections"]'),
    axis: 'y'
  }
];

test.use({viewport: {width: 1920, height: 1080}, reducedMotion: 'no-preference'});

for (const c of cases) {
  test(`the ${c.name} marker slides to the item a pointer presses`, async ({page}) => {
    await page.goto(`/#/${c.route}`);
    const marker = page.locator(c.marker);
    const item = c.pick(page);
    await expect(marker).toBeVisible();
    await expect(item).toBeVisible();
    // Animations run at a quarter speed, so a loaded machine still draws frames mid-slide.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', {playbackRate: 0.25});
    // Sample where the marker is drawn on every frame from before the press until well after it settles.
    await marker.evaluate((el, axis) => {
      const samples: number[] = [];
      (window as unknown as {samples: number[]}).samples = samples;
      const end = performance.now() + 3000;
      const tick = () => {
        const r = el.getBoundingClientRect();
        samples.push(axis === 'x' ? r.left : r.top);
        if (performance.now() < end) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, c.axis);
    const target = await item.boundingBox();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {steps: 4});
    await page.mouse.down();
    // Held long enough to sink, so the release eases the item back while the marker moves.
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(3100);
    const samples = await page.evaluate(() => (window as unknown as {samples: number[]}).samples);
    const from = samples[0];
    const to = samples.at(-1)!;
    expect(Math.abs(to - from), 'the marker moves to the pressed item').toBeGreaterThan(20);
    const lo = Math.min(from, to) + 2;
    const hi = Math.max(from, to) - 2;
    expect(samples.filter(v => v > lo && v < hi).length, 'frames drawn between the old and new place').toBeGreaterThanOrEqual(3);
  });
}

import type {Page} from '@playwright/test';
import {expect, mockBackend, test} from './fixtures';

// The group cards come up at their final size. The groups list names each group and its member count; each card's
// members and their health come from the group's own read and the node list, which arrive later. Cards that grew when
// the members arrived moved everything below them.
const FRAMES = 90;

// Samples what reaches the screen: a message posted from an animation frame runs after that frame paints. Each frame
// with cards on screen notes every card's height in the shown groups panel.
function watchCards(count: number) {
  const seen: {frames: string[]} = {frames: []};
  (window as unknown as {cards: typeof seen}).cards = seen;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    // Cards laid out hidden behind the loading state are not on screen.
    const cards = [...document.querySelectorAll('.rp-tabpanel[data-shown] .rp-card')].filter(card => card.checkVisibility({visibilityProperty: true}));
    if (cards.length && seen.frames.length < count) seen.frames.push(cards.map(card => Math.round(card.getBoundingClientRect().height)).join(' '));
  };
  const tick = () => {
    channel.port2.postMessage(0);
    if (seen.frames.length < count) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// The group reads and the node list answer 700 ms after the groups list.
async function slowMembers(page: Page) {
  await mockBackend(page);
  await page.route(/\/api\/v1\/(nodes|groups\/[^/]+)(\?.*)?$/, async route => {
    if (route.request().method() === 'GET') await new Promise(resolve => setTimeout(resolve, 700));
    await route.fallback();
  });
}

async function expectSteadyCards(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as {cards: {frames: unknown[]}}).cards.frames.length), {timeout: 10_000}).toBe(FRAMES);
  const {frames} = await page.evaluate(() => (window as unknown as {cards: {frames: string[]}}).cards);
  // The members have arrived by the last frame, and every frame before it showed the cards at that size.
  await expect(page.locator('.rp-tabpanel[data-shown] .rp-card :is(button, [role=row]).rp-node').first()).toBeVisible();
  expect(frames[0], 'first painted card heights').toBe(frames.at(-1));
  expect(new Set(frames)).toEqual(new Set([frames.at(-1)]));
}

for (const viewport of [
  {width: 1440, height: 900},
  {width: 390, height: 844}
])
  test.describe(`${viewport.width}px`, () => {
    test.use({viewport});

    test('the group cards opened by their link appear at their final size', async ({page}) => {
      await slowMembers(page);
      await page.addInitScript(watchCards, FRAMES);
      await page.goto('/#/policies');
      await expectSteadyCards(page);
    });

    test('the group cards opened from another page appear at their final size', async ({page}) => {
      await slowMembers(page);
      await page.goto('/#/activity');
      await expect(page.locator('.rp-activity-surface').first()).toBeVisible();
      await page.evaluate(watchCards, FRAMES);
      await page.evaluate(() => (location.hash = '#/policies'));
      await expectSteadyCards(page);
    });
  });

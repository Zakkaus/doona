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
    const cards = [...document.querySelectorAll('.rp-policy-list .rp-card')].filter(card => card.checkVisibility({visibilityProperty: true}));
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
  await expect(page.locator('.rp-policy-list .rp-card :is(button, [role=row]).rp-node').first()).toBeVisible();
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

// A card that opened on screen and was scrolled away before its group arrived stops waiting for it, so the list shows.
test('scrolling away from a loading card shows the list', async ({page}) => {
  const {api} = await mockBackend(page);
  // Automatic groups open folded, so a few more manual ones make the page long enough to leave the first card behind.
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const extra = Array.from({length: 6}, (_, i) => `  manual${i} { filter: name(hk-01, hk-02, sg-01, us-01, jp-01) policy: fixed(0) }`).join('\n');
  await api.pollOperation(await api.replaceConfigSource(main.id, main.content!.replace(/^group \{\n/m, `group {\n${extra}\n`), `"${main.content_sha256}"`));
  const [first] = await api.groups();
  await page.route(new RegExp(`/api/v1/groups/${first.id}(\\?.*)?$`), async route => {
    if (route.request().method() === 'GET') await new Promise(resolve => setTimeout(resolve, 15_000));
    await route.fallback();
  });
  await page.setViewportSize({width: 1440, height: 500});
  await page.goto('/#/policies');
  const list = page.locator('.rp-policy-list');
  await expect(list).toHaveAttribute('data-wait', '');
  await page.mouse.move(720, 300);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 1000);
  await expect(page.getByRole('region', {name: first.name, exact: true})).not.toBeInViewport({ratio: 0});
  await expect(list).not.toHaveAttribute('data-wait', {timeout: 5_000});
});

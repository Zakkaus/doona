import {expect, fulfillStream, isLive, mockBackend, routes, test} from './fixtures';
import type {Page} from '@playwright/test';

// The Skeleton of every route holds the shape of the page that replaces it (CONTRIBUTING, Loading states): at startup,
// while the route's code loads and while its first reads are pending, the page column's blocks sit where the loaded
// page's blocks will, so nothing moves when the content arrives. A block whose height follows the data (a table, the
// flows map) draws a typical height and is held to its top only, and the blocks after it to their size; it says so with
// data-typical. One page load per route and width walks through the three states, and DOONA_SKELETON_SHOTS=<dir> also
// saves a picture of each, taken after the state has been held for HOLD ms. A Skeleton has to be seen as well as laid
// out: each held state needs its shimmer visible, and from the frame it first shows, no frame of the whole walk may be
// without one, so a phase that restarts the 150ms delay or leaves a gap between phases fails.
test.skip(isLive, 'holds the mock backend');
// A service worker's own fetches are out of reach of request interception, so it stays out of the way of the holds.
test.use({storage: {'doona-lang': 'zh-TW'}, serviceWorkers: 'block'});

const TOLERANCE = 4;
// Longer than the 150ms a Skeleton waits before it shows, with room for a frame.
const HOLD = 250;
type Block = {name: string; top: number; left: number; width: number; height: number; typical: boolean};

// The blocks of the page column, top to bottom: what is left of the column's children once the wrappers that only
// carry layout (the page, its tabs and panel, a Skeleton's own group) give way to theirs. The heading is not one.
const blocks = (page: Page): Promise<Block[]> =>
  page.evaluate(() => {
    const wrapper =
      '.rp-page, .rp-page-skeleton, .rp-tabs, .rp-tabpanel, .rp-skeleton-group, .rp-chart-page, .rp-col, .rp-dashboard, .rp-policy-list, .rp-skeleton-cards';
    const out: Block[] = [];
    const visit = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') return;
      // Skeleton cards are one block when they lay out as a grid, and the page's blocks when they only stack.
      if (element.matches(wrapper) && !(element.matches('.rp-skeleton-cards') && style.display === 'grid')) return [...element.children].forEach(visit);
      if (box.height === 0) return;
      // A dashboard section on the fraction grid reaches one gap before its first card and holds one below the last, so it
      // is read as the span of its cards.
      const cards = element.matches('.rp-dash-section') ? [...element.children].map(child => child.getBoundingClientRect()) : [box];
      const left = Math.min(...cards.map(card => card.left));
      const top = Math.min(...cards.map(card => card.top));
      out.push({
        name: `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`,
        top: Math.round(box.top + scrollY),
        left: Math.round(left),
        width: Math.round(Math.max(...cards.map(card => card.right)) - left),
        height: Math.round(Math.max(...cards.map(card => card.bottom)) - top),
        typical: element.matches('[data-typical]') || !!element.querySelector('[data-typical]')
      });
    };
    for (const child of document.querySelector('.rp-content')!.children) if (!child.classList.contains('rp-head')) visit(child);
    return out;
  });

// Geometry is stable once two reads a poll apart agree, with the fonts in and something drawn.
async function settled(page: Page) {
  let last = '';
  await expect
    .poll(async () => {
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const now = JSON.stringify(await blocks(page));
      return (now !== '[]' && now === last) || ((last = now), false);
    })
    .toBe(true);
  return blocks(page);
}

const shape = (list: Block[]) =>
  list.map(block => `${block.name} ${block.left},${block.top} ${block.width}x${block.height}${block.typical ? ' typical' : ''}`).join('\n');

function expectSameShape(state: string, skeleton: Block[], content: Block[]) {
  // A typical last block stands for the rest of a list that grows with its data, such as the policies.
  const more = skeleton.at(-1)?.typical && content.length > skeleton.length;
  if (!more) expect.soft(skeleton.length, `${state}: blocks\nskeleton:\n${shape(skeleton)}\ncontent:\n${shape(content)}`).toBe(content.length);
  skeleton.forEach((block, i) => {
    const loaded = content[i];
    // A run of typical blocks is one list that follows its data: only where it starts is held.
    if (!loaded || (block.typical && skeleton[i - 1]?.typical)) return;
    const label = `${state}: block ${i} (${block.name} against ${loaded.name})`;
    // What follows a data-sized block moves with it, so only its size is held.
    if (!skeleton.slice(0, i).some(before => before.typical)) expect.soft(Math.abs(block.top - loaded.top), `${label} top`).toBeLessThanOrEqual(TOLERANCE);
    if (block.typical) return;
    expect.soft(Math.abs(block.left - loaded.left), `${label} left`).toBeLessThanOrEqual(TOLERANCE);
    expect.soft(Math.abs(block.width - loaded.width), `${label} width`).toBeLessThanOrEqual(TOLERANCE);
    expect.soft(Math.abs(block.height - loaded.height), `${label} height`).toBeLessThanOrEqual(TOLERANCE);
  });
}

// What is drawn of the Skeleton, in the page's own frames: a shimmer part that takes room and is seen (computed
// visibility and opacity, its ancestors' included). A frame is 'V' when one is, 'H' when parts take room and none is
// seen, and 'N' when there are none. A bar a narrow screen drops (display: none) is no part.
const SHIMMER = '.rp-content :is(.rp-skeleton-text, .rp-skeleton-cards > .rp-card)';
type Probe = {frames: string[]; parts: () => {drawn: number; unseen: number}};
const watchFrames = (page: Page) =>
  page.addInitScript(selector => {
    const parts = () => {
      const drawn = [...document.querySelectorAll(selector)].filter(part => part.getClientRects().length);
      return {drawn: drawn.length, unseen: drawn.filter(part => !part.checkVisibility({opacityProperty: true, visibilityProperty: true})).length};
    };
    const probe: Probe = {frames: [], parts};
    (window as unknown as {probe: Probe}).probe = probe;
    const sample = () => {
      const {drawn, unseen} = parts();
      probe.frames.push(drawn > unseen ? 'V' : drawn ? 'H' : 'N');
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, SHIMMER);
const framesSoFar = (page: Page) => page.evaluate(() => (window as unknown as {probe: Probe}).probe.frames.join(''));
// Every shimmer part of the held state is seen, not only laid out; `drawn` also needs one, which a page whose first read
// has already put its content up (the events table) does not.
async function expectSeen(page: Page, state: string, drawn = true) {
  await page.waitForTimeout(HOLD);
  const parts = await page.evaluate(() => (window as unknown as {probe: Probe}).probe.parts());
  if (drawn) expect.soft(parts.drawn, `${state}: no shimmer part is drawn`).toBeGreaterThan(0);
  expect.soft(parts.unseen, `${state}: shimmer parts that cannot be seen`).toBe(0);
}

// The route's code is the build's chunk named for its page, <Route>-<hash>.js; the dashboard's is the frame's own.
const chunkOf = (manifest: Array<{file: string}>, route: string) =>
  manifest.find(entry => new RegExp(`^assets/${route[0].toUpperCase()}${route.slice(1)}-[^/]+\\.js$`).test(entry.file))?.file;
// A promise a test settles from outside, to hold a request until its phase is read.
const gate = () => {
  let open = () => {};
  const promise = new Promise<void>(resolve => (open = resolve));
  return {promise, resolve: open};
};

for (const [width, height] of [
  [1280, 900],
  [390, 844]
]) {
  for (const route of routes) {
    test(`${route} keeps its shape from skeleton to content at ${width}px`, async ({page}) => {
      const {api, capabilities} = await mockBackend(page);
      const runtime = await api.runtime();
      const ready = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
      if (route === 'logs') {
        const records = Array.from({length: 40}, (_, i) => ({
          id: `log:${i + 1}`,
          event: 'log',
          data: {ts: runtime.observed_at, level: ['info', 'warn', 'error', 'debug'][i % 4], target: 'honk::dns', message: `message ${i + 1}`, fields: null}
        }));
        await page.route('**/api/v1/logs?*', stream => fulfillStream(stream, [{id: 'ready:0', event: 'stream.ready', data: ready}, ...records]));
      }
      if (route === 'events') {
        capabilities.resources.events.available = true;
        capabilities.resources.events.kinds = ['stream.ready', 'runtime.updated'];
        const records = Array.from({length: 20}, (_, i) => ({id: `events:${i + 2}`, event: 'runtime.updated', data: {...ready, href: '/api/v1/runtime'}}));
        await page.route('**/api/v1/events', stream => fulfillStream(stream, [{id: 'events:1', event: 'stream.ready', data: ready}, ...records]));
      }
      await page.setViewportSize({width, height});
      const gates = {startup: gate(), chunk: gate(), reads: gate()};
      let holdReads = false;
      const reads: string[] = [];
      const manifest: Array<{file: string}> = Object.values(await (await page.request.get('/.vite/manifest.json')).json());
      const chunk = chunkOf(manifest, route);
      // The dashboard is the frame's own code and has no chunk of its own to hold.
      expect(chunk ?? route === 'activity', `no code chunk named for ${route}`).toBeTruthy();
      await page.route('**/api/v1/capabilities', async hold => {
        await gates.startup.promise;
        await hold.fallback();
      });
      if (chunk)
        await page.route(`**/${chunk}`, async hold => {
          await gates.chunk.promise;
          await hold.fallback();
        });
      await page.route('**/api/v1/**', async hold => {
        if (holdReads && !hold.request().url().endsWith('/capabilities')) {
          reads.push(hold.request().url());
          await gates.reads.promise;
        }
        await hold.fallback();
      });

      const shots = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_SKELETON_SHOTS;
      const shoot = async (state: string) => shots && (await page.screenshot({path: `${shots}/${route}-${state}-${width}.png`}));
      await watchFrames(page);
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content .rp-page-skeleton').first()).toBeAttached();
      await expectSeen(page, 'startup');
      const startup = await settled(page);
      await shoot('startup');

      gates.startup.resolve();
      let held: Block[] = [];
      if (chunk) {
        await expect(page.locator('nav.rp-side')).not.toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('.rp-content .rp-head h1')).toBeAttached();
        await expectSeen(page, 'code loading');
        held = await settled(page);
        await shoot('skeleton');
      }

      holdReads = true;
      const arrived = chunk && page.waitForResponse(response => response.url().endsWith(chunk));
      gates.chunk.resolve();
      await arrived;
      // The page's first reads leave once it has mounted; a page that makes none has nothing to wait for.
      await expect
        .poll(() => reads.length, {timeout: 1500})
        .toBeGreaterThan(0)
        .catch(() => undefined);
      if (reads.length) await expectSeen(page, 'reads pending', false);
      const reading = await settled(page);
      await shoot('data');
      // Once it has shown, the Skeleton stays through every change of phase until the content replaces it.
      expect.soft(await framesSoFar(page), 'frames, H hidden, V visible, N none').toMatch(/^[HN]*V+N*$/);

      gates.reads.resolve();
      await expect(page.locator('.rp-content :is(.rp-page-skeleton, .rp-skeleton-group, .rp-skeleton-body, .rp-skeleton, .rp-table-skeleton)')).toHaveCount(0);
      const content = await settled(page);
      await shoot('content');

      expectSameShape('startup', startup, content);
      if (chunk) expectSameShape('code loading', held, content);
      expectSameShape('reads pending', reading, content);
    });
  }
}

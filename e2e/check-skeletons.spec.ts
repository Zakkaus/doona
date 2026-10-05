import {expect, fulfillStream, isLive, mockBackend, test} from './fixtures';

// Each box's top and height, for comparing a first-load Skeleton with the content that replaces it.
const boxes = (page: import('@playwright/test').Page, selector: string) =>
  page.evaluate(
    s =>
      [...document.querySelectorAll(s)]
        .map(element => element.getBoundingClientRect())
        .filter(box => box.height > 0)
        .map(box => ({top: box.top + scrollY, height: box.height})),
    selector
  );

test('the global settings draw their fields as a skeleton with one status until the config is read', async ({page}) => {
  test.skip(isLive, 'holds the mock backend');
  await mockBackend(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route(/\/api\/v1\/config(\?.*)?$/, async route => {
    await held;
    await route.fallback();
  });
  await page.setViewportSize({width: 1440, height: 920});
  await page.goto('/#/config?tab=global');
  const panel = page.locator('.rp-tabpanel[data-shown]');
  await expect(panel.locator('.rp-skeleton-group')).toBeVisible();
  await expect(panel.getByRole('status')).toHaveCount(1);
  await expect(panel.locator('input, button, [role=combobox]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const waiting = await boxes(page, '.rp-tabpanel[data-shown] .rp-card');
  expect(waiting.length).toBeGreaterThan(0);
  release();
  await expect(panel.locator('.rp-skeleton-group')).toHaveCount(0);
  await expect(panel.locator('input').first()).toBeVisible();
  const loaded = await boxes(page, '.rp-tabpanel[data-shown] .rp-card');
  expect(loaded).toHaveLength(waiting.length);
  waiting.forEach((box, i) => {
    expect(Math.abs(loaded[i].top - box.top), `card ${i} top`).toBeLessThanOrEqual(1);
    expect(Math.abs(loaded[i].height - box.height), `card ${i} height`).toBeLessThanOrEqual(1);
  });
});

test('the logs chart hold shows after the delay, reads no status of its own and keeps the loaded height', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  // What the cover's visibility is when it is first seen, before any timer has run.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const cover = document.querySelector('.rp-skeleton-cover');
      if (cover && !document.documentElement.dataset.cover) document.documentElement.dataset.cover = getComputedStyle(cover).visibility;
    }).observe(document, {childList: true, subtree: true});
  });
  let release = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route('**/api/v1/logs?*', async route => {
    await held;
    await fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data: {instance_id: runtime.instance_id, observed_at: runtime.observed_at}},
      {id: 'log:1', event: 'log', data: {ts: runtime.observed_at, level: 'info', target: 'dns', message: 'DNS answered', fields: null}}
    ]);
  });
  await page.goto('/#/logs');
  const cover = page.locator('.rp-chart-hold .rp-skeleton-cover').first();
  await expect(cover).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-cover', 'hidden');
  await expect(page.locator('.rp-chart-page').getByRole('status')).toHaveCount(0);
  await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(1);
  const before = await boxes(page, '.rp-chart-page');
  release();
  await expect(page.locator('.rp-chart-hold')).toHaveCount(0);
  const after = await boxes(page, '.rp-chart-page');
  expect(after).toHaveLength(1);
  expect(Math.abs(after[0].height - before[0].height)).toBeLessThanOrEqual(1);
});

test('a group card waiting for its details draws a skeleton with one status, not the old placeholders', async ({page}) => {
  test.skip(isLive, 'holds the mock backend');
  await mockBackend(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route(/\/api\/v1\/groups\/[^/?]+(\?.*)?$/, async route => {
    await held;
    await route.fallback();
  });
  await page.setViewportSize({width: 1440, height: 920});
  await page.goto('/#/policies');
  // The list stays behind its page Skeleton for three seconds at most, then shows its cards' own placeholders.
  const group = page.locator('.rp-policy-list section.rp-card .rp-skeleton-group').first();
  await expect(group).toBeVisible({timeout: 8000});
  await expect(page.locator('.rp-wait-line')).toHaveCount(0);
  await expect(group.getByRole('status')).toHaveCount(1);
  await expect(page.locator('.rp-policy-list section.rp-card .rp-form[role=status]')).toHaveCount(0);
  const name = await group.evaluate(element => element.closest('section')!.getAttribute('aria-label')!);
  const card = page.getByRole('region', {name, exact: true});
  release();
  await expect(card.locator('.rp-skeleton-group')).toHaveCount(0);
  // The loaded card's height follows the group's capabilities, so only its parts' own heights are held (Policies.tsx).
  await expect(card.locator('.rp-node, [role=row]').first()).toBeVisible();
});

test('the provider scope line draws a skeleton with one status until the providers are read', async ({page}) => {
  test.skip(isLive, 'holds the mock backend');
  const backend = await mockBackend(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => (release = resolve));
  backend.handlers['GET providers'] = async () => {
    await held;
    return backend.api.providers();
  };
  await page.goto('/#/nodes?tab=list');
  const scope = page.locator('.rp-tabpanel[data-shown] .rp-skeleton-group:has(.rp-skeleton-bar.caption)');
  await expect(scope).toBeVisible();
  await expect(scope.getByRole('status')).toHaveCount(1);
  release();
  await expect(scope).toHaveCount(0);
});

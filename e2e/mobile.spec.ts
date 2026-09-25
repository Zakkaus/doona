import type {Page} from '@playwright/test';
import {hubs} from '../src/shell/routes';
import {expect, mockBackend, routes, test} from './fixtures';

test.use({viewport: {width: 390, height: 844}});

const bar = (page: Page) => page.getByRole('navigation', {name: 'Sections'});

test('each hub opens its first page, then the page last seen in it', async ({page}) => {
  await page.goto('/#/activity');
  await expect(bar(page).getByRole('link', {name: 'Overview'})).toHaveAttribute('aria-current', 'page');
  await bar(page).getByRole('link', {name: 'Traffic'}).click();
  await expect(page).toHaveURL(/#\/connections$/);
  await page.locator('.rp-hubnav').getByText('Logs', {exact: true}).click();
  await expect(page).toHaveURL(/#\/logs$/);
  await expect(bar(page).getByRole('link', {name: 'Traffic'})).toHaveAttribute('aria-current', 'page');
  await bar(page).getByRole('link', {name: 'Routing'}).click();
  await expect(page).toHaveURL(/#\/policies$/);
  await expect(bar(page).locator('[aria-current]')).toHaveCount(1);
  await bar(page).getByRole('link', {name: 'Traffic'}).click();
  await expect(page).toHaveURL(/#\/logs$/);
  // The memory lasts the session, through a reload.
  await page.reload();
  await bar(page).getByRole('link', {name: 'Overview'}).click();
  await expect(page).toHaveURL(/#\/activity$/);
  for (const box of await bar(page)
    .getByRole('link')
    .evaluateAll(links => links.map(link => link.getBoundingClientRect())))
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
});

test('every page is at most two taps away: its hub, then its page', async ({page}) => {
  for (const [index, hub] of hubs.entries()) {
    for (const route of hub.pages) {
      await page.goto(`/#/${index ? 'activity' : 'settings'}`);
      await page.evaluate(() => sessionStorage.clear());
      await bar(page).getByRole('link').nth(index).click();
      if (!page.url().endsWith(`#/${route}`)) {
        const label = await page.locator(`.rp-side .rp-nav[href="#/${route}"]`).textContent();
        await page.locator('.rp-hubnav').getByText(label!, {exact: true}).click();
      }
      await expect(page).toHaveURL(new RegExp(`#/${route}$`));
      await expect(page.locator('.rp-hubnav [data-selected]')).toHaveText((await page.locator(`.rp-side .rp-nav[href="#/${route}"]`).textContent())!);
    }
  }
});

test('the bottom bar leaves the end of the page uncovered', async ({page}) => {
  await page.goto('/#/overview');
  await expect(page.locator('.rp-content > *').first()).toBeVisible();
  await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
  // Long enough to scroll, so the bar would sit over the end of the page without the reserved space.
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const {content, top} = await page.evaluate(() => ({
    content: document.querySelector('.rp-content')!.getBoundingClientRect().bottom,
    top: document.querySelector('.rp-hubbar')!.getBoundingClientRect().top
  }));
  expect(content).toBeLessThanOrEqual(top);
});

test.describe('desktop', () => {
  test.use({viewport: {width: 1280, height: 900}});
  test('groups the side navigation into the four hubs and hides the phone navigation', async ({page}) => {
    await page.goto('/#/overview');
    const sections = page.locator('.rp-side [data-group]');
    await expect(sections).toHaveCount(4);
    expect(await sections.locator('.rp-group').allTextContents()).toEqual(['Overview', 'Traffic', 'Routing', 'Settings']);
    for (const [index, hub] of hubs.entries())
      expect(
        await sections
          .nth(index)
          .locator('.rp-nav')
          .evaluateAll(links => links.map(link => link.getAttribute('href')))
      ).toEqual(hub.pages.map(route => `#/${route}`));
    await expect(page.locator('.rp-hubbar')).toBeHidden();
    await expect(page.locator('.rp-hubnav')).toBeHidden();
  });
});

for (const [scheme, palette] of [
  ['light', 'rose-pine/main'],
  ['dark', 'rose-pine/main'],
  ['dark', 'glass/glass']
]) {
  test.describe(`${scheme} ${palette}`, () => {
    test.use({storage: {'doona-scheme': scheme, 'doona-palette': palette}});
    test('tabs contain wrapped labels and their selection marker at phone width', async ({page}) => {
      for (const route of ['rules', 'config?tab=setup']) {
        await page.goto('/#/' + route);
        const bar = page.locator('.rp-tabbar').first();
        await expect(bar.getByRole('tab').first()).toBeVisible();
        const bounds = await bar.getByRole('tab').evaluateAll(tabs =>
          tabs.map(tab => {
            const box = tab.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(tab);
            const text = range.getBoundingClientRect();
            return {top: text.top - box.top, bottom: box.bottom - text.bottom};
          })
        );
        for (const boundsOfTab of bounds) {
          expect(boundsOfTab.top).toBeGreaterThanOrEqual(0);
          expect(boundsOfTab.bottom).toBeGreaterThanOrEqual(0);
        }
        const selected = await bar.locator('[data-selected]').boundingBox();
        const marker = await bar.locator('.rp-slider').boundingBox();
        expect(marker!.height).toBeGreaterThanOrEqual(selected!.height - 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      }
    });

    test('diagnostic prose wraps and empty tables stay centered while scrolled', async ({page}) => {
      const backend = await mockBackend(page);
      const config = await backend.api.config();
      const message = 'duplicate endpoint identity; retaining the first usable entry';
      config.diagnostics = [
        {level: 'warning', message, source_id: config.sources[0].id, line: null, column: null, span: null, code: 'duplicate-subscription-entry'}
      ];
      backend.handlers['GET config'] = async () => config;
      const cache = await backend.api.dnsCache();
      backend.handlers['GET dns/cache'] = async () => ({...cache, total: 0, entries: []});
      await page.goto('/#/config?tab=source');
      const light = page.locator('.rp-light', {hasText: message}).first();
      await expect(light).toBeVisible();
      const prose = await light.evaluate(el => {
        const text = el.querySelector('span')!;
        const range = document.createRange();
        range.selectNodeContents(text);
        const box = el.closest('.rp-card')!.getBoundingClientRect();
        return {lines: range.getClientRects().length, contained: [...range.getClientRects()].every(rect => rect.left >= box.left && rect.right <= box.right)};
      });
      expect(prose.lines).toBeGreaterThan(1);
      expect(prose.contained).toBe(true);
      await page.goto('/#/dns?tab=cache');
      const table = page.locator('.rp-table');
      const empty = table.getByText('No cache entries', {exact: true});
      await expect(empty).toBeVisible();
      for (const scroll of [false, true]) {
        if (scroll)
          await table.evaluate(el => {
            el.scrollLeft = el.scrollWidth;
          });
        const offset = await empty.evaluate(el => {
          const viewport = el.closest('.rp-table')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          return Math.abs((text.left + text.right) / 2 - (viewport.left + viewport.right) / 2);
        });
        expect(offset).toBeLessThanOrEqual(2);
      }
    });
  });
}

// A common phone width: every hub's pages fit side by side in every language.
test.describe('360px', () => {
  test.use({viewport: {width: 360, height: 780}});
  for (const lang of ['en', 'zh-TW', 'zh-CN'])
    test.describe(lang, () => {
      test.use({storage: {'doona-lang': lang}});
      test('every hub shows all its pages above the content without scrolling sideways', async ({page}) => {
        for (const hub of hubs) {
          await page.goto(`/#/${hub.pages[0]}`);
          const tabs = page.locator('.rp-hubnav .rp-btn');
          await expect(tabs).toHaveCount(hub.pages.length);
          const fit = await page.locator('.rp-hubnav').evaluate(nav => {
            const box = nav.getBoundingClientRect();
            const seg = nav.querySelector('.rp-seg')!;
            return seg.scrollWidth <= seg.clientWidth && [...nav.querySelectorAll('.rp-btn')].every(tab => tab.getBoundingClientRect().right <= box.right + 1);
          });
          expect(fit, hub.id).toBe(true);
        }
      });
    });
});

// The narrowest supported phone: every page fits without scrolling sideways.
test.describe('320px', () => {
  test.use({viewport: {width: 320, height: 640}});
  for (const route of [...routes, 'flows']) {
    test(`no horizontal overflow on ${route}`, async ({page}) => {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content > *').first()).toBeVisible();
      // WebKit's per-page load check: the page is the current one and has finished loading.
      if (route !== 'flows') await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});

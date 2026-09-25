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
      await expect(page.locator('.rp-hubnav [aria-current="page"]')).toHaveText((await page.locator(`.rp-side .rp-nav[href="#/${route}"]`).textContent())!);
    }
  }
});

test('the open hub lists its pages as links, the current one marked', async ({page}) => {
  await page.goto('/#/dns');
  const pages = page.getByRole('navigation', {name: 'Traffic'});
  await expect(pages.getByRole('link')).toHaveText(['Connections', 'DNS', 'Logs', 'Events']);
  await expect(pages.getByRole('radio')).toHaveCount(0);
  await expect(pages.locator('[aria-current]')).toHaveCount(1);
  await expect(pages.getByRole('link', {name: 'DNS'})).toHaveAttribute('aria-current', 'page');
  await pages.getByRole('link', {name: 'Events'}).click();
  await expect(page).toHaveURL(/#\/events$/);
  await expect(pages.getByRole('link', {name: 'Events'})).toHaveAttribute('aria-current', 'page');
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

test('language, theme, palette and wordmark are one overflow menu away', async ({page}) => {
  await page.goto('/#/overview');
  const top = page.locator('.rp-top');
  await expect(top.getByRole('button', {name: 'Search'})).toBeVisible();
  await expect(top.getByRole('button', {name: 'Refresh'})).toBeVisible();
  await expect(top.getByRole('button', {name: 'Reload honk'})).toBeVisible();
  for (const name of ['Language', 'Palette']) await expect(top.getByRole('button', {name, exact: true})).toBeHidden();
  const more = top.getByRole('button', {name: 'More options'});
  const box = (await more.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan((await top.boundingBox())!.width - 24);
  const pick = async (item: string) => {
    await more.click();
    // A palette's name continues with its variants, so the name only has to start with the item.
    await page.getByRole('menuitemradio', {name: new RegExp(`^${item}`)}).click();
  };
  await pick('Dark');
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await pick('Nord');
  await expect(page.locator('html')).toHaveAttribute('data-family', 'nord');
  await pick('Plain');
  await expect(page.locator('html')).toHaveAttribute('data-wordmark', 'plain');
  await pick('简体中文');
  await expect(top.getByRole('button', {name: '更多选项'})).toBeVisible();
});

for (const width of [320, 360])
  for (const lang of ['en', 'zh-TW', 'zh-CN'])
    test.describe(`${width}px ${lang} top bar`, () => {
      test.use({viewport: {width, height: 700}, storage: {'doona-lang': lang}});
      test('fits on one row without truncating', async ({page}) => {
        await page.goto('/#/overview');
        await expect(page.locator('.rp-top .rp-narrow-only button')).toBeVisible();
        const layout = await page.locator('.rp-top').evaluate(top => {
          const bounds = top.getBoundingClientRect();
          const visible = [...top.querySelectorAll<HTMLElement>('button, .rp-brand-text > span')].filter(el => el.getClientRects().length);
          return {
            height: bounds.height,
            inside: visible.every(el => {
              const box = el.getBoundingClientRect();
              return box.left >= bounds.left && box.right <= bounds.right && el.scrollWidth <= el.clientWidth + 1;
            })
          };
        });
        expect(layout.height).toBe(64);
        expect(layout.inside).toBe(true);
      });
    });

// The wordmark hides below the width the bar needs with it; every width up to the version's return must fit, with the
// short name and with the long one a honk leaves for the session.
for (const lang of ['en', 'zh-TW', 'zh-CN'])
  test.describe(`${lang} top bar from 320px to 400px`, () => {
    test.use({viewport: {width: 400, height: 700}, storage: {'doona-lang': lang}});
    test('never pushes the page sideways', async ({page}) => {
      await page.goto('/#/overview');
      await expect(page.locator('.rp-top .rp-narrow-only button')).toBeVisible();
      const sweep = async (name: string) => {
        for (let width = 320; width <= 400; width += 4) {
          await page.setViewportSize({width, height: 700});
          const overflow = await page.evaluate(() => {
            const top = document.querySelector<HTMLElement>('.rp-top')!;
            const right = top.getBoundingClientRect().right;
            const visible = [...top.querySelectorAll<HTMLElement>('button, .rp-brand-text > span')].filter(el => el.getClientRects().length);
            return Math.max(
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
              ...visible.map(el => el.getBoundingClientRect().right - right)
            );
          });
          expect(overflow, `${name} at ${width}px`).toBeLessThanOrEqual(0);
        }
      };
      await sweep('doona');
      await page.locator('.rp-brand').click();
      const duck = page.getByRole('dialog').locator('.rp-about-duck');
      for (let i = 0; i < 5; i++) await duck.click();
      await page.keyboard.press('Escape');
      await expect(page.locator('.rp-brand .rp-brand-text > span').first()).toHaveText('doooooona');
      await sweep('doooooona');
    });
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
    // Page actions stay separate buttons.
    const content = page.locator('.rp-content');
    for (const name of ['Export state JSON', 'Reload', 'Suspend']) await expect(content.getByRole('button', {name, exact: true})).toBeVisible();
    await expect(content.getByRole('button', {name: 'More actions'})).toBeHidden();
    // The top bar keeps its separate language, palette and theme controls.
    const top = page.locator('.rp-top');
    for (const name of ['Language', 'Palette']) await expect(top.getByRole('button', {name, exact: true})).toBeVisible();
    await expect(top.getByRole('button', {name: /^Theme: /})).toBeVisible();
    await expect(top.locator('.rp-vrule')).toBeVisible();
    await expect(top.getByRole('button', {name: 'More options'})).toBeHidden();
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

// A common phone width: every page's controls lie on screen or inside something that scrolls sideways, and actions a
// toolbar collapses on a phone stay one menu away.
test.describe('360px actions', () => {
  test.use({viewport: {width: 360, height: 740}});
  for (const route of routes)
    test(`every control on ${route} is reachable`, async ({page}) => {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content > *').first()).toBeVisible();
      await expect(page.locator(`.rp-hubnav [href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
      const stranded = await page.locator('.rp-content').evaluate(content =>
        [...content.querySelectorAll<HTMLElement>('button, a[href]')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
          .filter(el => {
            for (let up = el.parentElement; up && up !== content; up = up.parentElement)
              if (/auto|scroll/.test(getComputedStyle(up).overflowX) && up.scrollWidth > up.clientWidth) return false;
            const box = el.getBoundingClientRect();
            return box.left < 0 || box.right > innerWidth;
          })
          .map(el => el.getAttribute('aria-label') ?? el.textContent)
      );
      expect(stranded).toEqual([]);
    });

  test('moving between hubs and their pages does not stack history', async ({page}) => {
    // A same-origin page before the app stands for wherever the user came from.
    await page.goto('/logo.svg');
    await page.goto('/#/overview');
    await expect(bar(page).getByRole('link', {name: 'Overview'})).toHaveAttribute('aria-current', 'page');
    const entries = await page.evaluate(() => history.length);
    const pages = page.locator('.rp-hubnav');
    for (const [where, name] of [
      [bar(page), 'Traffic'],
      [pages, 'DNS'],
      [pages, 'Logs'],
      [bar(page), 'Traffic'],
      [bar(page), 'Routing'],
      [pages, 'Nodes'],
      [bar(page), 'Settings'],
      [pages, 'Configuration'],
      [bar(page), 'Overview'],
      [pages, 'Activity']
    ] as const)
      await where.getByRole('link', {name, exact: true}).click();
    await expect(page).toHaveURL(/#\/activity$/);
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await page.goBack();
    await expect(page).toHaveURL(/\/logo\.svg$/);
  });

  test('toolbar actions past the first move into a menu', async ({page}) => {
    for (const [route, visible, collapsed] of [
      ['dns?tab=log', 'Export CSV', ['Refresh', 'Load older records']],
      ['logs', 'Clear', ['Export']],
      ['overview', 'Export state JSON', ['Reload', 'Suspend']]
    ] as const) {
      await page.goto(`/#/${route}`);
      const content = page.locator('.rp-content');
      // The search fields carry a Clear button of their own.
      const action = (name: string) => content.locator('button.rp-btn').filter({hasText: new RegExp(`^${name}$`)});
      await expect(action(visible)).toBeVisible();
      for (const name of collapsed) await expect(action(name)).toBeHidden();
      await content.getByRole('button', {name: 'More actions'}).click();
      await expect(page.getByRole('menu', {name: 'More actions'}).getByRole('menuitem')).toHaveText([...collapsed]);
      await page.keyboard.press('Escape');
    }
    await page.goto('/#/logs');
    await expect(page.locator('.rp-table [role=row]').nth(1)).toBeVisible();
    await page.locator('.rp-content').getByRole('button', {name: 'More actions'}).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', {name: 'Export'}).click();
    expect((await download).suggestedFilename()).toMatch(/\.(json|jsonl|txt|log|csv)$/);
  });
});

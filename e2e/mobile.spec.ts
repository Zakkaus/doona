import type {Page} from '@playwright/test';
import {hubs} from '../src/shell/routes';
import {expect, mockBackend, routes, test} from './fixtures';

test.use({viewport: {width: 390, height: 844}});

const bar = (page: Page) => page.getByRole('navigation', {name: 'Sections'});

test('each hub opens its first page, then the page last seen in it', async ({page}) => {
  await page.goto('/#/activity');
  await expect(bar(page).getByRole('link', {name: 'Activity'})).toHaveAttribute('aria-current', 'page');
  await bar(page).getByRole('link', {name: 'Monitor'}).click();
  await expect(page).toHaveURL(/#\/connections$/);
  await page.locator('.rp-hubnav').getByText('Logs', {exact: true}).click();
  await expect(page).toHaveURL(/#\/logs$/);
  await expect(bar(page).getByRole('link', {name: 'Monitor'})).toHaveAttribute('aria-current', 'page');
  await bar(page).getByRole('link', {name: 'Routing'}).click();
  await expect(page).toHaveURL(/#\/policies$/);
  await expect(bar(page).locator('[aria-current]')).toHaveCount(1);
  await bar(page).getByRole('link', {name: 'Monitor'}).click();
  await expect(page).toHaveURL(/#\/logs$/);
  // The memory lasts the session, through a reload.
  await page.reload();
  await bar(page).getByRole('link', {name: 'Activity'}).click();
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
  const pages = page.getByRole('navigation', {name: 'Monitor'});
  await expect(pages.getByRole('link')).toHaveText(['Connections', 'Routing log', 'DNS', 'Logs', 'Events']);
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

test('language, theme, palette and wordmark are each two taps away in the overflow menu', async ({page}) => {
  await page.goto('/#/overview');
  const top = page.locator('.rp-top');
  await expect(top.getByRole('button', {name: 'Search'})).toBeVisible();
  await expect(top.getByRole('button', {name: 'Refresh'})).toBeVisible();
  // Reload lives in the overflow menu on a phone, beside the backend entry.
  await expect(top.getByRole('button', {name: 'Reload honk'})).toBeHidden();
  for (const name of ['Language', 'Palette']) await expect(top.getByRole('button', {name, exact: true})).toBeHidden();
  const more = top.getByRole('button', {name: 'More options'});
  const box = (await more.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan((await top.boundingBox())!.width - 24);
  // The menu is four short rows, each naming its current value, then Reload honk and the Backend row; a row opens its
  // choices in the same popover.
  await more.click();
  await expect(page.getByRole('menuitem')).toHaveText(['LanguageEnglish', 'ThemeLight', 'PaletteRosé Pine Moon', 'WordmarkGradient', 'Reload honk', 'Backend']);
  // Reload from the menu still asks first.
  await page.getByRole('menuitem', {name: 'Reload honk'}).click();
  const confirm = page.getByRole('dialog', {name: 'Reload honk?'});
  await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(confirm).toHaveCount(0);
  const pick = async (row: string, item: string) => {
    await more.click();
    await page.getByRole('menuitem', {name: row}).click();
    // A palette's name continues with its variants, so the name only has to start with the item.
    const choice = page.getByRole('menuitemradio', {name: new RegExp(`^${item}`)});
    const {x, width} = (await choice.boundingBox())!;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(390);
    await choice.click();
    await expect(page.getByRole('menu')).toHaveCount(0);
  };
  await pick('Theme', 'Dark');
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await pick('Palette', 'Nord');
  await expect(page.locator('html')).toHaveAttribute('data-family', 'nord');
  await pick('Wordmark', 'Plain');
  await expect(page.locator('html')).toHaveAttribute('data-wordmark', 'plain');
  await pick('Language', '简体中文');
  await expect(top.getByRole('button', {name: '更多选项'})).toBeVisible();
});

test('the overflow menu draws every row icon at the same size, whatever the scheme', async ({page}) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme: scheme});
    await page.goto('/#/overview');
    await page.locator('.rp-top').getByRole('button', {name: 'More options'}).click();
    const icons = page.locator('.rp-subitem .ic > *');
    await expect(icons).toHaveCount(6);
    // Read until every icon settles: one read right after the menu opened once caught an icon 10px wide in CI.
    await expect
      .poll(() => icons.evaluateAll(els => els.map(el => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])))
      .toEqual(Array(6).fill([16, 16]));
    await page.keyboard.press('Escape');
  }
});

test('the overflow menu opens and leaves a submenu by keyboard', async ({page}) => {
  await page.goto('/#/overview');
  await page.locator('.rp-top').getByRole('button', {name: 'More options'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', {name: 'Language'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu', {name: 'Theme'})).toBeVisible();
  await expect(page.getByRole('menuitemradio', {name: 'Light'})).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menuitem', {name: 'Theme'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', {name: 'Palette'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', {name: 'Palette'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  // The submenu moves focus to its current choice a frame after it opens; a key sent before that has nowhere to go.
  await expect(page.getByRole('menuitemradio', {name: 'Gradient'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-wordmark', 'plain');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test.describe('between phone and desktop widths', () => {
  test.use({viewport: {width: 800, height: 700}});
  test('a submenu opens beside its row and stays on screen', async ({page}) => {
    await page.goto('/#/overview');
    await page.locator('.rp-top').getByRole('button', {name: 'More options'}).click();
    await page.getByRole('menuitem', {name: 'Palette'}).click();
    await expect(page.getByRole('menu')).toHaveCount(2);
    const {x, width} = (await page.getByRole('menu', {name: 'Palette'}).boundingBox())!;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(800);
    await page.getByRole('menuitemradio', {name: /^Nord/}).click();
    await expect(page.locator('html')).toHaveAttribute('data-family', 'nord');
  });
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
  test('moving between pages in the side navigation adds history entries that Back retraces', async ({page}) => {
    await page.goto('/logo.svg');
    await page.goto('/#/overview');
    const nav = (route: string) => page.locator(`.rp-side .rp-nav[href="#/${route}"]`);
    for (const route of ['dns', 'rules', 'policies']) {
      await nav(route).click();
      await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    }
    for (const back of [/#\/rules$/, /#\/dns$/, /#\/overview$/, /\/logo\.svg$/]) {
      await page.goBack();
      await expect(page).toHaveURL(back);
    }
  });
  test('groups the side navigation into the four hubs and hides the phone navigation', async ({page}) => {
    await page.goto('/#/overview');
    const sections = page.locator('.rp-side [data-group]');
    await expect(sections).toHaveCount(4);
    expect(await sections.locator('.rp-group').allTextContents()).toEqual(['Activity', 'Monitor', 'Routing', 'Settings']);
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

// A common phone width: every hub's pages are reachable in every language. A set wider than the phone scrolls inside
// its strip, never the page, and the current page is scrolled into view.
test.describe('360px', () => {
  test.use({viewport: {width: 360, height: 780}});
  for (const lang of ['en', 'zh-TW', 'zh-CN'])
    test.describe(lang, () => {
      test.use({storage: {'doona-lang': lang}});
      test('every hub reaches all its pages above the content without scrolling the page sideways', async ({page}) => {
        for (const hub of hubs) {
          for (const route of hub.pages) {
            await page.goto(`/#/${route}`);
            await expect(page.locator('.rp-hubnav .rp-btn')).toHaveCount(hub.pages.length);
            const strip = () =>
              page.locator('.rp-hubnav').evaluate(nav => {
                const box = nav.getBoundingClientRect();
                const seg = nav.querySelector<HTMLElement>('.rp-seg')!;
                const current = nav.querySelector('[aria-current="page"]')!.getBoundingClientRect();
                return {
                  visible: current.left >= box.left - 1 && current.right <= box.right + 1,
                  contained: seg.scrollWidth <= seg.clientWidth || getComputedStyle(seg).overflowX === 'auto',
                  pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth
                };
              });
            await expect.poll(async () => (await strip()).visible, {message: `${hub.id} ${route}`}).toBe(true);
            expect(await strip(), `${hub.id} ${route}`).toMatchObject({contained: true, pageScroll: 0});
          }
        }
      });
    });
});

// The narrowest supported phone: every page fits without scrolling sideways.
test.describe('320px', () => {
  test.use({viewport: {width: 320, height: 640}});
  for (const route of routes) {
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

  test('moving between hubs and their pages adds history entries that Back retraces', async ({page}) => {
    // A same-origin page before the app stands for wherever the user came from.
    await page.goto('/logo.svg');
    await page.goto('/#/overview');
    await expect(bar(page).getByRole('link', {name: 'Activity'})).toHaveAttribute('aria-current', 'page');
    const pages = page.locator('.rp-hubnav');
    await bar(page).getByRole('link', {name: 'Monitor', exact: true}).click();
    await expect(page).toHaveURL(/#\/connections$/);
    await pages.getByRole('link', {name: 'DNS', exact: true}).click();
    await expect(page).toHaveURL(/#\/dns$/);
    await page.getByRole('tab', {name: 'Cache', exact: true}).click();
    await expect(page).toHaveURL(/#\/dns\?tab=cache$/);
    await bar(page).getByRole('link', {name: 'Routing', exact: true}).click();
    await expect(page).toHaveURL(/#\/policies$/);
    // The page already open adds no entry.
    const entries = await page.evaluate(() => history.length);
    await pages.getByRole('link', {name: 'Policies', exact: true}).click();
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await pages.getByRole('link', {name: 'Rules', exact: true}).click();
    await expect(page).toHaveURL(/#\/rules$/);
    for (const back of [/#\/policies$/, /#\/dns\?tab=cache$/, /#\/dns$/, /#\/connections$/, /#\/overview$/, /\/logo\.svg$/]) {
      await page.goBack();
      await expect(page).toHaveURL(back);
    }
  });

  test('toolbar actions past the first move into a menu', async ({page}) => {
    for (const [route, visible, collapsed] of [
      ['dns?tab=log', 'Refresh', ['Export CSV', 'Add rule', 'DNS rules', 'Recording settings', 'Load older records']],
      ['logs', 'Clear', ['Export', 'Recording settings']],
      ['overview', 'Export state JSON', ['Reload', 'Suspend']]
    ] as const) {
      await page.goto(`/#/${route}`);
      const content = page.locator('.rp-content');
      // The search fields carry a Clear button of their own, and the DNS log repeats Load older records at its end.
      const action = (name: string) => content.locator('button.rp-btn:not(.rp-narrow-only button)').filter({hasText: new RegExp(`^${name}$`)});
      await expect(action(visible)).toBeVisible();
      for (const name of collapsed) await expect(action(name)).toBeHidden();
      await content.getByRole('button', {name: 'More actions'}).click();
      // A disabled item also says why under its label, so only the labels are compared.
      await expect(page.getByRole('menu', {name: 'More actions'}).getByRole('menuitem').locator('[slot="label"]')).toHaveText([...collapsed]);
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

// Key-value facts split into two columns on a phone as long as each keeps 128px, and stack only on a card too
// narrow for that; wider screens keep the 176px columns.
for (const [width, columns] of [
  [360, 2],
  [390, 2],
  [1280, 1]
] as const)
  test.describe(`${width}px facts`, () => {
    test.use({viewport: {width, height: 800}});
    test(`the overview traffic counters use ${columns} columns`, async ({page}) => {
      await page.goto('/#/overview');
      const kv = page.locator('.rp-kv:not(.inline)').nth(1);
      await expect(kv.locator('.v').first()).toBeVisible();
      const tops = await kv.locator(':scope > div').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().top));
      expect(tops.filter(top => top === tops[0])).toHaveLength(columns);
    });
  });

// The installed iOS app runs in WebKit: a tap into a read-only source must not look like an edit, and says why.
test.describe('on a touch screen', () => {
  test.use({hasTouch: true, isMobile: true});
  test('a tap into a read-only source draws no caret or active line and shows the read-only notice', async ({page}) => {
    await page.goto('/#/config?tab=source&source=src-generated');
    const editor = page.locator('.cm-content[aria-label="/var/lib/honk/generated/skylink.dae"]');
    await expect(editor).toContainText('skylink');
    await editor.tap();
    await expect(page.locator('.rp-toast.info', {hasText: 'This file is read-only'})).toBeVisible();
    await expect(page.locator('.cm-cursorLayer')).toHaveCount(0);
    await expect(page.locator('.cm-activeLine')).toHaveCount(0);
  });
});

test('quick setup keeps Apply disabled without a line saying so', async ({page}) => {
  await page.goto('/#/config?tab=setup&source=src-sub-c');
  const apply = page.getByRole('button', {name: 'Apply', exact: true});
  await expect(apply).toBeDisabled();
  await expect(page.getByText('No changes to apply', {exact: true})).toHaveCount(0);
  await page.getByLabel('Subscription URL', {exact: true}).first().fill('https://example.org/changed');
  await expect(apply).toBeEnabled();
});

// Each case gives the reason under the disabled action, in view on a phone and named as the button's description.
async function expectReason(page: Page, button: ReturnType<Page['getByRole']>, reason: string) {
  await expect(button).toBeDisabled();
  const line = page.getByText(reason, {exact: true});
  await expect(line).toBeVisible();
  await expect(button).toHaveAccessibleDescription(reason);
  const box = (await line.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  return line;
}

test('the DNS cache says in view that the backend cannot clear or delete entries', async ({page}) => {
  const backend = await mockBackend(page);
  backend.capabilities.resources.dns_cache.flush = false;
  backend.capabilities.resources.dns_cache.delete_entry = false;
  await page.goto('/#/dns?tab=cache');
  await expectReason(page, page.getByRole('button', {name: 'Clear all cache', exact: true}), 'This backend does not support clearing the cache');
  // The rows' Delete buttons share one line above the table, in view without scrolling through it.
  const grid = page.getByRole('grid', {name: 'Cache', exact: true});
  const line = page.getByText('This backend does not support deleting cache entries', {exact: true});
  await expect(line).toBeVisible();
  expect((await line.boundingBox())!.y).toBeLessThan((await grid.boundingBox())!.y);
  // The Delete column sits past the phone's width until the table is scrolled sideways.
  await grid.evaluate(table => {
    for (let box: Element | null = table; box; box = box.parentElement) if (box.scrollWidth > box.clientWidth) return void (box.scrollLeft = box.scrollWidth);
  });
  await expectReason(page, grid.getByRole('button', {name: /^Delete the /}).first(), 'This backend does not support deleting cache entries');
});

test('the outbound mode keeps Apply disabled without a line until a mode is picked', async ({page}) => {
  await page.goto('/#/activity');
  const apply = page.getByRole('button', {name: 'Apply', exact: true});
  await expect(apply).toBeDisabled();
  await expect(page.getByText('No changes to apply', {exact: true})).toHaveCount(0);
  await page.getByRole('radiogroup', {name: 'Outbound mode'}).getByRole('radio', {name: 'Direct', exact: true}).click();
  await expect(apply).toBeEnabled();
});

test('the profile actions say a profile is created by saving the backend', async ({page}) => {
  await page.goto('/#/settings');
  await expectReason(page, page.getByRole('button', {name: 'Rename profile', exact: true}), 'No profile yet; saving the backend creates one');
  await expect(page.getByRole('button', {name: 'Delete profile', exact: true})).toHaveAccessibleDescription('No profile yet; saving the backend creates one');
});

test('the route trace says what it lacks until a destination and port are given', async ({page}) => {
  await page.goto('/#/rules?tab=trace');
  const run = page.getByRole('button', {name: 'Run trace', exact: true});
  const line = await expectReason(page, run, 'Enter a domain or destination IP.');
  await page.getByLabel('Domain', {exact: true}).fill('example.com');
  await expect(line).toHaveCount(0);
  await expect(run).toHaveAccessibleDescription('Ports must be integers from 1 to 65535.');
  await page.getByLabel('Destination port', {exact: true}).fill('443');
  await expect(run).toBeEnabled();
  await expect(page.getByText('Ports must be integers from 1 to 65535.', {exact: true})).toHaveCount(0);
});

// A large group's tiles scroll in a panel and a small group's sit in a plain grid; both follow one column rule, line up
// with each other and fit the demo's names whole, and the panel keeps the grid's 8px gap between its last column and
// the scrollbar, which on a phone is drawn over the content.
for (const [width, columns] of [
  [390, 1],
  [440, 1],
  [1440, 5]
]) {
  test.describe(`${width}px node grids`, () => {
    test.use({viewport: {width, height: 900}, storage: {'doona-lang': 'zh-TW'}});
    test('a large group lines up with a small one and keeps its tiles off the scrollbar', async ({page}) => {
      await page.goto('/#/policies');
      const large = page.getByRole('region', {name: 'skylink'});
      await large.scrollIntoViewIfNeeded();
      const panel = large.locator('.rp-nodegrid');
      await expect(panel.locator('.rp-node').first()).toBeVisible();
      const m = await page.evaluate(() => {
        const panel = document.querySelector('.rp-nodegrid')!;
        const small = document.querySelector('.rp-nodes')!;
        const edges = (tiles: NodeListOf<Element>) => {
          const boxes = [...tiles].map(t => t.getBoundingClientRect());
          const top = Math.min(...boxes.map(b => b.top));
          const row = boxes.filter(b => b.top === top);
          return {left: Math.min(...row.map(b => b.left)), right: Math.max(...row.map(b => b.right)), width: row[0].width, columns: row.length};
        };
        const range = document.createRange();
        const cut = [...document.querySelectorAll<HTMLElement>('.rp-node .n')].filter(n => {
          range.selectNodeContents(n);
          return range.getBoundingClientRect().width > n.clientWidth + 0.5;
        });
        const box = panel.getBoundingClientRect();
        return {
          inner: box.left + panel.clientLeft + panel.clientWidth,
          large: edges(panel.querySelectorAll('.rp-node')),
          small: {...edges(small.querySelectorAll('.rp-node')), columns: getComputedStyle(small).gridTemplateColumns.split(' ').length},
          cut: cut.map(n => n.textContent)
        };
      });
      expect(m.inner - m.large.right).toBeGreaterThanOrEqual(8);
      expect(m.large.columns).toBe(columns);
      expect(m.small.columns).toBe(columns);
      expect(Math.abs(m.large.width - m.small.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.large.left - m.small.left)).toBeLessThanOrEqual(columns === 1 ? 0.5 : 3);
      if (columns === 1) expect(Math.abs(m.large.right - m.small.right)).toBeLessThanOrEqual(0.5);
      expect(m.cut).toEqual([]);
    });
  });
}

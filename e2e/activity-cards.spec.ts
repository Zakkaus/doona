import {test, expect, loadCatalogues, mockBackend} from './fixtures';
import {freshBackend} from './getting-started';
import {translate} from '../src/i18n';
import {sha256} from '../src/api/hash';

test.beforeAll(loadCatalogues);
const shots = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_ACTIVITY_SHOTS;

for (const width of [1440, 768, 390])
  for (const lang of ['en', 'zh-TW', 'zh-CN'] as const)
    for (const scheme of ['light', 'dark'])
      for (const flags of [false, true])
        test.describe(`${width} ${lang} ${scheme} flags ${flags ? 'on' : 'off'} Activity cards`, () => {
          test.use({viewport: {width, height: 1000}, storage: {'doona-lang': lang, 'doona-scheme': scheme, 'doona-country-flags': flags ? 'on' : 'off'}});
          test('captions, setup descriptions and latency controls fit', async ({page}) => {
            const backend = await mockBackend(page);
            const config = await backend.api.config();
            const main = config.sources.find(source => source.kind === 'main')!;
            main.content = 'routing { fallback: direct }';
            main.content_sha256 = await sha256(main.content);
            config.sources = [main];
            backend.handlers['GET config'] = async () => config;
            await page.goto('/#/activity');
            const setup = page.getByRole('region', {name: translate(lang, 'act.setup.title'), exact: true});
            const latency = page.locator('.rp-latency');
            const picker = latency.locator('.rp-select');
            await expect(setup).toBeVisible();
            await expect(picker).toHaveText('hk-01');
            await page.evaluate(async () => {
              await document.fonts.ready;
            });
            if (shots) await page.screenshot({path: `${shots}/activity.${width}.${lang}.${scheme}.flags-${flags ? 'on' : 'off'}.png`});
            await expect.soft(setup.getByRole('heading')).toHaveCount(0);
            const setupTitle = setup
              .locator('[id]')
              .filter({hasText: translate(lang, 'act.setup.title')})
              .first();
            const modeTitle = page.locator('.rp-qlabel').filter({hasText: translate(lang, 'act.mode')});
            const typeRole = (el: Element) => {
              const style = getComputedStyle(el);
              return {element: el.tagName, size: style.fontSize, weight: style.fontWeight, color: style.color};
            };
            expect.soft(await setupTitle.evaluate(typeRole)).toEqual(await modeTitle.evaluate(typeRole));
            const descriptions = await setup
              .locator('.rp-setup-copy > .rp-note')
              .evaluateAll(elements => elements.map(el => ({whiteSpace: getComputedStyle(el).whiteSpace, clipped: el.scrollWidth > el.clientWidth + 1})));
            for (const description of descriptions) {
              expect.soft(description.whiteSpace).toBe('normal');
              expect.soft(description.clipped).toBe(false);
            }
            const geometry = await latency.evaluate(el => {
              const picker = el.querySelector<HTMLElement>('.rp-select')!;
              const help = el.querySelector<HTMLElement>('.rp-help')!;
              const caption = el.querySelector('.rp-tile-caption');
              const range = document.createRange();
              if (caption) range.selectNodeContents(caption);
              else
                range.selectNode(
                  [...el.querySelector('.rp-tile-head')!.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())!
                );
              const title = range.getBoundingClientRect();
              const p = picker.getBoundingClientRect();
              const h = help.getBoundingClientRect();
              return {
                titleFits: !caption || (caption.scrollWidth <= caption.clientWidth + 1 && title.right <= el.getBoundingClientRect().right - 16),
                control: Number.parseFloat(getComputedStyle(el).getPropertyValue('--rp-control')),
                picker: [p.y, p.height],
                help: [h.y, h.width, h.height],
                secondRow: p.y >= title.bottom,
                clipped: [...picker.querySelectorAll<HTMLElement>('*')].some(child => child.scrollWidth > child.clientWidth + 1),
                padding: getComputedStyle(picker).paddingInlineStart
              };
            });
            expect.soft(geometry.titleFits).toBe(true);
            expect.soft(geometry.help.slice(1)).toEqual([geometry.control, geometry.control]);
            expect.soft(geometry.picker[1]).toBe(geometry.control);
            expect.soft(geometry.help[0]).toBe(geometry.picker[0]);
            expect.soft(geometry.secondRow).toBe(width === 390 || (flags && width === 1440 && lang === 'en'));
            expect.soft(geometry.clipped).toBe(false);
            expect.soft(geometry.padding).toBe('8px');
            expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
            await picker.focus();
            await page.keyboard.press('Enter');
            const menu = page.getByRole('menu', {name: translate(lang, 'policy.pickGroups'), exact: true});
            await expect(menu).toBeVisible();
            await page.getByRole('searchbox', {name: translate(lang, 'policy.pickGroups'), exact: true}).fill('gaming');
            await menu.getByRole('menuitemradio', {name: 'gaming', exact: true}).click();
            await expect(picker).toHaveText('hk-02');
            await expect(picker).toBeFocused();
            expect
              .soft(await picker.evaluate(button => [...button.querySelectorAll<HTMLElement>('*')].some(el => el.scrollWidth > el.clientWidth + 1)))
              .toBe(false);
            await page.keyboard.press('Tab');
            const help = latency.getByRole('button', {name: translate(lang, 'ui.helpFor', {name: translate(lang, 'act.latency')}), exact: true});
            await expect(help).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(page.getByRole('dialog', {name: translate(lang, 'act.latency'), exact: true})).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(help).toBeFocused();
          });
        });

for (const width of [1440, 768, 390])
  test(`fresh setup descriptions wrap at ${width}`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await freshBackend(page);
    await page.goto('/#/activity');
    const setup = page.getByRole('region', {name: 'Getting started', exact: true});
    await expect(setup.getByRole('listitem')).toHaveCount(3);
    await expect(setup.getByRole('heading')).toHaveCount(0);
    const hints = await setup.locator('.rp-note').evaluateAll(elements => elements.map(el => el.scrollWidth <= el.clientWidth + 1));
    expect(hints).toEqual([true, true, true]);
  });

import {test, expect, loadCatalogues, mockBackend} from './fixtures';
import {freshBackend} from './getting-started';
import {translate} from '../src/i18n';
import {sha256} from '../src/api/hash';

test.beforeAll(loadCatalogues);
const shots = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_ACTIVITY_SHOTS;

function latencyGeometry(el: Element) {
  const head = el.querySelector<HTMLElement>('.rp-tile-head')!;
  const caption = head.querySelector<HTMLElement>('.rp-tile-caption')!;
  const picker = head.querySelector<HTMLElement>('.rp-select')!;
  const help = head.querySelector<HTMLElement>('.rp-help')!;
  const value = el.querySelector<HTMLElement>('.rp-big')!;
  const range = document.createRange();
  range.selectNodeContents(caption);
  const title = range.getBoundingClientRect();
  const hiddenCaption = getComputedStyle(caption).clipPath === 'inset(50%)';
  const header = head.getBoundingClientRect();
  const p = picker.getBoundingClientRect();
  const h = help.getBoundingClientRect();
  const v = value.getBoundingClientRect();
  return {
    hiddenCaption,
    titleFits:
      hiddenCaption || (caption.scrollWidth <= caption.clientWidth + 1 && title.right <= p.left && title.top >= header.top && title.bottom <= header.bottom),
    control: Number.parseFloat(getComputedStyle(el).getPropertyValue('--rp-control')),
    headerHeight: header.height,
    picker: [p.y, p.height],
    help: [h.y, h.width, h.height],
    controlsFit: [p, h].every(box => box.left >= header.left && box.right <= header.right && box.top >= header.top && box.bottom <= header.bottom),
    valueFits: v.top >= header.bottom && v.right <= el.getBoundingClientRect().right && value.scrollWidth <= value.clientWidth + 1,
    clipped: [...picker.querySelectorAll<HTMLElement>('*')].some(child => {
      if (child.scrollWidth <= child.clientWidth + 1) return false;
      const style = getComputedStyle(child);
      return !(
        child.matches('.rp-node-name') &&
        child.clientWidth > 0 &&
        style.overflow === 'hidden' &&
        style.textOverflow === 'ellipsis' &&
        style.whiteSpace === 'nowrap'
      );
    }),
    padding: getComputedStyle(picker).paddingInlineStart
  };
}

for (const width of [1440, 768, 390])
  for (const lang of ['en', 'zh-TW', 'zh-CN'] as const)
    test.describe(`${width} ${lang} Activity cards`, () => {
      test.use({viewport: {width, height: 1000}, storage: {'doona-lang': lang, 'doona-country-flags': 'off'}});
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
        for (const flags of [false, true]) {
          if (flags) {
            // The first pass chose another group; the second starts from the default one.
            await page.evaluate(() => {
              localStorage.removeItem('doona-dashboard');
              localStorage.setItem('doona-country-flags', 'on');
            });
            await page.reload();
            await expect(picker).toHaveText('hk-01');
            await page.evaluate(() => document.fonts.ready);
          }
          if (shots) await page.screenshot({path: `${shots}/activity.${width}.${lang}.light.flags-${flags ? 'on' : 'off'}.png`});
          const geometry = await latency.evaluate(latencyGeometry);
          await expect.soft(latency.locator('.rp-tile-caption')).toHaveText(translate(lang, 'act.latency'));
          await expect.soft(picker).toHaveAccessibleName(translate(lang, 'ui.valuePair', {label: translate(lang, 'policy.pickGroups'), value: 'hk-01'}));
          expect.soft(geometry.hiddenCaption).toBe(width === 390);
          expect.soft(geometry.titleFits).toBe(true);
          expect.soft(geometry.help.slice(1)).toEqual([geometry.control, geometry.control]);
          expect.soft(geometry.picker[1]).toBe(geometry.control);
          expect.soft(geometry.help[0]).toBe(geometry.picker[0]);
          expect.soft(geometry.headerHeight).toBe(geometry.control);
          expect.soft(geometry.controlsFit).toBe(true);
          expect.soft(geometry.valueFits).toBe(true);
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
          await expect.soft(picker).toHaveAccessibleName(translate(lang, 'ui.valuePair', {label: translate(lang, 'policy.pickGroups'), value: 'hk-02'}));
          await expect(picker).toBeFocused();
          expect.soft(await latency.evaluate(latencyGeometry)).toMatchObject({
            titleFits: true,
            headerHeight: geometry.control,
            controlsFit: true,
            valueFits: true,
            clipped: false
          });
          await page.keyboard.press('Tab');
          const help = latency.getByRole('button', {name: translate(lang, 'ui.helpFor', {name: translate(lang, 'act.latency')}), exact: true});
          await expect(help).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('dialog', {name: translate(lang, 'act.latency'), exact: true})).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(help).toBeFocused();
        }
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

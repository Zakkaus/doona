import {expect, expectLoadFailures, routes, test} from './fixtures';
import {LANGS, LOCALE, loadLanguage, translate} from '../src/i18n';

// The specs read the catalogues the page loads on demand.
test.beforeAll(() => Promise.all(LANGS.map(([lang]) => loadLanguage(lang))));
for (const lang of ['zh-TW', 'zh-CN', 'en'] as const) {
  test.describe(lang, () => {
    test.use({storage: {'doona-lang': lang}});
    test('renders navigation without browser errors', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('html')).toHaveAttribute('lang', LOCALE[lang]);
      for (const route of routes) {
        const nav = page.locator(`.rp-nav[href="#/${route}"]`);
        await expect(nav).toBeVisible();
      }
      await expect(page.locator('.rp-nav').first()).toBeVisible();
      await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
    });
    test('editor completion suggestions have a localized accessible name', async ({page}) => {
      await page.goto('/#/config?tab=source');
      await page.getByRole('button', {name: translate(lang, 'config.edit'), exact: true}).click();
      const editor = page.locator('.cm-content[contenteditable="true"]');
      await editor.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText('global {\n  log_l');
      await page.keyboard.press('Control+Space');
      const suggestions = page.getByRole('listbox', {name: translate(lang, 'cm.completions'), exact: true});
      await expect(suggestions).toBeVisible();
      await suggestions.getByRole('option', {name: 'log_level', exact: true}).click();
      await expect(editor).toContainText('log_level:');
    });
  });
}

const localeChunk = (lang?: string) =>
  new RegExp(lang ? `(?:locale-${lang}-[^/]*\\.js|/i18n/locales/${lang}\\.ts)` : `(?:locale-[^/]*\\.js|/i18n/locales/[^/]*\\.ts)`);

test.describe('language loading', () => {
  // Chunks fetched by the service worker would bypass page.route.
  test.use({serviceWorkers: 'block'});
  test('fetches only the saved language', async ({page}) => {
    const fetched: string[] = [];
    page.on('request', request => {
      if (localeChunk().test(request.url())) fetched.push(request.url());
    });
    await page.goto('/#/activity');
    await expect(page.locator('.rp-nav').first()).toBeVisible();
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toMatch(localeChunk('en'));
  });

  test('falls back to zh-TW when the saved language does not load', async ({page}) => {
    expectLoadFailures(page, localeChunk('en'));
    await page.route(localeChunk('en'), route => route.abort());
    await page.goto('/#/activity');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.locator('.rp-nav[href="#/activity"]')).toContainText(translate('zh-TW', 'nav.activity'));
  });

  test('says so, in the saved language, when no language loads', async ({page}) => {
    expectLoadFailures(page, localeChunk());
    await page.route(localeChunk(), route => route.abort());
    await page.goto('/#/activity');
    await expect(page.getByRole('alert')).toContainText('The interface text could not be loaded.');
    const retry = page.getByRole('button', {name: 'Retry', exact: true});
    await expect(retry).toBeVisible();
    // Retry reloads the page, since nothing on it can load the language again.
    await Promise.all([page.waitForEvent('load'), retry.click()]);
    await expect(page.getByRole('alert')).toContainText('The interface text could not be loaded.');
  });

  test('keeps the current language when a new one does not load', async ({page}) => {
    expectLoadFailures(page, localeChunk('zh-CN'));
    await page.route(localeChunk('zh-CN'), route => route.abort());
    await page.goto('/#/activity');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await page.getByRole('button', {name: translate('en', 'lang'), exact: true}).click();
    await page.getByRole('menuitemradio', {name: '简体中文'}).click();
    await expect(page.getByText(translate('en', 'shell.langUnavailable', {name: '简体中文'}))).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    expect(await page.evaluate(() => localStorage.getItem('doona-lang'))).toBe('en');
  });

  test('declares the SC font faces only once zh-CN is chosen, before the page renders in it', async ({page}) => {
    const scFaces = () => page.evaluate(() => [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Noto Sans SC').length);
    await page.goto('/#/activity');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    expect(await scFaces()).toBe(0);
    // Counted in the same task that switches the language, before the browser paints it.
    await page.evaluate(() => {
      const html = document.documentElement;
      new MutationObserver((_, observer) => {
        if (html.lang !== 'zh-CN') return;
        html.dataset.scFaces = String([...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Noto Sans SC').length);
        observer.disconnect();
      }).observe(html, {attributes: true, attributeFilter: ['lang']});
    });
    await page.getByRole('button', {name: translate('en', 'lang'), exact: true}).click();
    await page.getByRole('menuitemradio', {name: '简体中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    expect(Number(await page.locator('html').getAttribute('data-sc-faces'))).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('.rp-nav').first()).toBeVisible();
    expect(await scFaces()).toBeGreaterThan(0);
  });

  test('declares the TC ideograph faces only once zh-TW is chosen, before the page renders in it', async ({page}) => {
    await page.goto('/#/activity');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    // Counted in the same task that switches the language, before the browser paints it.
    const latin = await page.evaluate(() => {
      const html = document.documentElement;
      const count = () => [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Noto Sans TC').length;
      new MutationObserver((_, observer) => {
        if (html.lang !== 'zh-TW') return;
        html.dataset.tcFaces = String(count());
        observer.disconnect();
      }).observe(html, {attributes: true, attributeFilter: ['lang']});
      return count();
    });
    await page.getByRole('button', {name: translate('en', 'lang'), exact: true}).click();
    await page.getByRole('menuitemradio', {name: '繁體中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    expect(Number(await page.locator('html').getAttribute('data-tc-faces'))).toBeGreaterThan(latin + 50);
  });

  test('zh-TW renders the same after zh-CN in one session as after a reload', async ({page}) => {
    const family = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
    await page.goto('/#/activity');
    await page.getByRole('button', {name: translate('en', 'lang'), exact: true}).click();
    await page.getByRole('menuitemradio', {name: '简体中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.getByRole('button', {name: translate('zh-CN', 'lang'), exact: true}).click();
    await page.getByRole('menuitemradio', {name: '繁體中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    const switched = await family();
    await page.reload();
    await expect(page.locator('.rp-nav').first()).toBeVisible();
    expect(switched).toBe(await family());
    expect(switched).not.toContain('Noto Sans SC');
  });
});

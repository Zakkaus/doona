import {expect, expectLoadFailures, loadCatalogues, routes, test, loadingState} from './fixtures';
import {LANGS, LOCALE, translate} from '../src/i18n';

// The specs read the catalogues the page loads on demand.
test.beforeAll(loadCatalogues);
test.describe('translated configuration text', () => {
  test.use({storage: {'doona-lang': 'zh-TW'}});

  test('shows one localized diagnostic in the row and editor tooltip', async ({page}) => {
    await page.goto('/#/config?source=src-rules');
    const editor = page.locator('.cm-content[contenteditable="true"]');
    await editor.fill((await editor.innerText()) + '\nunknown_section {}\n');
    await page.getByRole('button', {name: translate('zh-TW', 'config.validate'), exact: true}).click();
    const message = translate('zh-TW', 'config.diagnostic.unknownSection', {name: 'unknown_section'});
    await expect(page.getByRole('list', {name: translate('zh-TW', 'config.diagnostics')})).toContainText(message);
    await expect(async () => {
      // The mark can be redrawn under a pointer that never moved, which raises no new hover.
      await page.mouse.move(0, 0);
      await editor.locator('.cm-lintRange-error').last().hover();
      await expect(page.locator('.cm-tooltip-lint')).toContainText(message, {timeout: 1500});
    }).toPass();
  });

  test('renders source diagnostic tooltips in the language chosen in Settings', async ({page}) => {
    const checkDiagnostic = async (lang: 'zh-TW' | 'en') => {
      await page.goto('/#/config?source=src-rules');
      const editor = page.locator('.cm-content[contenteditable="true"]');
      await editor.fill((await editor.innerText()) + '\nunknown_section {}\n');
      await page.getByRole('button', {name: translate(lang, 'config.validate'), exact: true}).click();
      const message = translate(lang, 'config.diagnostic.unknownSection', {name: 'unknown_section'});
      await expect(page.getByRole('list', {name: translate(lang, 'config.diagnostics')})).toContainText(message);
      await expect(async () => {
        await page.mouse.move(0, 0);
        await editor.locator('.cm-lintRange-error').last().hover();
        await expect(page.locator('.cm-tooltip-lint')).toContainText(message, {timeout: 1500});
      }).toPass();
    };
    await checkDiagnostic('zh-TW');
    await page.locator('.rp-nav[href="#/settings"]').click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', {name: translate('zh-TW', 'config.discard'), exact: true})
      .click();
    await page
      .locator('.rp-content')
      .getByRole('button', {name: new RegExp(translate('zh-TW', 'ui.lang') + '$')})
      .click();
    await page.getByRole('option', {name: 'English', exact: true}).click();
    await checkDiagnostic('en');
  });
});

// The body's font stack and the face warmed for menu glyphs, per language.
const fonts: Record<string, [string, string]> = {
  'zh-TW': ['"Noto Sans TC", system-ui, sans-serif', "14px 'Noto Sans TC'"],
  'zh-CN': ['"Noto Sans SC", "Noto Sans TC", system-ui, sans-serif', "14px 'Noto Sans SC'"],
  en: ['"Noto Sans TC", system-ui, sans-serif', "14px 'Noto Sans TC'"]
};
for (const [lang] of LANGS) {
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
      await expect(page.locator(`.rp-content ${loadingState}`)).toHaveCount(0);
    });
    test('uses and warms its font faces', async ({page}) => {
      await page.addInitScript(() => {
        const load = document.fonts.load.bind(document.fonts);
        const warmed: string[] = ((window as unknown as {warmed: string[]}).warmed = []);
        document.fonts.load = (font, text) => (warmed.push(font), load(font, text));
      });
      await page.goto('/#/activity');
      await expect(page.locator('.rp-nav').first()).toBeVisible();
      const [family, warm] = fonts[lang];
      expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toBe(`"Twemoji Country Flags", ${family}`);
      await expect.poll(() => page.evaluate(() => (window as unknown as {warmed: string[]}).warmed)).toContain(warm);
    });
    test('shows shortcut key names from the selected catalogue', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator('.rp-nav').first()).toBeVisible();
      await page.keyboard.press('?');
      const keys = await page
        .getByRole('dialog', {name: translate(lang, 'shell.shortcuts')})
        .locator('kbd')
        .allTextContents();
      expect(keys).toContain(translate(lang, 'shell.keyEnter'));
      expect(keys).toContain(translate(lang, 'shell.keyEsc'));
      expect(keys).toContain(`${translate(lang, 'shell.keyCtrl')} S`);
    });
    test('editor completion suggestions have a localized accessible name', async ({page}) => {
      await page.goto('/#/config?tab=source&source=src-rules');
      const editor = page.locator('.cm-content[contenteditable="true"]');
      await editor.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.insertText('\ndns {\n  ');
      // Typing opens the list on its own; Ctrl+Space would query again and ignore clicks until that finishes.
      await page.keyboard.type('dom');
      const suggestions = page.getByRole('listbox', {name: translate(lang, 'cm.completions'), exact: true});
      await expect(suggestions).toBeVisible();
      await suggestions.getByRole('option', {name: 'domain', exact: true}).click();
      await expect(editor).toContainText('domain(');
    });
  });
}

const localeChunk = (lang?: string) =>
  new RegExp(lang ? `(?:locale-${lang}-[^/]*\\.js|/i18n/locales/${lang}\\.json)` : `(?:locale-[^/]*\\.js|/i18n/locales/[^/]*\\.json)`);

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
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('.rp-nav[href="#/activity"]')).toContainText(translate('zh-TW', 'nav.activity'));
  });

  test('says so, in the saved language, when no language loads', async ({page}) => {
    expectLoadFailures(page, localeChunk());
    await page.route(localeChunk(), route => route.abort());
    await page.goto('/#/activity');
    await expect(page.getByRole('alert')).toContainText(translate('en', 'ui.interfaceTextUnavailable'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const retry = page.getByRole('button', {name: translate('en', 'ui.retry'), exact: true});
    await expect(retry).toBeVisible();
    // Retry reloads the page, since nothing on it can load the language again.
    await Promise.all([page.waitForEvent('load'), retry.click()]);
    await expect(page.getByRole('alert')).toContainText(translate('en', 'ui.interfaceTextUnavailable'));
  });

  test.describe('when both Chinese catalogues fail', () => {
    test.use({storage: {'doona-lang': 'zh-CN'}});
    test('keeps the requested language on the failure screen', async ({page}) => {
      expectLoadFailures(page, localeChunk());
      await page.route(localeChunk(), route => route.abort());
      await page.goto('/#/activity');
      await expect(page.getByRole('alert')).toContainText(translate('zh-CN', 'ui.interfaceTextUnavailable'));
      await expect(page.getByRole('button', {name: translate('zh-CN', 'ui.retry'), exact: true})).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    });
  });

  test('keeps the current language when a new one does not load', async ({page}) => {
    expectLoadFailures(page, localeChunk('zh-CN'));
    await page.route(localeChunk('zh-CN'), route => route.abort());
    await page.goto('/#/settings?card=appearance');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await page
      .locator('.rp-content')
      .getByRole('button', {name: new RegExp(translate('en', 'ui.lang') + '$')})
      .click();
    await page.getByRole('option', {name: '简体中文'}).click();
    await expect(page.getByText(translate('en', 'shell.langUnavailable', {name: '简体中文'}))).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    expect(await page.evaluate(() => localStorage.getItem('doona-lang'))).toBe('en');
  });

  test('declares the SC font faces only once zh-CN is chosen, before the page renders in it', async ({page}) => {
    const scFaces = () => page.evaluate(() => [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Noto Sans SC').length);
    await page.goto('/#/settings?card=appearance');
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
    await page
      .locator('.rp-content')
      .getByRole('button', {name: new RegExp(translate('en', 'ui.lang') + '$')})
      .click();
    await page.getByRole('option', {name: '简体中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    expect(Number(await page.locator('html').getAttribute('data-sc-faces'))).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('.rp-nav').first()).toBeVisible();
    expect(await scFaces()).toBeGreaterThan(0);
  });

  test('declares the TC ideograph faces only once zh-TW is chosen, before the page renders in it', async ({page}) => {
    await page.goto('/#/settings?card=appearance');
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
    await page
      .locator('.rp-content')
      .getByRole('button', {name: new RegExp(translate('en', 'ui.lang') + '$')})
      .click();
    await page.getByRole('option', {name: '繁體中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    expect(Number(await page.locator('html').getAttribute('data-tc-faces'))).toBeGreaterThan(latin + 50);
  });

  test('zh-TW renders the same after zh-CN in one session as after a reload', async ({page}) => {
    const family = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
    await page.goto('/#/settings?card=appearance');
    await page
      .locator('.rp-content')
      .getByRole('button', {name: new RegExp(translate('en', 'ui.lang') + '$')})
      .click();
    await page.getByRole('option', {name: '简体中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page
      .locator('.rp-content')
      .getByRole('button', {name: new RegExp(translate('zh-CN', 'ui.lang') + '$')})
      .click();
    await page.getByRole('option', {name: '繁體中文'}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    const switched = await family();
    await page.reload();
    await expect(page.locator('.rp-nav').first()).toBeVisible();
    expect(switched).toBe(await family());
    expect(switched).not.toContain('Noto Sans SC');
  });
});

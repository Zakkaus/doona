import {beforeAll, expect, it, vi} from 'vitest';
import en from './locales/en.json';
import fr from './test-fixtures/fr.json';
import ar from './test-fixtures/ar.json';
import type {Catalogue, Lang} from './index';
import {pageDirection, textDirection} from './direction';

const fixture = (lang: Lang) => Promise.resolve(({en, fr, ar} as Record<string, Partial<Catalogue>>)[lang]);
let translate: typeof import('./index').translate;
let LOCALE: typeof import('./index').LOCALE;
beforeAll(async () => {
  vi.resetModules();
  vi.doMock('./languages', async importOriginal => {
    const actual = await importOriginal<typeof import('./languages')>();
    return {
      ...actual,
      languages: [
        ...actual.languages,
        {id: 'fr', name: 'Français', locale: 'fr-FR', docs: 'en', fonts: null, complete: false},
        {id: 'ar', name: 'العربية', locale: 'ar', docs: 'en', fonts: null, complete: false}
      ]
    };
  });
  const i18n = await import('./index');
  translate = i18n.translate;
  LOCALE = i18n.LOCALE;
  const {loadLanguage} = i18n;
  await Promise.all([loadLanguage('fr' as Lang, fixture), loadLanguage('ar' as Lang, fixture)]);
});

it('uses English plural rules for an English fallback in partial French', () => {
  expect(translate('fr' as Lang, 'dns.deleted', {n: 0})).toBe('Deleted 0 cache entries');
  expect(translate('fr' as Lang, 'dns.deleted', {n: 1})).toBe('Deleted 1 cache entry');
  expect(translate('fr' as Lang, 'ui.retry')).toBe('Réessayer');
});

it('selects every Arabic plural category and formats the count after selection', () => {
  const counts = [
    [0, 'zero'],
    [1, 'one'],
    [2, 'two'],
    [3, 'few'],
    [11, 'many'],
    [100, 'other']
  ] as const;
  for (const [n, form] of counts) expect(translate('ar' as Lang, 'dns.deleted', {n})).toBe(`${form} ${new Intl.NumberFormat('ar').format(n)}`);
  // Formatted text is no count, so it takes the general form as written.
  expect(translate('ar' as Lang, 'dns.deleted', {n: '١'})).toBe('other ١');
});

it('uses a named numeric operand and preserves large UInt64 interpolation', () => {
  expect(translate('en', 'dns.deleted', {n: 1, files: 2}, 'files')).toBe('Deleted 1 cache entries');
  expect(translate('en', 'dns.deleted', {n: '18446744073709551615'})).toBe('Deleted 18,446,744,073,709,551,615 cache entries');
  expect(translate('en', 'dns.deleted', {n: 1.5})).toBe('Deleted 1.5 cache entries');
  expect(translate('ar' as Lang, 'dns.deleted', {n: 10_000_000_000_000_003n}).startsWith('few ')).toBe(true);
});

it('uses the Arabic fixture direction for page text and layout', () => {
  expect(textDirection(LOCALE['ar' as Lang])).toBe('rtl');
  expect(pageDirection(LOCALE['ar' as Lang], false)).toBe('rtl');
});

it('loads only itself for a complete language', async () => {
  vi.resetModules();
  const i18n = await import('./index');
  const read = vi.fn((lang: Lang) => Promise.resolve(lang === 'zh-TW' ? ({} as Partial<Catalogue>) : (en as Partial<Catalogue>)));
  await i18n.loadLanguage('zh-TW', read);
  expect(read.mock.calls).toEqual([['zh-TW']]);
  expect(i18n.isLoaded('en')).toBe(false);
});

it('retries a partial catalogue after its first load fails', async () => {
  vi.resetModules();
  const i18n = await import('./index');
  await expect(i18n.loadLanguage('fr' as Lang, lang => ((lang as string) === 'fr' ? Promise.reject(new Error('offline')) : fixture(lang)))).rejects.toThrow(
    'offline'
  );
  expect(i18n.isLoaded('fr' as Lang)).toBe(false);
  await i18n.loadLanguage('fr' as Lang, fixture);
  expect(i18n.translate('fr' as Lang, 'dns.deleted', {n: 0})).toBe('Deleted 0 cache entries');
});

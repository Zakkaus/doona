import {beforeEach, expect, it, vi} from 'vitest';
import type {Catalogue, Lang} from './index';

// A made-up partial language, xx, that has translated one key; the setup file's catalogues stay out of this module.
const xx = 'xx' as Lang;
beforeEach(() => {
  vi.resetModules();
  vi.doMock('./languages', async (original: () => Promise<typeof import('./languages')>) => {
    const actual = await original();
    return {...actual, languages: [...actual.languages, {id: 'xx', name: 'Xx', locale: 'en-US', docs: 'en', fonts: null, complete: false}]};
  });
});

const tables: Record<string, Partial<Catalogue>> = {xx: {'ui.newBuild': 'Xx build'}, en: {'ui.newBuild': 'New build', 'ui.separator': ', '}};
const read = vi.fn((lang: Lang) => Promise.resolve(tables[lang] ?? {}));

it('fills the keys a partial language lacks from English', async () => {
  const i18n = await import('./index');
  await i18n.loadLanguage(xx, read);
  expect(i18n.translate(xx, 'ui.newBuild')).toBe('Xx build');
  expect(i18n.translate(xx, 'ui.separator')).toBe(', ');
  expect(i18n.isLoaded('en')).toBe(true);
});

it('loads only itself for a complete language', async () => {
  read.mockClear();
  const i18n = await import('./index');
  await i18n.loadLanguage('zh-TW', read);
  expect(read.mock.calls).toEqual([['zh-TW']]);
  expect(i18n.isLoaded('en')).toBe(false);
});

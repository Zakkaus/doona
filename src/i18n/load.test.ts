import {beforeEach, expect, it, vi} from 'vitest';

// The setup file loads every language; these tests start from a fresh module with none loaded.
beforeEach(() => {
  vi.resetModules();
  vi.doUnmock('./locales/en');
});

it('loads only the language asked for, once', async () => {
  const i18n = await import('./index');
  expect(i18n.translate('en', 'ui.newBuild')).toBe('ui.newBuild');
  const first = i18n.loadLanguage('en');
  expect(i18n.loadLanguage('en')).toBe(first);
  await first;
  expect(i18n.isLoaded('en')).toBe(true);
  expect(i18n.isLoaded('zh-TW')).toBe(false);
  expect(i18n.translate('en', 'ui.newBuild')).not.toBe('ui.newBuild');
});

it('can ask again after a failed load', async () => {
  vi.doMock('./locales/en', () => {
    throw new Error('offline');
  });
  const i18n = await import('./index');
  await expect(i18n.loadLanguage('en')).rejects.toThrow();
  expect(i18n.isLoaded('en')).toBe(false);
  vi.doUnmock('./locales/en');
  await i18n.loadLanguage('en');
  expect(i18n.isLoaded('en')).toBe(true);
});

import {afterEach, beforeEach, expect, it, vi} from 'vitest';

// Reset the module boundary: setup has already loaded catalogues and cached the common font promise.
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('publishes translated text after three seconds when the font load stalls', async () => {
  const i18n = await import('./index');
  let requested!: () => void;
  const started = new Promise<void>(resolve => (requested = resolve));
  vi.stubGlobal('document', {
    fonts: {
      load: () => {
        requested();
        return new Promise(() => {});
      }
    }
  });
  const language = i18n.loadLanguage('en');
  await started;
  await vi.advanceTimersByTimeAsync(2999);
  expect(i18n.isLoaded('en')).toBe(false);
  expect(i18n.translate('en', 'nav.activity')).toBe('nav.activity');
  await vi.advanceTimersByTimeAsync(1);
  await language;
  expect(i18n.isLoaded('en')).toBe(true);
  expect(i18n.translate('en', 'nav.activity')).toBe('Activity');
  expect(vi.getTimerCount()).toBe(0);
});

it('publishes immediately and clears the deadline when optional fonts finish', async () => {
  const i18n = await import('./index');
  vi.stubGlobal('document', {fonts: {load: () => Promise.resolve([])}});
  await i18n.loadLanguage('en');
  expect(i18n.translate('en', 'nav.activity')).toBe('Activity');
  expect(vi.getTimerCount()).toBe(0);
});

import {beforeEach, expect, it, vi} from 'vitest';
import type {Catalogue, Key} from './index';

// The setup file loads every language; these tests start from a fresh module with none loaded.
beforeEach(() => {
  vi.resetModules();
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
  const i18n = await import('./index');
  await expect(i18n.loadLanguage('en', () => Promise.reject(new Error('offline')))).rejects.toThrow();
  expect(i18n.isLoaded('en')).toBe(false);
  await i18n.loadLanguage('en');
  expect(i18n.isLoaded('en')).toBe(true);
});

it('loads a later stage for every language, before and after it is asked for', async () => {
  const i18n = await import('./index');
  const read = vi.fn((lang: string, stage: string) => Promise.resolve({[`ui.${stage}`]: `${lang} ${stage}`} as Partial<Catalogue>));
  await i18n.loadLanguage('en', read);
  expect(read.mock.calls).toEqual([['en', 'core']]);
  let ready = false;
  const page = i18n
    .withCatalogue('rest', () => Promise.resolve('page'))()
    .then(module => ((ready = true), module));
  expect(ready).toBe(false);
  await expect(page).resolves.toBe('page');
  expect(read.mock.calls).toEqual([
    ['en', 'core'],
    ['en', 'activity'],
    ['en', 'rest']
  ]);
  expect(i18n.translate('en', 'ui.rest' as Key)).toBe('en rest');
  // A language loaded afterwards brings every stage asked for so far.
  await i18n.loadLanguage('zh-TW', read);
  expect(read.mock.calls.slice(3)).toEqual([
    ['zh-TW', 'core'],
    ['zh-TW', 'activity'],
    ['zh-TW', 'rest']
  ]);
  expect(i18n.translate('zh-TW', 'ui.activity' as Key)).toBe('zh-TW activity');
});

it('waits for an in-flight stage when returning to a previously loaded language', async () => {
  const i18n = await import('./index');
  vi.stubGlobal('localStorage', {getItem: () => 'en'});
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const read = (lang: string, stage: string): Promise<Partial<Catalogue>> =>
    stage === 'core' ? Promise.resolve({}) : gate.then(() => ({'ui.newBuild': `${lang} ${stage}`}));
  await i18n.loadLanguage('en', read);
  await i18n.loadLanguage('zh-TW', read);
  const stage = i18n.loadStage('activity');
  let ready = false;
  const switched = i18n.loadLanguage('zh-TW', read).then(() => {
    ready = true;
  });
  await Promise.resolve();
  const premature = ready;
  release();
  await Promise.all([stage, switched]);
  expect(premature).toBe(false);
  expect(i18n.translate('zh-TW', 'ui.newBuild')).toBe('zh-TW activity');
  vi.unstubAllGlobals();
});

it('loads a stage when the shown language has it, retrying an idle language that failed once it is asked for', async () => {
  const i18n = await import('./index');
  vi.stubGlobal('localStorage', {getItem: () => 'en'});
  let offline = true;
  const read = vi.fn((lang: string, stage: string) =>
    offline && `${lang}/${stage}` !== 'en/activity' && stage !== 'core'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({[`ui.${stage}`]: `${lang} ${stage}`} as Partial<Catalogue>)
  );
  await i18n.loadLanguage('zh-TW', read);
  await i18n.loadLanguage('en', read);
  await expect(i18n.withCatalogue('activity', () => Promise.resolve('page'))()).resolves.toBe('page');
  await expect(i18n.loadStage('rest')).rejects.toThrow('offline');
  offline = false;
  await i18n.loadLanguage('zh-TW', read);
  expect(i18n.translate('zh-TW', 'ui.activity' as Key)).toBe('zh-TW activity');
  vi.unstubAllGlobals();
});

it('retries a failed stage after its reader recovers', async () => {
  const i18n = await import('./index');
  vi.stubGlobal('localStorage', {getItem: () => 'en'});
  let offline = true;
  const read = (_lang: string, stage: string): Promise<Partial<Catalogue>> =>
    stage === 'core'
      ? Promise.resolve({})
      : offline
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({'ui.activity': 'Activity'} as Partial<Catalogue>);
  try {
    await i18n.loadLanguage('en', read);
    await expect(i18n.loadStage('activity')).rejects.toThrow('offline');
    offline = false;
    await i18n.loadStage('activity');
    expect(i18n.translate('en', 'ui.activity' as Key)).toBe('Activity');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('waits for the requested stage but not a later stage already in flight', async () => {
  const i18n = await import('./index');
  let releaseActivity!: () => void;
  let releaseRest!: () => void;
  const activity = new Promise<void>(resolve => (releaseActivity = resolve));
  const rest = new Promise<void>(resolve => (releaseRest = resolve));
  const read = (_lang: string, stage: string): Promise<Partial<Catalogue>> =>
    stage === 'core' ? Promise.resolve({}) : (stage === 'activity' ? activity : rest).then(() => ({'ui.activity': 'Activity'}) as Partial<Catalogue>);
  await i18n.loadLanguage('en', read);
  let restReady = false;
  const later = i18n.loadStage('rest').then(() => {
    restReady = true;
  });
  let activityReady = false;
  const earlier = i18n.loadStage('activity').then(() => {
    activityReady = true;
  });
  try {
    await Promise.resolve();
    expect(activityReady).toBe(false);
    releaseActivity();
    await earlier;
    expect(i18n.translate('en', 'ui.activity' as Key)).toBe('Activity');
    expect(restReady).toBe(false);
  } finally {
    releaseActivity();
    releaseRest();
    await later;
  }
});

it('falls back to a loaded language when the saved one has not loaded', async () => {
  const i18n = await import('./index');
  await i18n.loadLanguage('en');
  expect(i18n.loadedLang('zh-CN')).toBe('en');
});

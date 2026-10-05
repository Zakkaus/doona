import {runInNewContext} from 'node:vm';
import {expect, it} from 'vitest';
import {DEFAULT_PALETTE, palettes} from '../src/shell/palettes';
import {LANGS, LOCALE} from '../src/i18n';
import {pageDirection, rtlScripts, textDirection} from '../src/i18n/direction';
import {negotiationCases} from '../src/i18n/negotiation.test-cases';
import {stampScript} from './stamp.mjs';

const stamp = stampScript({
  palettes: palettes.map(palette => palette.id),
  defaultPalette: DEFAULT_PALETTE,
  locales: LOCALE,
  referenceLocale: LOCALE.en,
  rtlScripts
});
// `intl` stands in for the engine's Intl; the script's own context has the real one.
const prepaint = (stored, dark, intl, tags = []) => {
  const document = {documentElement: {dataset: {}, lang: '', dir: ''}};
  const context = {
    document,
    navigator: {languages: tags, language: tags[0] ?? ''},
    localStorage: {getItem: key => stored[key] ?? null, setItem: (key, value) => (stored[key] = value), removeItem: key => delete stored[key]},
    matchMedia: () => ({matches: dark})
  };
  runInNewContext(stamp, intl ? {...context, Intl: intl} : context);
  return document.documentElement;
};

it('accepts every palette the app offers', () => {
  for (const {id} of palettes) {
    const [family, flavour] = id.split('/');
    expect(prepaint({'doona-palette': id}, false).dataset).toMatchObject({family, flavour});
  }
});

it('moves the old Glass material into its palette once', () => {
  for (const [material, palette] of [
    ['clear', 'glass/glass'],
    ['frosted', 'glass/frosted'],
    ['tinted', 'glass/tinted']
  ]) {
    const stored = {'doona-palette': 'glass/glass', 'doona-glass': material};
    expect(prepaint(stored, false).dataset.flavour).toBe(palette.split('/')[1]);
    expect(stored).toEqual({'doona-palette': palette});
  }
  const other = {'doona-palette': 'nord/nord', 'doona-glass': 'frosted'};
  expect(prepaint(other, false).dataset.family).toBe('nord');
  expect(other).toEqual({'doona-palette': 'nord/nord'});
});

it('falls back to the default palette for removed or malformed ids without losing dark mode', () => {
  for (const palette of ['tokyo-night/storm', 'unknown/palette', '/moon', 'rose-pine/moon/extra', null]) {
    expect(prepaint({'doona-palette': palette, 'doona-scheme': 'dark', 'doona-lang': 'en'}, false)).toEqual({
      dataset: {scheme: 'dark', family: 'rose-pine', flavour: 'moon', wordmark: 'gradient'},
      lang: 'en-US',
      dir: 'ltr'
    });
  }
});

it('keeps a supported palette and follows the system for an invalid scheme', () => {
  expect(prepaint({'doona-palette': 'catppuccin/macchiato', 'doona-scheme': 'invalid', 'doona-wordmark': 'plain', 'doona-lang': 'zh-CN'}, true)).toEqual({
    dataset: {scheme: 'dark', family: 'catppuccin', flavour: 'macchiato', wordmark: 'plain'},
    lang: 'zh-CN',
    dir: 'ltr'
  });
});

it('stamps the language and direction the app sets for every language', () => {
  for (const [lang] of LANGS) expect(prepaint({'doona-lang': lang}, false)).toMatchObject({lang: LOCALE[lang], dir: textDirection(LOCALE[lang])});
});

it('stamps the browser language when no supported language was saved', () => {
  for (const {tags, lang} of negotiationCases)
    for (const saved of [null, 'unsupported', 'constructor', '__proto__'])
      expect(prepaint({'doona-lang': saved}, false, undefined, tags).lang).toBe(LOCALE[lang]);
});

it('reads the direction from the text info, or else from the likely script', () => {
  const engine = (info, script) => ({
    Locale: class {
      textInfo = info;
      maximize = () => ({script});
    }
  });
  expect(prepaint({}, false, engine({direction: 'rtl'}, 'Latn')).dir).toBe('rtl');
  expect(prepaint({}, false, engine({direction: 'ltr'}, 'Arab')).dir).toBe('ltr');
  expect(prepaint({}, false, engine(undefined, 'Arab')).dir).toBe('rtl');
  expect(prepaint({}, false, engine(undefined, 'Hebr')).dir).toBe('rtl');
  expect(prepaint({}, false, engine(undefined, 'Hant')).dir).toBe('ltr');
  expect(prepaint({}, false, {}).dir).toBe('ltr');
});

it('stamps the mirrored layout right to left in every language before first paint', () => {
  for (const [lang] of LANGS) {
    const html = prepaint({'doona-lang': lang, 'doona-mirror': 'on'}, false);
    expect(html).toMatchObject({lang: LOCALE[lang], dir: pageDirection(LOCALE[lang], true)});
    expect(html.dataset.mirror).toBe('');
  }
  // Even where the engine's Intl would fail.
  expect(prepaint({'doona-mirror': 'on'}, false, {}).dir).toBe('rtl');
  for (const value of ['off', 'true', '', null]) {
    const html = prepaint({'doona-lang': 'en', 'doona-mirror': value}, false);
    expect(html.dir).toBe('ltr');
    expect(html.dataset).not.toHaveProperty('mirror');
  }
});

it('links the Glass stylesheet before first paint for the Glass palettes only', () => {
  const linked = stampScript({
    palettes: palettes.map(palette => palette.id),
    defaultPalette: DEFAULT_PALETTE,
    locales: LOCALE,
    referenceLocale: LOCALE.en,
    rtlScripts,
    glassStylesheet: './assets/glass-hash.css'
  });
  for (const {id} of palettes) {
    const written = [];
    const document = {documentElement: {dataset: {}, lang: '', dir: ''}, write: html => written.push(html)};
    runInNewContext(linked, {
      document,
      navigator: {languages: [], language: ''},
      localStorage: {getItem: key => (key === 'doona-palette' ? id : null)},
      matchMedia: () => ({matches: false})
    });
    expect(written).toEqual(id.startsWith('glass/') ? ['<link rel="stylesheet" data-glass href="./assets/glass-hash.css">'] : []);
  }
});

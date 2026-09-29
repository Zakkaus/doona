import {expect, it} from 'vitest';
import {LANGS, LOCALE} from './index';
import {pageDirection, rtlScripts, textDirection} from './direction';

const rtl = ['ar', 'ar-EG', 'he-IL', 'fa', 'ur-PK', 'ckb', 'az-Arab'];
const ltr = ['zh-TW', 'zh-CN', 'en-US', 'ja', 'ar-Latn'];

it('reads each registered language according to its locale script', () => {
  for (const [lang] of LANGS) {
    const script = new Intl.Locale(LOCALE[lang]).maximize().script ?? '';
    expect(textDirection(LOCALE[lang])).toBe(rtlScripts.includes(script) ? 'rtl' : 'ltr');
  }
});

it('follows the locale text info', () => {
  for (const tag of rtl) expect(textDirection(tag), tag).toBe('rtl');
  for (const tag of ltr) expect(textDirection(tag), tag).toBe('ltr');
});

it('falls back to the likely script where Intl.Locale has no text info', () => {
  // Node has getTextInfo and no textInfo, as Chrome does; without the method it reads as Firefox does.
  const proto = Intl.Locale.prototype as unknown as {getTextInfo?: () => unknown};
  const getTextInfo = proto.getTextInfo;
  proto.getTextInfo = undefined;
  try {
    for (const tag of rtl) expect(textDirection(tag), tag).toBe('rtl');
    for (const tag of ltr) expect(textDirection(tag), tag).toBe('ltr');
  } finally {
    proto.getTextInfo = getTextInfo;
  }
});

it('reads a tag Intl cannot parse left to right', () => {
  expect(textDirection('')).toBe('ltr');
  expect(textDirection('not a tag')).toBe('ltr');
});

it('mirrors the page right to left without changing the language direction', () => {
  for (const [lang] of LANGS) {
    expect(pageDirection(LOCALE[lang], true)).toBe('rtl');
    expect(pageDirection(LOCALE[lang], false)).toBe(textDirection(LOCALE[lang]));
  }
  expect(pageDirection('ar', false)).toBe('rtl');
  expect(pageDirection('ar', true)).toBe('rtl');
});

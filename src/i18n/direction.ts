export type Dir = 'ltr' | 'rtl';

// The scripts written right to left. An engine whose Intl.Locale has no text info (Firefox) decides by the locale's
// likely script, so Arabic, Hebrew or Persian need no entry of their own. tools/stamp.js receives this list at build.
export const rtlScripts = ['Adlm', 'Arab', 'Hebr', 'Mand', 'Nkoo', 'Rohg', 'Samr', 'Syrc', 'Thaa', 'Yezi'];

type TextInfo = {direction?: string};
type Locale = Intl.Locale & {getTextInfo?: () => TextInfo; textInfo?: TextInfo};

// The direction a locale's text runs in. An engine that implemented text info first as a property has `textInfo`; a
// tag Intl cannot parse reads left to right.
export function textDirection(locale: string): Dir {
  try {
    const tag = new Intl.Locale(locale) as Locale;
    const info = tag.getTextInfo?.() ?? tag.textInfo;
    if (info?.direction) return info.direction === 'rtl' ? 'rtl' : 'ltr';
    return rtlScripts.includes(tag.maximize().script ?? '') ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

// The page's direction: the mirrored layout runs right to left whatever the language, whose text keeps its own order.
export function pageDirection(locale: string, mirrored: boolean): Dir {
  return mirrored ? 'rtl' : textDirection(locale);
}

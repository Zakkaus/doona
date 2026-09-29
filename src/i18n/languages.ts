// The one list of interface languages, in menu order. The Lang type, the language menu, the stored-value check, the
// catalogue loaders, the docs links and the first-paint script (vite.config.ts injects the locales into
// tools/stamp.js) all read it, and tools/check-i18n.mjs and tools/screenshots.mjs parse it through
// tools/languages.mjs, so every entry stays a plain literal.
//   id      the stored value, and the name of the language's catalogue, src/i18n/locales/<id>.json
//   name    the language's name in itself, as the menu shows it
//   locale  the BCP 47 tag for Intl and <html lang>
//   docs    the doona-docs language folder the docs links open; 'en' when the docs have no translation
//   fonts   <name> of the src/fonts-<name>.css stylesheet that declares the language's ideograph faces, loaded with
//           its catalogue, or null
//   faces   the font families the body prefers, in order, before the system font; the first is warmed for menu glyphs.
//           The TC faces in src/fonts.css cover Latin for every language.
//   complete  whether check:i18n requires every key. A partial language loads English with its own catalogue and
//           shows the English text for a key it lacks; maintainers mark it complete once it has them all.
export const languages = [
  {id: 'zh-TW', name: '繁體中文', locale: 'zh-TW', docs: 'zh-TW', fonts: 'tc', faces: ['Noto Sans TC'], complete: true},
  {id: 'zh-CN', name: '简体中文', locale: 'zh-CN', docs: 'zh-CN', fonts: 'sc', faces: ['Noto Sans SC', 'Noto Sans TC'], complete: true},
  {id: 'en', name: 'English', locale: 'en-US', docs: 'en', fonts: null, faces: ['Noto Sans TC'], complete: true}
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  locale: string;
  docs: 'zh-TW' | 'zh-CN' | 'en';
  fonts: string | null;
  faces: readonly string[];
  complete: boolean;
}>;

export type Lang = (typeof languages)[number]['id'];
export type CompleteLang = Extract<(typeof languages)[number], {complete: true}>['id'];
// The language startup falls back to when the negotiated one's catalogue does not load.
export const DEFAULT_LANG = 'zh-TW' satisfies Lang;
// The reference and fallback catalogue, always complete: its keys define Key (src/i18n/index.ts imports en.json by
// name), no other catalogue may hold a key it lacks or a different placeholder, and a partial language falls back to it.
export const REFERENCE_LANG = 'en' satisfies CompleteLang;

const ids: ReadonlySet<string> = new Set(languages.map(language => language.id));
export function isLang(value: string | null): value is Lang {
  return value !== null && ids.has(value);
}

// The first browser preference doona has, by its exact tag, else by its primary subtag; English when none matches.
// Chinese needs a rule rather than data: a Hant script or a TW, HK or MO region reads Traditional, any other Chinese
// Simplified. tools/stamp.js repeats this for the first paint.
export function browserLang(tags: readonly string[]): Lang {
  for (const preference of tags) {
    const tag = preference.toLowerCase();
    const primary = tag.split('-')[0];
    const exact = languages.find(language => language.id.toLowerCase() === tag || language.locale.toLowerCase() === tag);
    if (exact) return exact.id;
    if (primary === 'zh') return /-hans\b/.test(tag) ? 'zh-CN' : /-(hant|tw|hk|mo)\b/.test(tag) ? 'zh-TW' : 'zh-CN';
    const match = languages.find(language => language.id.toLowerCase().split('-')[0] === primary);
    if (match) return match.id;
  }
  return REFERENCE_LANG;
}

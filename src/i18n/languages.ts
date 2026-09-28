// The one list of interface languages, in menu order. The Lang type, the language menu, the stored-value check, the
// catalogue loaders, the docs links and the first-paint script (vite.config.ts injects the locales into
// tools/stamp.js) all read it, and tools/gen-locales.mjs, tools/check-i18n.mjs and tools/screenshots.mjs parse it
// through tools/languages.mjs, so every entry stays a plain literal.
//   id      the stored value, the key of each language's table in every messages.ts, and src/i18n/locales/<id>.ts
//   name    the language's name in itself, as the menu shows it
//   locale  the BCP 47 tag for Intl and <html lang>
//   docs    the doona-docs language folder the docs links open; 'en' when the docs have no translation
//   fonts   <name> of the src/fonts-<name>.css stylesheet that declares the language's ideograph faces, loaded with
//           its catalogue, or null
export const languages = [
  {id: 'zh-TW', name: '繁體中文', locale: 'zh-TW', docs: 'zh-TW', fonts: 'tc'},
  {id: 'zh-CN', name: '简体中文', locale: 'zh-CN', docs: 'zh-CN', fonts: 'sc'},
  {id: 'en', name: 'English', locale: 'en-US', docs: 'en', fonts: null}
] as const satisfies ReadonlyArray<{id: string; name: string; locale: string; docs: 'zh-TW' | 'zh-CN' | 'en'; fonts: string | null}>;

export type Lang = (typeof languages)[number]['id'];
// The language before a reader picks one or the browser says, and the reference table: its keys define Key, and
// every other table must have exactly those keys.
export const DEFAULT_LANG = 'zh-TW' satisfies Lang;

const ids: ReadonlySet<string> = new Set(languages.map(language => language.id));
export function isLang(value: string | null): value is Lang {
  return value !== null && ids.has(value);
}

// The browser's first preference decides. Chinese needs a rule rather than data: a Hant script or a TW, HK or MO
// region reads Traditional, any other Chinese Simplified. Any other language is picked by its primary subtag, and a
// language doona does not have reads English.
export function browserLang(tags: readonly string[]): Lang {
  const tag = tags[0]?.toLowerCase() ?? '';
  const primary = tag.split('-')[0];
  if (primary === 'zh') return /-hans\b/.test(tag) ? 'zh-CN' : /-(hant|tw|hk|mo)\b/.test(tag) ? 'zh-TW' : 'zh-CN';
  return languages.find(language => language.id.toLowerCase().split('-')[0] === primary)?.id ?? 'en';
}

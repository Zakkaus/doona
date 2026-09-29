// Browser preferences and the language doona picks for them, shared by src/i18n/lang.test.ts (browserLang) and
// tools/stamp.test.mjs (the first-paint script).
export const negotiationCases = [
  {tags: ['zh-TW'], lang: 'zh-TW'},
  {tags: ['zh-HK', 'en'], lang: 'zh-TW'},
  {tags: ['zh-Hant-SG'], lang: 'zh-TW'},
  {tags: ['zh-CN'], lang: 'zh-CN'},
  {tags: ['zh'], lang: 'zh-CN'},
  {tags: ['zh-Hans-HK'], lang: 'zh-CN'},
  {tags: ['zh-Hant-TW'], lang: 'zh-TW'},
  {tags: ['en-US', 'zh-TW'], lang: 'en'},
  {tags: ['en-GB', 'zh-CN'], lang: 'en'},
  {tags: ['xx-XX', 'zh-TW'], lang: 'zh-TW'},
  {tags: ['xx-XX', 'zh-Hans-HK'], lang: 'zh-CN'},
  {tags: ['xx', 'en-AU', 'zh-TW'], lang: 'en'},
  {tags: ['xx-XX'], lang: 'en'},
  {tags: [], lang: 'en'}
] as const;

import {expect, it} from 'vitest';
import {checkCatalogues, missingLanguage, readCatalogues} from './catalogues.mjs';

// A made-up partial language, xx, beside a two-key reference.
const en = {'a.count': {one: '{n} item', other: '{n} items'}, 'b.title': 'Title {name}'};
const check = (xx, complete = new Set(['en'])) => checkCatalogues({en, xx}, 'en', complete);

it('lets a partial language leave keys out and reports them', () => {
  expect(check({'b.title': 'Xx {name}'})).toEqual({failures: [], missing: {en: [], xx: ['a.count']}});
});

it('fails a complete language that leaves a key out', () => {
  expect(check({'b.title': 'Xx {name}'}, new Set(['en', 'xx'])).failures).toEqual(['src/i18n/locales/xx.json: a.count is missing']);
});

it('fails a partial language on an unknown key, a placeholder, a plural shape or the order', () => {
  expect(check({'a.count': {one: 'x', many: 'y'}, 'b.title': 'Xx {title}', 'c.extra': 'x'}).failures).toEqual([
    'src/i18n/locales/xx.json: a.count must be a non-empty string or {"one", "other"} non-empty strings',
    "src/i18n/locales/xx.json: b.title placeholders {title} differ from en's {name}",
    'src/i18n/locales/xx.json: c.extra is not in en.json'
  ]);
  expect(check({'b.title': 'Xx {name}', 'a.count': '{n} xx'}).failures).toEqual(['src/i18n/locales/xx.json: keys are not sorted']);
});

it('fails a blank message, in a string or a plural form', () => {
  expect(check({'a.count': {one: '', other: 'x {n}'}, 'b.title': ' '}).failures).toEqual([
    'src/i18n/locales/xx.json: a.count must be a non-empty string or {"one", "other"} non-empty strings',
    'src/i18n/locales/xx.json: b.title must be a non-empty string or {"one", "other"} non-empty strings'
  ]);
});

const registry = [
  {id: 'en', complete: true},
  {id: 'yy', complete: true},
  {id: 'xx', complete: false}
];
const files = {'src/i18n/locales/en.json': JSON.stringify(en)};

it('names an absent catalogue, but lets --missing ask about a partial language before it has one', () => {
  expect(readCatalogues(registry, file => files[file])).toEqual({
    catalogues: {en, xx: {}},
    failures: [
      'src/i18n/locales/yy.json does not exist, and yy is marked complete in src/i18n/languages.ts',
      'src/i18n/locales/xx.json does not exist; create it, starting from {}'
    ]
  });
  expect(readCatalogues(registry, file => files[file], 'xx').failures).toEqual([
    'src/i18n/locales/yy.json does not exist, and yy is marked complete in src/i18n/languages.ts'
  ]);
  expect(checkCatalogues(readCatalogues(registry, file => files[file], 'xx').catalogues, 'en', new Set(['en'])).missing.xx).toEqual(['a.count', 'b.title']);
});

it('reads --missing <id> only for a language in the registry', () => {
  const ids = ['en', 'xx'];
  expect(missingLanguage([], ids)).toBeUndefined();
  expect(missingLanguage(['--missing', 'xx'], ids)).toBe('xx');
  expect(() => missingLanguage(['--missing'], ids)).toThrow(
    /--missing needs a language id\nusage: pnpm check:i18n \[--missing <id>\], where <id> is one of en, xx/
  );
  expect(() => missingLanguage(['--missing', 'qq'], ids)).toThrow(/no language qq in src\/i18n\/languages\.ts\nusage:/);
});

import {expect, it} from 'vitest';
import {areaPrefixFailures, checkCatalogues, missingLanguage, readCatalogues} from './catalogues.mjs';

// A made-up partial language, xx, beside a two-key reference.
const en = {'a.count': {one: '{n} item', other: '{n} items'}, 'b.title': 'Title {name}'};
const locales = {en: 'en-US', xx: 'en-US', ar: 'ar'};
const check = (xx, complete = new Set(['en'])) => checkCatalogues({en, xx}, 'en', complete, locales);

it('rejects a key without an area prefix', () => {
  expect(areaPrefixFailures(['ui.close', 'close', 'ui.', '.close'])).toEqual([
    'Message key has no area prefix: close',
    'Message key has no area prefix: ui.',
    'Message key has no area prefix: .close'
  ]);
});

it('lets a partial language leave keys out and reports them', () => {
  expect(check({'b.title': 'Xx {name}'})).toEqual({failures: [], missing: {en: [], xx: ['a.count']}});
});

it('fails a complete language that leaves a key out', () => {
  expect(check({'b.title': 'Xx {name}'}, new Set(['en', 'xx'])).failures).toEqual(['src/i18n/locales/xx.json: a.count is missing']);
});

it('fails a partial language on an unknown key, a placeholder, a plural shape or the order', () => {
  expect(check({'a.count': {one: 'x', many: 'y'}, 'b.title': 'Xx {title}', 'c.extra': 'x'}).failures).toEqual([
    'src/i18n/locales/xx.json: a.count must be a non-empty string or a plural object with "other" and only one, other forms',
    "src/i18n/locales/xx.json: b.title placeholders {title} differ from en's {name}",
    'src/i18n/locales/xx.json: c.extra is not in en.json'
  ]);
  expect(check({'b.title': 'Xx {name}', 'a.count': '{n} xx'}).failures).toEqual(['src/i18n/locales/xx.json: keys are not sorted']);
});

it('checks the placeholders of each plural form, and a single form against the general one', () => {
  expect(check({'a.count': {one: 'one item', other: '{n} items'}, 'b.title': 'Xx {name}'}).failures).toEqual([
    "src/i18n/locales/xx.json: a.count (one) placeholders {} differ from en's {n}"
  ]);
  expect(check({'a.count': '{n} xx', 'b.title': 'Xx {name}'}).failures).toEqual([]);
  expect(check({'a.count': 'xx', 'b.title': {one: 'Xx {name}', other: 'Xx'}}).failures).toEqual([
    "src/i18n/locales/xx.json: a.count placeholders {} differ from en's {n}",
    "src/i18n/locales/xx.json: b.title (other) placeholders {} differ from en's {name}"
  ]);
});

it('checks the $ arguments of CodeMirror phrases as CodeMirror reads them', () => {
  const reference = {'cm.found': 'Found $ of $2', 'x.price': 'Costs $5'};
  const read = xx => checkCatalogues({en: reference, xx}, 'en', new Set(['en']), locales).failures;
  expect(read({'cm.found': '$2 中的 $1，共 $$', 'x.price': '五元'})).toEqual([]);
  expect(read({'cm.found': '找到 $2', 'x.price': '五元'})).toEqual(["src/i18n/locales/xx.json: cm.found CodeMirror arguments {$2} differ from en's {$1,$2}"]);
});

it('fails a blank message, in a string or a plural form', () => {
  expect(check({'a.count': {one: '', other: 'x {n}'}, 'b.title': ' '}).failures).toEqual([
    'src/i18n/locales/xx.json: a.count must be a non-empty string or a plural object with "other" and only one, other forms',
    'src/i18n/locales/xx.json: b.title must be a non-empty string or a plural object with "other" and only one, other forms'
  ]);
});

it('accepts Arabic plural categories but rejects categories outside its locale', () => {
  const ar = {
    'a.count': {zero: '{n} zero', one: '{n} one', two: '{n} two', few: '{n} few', many: '{n} many', other: '{n} other'}
  };
  expect(checkCatalogues({en, ar}, 'en', new Set(['en']), locales).failures).toEqual([]);
  expect(checkCatalogues({en, ar: {'a.count': {...ar['a.count'], bogus: '{n} bogus'}}}, 'en', new Set(['en']), locales).failures).toEqual([
    'src/i18n/locales/ar.json: a.count must be a non-empty string or a plural object with "other" and only zero, one, two, few, many, other forms'
  ]);
  expect(check({'a.count': {one: '{n} one', other: '{n} other', few: '{n} few'}}).failures).toEqual([
    'src/i18n/locales/xx.json: a.count must be a non-empty string or a plural object with "other" and only one, other forms'
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
  expect(checkCatalogues(readCatalogues(registry, file => files[file], 'xx').catalogues, 'en', new Set(['en']), locales).missing.xx).toEqual([
    'a.count',
    'b.title'
  ]);
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

it('fails a key written twice in one catalogue, which parsing would resolve to the last value', () => {
  const source = '{\n  "a.count": {"one": "{n} item", "other": "{n} items"},\n  "b.title": "Original",\n  "b.title": "Overwritten \\"{name}\\""\n}\n';
  expect(readCatalogues([{id: 'en', complete: true}], () => source).failures).toEqual(['src/i18n/locales/en.json: b.title is written more than once']);
  expect(readCatalogues([{id: 'en', complete: true}], () => JSON.stringify(en)).failures).toEqual([]);
});

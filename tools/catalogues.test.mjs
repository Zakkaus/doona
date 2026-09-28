import {expect, it} from 'vitest';
import {checkCatalogues} from './catalogues.mjs';

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
    'src/i18n/locales/xx.json: a.count must be a string or {"one", "other"} strings',
    "src/i18n/locales/xx.json: b.title placeholders {title} differ from en's {name}",
    'src/i18n/locales/xx.json: c.extra is not in en.json'
  ]);
  expect(check({'b.title': 'Xx {name}', 'a.count': '{n} xx'}).failures).toEqual(['src/i18n/locales/xx.json: keys are not sorted']);
});

import {expect, it} from 'vitest';
import {browserLang, formatList, readLang} from './index';
import {negotiationCases} from './negotiation.test-cases';

const stored = (value: string | null) => ({getItem: () => value});

it('follows the browser when no language was chosen', () => {
  for (const {tags, lang} of negotiationCases) expect(browserLang(tags)).toBe(lang);
});

it('joins plain enumerations with the catalogue separator', () => {
  expect(formatList('en', ['A', 'B', 'C'])).toBe('A, B, C');
  expect(formatList('zh-TW', ['甲', '乙'])).toBe('甲、乙');
});

it('keeps a chosen language over the browser', () => {
  expect(readLang(stored('zh-CN'), ['en-US'])).toBe('zh-CN');
  expect(readLang(stored('zh-TW'), ['en-US'])).toBe('zh-TW');
  expect(readLang(stored(null), ['zh-TW'])).toBe('zh-TW');
  expect(readLang(stored('fr'), ['ja'])).toBe('en');
  expect(
    readLang(
      {
        getItem: () => {
          throw new Error('blocked');
        }
      },
      ['zh-CN']
    )
  ).toBe('zh-CN');
});

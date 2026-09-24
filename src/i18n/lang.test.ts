import {expect, it} from 'vitest';
import {browserLang, readLang} from './index';

const stored = (value: string | null) => ({getItem: () => value});

it('follows the browser when no language was chosen', () => {
  expect(browserLang(['zh-TW'])).toBe('zh-TW');
  expect(browserLang(['zh-HK', 'en'])).toBe('zh-TW');
  expect(browserLang(['zh-Hant-SG'])).toBe('zh-TW');
  expect(browserLang(['zh-CN'])).toBe('zh-CN');
  expect(browserLang(['zh'])).toBe('zh-CN');
  expect(browserLang(['zh-Hans-HK'])).toBe('zh-CN');
  expect(browserLang(['en-US', 'zh-TW'])).toBe('en');
  expect(browserLang(['ja-JP'])).toBe('en');
  expect(browserLang([])).toBe('en');
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

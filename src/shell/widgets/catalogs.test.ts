import {expect, it} from 'vitest';
import en from '../../i18n/locales/en.json';
import cn from '../../i18n/locales/zh-CN.json';
import tw from '../../i18n/locales/zh-TW.json';
it('keeps widget and navigation text free of bullet separators in all catalogs', () => {
  for (const catalog of [en, cn, tw])
    for (const [key, value] of Object.entries(catalog)) if (/^(widgets|nav|hub)\./.test(key)) expect(JSON.stringify(value), key).not.toMatch(/[·•]/);
});

it('uses singular and plural retained notice counts', async () => {
  const {translate} = await import('../../i18n');
  expect(translate('en', 'widgets.noticeCount', {n: 1})).toBe('1 retained notice record');
  expect(translate('en', 'widgets.noticeCount', {n: 2})).toBe('2 retained notice records');
});

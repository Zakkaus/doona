import {expect, it} from 'vitest';
import {flagChoices, flagRegions} from './flags';
import {regions} from './regions';

it.each(['zh-TW', 'zh-CN', 'en'])('prioritizes detected regions before locale-sorted remaining regions in %s', locale => {
  const choices = flagChoices(locale);
  expect(choices.slice(0, 6).map(item => item.id)).toEqual(['HK', 'TW', 'JP', 'SG', 'US', 'KR']);
  expect(choices.slice(0, regions.length).map(item => item.id)).toEqual(regions.map(([id]) => id));
  expect(new Set(choices.map(item => item.id))).toEqual(new Set(flagRegions));
  const remaining = choices.slice(regions.length).map(item => item.label);
  expect(remaining).toEqual([...remaining].sort(new Intl.Collator(locale).compare));
});

it.each([
  ['zh-TW', ['香港', '澳門', '台灣']],
  ['zh-CN', ['香港', '澳门', '台湾']],
  ['en-US', ['Hong Kong', 'Macao', 'Taiwan']]
] as const)('shows short names and keeps official, English and ISO search terms in %s', (locale, expected) => {
  const choices = flagChoices(locale);
  const official = new Intl.DisplayNames(locale, {type: 'region'});
  const english = new Intl.DisplayNames('en', {type: 'region'});
  for (const [index, id] of ['HK', 'MO', 'TW'].entries()) {
    const item = choices.find(item => item.id === id)!;
    expect(item.label).toBe(expected[index]);
    for (const term of [id, official.of(id), english.of(id)]) expect(item.keywords).toContain(term);
  }
});

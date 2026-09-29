import {expect, it} from 'vitest';
import {translate, type Lang} from '../../i18n';
import {shareDescription} from './description';

const shares = [
  {label: 'Proxy', text: '3'},
  {label: 'Direct', text: '1'}
];

it.each([
  ['en', 'Traffic: Proxy: 3, Direct: 1'],
  ['zh-TW', 'Traffic\uFF1AProxy\uFF1A3\uFF0CDirect\uFF1A1'],
  ['zh-CN', 'Traffic\uFF1AProxy\uFF1A3\uFF0CDirect\uFF1A1']
] as Array<[Lang, string]>)('describes every share as a complete value pair in %s', (lang, name) => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params);
  expect(shareDescription('Traffic', shares, t)).toBe(name);
});

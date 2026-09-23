import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect, it} from 'vitest';
import {translate} from '../src/i18n';
import {palettes} from '../src/shell/view';

const stamp = readFileSync(new URL('./stamp.js', import.meta.url), 'utf8');
const prepaint = (stored, dark) => {
  const document = {documentElement: {dataset: {}, lang: ''}};
  runInNewContext(stamp, {document, localStorage: {getItem: key => stored[key] ?? null}, matchMedia: () => ({matches: dark})});
  return document.documentElement;
};

it('accepts exactly the palettes the app offers', () => {
  const inline = /var palettes = \[([^\]]*)\]/
    .exec(stamp)[1]
    .match(/'[^']+'/g)
    .map(item => item.slice(1, -1));
  const offered = palettes(translate.bind(null, 'en')).flatMap(section => section.items.map(item => item.id));
  expect([...inline].sort()).toEqual([...offered].sort());
});

it('falls back to the default palette for removed or malformed ids without losing dark mode', () => {
  for (const palette of ['tokyo-night/storm', 'unknown/palette', '/moon', 'rose-pine/moon/extra', null]) {
    expect(prepaint({'doona-palette': palette, 'doona-scheme': 'dark', 'doona-lang': 'en'}, false)).toEqual({
      dataset: {scheme: 'dark', family: 'rose-pine', flavour: 'moon', wordmark: 'gradient'},
      lang: 'en-US'
    });
  }
});

it('keeps a supported palette and follows the system for an invalid scheme', () => {
  expect(prepaint({'doona-palette': 'catppuccin/macchiato', 'doona-scheme': 'invalid', 'doona-wordmark': 'plain', 'doona-lang': 'zh-CN'}, true)).toEqual({
    dataset: {scheme: 'dark', family: 'catppuccin', flavour: 'macchiato', wordmark: 'plain'},
    lang: 'zh-CN'
  });
});

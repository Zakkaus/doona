import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect, it} from 'vitest';
import {DEFAULT_PALETTE, palettes} from '../src/shell/palettes';

// The same injection vite.config.ts makes at build.
const stamp = readFileSync(new URL('./stamp.js', import.meta.url), 'utf8')
  .replace("'__PALETTES__'", JSON.stringify(palettes.map(palette => palette.id)))
  .replace("'__DEFAULT_PALETTE__'", JSON.stringify(DEFAULT_PALETTE));
const prepaint = (stored, dark) => {
  const document = {documentElement: {dataset: {}, lang: ''}};
  runInNewContext(stamp, {document, localStorage: {getItem: key => stored[key] ?? null}, matchMedia: () => ({matches: dark})});
  return document.documentElement;
};

it('accepts every palette the app offers', () => {
  for (const {id} of palettes) {
    const [family, flavour] = id.split('/');
    expect(prepaint({'doona-palette': id}, false).dataset).toMatchObject({family, flavour});
  }
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
